"""
Puts a user's own device screens into Emil's renders of the push in, the
login and the zoom: their login screen as the camera pushes in and they log
in, then the first screen of their sequence as it zooms in. One clip per
user, for their product, location and login type.

    python tools/screen-swap/intro.py track <product> [--location <location>]
    python tools/screen-swap/intro.py check <product> [--location <location>] [--every 10]
    python tools/screen-swap/intro.py build <user id> [--cms <url>]

(from the demo folder). Needs numpy, opencv-python, ffmpeg and node on the
PATH, and Edge or Chrome (set BROWSER to its path if it isn't Edge's usual
place).

The renders are Emil's second set (27 to 31 Oct 2026), in
New-vids/renders/<product>/ next to the repo (set TI_RENDERS to look
elsewhere), renamed by location and login type (README.txt there has his
names). Per location: <location>_pushin, which starts on the environment
clip's End framing and ends on the monitor, its screen pass
<location>_pushin_screen, the three logins <location>_login_<rfid, barcode,
typed> and <location>_zoom, all comped over the location. Per product: the
logins and zoom on a transparent background (the camera is the same in
every location), SmartDrawer's login screen passes login_<login>_screen,
and the typed login's hand (login_typed_hand on SmartDrawer, as alpha;
login_typed_hand_matte on SupplySystem).

track: once per product. Emil left the device screens flat grey (120 in
  every channel), so a screen is found in each frame by its edges against
  the black bezel, and the render's camera is fitted to them. Where an edge
  is out of shot (the barcode login looks down at the scanner, the zoom
  ends with the screen filling the frame), the corners follow the camera's
  path from the frames either side. The logins and zoom are tracked once;
  each location's push in is tracked for its own camera. Also finds the
  typed login's taps from the hand. Writes
  tracks/intro-<product>.json.
check: a contact sheet of a track, for checking it by eye.
build: draws the user's screens in headless Edge (render.html), puts them
  into the push in, the login and the zoom for their location, and writes
  assets/custom/<user id>/intro.mp4 with its first and last frames, and the
  intro entry in data/custom-clips.js.

The swap, per frame: the grey becomes our screen, toned as the renders tone
a screen, warped onto the corners and averaged over the frame's shutter, so
it carries the render's motion blur. Where a screen pass gives the screen's
matte, that says where our screen goes (the typed login's hand is already
held out of it); elsewhere it goes wherever the frame is still the flat
grey, so a hand, a card or a nearer cabinet in front stays. The screen
pass's glass reflections and the hand's glow go on top.
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

LOCATIONS = ['aircraft_hangar', 'amazon_warehouse', 'cnc_machine_shop', 'f1_automotive', 'medical_cleanroom', 'rail_depot']
LOGINS = {'barcode': 'barcode', 'rfid': 'rfid', 'login_no_password': 'typed', 'login_with_password': 'typed'}
OTHER = {'smartdrawer': 'supplysystem', 'supplysystem': 'smartdrawer'}

# Per product: whether its logins have screen passes, the typed login's hand
# (alpha of a hand pass, or a matte), and the frame each badge or barcode
# login logs in on (the fob on the reader, the card held under the scanner;
# from contact sheets). The typed login logs in on its last tap, found by track.
PRODUCTS = {
    'smartdrawer': {'login_passes': True, 'hand': ('login_typed_hand.mov', 'alpha'),
                    'logged_in': {'rfid': 62, 'barcode': 72}},
    'supplysystem': {'login_passes': False, 'hand': ('login_typed_hand_matte.mov', 'luma'),
                     'logged_in': {'rfid': 62, 'barcode': 66}},
}


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


def pass_matte(img):
    """Where a screen pass shows the screen, 0 to 1. SmartDrawer's passes carry
    it in alpha. SupplySystem's push in pass has none, and is black off the
    screen, so it is only good for telling which screen is which."""
    if img.shape[2] == 4 and img[..., 3].min() < 255:
        return img[..., 3].astype(np.float32) / 255
    return (img[..., :3].max(2) > 8).astype(np.float32)


# ---------- Tracking ----------

def grey_components(img):
    m = (np.abs(img[..., :3].astype(np.int16) - GREY) <= 2).all(2)
    if img.shape[2] == 4:
        m &= img[..., 3] >= 250
    n, lab, st, cen = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=4)
    return lab, st, cen


def pick_screen(img, inside=None, min_area=600):
    """The grey area that is the screen being tracked: the one most inside the
    screen pass's matte where there is one, otherwise the largest. Returns
    its mask and box, or None."""
    lab, st, cen = grey_components(img)
    ks = [k for k in range(1, len(st)) if st[k, 4] >= min_area]
    if not ks:
        return None
    if inside is not None:
        overlap = np.bincount(lab[inside], minlength=len(st))
        k = max(ks, key=lambda k: overlap[k])
        if overlap[k] < 0.5 * st[k, 4]:
            return None
    else:
        k = max(ks, key=lambda k: st[k, 4])
    return (lab == k).astype(np.uint8), st[k, :4].tolist()


def edge_points(img, comp):
    """Points on the grey screen's edges, by side, to a fraction of a pixel.
    Each is where the brightness crosses halfway from the grey to the bezel
    just outside it, along the side's own axis. Points whose outside is off
    the frame, or isn't dark bezel (the hand, the barcode card), are left out."""
    bgr = img[..., :3].astype(np.int16)
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


