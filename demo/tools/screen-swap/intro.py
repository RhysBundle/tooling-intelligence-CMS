"""
Puts a user's own device screens into Emil's renders of the push in, the
login and the zoom (19 Oct 2026): their login screen as the camera pushes in
and they log in, then the first screen of their sequence as it zooms in.
One clip per user, for their location and login type.

    python tools/screen-swap/intro.py track <product>
    python tools/screen-swap/intro.py check <product> [--every 10]
    python tools/screen-swap/intro.py build <user id> [--cms <url>]

(from the demo folder). Needs numpy, opencv-python, ffmpeg and node on the
PATH, and Edge or Chrome (set BROWSER to its path if it isn't Edge's usual
place).

The renders are in New-vids/renders/<product>/ next to the repo (set
TI_RENDERS to look elsewhere), renamed from Emil's names by location and
login type (README.txt there has both). Per product: pushin_alpha,
zoom_alpha and the three login clips on a transparent background; per
location, <location>_pushin and <location>_zoom with the background in, and
<location>_bkgd, the background on its own.

track: once per product. Emil left the device screen flat grey (120 in every
  channel), so the screen is found in each frame by its edges against the
  black bezel. Where an edge is out of shot (the barcode clip looks down at
  the scanner, and the zoom ends with the screen filling the frame), the
  corners follow the camera's smooth path from the frames either side.
  Writes tracks/intro-<product>.json.
check: a contact sheet of a track, for checking it by eye.
build: draws the user's login screen and first screen in headless Edge
  (render.html), puts them into the push in, the login for their login type
  and the zoom, for their location, and writes assets/custom/<user id>/intro.mp4
  with its first and last frames, and the intro entry in data/custom-clips.js.

The swap, per frame: the grey becomes our screen, toned as the renders tone
a screen and warped onto the corners. It is averaged over the frame's
shutter, so it carries the render's motion blur. Where the typed login's
hand is over the screen (Emil's hand matte), the render is left as it is.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
DEMO = HERE.parent.parent
RENDERS = Path(os.environ.get('TI_RENDERS') or DEMO.parent.parent / 'New-vids' / 'renders')
TRACKS = HERE / 'tracks'
sys.path.insert(0, str(HERE))
from swap import tone, fnv, user_data, browser, read_custom, write_custom  # noqa: E402

FW, FH = 1920, 1080
SW, SH = 1024, 768                    # the device UI, artwork px
RS = 2                                # our screens are drawn at twice that, so the zoom's end stays sharp
GREY = 120                            # Emil's screen, every channel
CORNERS = np.float32([[0, 0], [SW, 0], [SW, SH], [0, SH]])
SIDES = [(0, 1), (1, 2), (2, 3), (3, 0)]   # top, right, bottom, left, as corner pairs
SHUTTER = 1.0                         # motion blur over a whole frame's movement (as the take render)

# Per product: the clips, which background frame the barcode clip's camera
# move starts on (matched by its movement), frames to drop from the end of a
# login, and the frame each login's screen changes on (the scan, the tap,
# the last key).
PRODUCTS = {
    'smartdrawer': {
        'clips': {'pushin': 'pushin_alpha.mov', 'zoom': 'zoom_alpha.mov', 'barcode': 'login_barcode_alpha.mov',
                  'rfid': 'login_rfid_alpha.mov', 'typed': 'login_typed_alpha.mov'},
        'hand': 'login_typed_hand_matte.mov',
        'still': ['rfid', 'typed'],   # freeze frames (Emil); only the barcode login moves the camera
        'barcode_bkgd': 140,
        'trim': {'rfid': 3},          # its last 3 frames drift half a pixel
        'logged_in': {'barcode': 66, 'rfid': 40, 'typed': 179},
    },
    # Not tracked or checked yet: barcode_bkgd is from the 19 Oct review, the
    # logged_in frames are guesses from contact sheets
    'supplysystem': {
        'clips': {'pushin': 'pushin_alpha.mov', 'zoom': 'zoom_alpha.mov', 'barcode': 'login_barcode_alpha.mov',
                  'rfid': 'login_rfid_alpha.mov', 'typed': 'login_typed_alpha.mov'},
        'hand': 'login_typed_hand_matte.mov',
        'still': ['rfid', 'typed'],
        'barcode_bkgd': 112,
        'trim': {},
        'logged_in': {'barcode': 62, 'rfid': 62, 'typed': 199},
    },
}
LOGINS = {'barcode': 'barcode', 'rfid': 'rfid', 'login_no_password': 'typed', 'login_with_password': 'typed'}


# ---------- Frames ----------

def frames(path, fmt='bgr24', count=None):
    """The clip's frames in order, decoded by ffmpeg."""
    ch = {'bgr24': 3, 'bgra': 4, 'gray': 1}[fmt]
    cmd = ['ffmpeg', '-v', 'error', '-i', str(path)]
    if count:
        cmd += ['-frames:v', str(count)]
    p = subprocess.Popen(cmd + ['-f', 'rawvideo', '-pix_fmt', fmt, '-'], stdout=subprocess.PIPE, bufsize=1 << 24)
    n = FW * FH * ch
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            f = np.frombuffer(b, np.uint8)
            yield f.reshape(FH, FW, ch) if ch > 1 else f.reshape(FH, FW)
    finally:
        p.stdout.close()
        p.wait()


