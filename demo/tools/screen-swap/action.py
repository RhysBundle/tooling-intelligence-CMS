"""
Puts a user's own device screens into Emil's take and return renders (his
second set, 27 to 31 Oct 2026): the Take or Return screen for the product
while the drawer is open, then, once the door is shut, the screen the demo
shows next. One clip each time the user's sequence takes or returns, for
their location. They replace the phase 1 take and return clips (swap.py).

    python tools/screen-swap/action.py track <product>
    python tools/screen-swap/action.py check <product> <take|return> [--every 10]
    python tools/screen-swap/action.py build <user id> [--cms <url>]

(from the demo folder). Needs what intro.py needs.

The renders, in New-vids/renders/<product>/ (README.txt there has Emil's
names): per location <location>_take and <location>_return comped over the
location; per product the same on a plain background (SmartDrawer's
<kind>_alpha, SupplySystem's <kind>; the camera is the same in every
location) and its screen pass <kind>_screen (glass reflections, and in alpha
the screen with the hand held out). Each starts and ends square on the
screen, on the zoom's last framing, which is where the user's intro leaves
the demo's HTML screens, so the clip cuts in and fades back out with nothing
moving. In between the camera pulls back, the drawer (SmartDrawer) or locker
door (SupplySystem) opens, the item comes out or goes back, the door shuts,
and the camera pushes back in.

track: once per product. Finds the grey screen's edges in each frame of the
  plain background render and fits the render's camera to them (intro.py's
  tracking). Writes tracks/action-<product>.json.
check: a contact sheet of a track, for checking it by eye.
build: for each take or return in the user's sequence, draws its two
  screens in headless Edge (render.html), puts them into the render for the
  user's location, and writes assets/custom/<user id>/<kind>-<product>-<stamp>.mp4
  with its first frame, and the entries in data/custom-clips.js.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import intro  # noqa: E402
from intro import (DEMO, TRACKS, LOCATIONS, FW, FH, SIDES, AXES, frames, render_path, measure_clip, usable,  # noqa: E402
                   fit_track, pass_matte, put_screen, reflection, pass_floor, render_screens, first_stamp,
                   encoder, draw_quad)
from swap import fnv, user_data, read_custom, write_custom, screen_spec  # noqa: E402

KINDS = ['take', 'return']

# Per product and clip: the frame the door is shut on, when the device moves
# on from the Take or Return screen (from contact sheets). SmartDrawer's take
# has its drawer pushed shut; its return's camera rises before the drawer
# shuts, so it is the pocket's lid. SupplySystem's take and return share
# their moves: the locker door swings shut as the camera starts to rise.
# framing: the login_screen in js/media.js that the clips start and end on.
# file: the render tracked, the screen on a plain background (SmartDrawer's
# with alpha, SupplySystem's without, which tracks the same).
PRODUCTS = {
    'smartdrawer': {'framing': 'smartdrawer_new_zoom', 'file': '{kind}_alpha.mov',
                    'take': {'shut': 322}, 'return': {'shut': 286}},
    'supplysystem': {'framing': 'supplysystem_new_zoom', 'file': '{kind}.mov',
                     'take': {'shut': 304}, 'return': {'shut': 304},
                     # For about 2 seconds only the screen's bottom edge and a
                     # stub of its left are in shot, which leaves the camera's
                     # turn free. With intro.py's hold on it (HOLD_TURN 0.3)
                     # the screen drifted to 1.58 wide to 1 tall and 21 frames
                     # missed the edges seen by over 2 px; lighter, it tipped
                     # over to 12.6 to 1. Held harder it stays 1.28 to 1.36
                     # and 4 frames miss by over 2 px (worst 2.4)
                     'hold': {'HOLD': 0.05, 'HOLD_TURN': 1.0}},
}
# The camera holds still for a second at each end. While it does, the screen
# is left plain, as the HTML screen either side of the clip is; the screen
# pass's reflections come in over this many frames once it moves, and go
# again as it settles.
EASE = 20
# The zoom's last frame (what the HTML screens sit on) and these renders'
# first and last frames differ in places: SupplySystem's badge reader is lit
# in the zoom and not here. That difference is laid on the clip's first frame
# and fades out over this many frames, carried with the screen's plane as
# the camera moves (SupplySystem's starts at once), and fades back in at the
# end, so the cut in and the fade out show nothing changing.
SETTLE = 15

# Bump when a change here alters how the clips look
LOOK = 1

DOOR_STEPS = {'open_pocket_take': 'take', 'check_in': 'return'}
NEW_TRANSACTION = {'select_action', 'select_product', 'product_search', 'logout'}


# ---------- Which clips a sequence plays (as js/demo.js) ----------

def clip_after(steps, i):
    """'take', 'return' or None: the clip played after step i, as
    actionClipAfter() in js/demo.js."""
    t = steps[i].get('type')
    if t not in ('select_action', 'enter_quantity'):
        return None
    kind = None
    for k in range(i, -1, -1):
        s = steps[k]
        if s.get('type') == 'select_action':
            kind = 'return' if (s.get('params') or {}).get('action') == 'return' else 'take'
            break
        if s.get('type') in ('select_product', 'product_search'):
            return None
    if not kind:
        return None
    for s in steps[i + 1:]:
        t = s.get('type')
        if t == 'enter_quantity' or t in DOOR_STEPS or t == 'scale_transaction':
            return None
        if t in NEW_TRANSACTION:
            break
    return kind


def product_at(steps, i):
    for k in range(min(i, len(steps) - 1), -1, -1):
        if steps[k].get('type') == 'select_product':
            return (steps[k].get('params') or {}).get('product')
    return None


def door_screen(kind, product):
    return screen_spec(kind, {'product': product}, None)


def next_screen(steps, j):
    """What the device shows once the clip that ends step j - 1 is over: what
    runStep(j) puts up in js/demo.js. A log out goes straight to the login
    screen (the screen was hidden for the clip, so nothing is pressed), and
    a door step plays its own clip, so this one ends on that one's start."""
    if j >= len(steps):
        return {'kind': 'login', 'message': ''}
    s = steps[j]
    t = s.get('type')
    if t == 'logout':
        return {'kind': 'login', 'message': str((s.get('text') or {}).get('message') or '')}
    if t in DOOR_STEPS:
        return door_screen(DOOR_STEPS[t], product_at(steps, j))
    return {'kind': 'arrive', 'steps': steps, 'index': j}