def lines_of(img, comp):
    pts = edge_points(img, comp)
    return [fit_line(p, AXES[s]) for s, p in enumerate(pts)]


def usable(ls, box):
    """A side whose edge strays more than a pixel from straight was cut by
    something in front of it (the typed login's hand), and a sliver of edge
    at the frame's border is too short to trust, so neither is used. A
    sliver is under 120 points, or for a screen far off (the push in's
    start), under half the screen's own size."""
    if not box:
        return [None] * 4
    w, h = box[2], box[3]
    need = [max(30, min(120, 0.5 * e)) for e in (w, h, w, h)]
    return [ln if ln and ln['rms'] < 1.0 and ln['count'] >= need[s] else None for s, ln in enumerate(ls)]


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


def project(p, pts=SCREEN_3D):
    return cv2.projectPoints(pts, p[:3], p[3:], K, None)[0][:, 0, :]


# Where an edge is out of shot, the edges seen leave the camera two ways to
# go, and its path decides. SMOOTH keeps the path smooth (least second
# difference); HOLD keeps it still wherever the edges seen keep still (least
# first difference). Without HOLD, in the first set's barcode login the
# screen grew from 1100 to 1200 px wide and back while the camera waited for
# the scan (the wobble Rhys saw); with it the screen keeps one size, 4:3, as
# it should. HOLD_TURN holds the camera's turn harder: once only the screen's
# left and right edges are in shot (the end of SupplySystem's zoom), nothing
# seen pins its turn, and it drifted until one side was 5% taller than the
# other on a screen that is square on. Clips that show all four edges
# barely move.
SMOOTH, HOLD, HOLD_TURN = 0.05, 0.05, 0.3


def fit_camera(lines, guess, iterations=60):
    """The camera in every frame, as a turn and a position against a flat 4:3
    screen, fitted to whichever sides were seen. What those leave open
    follows a smooth, steady path (SMOOTH, HOLD and HOLD_TURN). Returns the poses."""
    n = len(lines)
    p = np.zeros((n, 6))
    for f in range(n):
        ok, r, t = cv2.solvePnP(SCREEN_3D, guess[f].astype(float), K, None, flags=cv2.SOLVEPNP_IPPE)
        p[f] = np.r_[r.ravel(), t.ravel()]
    # In frame px: a turn moves the image by about FOCAL per radian, a move
    # by about FOCAL / distance per screen unit
    depth = float(np.median(p[:, 5]))
    scale = np.r_[[FOCAL] * 3, [FOCAL / depth] * 3]
    obs = [[(s, np.array(ln['n']), ln['d'], 1 / max(ln['rms'], 0.25)) for s, ln in enumerate(ls) if ln] for ls in lines]

    def frame_res(f, pf):
        c = project(pf)
        return np.array([w * (nv @ c[k] - d) for s, nv, d, w in obs[f] for k in SIDES[s]])

    # The path rows (second and first differences) are linear in p; their
    # normal matrix is banded
    S = np.zeros(((n - 2) * 6 + (n - 1) * 6, n * 6))
    for f in range(n - 2):
        for j in range(6):
            S[f * 6 + j, f * 6 + j] = SMOOTH * scale[j]
            S[f * 6 + j, (f + 1) * 6 + j] = -2 * SMOOTH * scale[j]
            S[f * 6 + j, (f + 2) * 6 + j] = SMOOTH * scale[j]
    at = (n - 2) * 6
    for f in range(n - 1):
        for j in range(6):
            hold = HOLD_TURN if j < 3 else HOLD
            S[at + f * 6 + j, f * 6 + j] = -hold * scale[j]
            S[at + f * 6 + j, (f + 1) * 6 + j] = hold * scale[j]
    StS = S.T @ S

    def cost_of(p):
        return sum((frame_res(f, p[f]) ** 2).sum() for f in range(n)) + ((S @ p.ravel()) ** 2).sum()
    mu = 1e-3
    cost = cost_of(p)
    for _ in range(iterations):
        # Each frame's residuals depend on its own pose only, so the normal
        # matrix is block diagonal plus the smoothness band
        A = StS.copy()
        g = StS @ p.ravel()
        for f in range(n):
            base = frame_res(f, p[f])
            if not len(base):
                continue
            J = np.zeros((len(base), 6))
            for j in range(6):
                q = p[f].copy()
                h = 1e-6 if j < 3 else 1e-6 * max(1.0, abs(depth))
                q[j] += h
                J[:, j] = (frame_res(f, q) - base) / h
            A[f * 6:f * 6 + 6, f * 6:f * 6 + 6] += J.T @ J
            g[f * 6:f * 6 + 6] += J.T @ base
        while True:
            step = np.linalg.solve(A + mu * np.diag(np.diag(A) + 1e-9), -g)
            trial = p + step.reshape(n, 6)
            new = cost_of(trial)
            if new < cost:
                p, mu = trial, max(mu / 3, 1e-9)
                break
            mu *= 4
            if mu > 1e8:
                break
        if mu > 1e8 or abs(cost - new) < 1e-9 * max(cost, 1):
            break
        cost = new
    return p