def render_path(product, name):
    p = RENDERS / product / name
    if not p.exists():
        sys.exit(f'render not found: {p}')
    return p


# ---------- Tracking ----------

def edge_points(img):
    """Points on the grey screen's edges, by side, to a fraction of a pixel.
    Each is where the brightness crosses halfway from the grey to the bezel
    just outside it, along the side's own axis. Points whose outside is off
    the frame, or isn't dark bezel (the hand, the barcode card), are left out."""
    bgr = img[..., :3].astype(np.int16)
    m = (np.abs(bgr - GREY) <= 2).all(2)
    if img.shape[2] == 4:
        m &= img[..., 3] >= 250
    n, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), 4)
    if n < 2:
        return None
    k = 1 + int(np.argmax(st[1:, 4]))
    if st[k, 4] < 2000:
        return None
    comp = (lab == k).astype(np.uint8)
    cs, _ = cv2.findContours(comp, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=len)[:, 0, :]
    sm = cv2.GaussianBlur(comp.astype(np.float32), (0, 0), 2)
    gx = cv2.Sobel(sm, cv2.CV_32F, 1, 0, ksize=3)[c[:, 1], c[:, 0]]
    gy = cv2.Sobel(sm, cv2.CV_32F, 0, 1, ksize=3)[c[:, 1], c[:, 0]]
    lum = bgr.mean(2).astype(np.float32)
    out = [[], [], [], []]
    steps = np.arange(-6, 9)
    for (x, y), ex, ey in zip(c, gx, gy):
        ox, oy = -ex, -ey                              # outward, away from the grey
        if abs(oy) >= abs(ox):
            side, d = (0, (0, -1)) if oy < 0 else (2, (0, 1))
        else:
            side, d = (3, (-1, 0)) if ox < 0 else (1, (1, 0))
        xs, ys = x + d[0] * steps, y + d[1] * steps
        ok = (xs >= 0) & (xs < FW) & (ys >= 0) & (ys < FH)
        v = np.full(len(steps), np.nan, np.float32)
        v[ok] = lum[ys[ok], xs[ok]]
        # The bezel's brightness, from the outermost samples still in the frame
        outside = v[7:][~np.isnan(v[7:])]
        if len(outside) < 2:
            continue
        b = float(outside[-2:].min())
        if b > 90:
            continue
        level = (GREY + b) / 2
        for t in range(1, len(steps)):
            if v[t - 1] > level >= v[t]:
                hit = steps[t - 1] + (v[t - 1] - level) / (v[t - 1] - v[t])
                out[side].append((x + d[0] * hit, y + d[1] * hit))
                break
    return [np.float32(p) for p in out]