def clips_in(steps):
    """Each clip the sequence plays: kind, product, the step it follows (or
    is), and the stamp of the step after it, which the demo matches."""
    first = 1 if steps and steps[0].get('type') == 'login_method' else 0
    out = []
    for i in range(first, len(steps)):
        kind = DOOR_STEPS.get(steps[i].get('type')) or clip_after(steps, i)
        product = product_at(steps, i)
        if not kind or not product:
            continue
        nxt = steps[i + 1] if i + 1 < len(steps) else None
        out.append({'kind': kind, 'product': product, 'step': i, 'next': first_stamp(nxt)})
    return out


# ---------- Track ----------

def framing_corners(product):
    """The corners of the framing the clips start and end on, from js/media.js."""
    js = ('global.window = global;'
          f'require({json.dumps(str(DEMO / "js" / "media.js"))});'
          f'console.log(JSON.stringify(window.TI_MEDIA.login_screen[{json.dumps(PRODUCTS[product]["framing"])}].screen.corners));')
    return np.array(json.loads(subprocess.run(['node', '-e', js], check=True, capture_output=True, text=True).stdout))


def side_lines(corners):
    """The four sides of a quad as intro.py's measured lines (n.x = d, n facing out)."""
    out = []
    for s, (a, b) in enumerate(SIDES):
        dx, dy = corners[b] - corners[a]
        nv = np.array([dy, -dx]) / np.hypot(dx, dy)
        if nv @ AXES[s] < 0:
            nv = -nv
        out.append({'n': nv.tolist(), 'd': float(nv @ corners[a]), 'count': 10 ** 4, 'rms': 0.25})
    return out