def corners_of(poses):
    return np.array([project(pf) for pf in poses])


def cached(key, stamp_of, work):
    """work()'s result, kept in the temp folder between runs while the
    renders it read are unchanged, since decoding them is the slow part."""
    cache = Path(tempfile.gettempdir()) / 'ti-intro' / (key + '.json')
    stamp = '|'.join(f'{p}|{p.stat().st_size}|{p.stat().st_mtime}' for p in stamp_of)
    if cache.exists():
        saved = json.loads(cache.read_text())
        if saved['stamp'] == stamp:
            return saved['value']
    value = work()
    cache.parent.mkdir(exist_ok=True)
    cache.write_text(json.dumps({'stamp': stamp, 'value': value}))
    return value


def measure_clip(path):
    """Each frame's edge lines and box for the one screen in a login or zoom."""
    def work():
        out = []
        for img in frames(path, 'bgra'):
            got = pick_screen(img, min_area=2000)
            out.append([lines_of(img, got[0]), got[1]] if got else [[None] * 4, None])
        return out
    return cached(f'{path.parent.name}-{path.stem}', [path], work)


def measure_pushin(product, location):
    """Each frame's edge lines and box for the product's screen in a
    location's push in. The other cabinet's screen is in shot as it starts,
    also grey, so the screen pass says which is which."""
    comp_p = render_path(product, f'{location}_pushin.mov')
    pass_p = render_path(product, f'{location}_pushin_screen.mov')

    def work():
        out = []
        for img, scr in zip(frames(comp_p, 'bgr24'), frames(pass_p, 'bgra')):
            got = pick_screen(img, inside=pass_matte(scr) > 0.5)
            out.append([lines_of(img, got[0]), got[1]] if got else [[None] * 4, None])
        return out
    return cached(f'{product}-{location}-pushin', [comp_p, pass_p], work)


def fit_track(measured, still=False):
    """Corners for every frame from the measured lines. A still camera gets one
    place, from every frame that shows all four sides."""
    lines = [usable(ls, box) for ls, box in measured]
    seen = [[bool(ln) for ln in ls] for ls in lines]
    if not any(any(s) for s in seen):
        return None
    if still:
        full = [ls for ls in lines if all(ls)]
        corners = corners_of(fit_camera(full, smooth_corners(full)))
        corners = np.repeat(np.median(corners, 0)[None], len(lines), 0)
    else:
        corners = corners_of(fit_camera(lines, smooth_corners(lines)))
    res = [abs(np.array(ln['n']) @ corners[f][k] - ln['d']) for f, ls in enumerate(lines)
           for s, ln in enumerate(ls) if ln for k in SIDES[s]]
    return {'corners': np.round(corners, 3).tolist(), 'seen': seen, 'worst': round(float(max(res, default=0)), 2)}


def is_still(measured):
    """Whether the camera holds still: the corners of every frame that shows
    all four sides within half a pixel of each other."""
    full = [usable(ls, box) for ls, box in measured]
    full = [ls for ls in full if all(ls)]
    if len(full) < len(measured) * 0.25:
        return False
    c = corners_of(fit_camera(full, smooth_corners(full)))
    return float(np.abs(c - np.median(c, 0)).max()) < 0.5


# ---------- The typed login's taps ----------

def fingertips(product):
    """The fingertip in each frame of the typed login: the top of the hand,
    since the finger points up at the screen. None where no hand is in shot."""
    name, kind = PRODUCTS[product]['hand']
    path = render_path(product, name)

    def work():
        out = []
        for img in frames(path, 'bgra' if kind == 'alpha' else 'gray'):
            m = (img[..., 3] if kind == 'alpha' else img) > 128
            ys, xs = np.nonzero(m)
            if len(ys) < 50 or ys.min() >= FH - 2:
                out.append(None)
                continue
            top = ys.min()
            out.append([float(xs[ys <= top + 6].mean()), float(top)])
        return out
    return cached(f'{product}-fingertips', [path], work)