def fit_line(p, axis_normal):
    """A line n.x = d through the points (n a unit normal facing out),
    dropping points that stray from it. None for too few points."""
    if len(p) < 25:
        return None
    keep = np.ones(len(p), bool)
    for _ in range(4):
        q = p[keep]
        c = q.mean(0)
        _, _, vt = np.linalg.svd(q - c)
        n = vt[1]
        if n @ axis_normal < 0:
            n = -n
        r = (p - c) @ n
        mad = np.median(np.abs(r[keep] - np.median(r[keep]))) + 1e-6
        new = np.abs(r) < max(0.75, 4 * mad)
        if new.sum() < 25 or (new == keep).all():
            keep = new if new.sum() >= 25 else keep
            break
        keep = new
    q = p[keep]
    c = q.mean(0)
    rms = float(np.sqrt((((q - c) @ n) ** 2).mean()))
    if abs(n @ axis_normal) < 0.8:
        return None
    return {'n': n.tolist(), 'd': float(n @ c), 'count': int(keep.sum()), 'rms': rms,
            'span': [q.min(0).tolist(), q.max(0).tolist()]}


AXES = [np.float32([0, -1]), np.float32([1, 0]), np.float32([0, 1]), np.float32([-1, 0])]


def lines_of(img):
    pts = edge_points(img)
    if pts is None:
        return [None] * 4
    return [fit_line(p, AXES[s]) for s, p in enumerate(pts)]


def usable(ls):
    """A side whose edge strays more than a pixel from straight was cut by
    something in front of it (the typed login's hand), and a sliver of edge
    at the frame's border (under 120 points) is too short to trust, so
    neither is used."""
    return [ln if ln and ln['rms'] < 1.0 and ln['count'] >= 120 else None for ln in ls]


def smooth_corners(lines, smooth=0.05):
    """A first guess at the four corners in every frame, for fit_camera to
    start from: on each side's line where it was seen, and otherwise on the
    smoothest path (least second difference) between frames that pin them."""
    n = len(lines)
    rows, rhs = [], []
    nv = n * 8

    def var(f, k, axis):
        return f * 8 + k * 2 + axis
    for f, ls in enumerate(lines):
        for s, ln in enumerate(ls):
            if not ln:
                continue
            w = 1 / max(ln['rms'], 0.25)
            for k in SIDES[s]:
                r = np.zeros(nv)
                r[var(f, k, 0)], r[var(f, k, 1)] = w * ln['n'][0], w * ln['n'][1]
                rows.append(r)
                rhs.append(w * ln['d'])
    for f in range(1, n - 1):
        for k in range(4):
            for a in range(2):
                r = np.zeros(nv)
                r[var(f - 1, k, a)], r[var(f, k, a)], r[var(f + 1, k, a)] = smooth, -2 * smooth, smooth
                rows.append(r)
                rhs.append(0.0)
    sol = np.linalg.lstsq(np.array(rows), np.array(rhs), rcond=None)[0]
    return sol.reshape(n, 4, 2)


# The render's camera: a 1926 px focal length (a 36 mm lens on a 1920 px
# frame), measured from the vanishing points wherever the screen is seen at
# an angle, the same all through the push in, the logins and the zoom.
FOCAL = 1926.0
K = np.array([[FOCAL, 0, FW / 2], [0, FOCAL, FH / 2], [0, 0, 1]])
SCREEN_3D = np.array([[0, 0, 0], [4, 0, 0], [4, 3, 0], [0, 3, 0]], float)   # 4:3, in screen widths of 4


def project(p):
    return cv2.projectPoints(SCREEN_3D, p[:3], p[3:], K, None)[0][:, 0, :]