def anchored(measured, corners):
    """At each end the camera holds still on the zoom's framing, with the
    screen filling the frame's height, so only its left and right edges are
    in shot and the fit drifts. Every frame whose measured edges all lie on
    that framing (within half a pixel) is given all four of its sides."""
    ref = side_lines(corners)
    out, pinned = [], 0
    for ls, box in measured:
        seen = [(s, ln) for s, ln in enumerate(usable(ls, box)) if ln]
        on = len(seen) >= 2 and all(max(abs(np.dot(ln['n'], corners[k]) - ln['d']) for k in SIDES[s]) < 0.5
                                    for s, ln in seen)
        if on:
            out.append([ref, [0, 0, FW, FH]])
            pinned += 1
        else:
            out.append([ls, box])
    return out, pinned


def cmd_track(product):
    out = {'product': product, 'clips': {}}
    corners = framing_corners(product)
    for name, v in PRODUCTS[product].get('hold', {}).items():
        setattr(intro, name, v)
    for kind in KINDS:
        file = PRODUCTS[product]['file'].format(kind=kind)
        m, pinned = anchored(measure_clip(render_path(product, file)), corners)
        t = fit_track(m)
        out['clips'][kind] = dict(t, file=file)
        # The edges seen can be met by a screen tipped away from the camera,
        # squashed in the frame, so its shape is printed to check: a 4:3
        # screen seen near square on is about 1.33 wide to 1 tall
        q = np.array(t['corners'])
        shape = np.hypot(*(q[:, 1] - q[:, 0]).T) / np.hypot(*(q[:, 3] - q[:, 0]).T)
        print(f'{product} {kind}: {len(m)} frames, {pinned} on the zoom\'s framing, all four sides seen in '
              f'{sum(all(s) for s in t["seen"])}, corners within {t["worst"]:.2f} px of the edges seen, '
              f'{shape.min():.2f} to {shape.max():.2f} wide to 1 tall', flush=True)
    TRACKS.mkdir(exist_ok=True)
    (TRACKS / f'action-{product}.json').write_text(json.dumps(out))
    print(f'wrote tracks/action-{product}.json')


def load_track(product):
    p = TRACKS / f'action-{product}.json'
    if not p.exists():
        sys.exit(f'no track for {product}: run  python tools/screen-swap/action.py track {product}')
    return json.loads(p.read_text())


def cmd_check(product, kind, every):
    tr = load_track(product)['clips'][kind]
    c = np.float32(tr['corners'])
    tiles = []
    for f, img in enumerate(frames(render_path(product, f'rail_depot_{kind}.mov'))):
        if f % every:
            continue
        im = img.copy()
        draw_quad(im, c[f], tr['seen'][f])
        cv2.putText(im, str(f), (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 255), 4)
        tiles.append(cv2.resize(im, (480, 270)))
    while len(tiles) % 6:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[r:r + 6]) for r in range(0, len(tiles), 6)])
    out = Path(tempfile.gettempdir()) / f'action-{product}-{kind}-check.jpg'
    cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(out)


# ---------- Build ----------

def can_build(config):
    """Why a config can't have its own take and return clips, or None."""
    product, location = config.get('solution'), config.get('location')
    if product not in PRODUCTS or location not in LOCATIONS:
        return f'no take and return renders for {product} in {location}'
    if not (TRACKS / f'action-{product}.json').exists():
        return f'{product} has no take and return track (action.py track {product})'
    return None


def made_for(config):
    """What the clips are made with, checked by madeFor() in js/demo.js;
    each clip also carries its location and the stamp of the step after it."""
    return {'solution': config['solution'],
            'theme_colour': (config.get('theme_colour') or '').lower(),
            'button_colour': (config.get('button_colour') or '').lower(),
            'logo': fnv(config.get('logo') or '')}


def end_frame(path, last):
    """A clip's first or last frame, decoded as frames() decodes."""
    seek = ['-sseof', '-1'] if last else []
    raw = subprocess.run(['ffmpeg', '-v', 'error'] + seek + ['-i', str(path)] + ([] if last else ['-frames:v', '1']) +
                         ['-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'], check=True, capture_output=True).stdout
    n = FW * FH * 3
    return np.frombuffer(raw[-n:], np.uint8).reshape(FH, FW, 3).astype(np.float32)