def find_taps(tips, corners):
    """The taps: each place the fingertip comes to rest (it moves under 3 px
    from the frame before, and no more than either side; rests at least 7
    frames apart, keeping the stillest), in the device UI's px through the
    screen's corners. Emil's finger glides from key to key rather than
    tapping sharply, so a rest is the best sign of a press. In both renders
    the first is on the login screen's User ID field and the last on the
    keyboard's Enter."""
    n = len(tips)
    speed = np.full(n, np.inf)
    for f in range(1, n):
        a, b = tips[f - 1], tips[f]
        if a and b:
            speed[f] = np.hypot(b[0] - a[0], b[1] - a[1])
    h = cv2.getPerspectiveTransform(np.float32(corners[0]), CORNERS)
    taps = []
    for f in range(1, n - 1):
        if not (speed[f] < 3 and speed[f] <= speed[f - 1] and speed[f] <= speed[f + 1]):
            continue
        # The pad that touches sits a little below the finger's top edge
        x, y = cv2.perspectiveTransform(np.float32([[[tips[f][0], tips[f][1] + 6]]]), h)[0, 0]
        if not (0 <= x <= SW + 20 and 0 <= y <= SH):
            continue
        tap = {'frame': f, 'speed': float(speed[f]), 'at': [round(float(min(x, SW - 4)), 1), round(float(y), 1)]}
        if taps and f - taps[-1]['frame'] < 7:
            if tap['speed'] < taps[-1]['speed']:
                taps[-1] = tap
            continue
        taps.append(tap)
    return {'taps': [{'frame': t['frame'], 'at': t['at']} for t in taps]}


def cmd_track(product, only=None):
    path = TRACKS / f'intro-{product}.json'
    out = json.loads(path.read_text()) if path.exists() and only else {'product': product, 'clips': {}, 'pushin': {}}
    if not only:
        for name in ['rfid', 'barcode', 'typed', 'zoom']:
            file = 'zoom_alpha.mov' if name == 'zoom' else f'login_{name}_alpha.mov'
            m = measure_clip(render_path(product, file))
            still = name != 'zoom' and is_still(m)
            t = fit_track(m, still)
            out['clips'][name] = dict(t, file=file, still=still)
            print(f'{product} {name}: {len(m)} frames, {"still" if still else "moving"}, all four sides seen in '
                  f'{sum(all(s) for s in t["seen"])}, corners within {t["worst"]:.2f} px of the edges seen', flush=True)
        out['typed'] = find_taps(fingertips(product), out['clips']['typed']['corners'])
        print(f'{product} typed: taps at ' +
              ', '.join(f'{t["frame"]} ({t["at"][0]:.0f}, {t["at"][1]:.0f})' for t in out['typed']['taps']))
    for loc in [only] if only else LOCATIONS:
        m = measure_pushin(product, loc)
        t = fit_track(m)
        out['pushin'][loc] = t
        print(f'{product} {loc} push in: {len(m)} frames, all four sides seen in '
              f'{sum(all(s) for s in t["seen"])}, corners within {t["worst"]:.2f} px of the edges seen', flush=True)
    TRACKS.mkdir(exist_ok=True)
    path.write_text(json.dumps(out))
    print(f'wrote tracks/intro-{product}.json')


def load_track(product):
    p = TRACKS / f'intro-{product}.json'
    if not p.exists():
        sys.exit(f'no track for {product}: run  python tools/screen-swap/intro.py track {product}')
    return json.loads(p.read_text())


def draw_quad(im, q, seen):
    for s, (a, b) in enumerate(SIDES):
        col = (0, 255, 0) if seen[s] else (0, 140, 255)
        cv2.line(im, tuple(np.int32(np.array(q[a]) * 4)), tuple(np.int32(np.array(q[b]) * 4)), col, 3, cv2.LINE_AA, 2)