def fit_camera(lines, guess, smooth=0.05, iterations=60):
    """The camera in every frame, as a turn and a position against a flat 4:3
    screen, fitted to whichever sides were seen. Where too few were (an
    edge out of shot), the camera's path stays smooth (least second
    difference), as the render's camera moves smoothly. Returns the corners."""
    n = len(lines)
    p = np.zeros((n, 6))
    for f in range(n):
        ok, r, t = cv2.solvePnP(SCREEN_3D, guess[f].astype(float), K, None, flags=cv2.SOLVEPNP_IPPE)
        p[f] = np.r_[r.ravel(), t.ravel()]
    # Smoothness in frame px: a turn moves the image by about FOCAL per
    # radian, a move by about FOCAL / distance per screen unit
    depth = float(np.median(p[:, 5]))
    sw = smooth * np.r_[[FOCAL] * 3, [FOCAL / depth] * 3]
    obs = [[(s, np.array(ln['n']), ln['d'], 1 / max(ln['rms'], 0.25)) for s, ln in enumerate(ls) if ln] for ls in lines]

    def frame_res(f, pf):
        c = project(pf)
        return np.array([w * (nv @ c[k] - d) for s, nv, d, w in obs[f] for k in SIDES[s]])

    def all_res(p):
        r = [frame_res(f, p[f]) for f in range(n)]
        r.append(((p[:-2] - 2 * p[1:-1] + p[2:]) * sw).ravel())
        return np.concatenate(r)
    # The smoothness rows are linear in p
    S = np.zeros(((n - 2) * 6, n * 6))
    for f in range(n - 2):
        for j in range(6):
            S[f * 6 + j, f * 6 + j] = sw[j]
            S[f * 6 + j, (f + 1) * 6 + j] = -2 * sw[j]
            S[f * 6 + j, (f + 2) * 6 + j] = sw[j]
    mu = 1e-3
    cost = (all_res(p) ** 2).sum()
    for _ in range(iterations):
        blocks, r0 = [], []
        for f in range(n):
            base = frame_res(f, p[f])
            J = np.zeros((len(base), 6))
            for j in range(6):
                q = p[f].copy()
                h = 1e-6 if j < 3 else 1e-6 * max(1.0, abs(depth))
                q[j] += h
                J[:, j] = (frame_res(f, q) - base) / h
            blocks.append(J)
            r0.append(base)
        rows = sum(len(b) for b in r0)
        J = np.zeros((rows, n * 6))
        at = 0
        for f, b in enumerate(blocks):
            J[at:at + len(b), f * 6:f * 6 + 6] = b
            at += len(b)
        J = np.vstack([J, S])
        r = np.concatenate(r0 + [S @ p.ravel()])
        A, g = J.T @ J, J.T @ r
        while True:
            step = np.linalg.solve(A + mu * np.diag(np.diag(A) + 1e-9), -g)
            trial = p + step.reshape(n, 6)
            new = (all_res(trial) ** 2).sum()
            if new < cost:
                p, mu = trial, max(mu / 3, 1e-9)
                break
            mu *= 4
            if mu > 1e8:
                break
        if mu > 1e8 or abs(cost - new) < 1e-9 * max(cost, 1):
            cost = min(cost, new)
            break
        cost = new
    return np.array([project(pf) for pf in p])


def measured_lines(path):
    """Each frame's edge lines, kept in the temp folder between runs, since
    decoding the render is the slow part."""
    cache = Path(tempfile.gettempdir()) / 'ti-intro' / (path.parent.name + '-' + path.stem + '.json')
    stamp = f'{path}|{path.stat().st_size}|{path.stat().st_mtime}'
    if cache.exists():
        saved = json.loads(cache.read_text())
        if saved['stamp'] == stamp:
            return saved['lines']
    lines = [lines_of(img) for img in frames(path, 'bgra')]
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({'stamp': stamp, 'lines': lines}))
    return lines