def difference(ref, own):
    """Where own differs from ref by more than the renders' noise, feathered."""
    d = ref - own
    m = (np.abs(d).max(2) > 8).astype(np.uint8)
    m = cv2.dilate(m, np.ones((15, 15), np.uint8)).astype(np.float32)
    return d * cv2.GaussianBlur(m, (0, 0), 4)[..., None]


def build_clip(product, location, kind, screens, out_video, out_poster, log=print, tick=None):
    """screens: our two screens (toned, RS times the UI's px): the door's,
    then what follows once it's shut. tick() is called after each frame."""
    spec = PRODUCTS[product]
    c = np.float32(load_track(product)['clips'][kind]['corners'])
    n = len(c)
    moving = np.nonzero(np.abs(np.diff(c, axis=0)).max((1, 2)) > 0.05)[0]
    start, end = int(moving[0]), int(moving[-1]) + 1
    comp = render_path(product, f'{location}_{kind}.mov')
    ref = end_frame(render_path(product, f'{location}_zoom.mov'), True)
    ends = [(0, difference(ref, end_frame(comp, False))), (n - 1, difference(ref, end_frame(comp, True)))]
    shut = spec[kind]['shut']
    scr_path = render_path(product, f'{kind}_screen.mov')
    floor = pass_floor(product, scr_path)
    part = Path(str(out_video) + '.part')
    enc = encoder(part)
    first = None
    count = 0
    for f, (img, scr) in enumerate(zip(frames(comp), frames(scr_path, 'bgra'))):
        for at, delta in ends:
            b = 1 - abs(f - at) / SETTLE
            if b > 0:
                h = cv2.getPerspectiveTransform(c[at], c[f])
                img = np.clip(img + b * cv2.warpPerspective(delta, h, (FW, FH)), 0, 255).astype(np.uint8)
        k = float(np.clip(min((f - start) / EASE, (end - f) / EASE), 0, 1))
        refl = reflection(scr, floor) * k
        out = put_screen(img, c, f, screens[0] if f < shut else screens[1], matte=pass_matte(scr), refl=refl)
        if first is None:
            first = out
        enc.stdin.write(out.tobytes())
        count += 1
        if tick:
            tick()
    enc.stdin.close()
    if enc.wait():
        raise RuntimeError('ffmpeg failed')
    intro.check_video(part, count)
    cv2.imwrite(str(out_poster), first, [cv2.IMWRITE_JPEG_QUALITY, 92])
    os.replace(part, out_video)
    log(f'{out_video.name}: {count} frames ({count / 30:.1f}s)')


def wanted_clips(seq):
    """The clips a sequence needs, one per kind, product and step after it:
    [(kind, key, what)]."""
    out = {}
    for w in clips_in((seq or {}).get('steps') or []):
        out.setdefault((w['kind'], f'{w["product"]}|{w["next"]}'), w)
    return [(kind, key, w) for (kind, key), w in out.items()]


def plan_for(config, seq):
    """Everything a user's clips are made from. The worker makes them again
    whenever it changes: the colours and logo, the location, any step of the
    sequence (a clip's last screen can show an earlier step's search), the
    track, or this tool's LOOK."""
    steps = [{k: v for k, v in s.items() if k != 'text'} | {'text': {k: v for k, v in (s.get('text') or {}).items()
                                                                     if k not in ('instruction', 'clip_instruction')}}
             for s in (seq or {}).get('steps') or []]
    track = hashlib.sha1((TRACKS / f'action-{config["solution"]}.json').read_bytes()).hexdigest()[:8]
    return {'made': made_for(config), 'location': config['location'],
            'steps': fnv(json.dumps(steps, sort_keys=True, ensure_ascii=False)),
            'renders': f'{LOOK}-{track}'}