def cmd_check(product, location, every):
    tr = load_track(product)
    tiles = []

    def tile(im, label):
        t = cv2.resize(im, (480, 270), interpolation=cv2.INTER_AREA)
        cv2.putText(t, label, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1, cv2.LINE_AA)
        tiles.append(t)
    location = location or 'rail_depot'
    p = tr['pushin'][location]
    for f, img in enumerate(frames(render_path(product, f'{location}_pushin.mov'))):
        if f % every and f != len(p['corners']) - 1:
            continue
        im = img.copy()
        draw_quad(im, p['corners'][f], p['seen'][f])
        tile(im, f'pushin {f}')
    for name, c in tr['clips'].items():
        for f, img in enumerate(frames(render_path(product, f'{location}_{"zoom" if name == "zoom" else "login_" + name}.mov'))):
            if f % every and f != len(c['corners']) - 1:
                continue
            im = img.copy()
            draw_quad(im, c['corners'][f], c['seen'][f])
            if name == 'typed':
                for t in tr['typed']['taps']:
                    if t['frame'] == f:
                        h = cv2.getPerspectiveTransform(CORNERS, np.float32(c['corners'][f]))
                        x, y = cv2.perspectiveTransform(np.float32([[t['at']]]), h)[0, 0]
                        cv2.circle(im, (int(x), int(y)), 14, (0, 0, 255), 3)
            tile(im, f'{name} {f}')
    cols = 6
    while len(tiles) % cols:
        tiles.append(np.zeros_like(tiles[0]))
    sheet = np.vstack([np.hstack(tiles[i:i + cols]) for i in range(0, len(tiles), cols)])
    out = Path(tempfile.gettempdir()) / f'intro-{product}-{location}-check.jpg'
    cv2.imwrite(str(out), sheet, [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(out)


# ---------- Build ----------

def warp_onto(src, h, roi, scale=RS, border=cv2.BORDER_CONSTANT):
    """src (drawn at scale times the UI's px) onto the frame region roi,
    blurred first where it is drawn smaller, so text doesn't alias."""
    x0, y0, x1, y1 = roi
    t = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ h @ np.diag([1 / scale, 1 / scale, 1])
    c = h @ [SW / 2, SH / 2, 1]
    jac = (h[:2, :2] - np.outer(c[:2] / c[2], h[2, :2])) / c[2] / scale
    s = np.sqrt(abs(np.linalg.det(jac)))
    pre = max(0.0, 0.5 * (1 / max(s, 1e-3) - 1))
    if pre > 0.15:
        src = cv2.GaussianBlur(src, (0, 0), pre)
    return cv2.warpPerspective(src, t, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=border)


def shutter_quads(corners, f):
    """The screen's corners through frame f's shutter: corners between frames
    are taken as straight moves, sampled finely enough for the movement."""
    n = len(corners)
    a, b = corners[max(f - 1, 0)], corners[min(f + 1, n - 1)]
    here = corners[f]
    move = max(np.abs(here - a).max(), np.abs(b - here).max()) * SHUTTER
    k = int(np.clip(np.ceil(move), 1, 16))
    ts = ((np.arange(k) + 0.5) / k - 0.5) * SHUTTER
    return np.float32([here + ((b - here) if t > 0 else (here - a)) * t for t in ts])


def box_of(quads, pad=3):
    lo = np.floor(quads.reshape(-1, 2).min(0)) - pad
    hi = np.ceil(quads.reshape(-1, 2).max(0)) + pad
    x0, y0 = int(max(0, lo[0])), int(max(0, lo[1]))
    x1, y1 = int(min(FW, hi[0])), int(min(FH, hi[1]))
    return (x0, y0, x1, y1) if x1 > x0 and y1 > y0 else None


def put_screen(frame, corners, f, ours, matte=None, hand=None, refl=None):
    """Our screen (toned, BGR float, RS times the UI's px) in place of the grey
    in frame f, averaged over the shutter.
    matte: where the screen is, from a screen pass (hand already held out).
    Without one, the screen goes where the frame is the flat grey, so
    whatever is in front of it stays.
    hand: a hand matte to hold out as well.
    refl: reflections to add on the screen (frame px, BGR float), or a
    callable giving them for the region."""
    quads = shutter_quads(corners, f)
    roi = box_of(quads)
    if roi is None:
        return frame
    x0, y0, x1, y1 = roi
    ones = np.ones((SH * RS, SW * RS), np.float32)
    acc = np.zeros((y1 - y0, x1 - x0, 3), np.float32)
    cov = np.zeros((y1 - y0, x1 - x0), np.float32)
    for q in quads:
        h = cv2.getPerspectiveTransform(CORNERS, q).astype(float)
        if matte is None:
            cov += warp_onto(ones, h, roi)
        # Out past its edges our screen carries on as its edge pixels, so
        # wherever the grey reaches a pixel past the track there's no seam
        acc += warp_onto(ours, h, roi, border=cv2.BORDER_REPLICATE)
    acc /= len(quads)
    fr = frame[y0:y1, x0:x1].astype(np.float32)
    if matte is None:
        cov /= len(quads)
        w = cov * grey_left(fr, cov)
        # Flat grey just outside the track's edges (it can be a pixel or two
        # out in the fastest frames) goes too
        near = cv2.dilate((cov > 0.01).astype(np.uint8), np.ones((7, 7), np.uint8)) > 0
        flat = (np.abs(fr - GREY).max(2) <= 3) & near
        w = np.maximum(w, flat.astype(np.float32))
    else:
        w = matte[y0:y1, x0:x1]
    if hand is not None:
        w = w * (1 - hand[y0:y1, x0:x1].astype(np.float32) / 255)
    out_roi = fr + w[..., None] * (acc - GREY)
    if refl is not None:
        r = refl(roi) if callable(refl) else refl[y0:y1, x0:x1]
        out_roi += w[..., None] * r
    out = frame.copy()
    out[y0:y1, x0:x1] = np.clip(out_roi, 0, 255).astype(np.uint8)
    return out


def grey_left(fr, cov):
    """How much of each pixel the screen's grey still shows: 1 where the frame
    is the flat grey, falling to 0 where something stands in front of it.
    Judged inside the screen, then spread a few pixels so its edges under
    whatever is in front are held out too."""
    inner = cov > 0.98
    off = np.abs(fr - GREY).max(2)
    blocked = np.clip((off - 4) / 20, 0, 1) * inner
    blocked = cv2.dilate(blocked, np.ones((5, 5), np.uint8))
    return 1 - blocked


def reflection(scr, floor):
    """The screen pass's glass reflections and the hand's glow: what it shows
    above its darkest part, with the render's noise smoothed out."""
    rgb = cv2.GaussianBlur(scr[..., :3].astype(np.float32), (0, 0), 1.5)
    return np.maximum(rgb - floor, 0) * REFLECT


# How much of the screen pass's reflections go on our screen
REFLECT = 0.6


def pass_floor(product, path):
    """The screen pass's darkest level inside the screen (its 2nd percentile,
    over every 10th frame), taken as no reflection at all."""
    def work():
        vals = []
        for f, scr in enumerate(frames(path, 'bgra')):
            if f % 10:
                continue
            m = pass_matte(scr) > 0.99
            if m.sum() > 1000:
                vals.append(float(np.percentile(scr[..., :3][m].mean(1), 2)))
        return float(np.median(vals))
    return cached(f'{product}-{path.stem}-floor', [path], work)


class Carry:
    """Reflections carried on the screen itself, from the last frame that had
    a screen pass into clips that have none: SupplySystem's logins, and both
    zooms, where they fade out so the last frame is the plain screen the
    HTML takes over from."""
    def __init__(self):
        self.ui = None

    def take(self, refl, corners):
        h = cv2.getPerspectiveTransform(np.float32(corners), CORNERS).astype(float)
        self.ui = cv2.warpPerspective(refl, h, (SW, SH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)

    def at(self, corners, k=1.0):
        if self.ui is None or k <= 0:
            return None
        h = cv2.getPerspectiveTransform(CORNERS, np.float32(corners)).astype(float)
        return lambda roi: warp_onto(self.ui, h, roi, scale=1, border=cv2.BORDER_REPLICATE) * k


def first_screen(steps):
    """What the device shows straight after login: the sequence's first step
    after its log in step, as that step's screen arrives (nothing typed or
    picked yet). A take or return door step plays its clip first, and a
    sequence that only logs out goes back to the login screen."""
    i = 1 if steps and steps[0].get('type') == 'login_method' else 0
    if i >= len(steps) or steps[i].get('type') in ('logout', 'open_pocket_take', 'check_in'):
        return {'kind': 'login'}, None
    return {'kind': 'arrive', 'steps': steps, 'index': i}, steps[i]


def typed_plan(userid, taps, first_spec):
    """The typed login as screens over the clip's frames. Emil's finger taps
    the login screen's User ID field first, and the keyboard comes up; each
    tap after that presses the key under the finger and puts the next of the
    user ID's characters in the field (several at once if the ID is longer
    than the taps, and some taps are passed over if it is shorter); the
    last tap is the keyboard's Enter, and the first screen follows.
    Returns the screens to draw and, as (frame, screen), when each comes in."""
    chars = list(str(userid))
    field, keys, enter = taps[0], taps[1:-1], taps[-1]
    n, m = len(keys), len(chars)
    if m <= n:
        pick = sorted({round(i * (n - 1) / max(m - 1, 1)) for i in range(m)}) if m else []
        typed = {k: chars[i] for i, k in enumerate(pick)}
    else:
        typed = {k: ''.join(chars[k * m // n:(k + 1) * m // n]) for k in range(n)}
    # Capitals show with Caps Lock on, as the case of what was typed last, so
    # the keyboard keeps that case through Enter
    upper = bool(chars) and chars[0].isupper()
    specs = [{'kind': 'login'}, {'kind': 'keyboard', 'text': '', 'upper': upper}]
    events = [(field['frame'] + 4, 1)]
    text = ''
    for k, t in enumerate(keys):
        if k not in typed:
            continue
        text += typed[k]
        upper = typed[k][-1].isupper()
        specs.append({'kind': 'keyboard', 'text': text, 'upper': upper, 'press': t['at']})
        events.append((t['frame'] - 1, len(specs) - 1))
        specs.append({'kind': 'keyboard', 'text': text, 'upper': upper})
        events.append((t['frame'] + 4, len(specs) - 1))
    specs.append({'kind': 'keyboard', 'text': text, 'upper': upper, 'press': enter['at']})
    events.append((enter['frame'] - 1, len(specs) - 1))
    specs.append(first_spec)
    events.append((enter['frame'] + 6, len(specs) - 1))
    return specs, events


def render_screens(config, specs, out_dir):
    job = {'theme': config.get('theme_colour') or '', 'button': config.get('button_colour') or '',
           'logo': config.get('logo') or '', 'scale': RS, 'screens': []}
    for k, spec in enumerate(specs):
        job['screens'].append(dict(spec, out=str(out_dir / f'screen-{k}.png')))
    (out_dir / 'job.json').write_text(json.dumps(job))
    subprocess.run(['node', str(HERE / 'render.js'), str(out_dir / 'job.json'), browser()], check=True)
    results = json.loads((out_dir / 'job.json.results').read_text())
    return [tone(cv2.imread(s['out'])) for s in job['screens']], results


def first_stamp(step):
    """A stamp of the first screen's step without its pop-up lines, the same
    as firstStamp() in js/demo.js, so a change to it in the CMS falls back
    to the usual clip."""
    if not step:
        return ''
    text = {k: v for k, v in (step.get('text') or {}).items() if k not in ('instruction', 'clip_instruction')}
    v = {'type': step.get('type'), 'params': step.get('params') or {}, 'text': text}
    return fnv(json.dumps(v, sort_keys=True, separators=(',', ':'), ensure_ascii=False))


def encoder(video):
    # BT.709 and tagged as such: untagged, Edge decodes the colours about 5
    # levels off in red, and the HTML screen that takes over shows the jump.
    # setparams because ffmpeg 8 tags the file from the frames, which the
    # scale leaves without primaries or transfer, and ignores the options below
    return subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{FW}x{FH}',
                             '-r', '30', '-i', '-', '-vf', 'scale=out_color_matrix=bt709:out_range=tv,'
                             'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv',
                             '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p', '-colorspace', 'bt709',
                             '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                             '-movflags', '+faststart', '-an', '-f', 'mp4', str(video)], stdin=subprocess.PIPE)


# Bump when a change here alters how an intro looks, so the worker on SAGA
# (worker.py) makes every intro again
LOOK = 1


def can_build(config):
    """Why a config can't have an intro, or None if it can."""
    product, location = config.get('solution'), config.get('location')
    if product not in PRODUCTS or location not in LOCATIONS or not LOGINS.get(config.get('login_type')):
        return f'no renders for {product} in {location} with {config.get("login_type")}'
    p = TRACKS / f'intro-{product}.json'
    if not p.exists() or location not in json.loads(p.read_text())['pushin']:
        return f'{product} has no track for the {location} push in (intro.py track {product})'
    return None


def made_for(config, seq):
    """What an intro is made with. The demo only uses one while the config and
    its sequence's first screen still match it (customIntro() in js/demo.js).
    renders also changes with the renders' track or this tool's LOOK, which
    only the worker checks."""
    _, first_step = first_screen((seq or {}).get('steps') or [])
    product = config['solution']
    track = hashlib.sha1((TRACKS / f'intro-{product}.json').read_bytes()).hexdigest()[:8]
    return {'solution': product, 'location': config['location'], 'login_type': config['login_type'],
            'theme_colour': (config.get('theme_colour') or '').lower(),
            'button_colour': (config.get('button_colour') or '').lower(),
            'logo': fnv(config.get('logo') or ''),
            'first': first_stamp(first_step),
            'renders': f'{LOOK}-{track}'}


def entry_for(config, made, prefix, bust=False):
    """The intro's entry for the demo: its files from prefix, and what it was
    made with. bust adds the stamp to each file's address, so a browser
    doesn't show an old copy it kept."""
    v = '?v=' + fnv(json.dumps(made, sort_keys=True)) if bust else ''
    return {'label': f'{made["solution"]} push in, {made["login_type"]} login and zoom, {config["user_id"]}',
            'video': prefix + 'intro.mp4' + v, 'poster': prefix + 'intro-start.jpg' + v, 'end': prefix + 'intro-end.jpg' + v,
            'login_screen': f'{made["solution"]}_new_zoom', 'made': made}


def build(config, seq, out_dir, log=print):
    """Makes config's intro in out_dir: intro.mp4 and its first and last
    frames. The video is written under another name and renamed when done,
    so a half-made one is never served. Returns what it was made with."""
    product, location = config['solution'], config['location']
    login = LOGINS[config['login_type']]
    spec = PRODUCTS[product]
    tr = load_track(product)
    steps = (seq or {}).get('steps') or []
    first, first_step = first_screen(steps)
    made = made_for(config, seq)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # The screens, and from which frame of the login each shows
    if login == 'typed':
        specs, events = typed_plan(config['user_id'], tr['typed']['taps'], first)
    else:
        specs, events = [{'kind': 'login'}, first], [(spec['logged_in'][login], 1)]
    with tempfile.TemporaryDirectory() as tmp:
        screens, results = render_screens(config, specs, Path(tmp))
    pressed = [r.get('key') for r in results if r.get('key')]
    if pressed:
        log(f'{config["user_id"]}: keys under the finger: ' + ' '.join(pressed))

    def login_screen_at(f):
        k = 0
        for at, s in events:
            if f >= at:
                k = s
        return screens[k]

    part = out_dir / 'intro.mp4.part'
    enc = encoder(part)
    first_frame = last = None
    count = 0
    carry = Carry()

    def emit(img):
        nonlocal first_frame, last, count
        if first_frame is None:
            first_frame = img
        last = img
        count += 1
        enc.stdin.write(img.tobytes())

    # The push in, with the login screen
    c = np.float32(tr['pushin'][location]['corners'])
    scr_path = render_path(product, f'{location}_pushin_screen.mov')
    floor = pass_floor(product, scr_path)
    has_alpha = product == 'smartdrawer'
    for f, (img, scr) in enumerate(zip(frames(render_path(product, f'{location}_pushin.mov')), frames(scr_path, 'bgra'))):
        refl = reflection(scr, floor)
        emit(put_screen(img, c, f, screens[0], matte=pass_matte(scr) if has_alpha else None, refl=refl))
    carry.take(refl, c[-1])

    # The login, from its second frame (its first is the push in's last)
    c = np.float32(tr['clips'][login]['corners'])
    passes = frames(render_path(product, f'login_{login}_screen.mov'), 'bgra') if spec['login_passes'] else None
    floor = pass_floor(product, render_path(product, f'login_{login}_screen.mov')) if passes else None
    hands = None
    if login == 'typed' and not passes:
        hands = frames(render_path(product, spec['hand'][0]), 'gray')
    scr = None
    for f, img in enumerate(frames(render_path(product, f'{location}_login_{login}.mov'))):
        scr = next(passes) if passes else None
        hand = next(hands) if hands else None
        if f == 0:
            continue
        ours = login_screen_at(f)
        if scr is not None:
            refl = reflection(scr, floor)
            emit(put_screen(img, c, f, ours, matte=pass_matte(scr), refl=refl))
        else:
            emit(put_screen(img, c, f, ours, hand=hand, refl=carry.at(c[f])))
    if scr is not None:
        carry.take(refl, c[-1])

    # The zoom, from its second frame, with the reflections fading out
    c = np.float32(tr['clips']['zoom']['corners'])
    n = len(c)
    for f, img in enumerate(frames(render_path(product, f'{location}_zoom.mov'))):
        if f == 0:
            continue
        emit(put_screen(img, c, f, login_screen_at(10 ** 6), refl=carry.at(c[f], 1 - f / (n - 1))))
    enc.stdin.close()
    if enc.wait():
        raise RuntimeError('ffmpeg failed')
    cv2.imwrite(str(out_dir / 'intro-start.jpg'), first_frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    cv2.imwrite(str(out_dir / 'intro-end.jpg'), last, [cv2.IMWRITE_JPEG_QUALITY, 92])
    os.replace(part, out_dir / 'intro.mp4')
    log(f'{config["user_id"]}: {count} frames ({count / 30:.1f}s)')
    return made


def cmd_build(userid, cms):
    """Makes the intro into the demo's own files, assets/custom/<user id>/
    and its entry in data/custom-clips.js, so it goes in the package and
    works from file://."""
    config, seq = user_data(userid, cms)
    if not config:
        sys.exit(f'no config for {userid}')
    why = can_build(config)
    if why:
        sys.exit(f'{userid}: {why}')
    uid = str(config['user_id']).lower()
    made = build(config, seq, DEMO / 'assets' / 'custom' / uid)
    data = read_custom()
    data.setdefault(uid, {})['intro'] = entry_for(config, made, f'assets/custom/{uid}/')
    write_custom(data)
    print(f'{userid}: assets/custom/{uid}/intro.mp4; wrote data/custom-clips.js')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('track')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p.add_argument('--location', choices=LOCATIONS)
    p = sub.add_parser('check')
    p.add_argument('product', choices=sorted(PRODUCTS))
    p.add_argument('--location', choices=LOCATIONS)
    p.add_argument('--every', type=int, default=10)
    p = sub.add_parser('build')
    p.add_argument('userid')
    p.add_argument('--cms')
    args = ap.parse_args()
    if args.cmd == 'track':
        cmd_track(args.product, args.location)
    elif args.cmd == 'check':
        cmd_check(args.product, args.location, args.every)
    else:
        cmd_build(args.userid, args.cms)


if __name__ == '__main__':
    main()