def cmd_track(product):
    spec = PRODUCTS[product]
    out = {'product': product, 'clips': {}}
    for name, file in spec['clips'].items():
        lines = [usable(ls) for ls in measured_lines(render_path(product, file))]
        if name in spec['still']:
            # A freeze frame: one place for the screen, from every frame that shows all of it
            full = [f for f, ls in enumerate(lines) if all(ls)]
            corners = fit_camera([lines[f] for f in full], smooth_corners([lines[f] for f in full]))
            corners = np.repeat(np.median(corners, 0)[None], len(lines), 0)
        else:
            corners = fit_camera(lines, smooth_corners(lines))
        seen = [[bool(ln) for ln in ls] for ls in lines]
        res = [[round(float(abs(np.array(ln['n']) @ corners[f][k] - ln['d'])), 3) for k in SIDES[s]]
               if ln else None for f, ls in enumerate(lines) for s, ln in enumerate(ls)]
        worst = max((max(x) for x in res if x), default=0)
        out['clips'][name] = {'file': file, 'corners': np.round(corners, 3).tolist(), 'seen': seen}
        print(f'{product} {name}: {len(lines)} frames, all four sides seen in {sum(all(s) for s in seen)}, '
              f'corners within {worst:.2f} px of the edges seen', flush=True)
    TRACKS.mkdir(exist_ok=True)
    (TRACKS / f'intro-{product}.json').write_text(json.dumps(out))
    print(f'wrote tracks/intro-{product}.json')


def load_track(product):
    p = TRACKS / f'intro-{product}.json'
    if not p.exists():
        sys.exit(f'no track for {product}: run  python tools/screen-swap/intro.py track {product}')
    return json.loads(p.read_text())


def cmd_check(product, every):
    tr = load_track(product)
    tiles = []
    for name, c in tr['clips'].items():
        corners = np.float32(c['corners'])
        for f, img in enumerate(frames(render_path(product, c['file']), 'bgra')):
            if f % every and f != len(corners) - 1:
                continue
            im = img[..., :3].copy()
            q = corners[f]
            for s, (a, b) in enumerate(SIDES):
                col = (0, 255, 0) if c['seen'][f][s] else (0, 140, 255)
                cv2.line(im, tuple(np.int32(q[a] * 4)), tuple(np.int32(q[b] * 4)), col, 3, cv2.LINE_AA, 2)
            t = cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA)
            cv2.putText(t, f'{name} {f}', (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
            tiles.append(t)
    cols = 6
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])
    out = Path(tempfile.gettempdir()) / f'intro-{product}-check.jpg'
    cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(out)


# ---------- Build ----------