def frame_count(config, seq):
    """How many frames config's clips have, for the worker's progress."""
    tr = load_track(config['solution'])
    return sum(len(tr['clips'][kind]['corners']) for kind, _, _ in wanted_clips(seq))


def build(config, seq, out_dir, prefix, bust=False, log=print, tick=None, step=None):
    """Makes config's clips in out_dir and returns their entry for the demo
    (files from prefix; bust adds the plan's stamp to each file's address so
    a browser doesn't show an old copy). step(label) is called as each clip
    starts, tick() after each frame."""
    product, location = config['solution'], config['location']
    steps = (seq or {}).get('steps') or []
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    plan = plan_for(config, seq)
    v = '?v=' + fnv(json.dumps(plan, sort_keys=True)) if bust else ''
    entry = {'made': plan['made'], 'plan': plan, 'take': {}, 'return': {}}
    keep = set()
    for kind, key, w in wanted_clips(seq):
        name = f'{kind}-{w["product"]}-{w["next"] or "end"}'
        p = TICATALOGUE.get(w['product'], w['product'])
        if step:
            step(f'{kind.capitalize()}: {p}')
        specs = [door_screen(kind, w['product']), next_screen(steps, w['step'] + 1)]
        with tempfile.TemporaryDirectory() as tmp:
            screens, _ = render_screens(config, specs, Path(tmp))
        build_clip(product, location, kind, screens, out_dir / f'{name}.mp4', out_dir / f'{name}-start.jpg',
                   log=log, tick=tick)
        keep |= {f'{name}.mp4', f'{name}-start.jpg'}
        entry[kind][key] = {
            'label': f'{product} {kind}, {config["user_id"]}, {p}, {location}',
            'video': f'{prefix}{name}.mp4{v}', 'poster': f'{prefix}{name}-start.jpg{v}',
            'location': location, 'framing': PRODUCTS[product]['framing'], 'renders': plan['renders']}
    # Only this tool's and swap.py's own clips: the intro lives here too
    for old in list(out_dir.glob('take-*')) + list(out_dir.glob('return-*')):
        if old.name not in keep:
            old.unlink()
    return entry


def catalogue_names():
    """Product names by catalogue ID, for the worker's progress labels."""
    js = (f'const m = require({json.dumps(str(DEMO.parent / "shared" / "catalogue.js"))});'
          'const c = m.TICatalogue || m;'
          'console.log(JSON.stringify(Object.fromEntries(c.search("").map(p => [p.id, p.name]))));')
    try:
        return json.loads(subprocess.run(['node', '-e', js], check=True, capture_output=True, text=True).stdout)
    except Exception:
        return {}


TICATALOGUE = catalogue_names()


def cmd_build(userid, cms):
    """Makes the clips into the demo's own files, assets/custom/<user id>/
    and their entries in data/custom-clips.js, so they go in the package and
    work from file://."""
    config, seq = user_data(userid, cms)
    if not config:
        sys.exit(f'no config for {userid}')
    why = can_build(config)
    if why:
        sys.exit(f'{userid}: {why}')
    if not wanted_clips(seq):
        print(f'{userid}: its sequence takes and returns nothing, so no clips')
    uid = str(config['user_id']).lower()
    entry = build(config, seq, DEMO / 'assets' / 'custom' / uid, f'assets/custom/{uid}/')
    entry.pop('plan')
    data = read_custom()
    mine = data.get(uid, {})
    if 'intro' in mine:
        entry['intro'] = mine['intro']
    data[uid] = entry
    write_custom(data)
    print(f'{userid}: {sum(len(entry[k]) for k in KINDS)} clips; wrote data/custom-clips.js')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('track')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p = sub.add_parser('check')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p.add_argument('kind', choices=KINDS)
    p.add_argument('--every', type=int, default=10)
    p = sub.add_parser('build')
    p.add_argument('userid')
    p.add_argument('--cms')
    args = ap.parse_args()
    if args.cmd == 'track':
        cmd_track(args.product)
    elif args.cmd == 'check':
        cmd_check(args.product, args.kind, args.every)
    else:
        cmd_build(args.userid, args.cms)


if __name__ == '__main__':
    main()