def warp_onto(src, h, roi):
    """src (drawn at RS times the UI's px) onto the frame region roi, blurred
    first where it is drawn smaller, so text doesn't alias."""
    x0, y0, x1, y1 = roi
    t = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ h @ np.diag([1 / RS, 1 / RS, 1])
    c = h @ [SW / 2, SH / 2, 1]
    jac = (h[:2, :2] - np.outer(c[:2] / c[2], h[2, :2])) / c[2] / RS
    scale = np.sqrt(abs(np.linalg.det(jac)))
    pre = max(0.0, 0.5 * (1 / max(scale, 1e-3) - 1))
    if pre > 0.15:
        src = cv2.GaussianBlur(src, (0, 0), pre)
    return cv2.warpPerspective(src, t, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def put_screen(frame, corners, f, ours, hand=None):
    """Our screen (toned, BGR float, RS times the UI's px) in place of the grey
    in frame f, over the shutter: corners between frames are taken as straight
    moves, and each part-frame is warped and averaged."""
    n = len(corners)
    a, b = corners[max(f - 1, 0)], corners[min(f + 1, n - 1)]
    here = corners[f]
    move = max(np.abs(here - a).max(), np.abs(b - here).max()) * SHUTTER
    k = int(np.clip(np.ceil(move), 1, 16))
    ts = (np.arange(k) + 0.5) / k - 0.5
    allq = []
    for t in ts * SHUTTER:
        q = here + ((b - here) if t > 0 else (here - a)) * t
        allq.append(q)
    allq = np.float32(allq)
    lo = np.floor(allq.reshape(-1, 2).min(0)) - 3
    hi = np.ceil(allq.reshape(-1, 2).max(0)) + 3
    x0, y0 = int(max(0, lo[0])), int(max(0, lo[1]))
    x1, y1 = int(min(FW, hi[0])), int(min(FH, hi[1]))
    if x1 <= x0 or y1 <= y0:
        return frame
    roi = (x0, y0, x1, y1)
    ones = np.ones((SH * RS, SW * RS), np.float32)
    acc = np.zeros((y1 - y0, x1 - x0, 3), np.float32)
    cov = np.zeros((y1 - y0, x1 - x0), np.float32)
    for q in allq:
        h = cv2.getPerspectiveTransform(CORNERS, q).astype(float)
        m = warp_onto(ones, h, roi)
        acc += warp_onto(ours, h, roi) * m[..., None]
        cov += m
    acc /= len(allq)
    cov /= len(allq)
    if hand is not None:
        keep = 1 - hand[y0:y1, x0:x1].astype(np.float32) / 255
        acc *= keep[..., None]
        cov *= keep
    fr = frame[y0:y1, x0:x1].astype(np.float32)
    out = frame.copy()
    out[y0:y1, x0:x1] = np.clip(fr - cov[..., None] * GREY + acc, 0, 255).astype(np.uint8)
    return out


def first_screen(steps):
    """What the device shows straight after login: the sequence's first step
    after its log in step, as that step's screen arrives (nothing typed or
    picked yet). A take or return door step plays its clip first, and a
    sequence that only logs out goes back to the login screen."""
    i = 1 if steps and steps[0].get('type') == 'login_method' else 0
    if i >= len(steps) or steps[i].get('type') in ('logout', 'open_pocket_take', 'check_in'):
        return {'kind': 'login'}, None
    return {'kind': 'arrive', 'steps': steps, 'index': i}, steps[i]


def render_screens(config, specs, out_dir):
    job = {'theme': config.get('theme_colour') or '', 'button': config.get('button_colour') or '',
           'logo': config.get('logo') or '', 'scale': RS, 'screens': []}
    for k, spec in enumerate(specs):
        job['screens'].append(dict(spec, out=str(out_dir / f'screen-{k}.png')))
    (out_dir / 'job.json').write_text(json.dumps(job))
    subprocess.run(['node', str(HERE / 'render.js'), str(out_dir / 'job.json'), browser()], check=True)
    return [tone(cv2.imread(s['out'])) for s in job['screens']]


def first_stamp(step):
    """A stamp of the first screen's step without its pop-up lines, the same
    as firstStamp() in js/demo.js, so a change to it in the CMS falls back
    to the usual clip."""
    if not step:
        return ''
    text = {k: v for k, v in (step.get('text') or {}).items() if k not in ('instruction', 'clip_instruction')}
    v = {'type': step.get('type'), 'params': step.get('params') or {}, 'text': text}
    return fnv(json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False))


def cmd_build(userid, cms):
    config, seq = user_data(userid, cms)
    if not config:
        sys.exit(f'no config for {userid}')
    product, location = config['solution'], config['location']
    login = LOGINS.get(config['login_type'])
    if product not in PRODUCTS or not login:
        sys.exit(f'{userid}: no renders for {product} with {config["login_type"]} yet')
    spec = PRODUCTS[product]
    tr = load_track(product)['clips']
    steps = (seq or {}).get('steps') or []
    first, first_step = first_screen(steps)
    uid = str(config['user_id']).lower()
    out_dir = DEMO / 'assets' / 'custom' / uid
    out_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as tmp:
        login_scr, first_scr = render_screens(config, [{'kind': 'login'}, first], Path(tmp))

    pushin = render_path(product, f'{location}_pushin.mov')
    zoom = render_path(product, f'{location}_zoom.mov')
    bkgd = render_path(product, f'{location}_bkgd.mov')
    login_clip = render_path(product, spec['clips'][login])
    hand = render_path(product, spec['hand']) if login == 'typed' else None
    trim = spec['trim'].get(login, 0)
    switch = spec['logged_in'][login]

    video = out_dir / 'intro.mp4'
    # BT.709 and tagged as such: untagged, Edge decodes the colours about 5
    # levels off in red, and the HTML screen that takes over shows the jump
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{FW}x{FH}',
                            '-r', '30', '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv',
                            '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709',
                            '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                            '-movflags', '+faststart', '-an', str(video)], stdin=subprocess.PIPE)
    first_frame = last = None
    count = 0

    def emit(img):
        nonlocal first_frame, last, count
        if first_frame is None:
            first_frame = img
        last = img
        count += 1
        enc.stdin.write(img.tobytes())

    c = np.float32(tr['pushin']['corners'])
    for f, img in enumerate(frames(pushin)):
        emit(put_screen(img, c, f, login_scr))

    c = np.float32(tr[login]['corners'])
    n = len(c) - trim
    if login == 'barcode':
        # The camera moves, so the background moves with it from the frame it started on
        bk = frames(bkgd, count=spec['barcode_bkgd'] + n)
        for _ in range(spec['barcode_bkgd']):
            next(bk)
    else:
        # The camera is still: the background as the push in left it
        still = None
        for still in frames(bkgd, count=len(tr['pushin']['corners'])):
            pass
        bk = iter(lambda: still, None)
    hands = frames(hand, 'gray', count=n) if hand else None
    for f, img in enumerate(frames(login_clip, 'bgra', count=n)):
        a = img[..., 3:4].astype(np.float32) / 255
        comp = (img[..., :3] * a + next(bk) * (1 - a)).round().astype(np.uint8)
        emit(put_screen(comp, c, f, login_scr if f < switch else first_scr, next(hands) if hands else None))

    c = np.float32(tr['zoom']['corners'])
    for f, img in enumerate(frames(zoom)):
        emit(put_screen(img, c, f, first_scr))
    enc.stdin.close()
    if enc.wait():
        sys.exit('ffmpeg failed')
    cv2.imwrite(str(out_dir / 'intro-start.jpg'), first_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(str(out_dir / 'intro-end.jpg'), last, [cv2.IMWRITE_JPEG_QUALITY, 92])

    rel = f'assets/custom/{uid}/intro'
    data = read_custom()
    entry = data.setdefault(uid, {})
    entry['intro'] = {
        'label': f'{product} push in, {config["login_type"]} login and zoom, {userid}',
        'video': rel + '.mp4', 'poster': rel + '-start.jpg', 'end': rel + '-end.jpg',
        'login_screen': f'{product}_new_zoom',
        'made': {'solution': product, 'location': location, 'login_type': config['login_type'],
                 'theme_colour': (config.get('theme_colour') or '').lower(),
                 'button_colour': (config.get('button_colour') or '').lower(),
                 'logo': fnv(config.get('logo') or ''),
                 'first': first_stamp(first_step)}}
    write_custom(data)
    print(f'{userid}: {rel}.mp4, {count} frames; wrote data/custom-clips.js')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('track')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p = sub.add_parser('check')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p.add_argument('--every', type=int, default=10)
    p = sub.add_parser('build')
    p.add_argument('userid')
    p.add_argument('--cms')
    args = ap.parse_args()
    if args.cmd == 'track':
        cmd_track(args.product)
    elif args.cmd == 'check':
        cmd_check(args.product, args.every)
    else:
        cmd_build(args.userid, args.cms)


if __name__ == '__main__':
    main()
