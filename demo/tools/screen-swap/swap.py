"""
Puts a user's own device screens into the take and return renders: their
colours and logo, and the product they take or return, in every frame.

    python tools/screen-swap/swap.py probe <clip> [artwork ...]
    python tools/screen-swap/swap.py track <clip>
    python tools/screen-swap/swap.py check <clip> [--every 12]
    python tools/screen-swap/swap.py build <user id> [--cms <url>]

(from the demo folder). Needs numpy, opencv-python, ffmpeg and node on the
PATH, and Edge or Chrome (set BROWSER to its path if it isn't Edge's usual
place).

probe: which phase 1 artwork the render's screen shows, every few frames,
  for writing a clip's segments in clips.py.
track: once per render. Finds the screen in every frame by fitting the
  segment's artwork to it (ECC homography, seeded by SIFT), so the track
  can't drift. Where too little of the screen shows to fit, it follows the
  screen's surroundings by optical flow, from both ends. Then smooths the
  corners' paths, since the render's camera moves smoothly, and measures how
  out of focus the screen is in each frame. Writes tracks/<clip>.json.
check: a contact sheet of a track, for checking it by eye.
build: draws the user's screens in headless Edge (render.html), swaps them
  into each render they need, one clip per product taken or returned, and
  writes assets/custom/<user id>/ and data/custom-clips.js. The config and
  sequence come from data/configs.js and data/sequences.js, or the CMS.

The swap, per frame: the render's screen is modelled as
a * blur(warp(tone(artwork))) + b, fitted to the frame, where tone is the
renders' screen tone and blur is the frame's defocus and motion blur. Ours
goes in the same way, plus the broad part of what the model misses, so the
render's reflections stay but none of the old text does. Wherever the hand
is in front of the screen, the render is left as it was.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
DEMO = HERE.parent.parent
GD = DEMO.parent.parent / 'GDrive-example'
ART = GD / '2305_Product Demo_Screen Artwork'
TRACKS = HERE / 'tracks'
CACHE = Path(tempfile.gettempdir()) / 'ti-screen-swap'
sys.path.insert(0, str(HERE))
from clips import CLIPS  # noqa: E402

FW, FH = 1920, 1080
SW, SH = 1024, 768                   # the device UI, artwork px
SMOOTH_R = 6                         # frames each side in the corner smoothing
ACCEPT = 0.85                        # artwork fit (ECC match) trusted over the optical flow
MIN_DETAIL = 0.2                     # share of the artwork's edges in view needed to fit it
SHUTTER = 1.0                        # motion blur as long as a whole frame's movement
                                     # (fitted on the SmartDrawer take, frames 118, 121, 162)
SIGMAS = [0, 0.7, 1.0, 1.4, 1.8, 2.3, 2.8, 3.4, 4.2, 5.0, 6.0, 7.5]   # defocus tried, frame px
LOW_PASS = 12.0                      # px: what of the render's own screen is kept
CORNERS = np.float32([[0, 0], [SW, 0], [SW, SH], [0, SH]])
ECC_CRIT = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 80, 1e-6)

# The renders' screen tone, as login_screen.smartdrawer_phase1.tone in js/media.js
TONE_SATURATION = 0.7
TONE_CURVE = np.array([[0, 0], [36, 5], [64, 30], [180, 156], [220, 188], [240, 205], [255, 208]], float)


# ---------- Frames ----------

def source(clip):
    c = CLIPS[clip]
    src = GD / c['source']
    return src if src.exists() else DEMO / c['demo_copy']


def frame_dir(clip):
    """The render's frames as PNGs, kept in the temp folder between runs."""
    src = source(clip)
    d = CACHE / clip
    stamp = f'{src}|{src.stat().st_size}|{src.stat().st_mtime}'
    if not ((d / 'source.txt').exists() and (d / 'source.txt').read_text() == stamp):
        shutil.rmtree(d, ignore_errors=True)
        d.mkdir(parents=True)
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(src), str(d / '%04d.png')], check=True)
        (d / 'source.txt').write_text(stamp)
    return d


def frame_count(clip):
    return len(list(frame_dir(clip).glob('*.png')))


def read_frame(clip, f):
    return cv2.imread(str(frame_dir(clip) / f'{f:04d}.png'))


def artwork(path):
    im = cv2.imread(str(ART / path))
    if im is None:
        sys.exit(f'artwork not found: {path}')
    return im


# ---------- Image helpers ----------

def grey(im):
    return cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255


def tone(img):
    """The renders' screen tone: saturate, then a curve of levels (BGR in and out)."""
    s = TONE_SATURATION
    m = np.array([[0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
                  [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
                  [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]])
    rgb = np.clip(img[..., ::-1].astype(np.float32) / 255 @ m.T, 0, 1) * 255
    return np.interp(rgb, TONE_CURVE[:, 0], TONE_CURVE[:, 1])[..., ::-1].astype(np.float32)


def roi_of(h, pad):
    q = cv2.perspectiveTransform(CORNERS[None], h)[0]
    x0, y0 = np.floor(q.min(0)) - pad
    x1, y1 = np.ceil(q.max(0)) + pad
    return int(max(0, x0)), int(max(0, y0)), int(min(FW, x1)), int(min(FH, y1))


def warp(src, h, roi):
    """src (artwork px) onto the frame region roi, prefiltered so text doesn't
    alias where the screen is drawn smaller than 1024 px across."""
    x0, y0, x1, y1 = roi
    t = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]], float) @ h
    c = h @ [SW / 2, SH / 2, 1]
    jac = (h[:2, :2] - np.outer(c[:2] / c[2], h[2, :2])) / c[2]
    scale = np.sqrt(abs(np.linalg.det(jac)))
    pre = max(0.0, 0.5 * (1 / max(scale, 1e-3) - 1))
    if pre > 0.15:
        src = cv2.GaussianBlur(src, (0, 0), pre)
    return cv2.warpPerspective(src, t, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)


def blur(img, s):
    return img if s <= 0 else cv2.GaussianBlur(img, (0, 0), s)


def motion_kernel(v):
    """A line along v, as long as the movement in one frame times the shutter."""
    length = float(np.hypot(*v)) * SHUTTER
    if length < 1.0:
        return None
    n = int(np.ceil(length)) | 1
    k = np.zeros((n + 2, n + 2), np.float32)
    c = (n + 1) / 2
    d = v / np.hypot(*v)
    for t in np.linspace(-length / 2, length / 2, int(length * 4) + 1):
        x, y = c + d[0] * t, c + d[1] * t
        x0, y0 = int(np.floor(x)), int(np.floor(y))
        fx, fy = x - x0, y - y0
        for dx, dy, w in ((0, 0, (1 - fx) * (1 - fy)), (1, 0, fx * (1 - fy)), (0, 1, (1 - fx) * fy), (1, 1, fx * fy)):
            k[y0 + dy, x0 + dx] += w
    return k / k.sum()


def motion(img, k):
    return img if k is None else cv2.filter2D(img, -1, k, borderType=cv2.BORDER_REFLECT)


def velocity(hs, f):
    """Movement per frame of the visible middle of the screen, frame px."""
    a, b = hs.get(f - 1, hs[f]), hs.get(f + 1, hs[f])
    span = (f + 1 in hs) + (f - 1 in hs)
    if not span:
        return np.zeros(2, np.float32)
    gx, gy = np.meshgrid(np.linspace(0, SW, 33), np.linspace(0, SH, 25))
    g = np.float32(np.dstack([gx, gy]).reshape(1, -1, 2))
    p = cv2.perspectiveTransform(g, hs[f])[0]
    vis = (p[:, 0] >= 0) & (p[:, 0] < FW) & (p[:, 1] >= 0) & (p[:, 1] < FH)
    c = g[0][vis].mean(0) if vis.any() else np.float32([SW / 2, SH / 2])
    pa = cv2.perspectiveTransform(c[None, None], a)[0, 0]
    pb = cv2.perspectiveTransform(c[None, None], b)[0, 0]
    return (pb - pa) / span


def fit(model, frame, w):
    """Per-channel a, b with frame ~ a * model + b where w is set."""
    a = np.ones(3, np.float32)
    b = np.zeros(3, np.float32)
    sel = w > 0.5
    if sel.sum() < 500:
        return a, b
    for c in range(3):
        m, y = model[..., c][sel], frame[..., c][sel]
        a[c], b[c] = np.linalg.lstsq(np.vstack([m, np.ones_like(m)]).T, y, rcond=None)[0]
    return a, b


def skin(frame):
    """The hand's orange, not the screen's red (hue about 176, saturation over 200)."""
    hsv = cv2.cvtColor(np.clip(frame, 0, 255).astype(np.uint8), cv2.COLOR_BGR2HSV)
    h, s, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
    return (h >= 3) & (h <= 25) & (s >= 35) & (s <= 190) & (v >= 70)


def big_blobs(mask, min_area):
    n, lab, st, _ = cv2.connectedComponentsWithStats(mask, 8)
    keep = np.zeros(n, np.uint8)
    keep[1:] = st[1:, 4] >= min_area
    return keep[lab]


# ---------- Tracking ----------

def ecc(tmpl, img, h, levels=(4, 2, 1)):
    """Refines h (artwork px to frame px) so the frame matches the artwork,
    coarse to fine."""
    cc = None
    for s in levels:
        t = cv2.resize(tmpl, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA) if s > 1 else tmpl
        i = cv2.resize(img, None, fx=1 / s, fy=1 / s, interpolation=cv2.INTER_AREA) if s > 1 else img
        d, di = np.diag([s, s, 1.0]), np.diag([1 / s, 1 / s, 1.0])
        hs = (di @ h @ d).astype(np.float32)
        cc, hs = cv2.findTransformECC(t, i, hs / hs[2, 2], cv2.MOTION_HOMOGRAPHY, ECC_CRIT, None, 5 if s == 1 else 3)
        h = d @ hs.astype(np.float64) @ di
    return h / h[2, 2], cc


def sift_seed(art, frame):
    sift = cv2.SIFT_create(4000)
    ka, da = sift.detectAndCompute(cv2.cvtColor(art, cv2.COLOR_BGR2GRAY), None)
    kf, df = sift.detectAndCompute(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), None)
    good = [m for m, n in cv2.BFMatcher().knnMatch(da, df, k=2) if m.distance < 0.75 * n.distance]
    if len(good) < 8:
        return None, 0
    h, inl = cv2.findHomography(np.float32([ka[m.queryIdx].pt for m in good]),
                                np.float32([kf[m.trainIdx].pt for m in good]), cv2.RANSAC, 3)
    return h, int(inl.sum()) if inl is not None else 0


def flow_step(prev, img, h):
    """Moves h from frame prev to frame img (both grey uint8) by the optical
    flow of the screen and what's around it: the bezel, and on SupplySystem
    the cabinet front. For frames that show too little of the screen to fit
    the artwork."""
    q = cv2.perspectiveTransform(CORNERS[None], h)[0]
    c = q.mean(0)
    mask = np.zeros(prev.shape, np.uint8)
    cv2.fillConvexPoly(mask, np.int32(np.clip(np.round((q - c) * 1.3 + c), -1e6, 1e6)), 1)
    pts = cv2.goodFeaturesToTrack(prev, 500, 0.01, 7, mask=mask)
    if pts is None or len(pts) < 12:
        return None
    nxt, st, _ = cv2.calcOpticalFlowPyrLK(prev, img, pts, None, winSize=(21, 21), maxLevel=4)
    back, st2, _ = cv2.calcOpticalFlowPyrLK(img, prev, nxt, None, winSize=(21, 21), maxLevel=4)
    ok = (st.ravel() == 1) & (st2.ravel() == 1) & (np.linalg.norm((back - pts).reshape(-1, 2), axis=1) < 1.0)
    if ok.sum() < 12:
        return None
    # Affine, not a homography: the features sit at different depths (behind
    # the glass doors, on SupplySystem), which bends a homography's
    # perspective. The perspective stays as the last fitted frame had it.
    m, inl = cv2.estimateAffine2D(pts[ok], nxt[ok], method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if m is None or inl.sum() < 10:
        return None
    return np.vstack([m, [0, 0, 1]]) @ h


def edge_ratios(h):
    q = cv2.perspectiveTransform(CORNERS[None], h)[0]
    e = [np.linalg.norm(q[(i + 1) % 4] - q[i]) for i in range(4)]
    return q, e[0] / e[2], e[1] / e[3]


def plausible(h, ref):
    """Whether h could follow ref (the frame before): its shape (the ratios
    of opposite edges) changes by no more than a real screen's does from one
    frame to the next, about 0.007, and its size by no more than 20 percent.
    With only part of a plain screen in view, a fit can match well and still
    be the wrong shape."""
    q, tb, rl = edge_ratios(h)
    if not cv2.isContourConvex(q.astype(np.float32)):
        return False
    r, tb0, rl0 = edge_ratios(ref)
    return abs(tb - tb0) < 0.02 and abs(rl - rl0) < 0.02 and         0.8 < cv2.contourArea(q) / max(cv2.contourArea(r), 1) < 1.25


def detail_in_view(tmpl, h, cache={}):
    """The share of the artwork's edges that lands inside the frame under h."""
    key = id(tmpl)
    if key not in cache:
        g = cv2.GaussianBlur(tmpl, (0, 0), 1.5)
        cache[key] = np.hypot(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))[::8, ::8]
    w = cache[key]
    ys, xs = np.mgrid[0:SH:8, 0:SW:8]
    p = cv2.perspectiveTransform(np.float32(np.dstack([xs, ys]).reshape(1, -1, 2)), h)[0]
    vis = ((p[:, 0] >= 0) & (p[:, 0] < FW) & (p[:, 1] >= 0) & (p[:, 1] < FH)).reshape(ys.shape)
    return float(w[vis].sum() / max(w.sum(), 1e-6))


def track_pass(clip, order, anchors, template):
    """Tracks the frames in order, restarting at each anchor {frame: H}.
    Each frame is guessed by optical flow from the one before, then fitted
    to its artwork (template(f), or None to skip); the fit is kept only if it
    matches well. Returns {frame: (H, match, fitted)}."""
    out, h, prev, last = {}, None, None, None
    for f in order:
        img8 = cv2.cvtColor(read_frame(clip, f), cv2.COLOR_BGR2GRAY)
        if f in anchors:
            h, last = anchors[f], None
            out[f] = (h, 1.0, True)
        elif h is not None:
            guess = flow_step(prev, img8, h)
            if guess is None:
                guess = h if last is None else h @ np.linalg.inv(last) @ h
            hn, cc = guess, -1.0
            tmpl = template(f)
            # Only fit where enough of the artwork's detail is in view: a strip
            # of plain screen fits any shape.
            if tmpl is not None and detail_in_view(tmpl, guess) >= MIN_DETAIL:
                try:
                    he, cc = ecc(tmpl, img8.astype(np.float32) / 255, guess)
                    if cc < ACCEPT or not plausible(he, h):
                        cc = min(cc, ACCEPT - 0.01)
                    else:
                        hn = he
                except cv2.error:
                    cc = -1.0
            last, h = h, hn
            out[f] = (h, float(cc), cc >= ACCEPT)
        prev = img8
    return out


def blend_h(ha, hb, wb):
    """Between two homographies, by their corners."""
    qa = cv2.perspectiveTransform(CORNERS[None], ha)[0]
    qb = cv2.perspectiveTransform(CORNERS[None], hb)[0]
    return cv2.getPerspectiveTransform(CORNERS, ((1 - wb) * qa + wb * qb).astype(np.float32)).astype(np.float64)


def since_fitted(track, order):
    """Frames since the last fitted one, in the order the pass ran."""
    out, n = {}, None
    for f in order:
        if f in track:
            n = 0 if track[f][2] else (None if n is None else n + 1)
            out[f] = n
    return out


def smooth(hs):
    """Robust local cubic through each corner's path over 2 * SMOOTH_R + 1
    frames. Runs of frames are smoothed separately."""
    frames = sorted(hs)
    runs, run = [], [frames[0]]
    for f in frames[1:]:
        if f == run[-1] + 1:
            run.append(f)
        else:
            runs.append(run)
            run = [f]
    runs.append(run)
    out = {}
    for run in runs:
        p = np.array([cv2.perspectiveTransform(CORNERS[None], hs[f])[0] for f in run])
        n = len(run)
        for i in range(n):
            lo, hi = max(0, i - SMOOTH_R), min(n, i + SMOOTH_R + 1)
            t = np.arange(lo, hi) - i
            x = np.vander(t, min(4, hi - lo), increasing=True).astype(float)
            y = p[lo:hi].reshape(hi - lo, -1)
            base = np.exp(-0.5 * (t / (SMOOTH_R / 2)) ** 2)
            w = base
            for _ in range(3):
                sw = np.sqrt(w)[:, None]
                beta = np.linalg.lstsq(x * sw, y * sw, rcond=None)[0]
                r = np.abs(y - x @ beta).max(1)
                c = 4.0 * max(np.median(r), 0.5)
                w = base * np.where(r < c, (1 - (r / c) ** 2) ** 2, 0)
            q = (x[t == 0] @ beta).reshape(4, 2).astype(np.float32)
            out[run[i]] = cv2.getPerspectiveTransform(CORNERS, q).astype(np.float64)
    return out


def segment_of(clip, f):
    """(segment, next segment, share of next) for frame f, or None."""
    c = CLIPS[clip]
    segs = c['segments']
    for k, s in enumerate(segs):
        if s['frames'][0] <= f <= s['frames'][1]:
            return k, k, 0.0
    w = c.get('dissolves', {}).get(f)
    if w is not None:
        for k in range(len(segs) - 1):
            if segs[k]['frames'][1] < f < segs[k + 1]['frames'][0]:
                return k, k + 1, w
    return None


def mix(images, seg):
    k, k2, w = seg
    return images[k] if w == 0 else (1 - w) * images[k] + w * images[k2]


def measure_blur(fr, art_toned, h, v):
    """The defocus, as the Gaussian that best fits the frame after the motion
    blur, judged at the artwork's edges: flat areas look the same at any blur."""
    roi = roi_of(h, 40)
    x0, y0, x1, y1 = roi
    fr = fr[y0:y1, x0:x1].astype(np.float32)
    wa = motion(warp(art_toned, h, roi), motion_kernel(v))
    m = warp(np.ones((SH, SW), np.float32), h, roi)
    inner = cv2.erode((m > 0.99).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    gy = cv2.GaussianBlur(cv2.cvtColor(np.clip(wa, 0, 255).astype(np.uint8), cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 1.5)
    gm = np.hypot(cv2.Sobel(gy, cv2.CV_32F, 1, 0), cv2.Sobel(gy, cv2.CV_32F, 0, 1)) * inner
    if gm.sum() < 1:
        return 1.0
    best = None
    for s in SIGMAS:
        model = blur(wa, s)
        a, b = fit(model, fr, inner)
        err = (((fr - (model * a + b)) ** 2).sum(2) * gm).sum() / gm.sum()
        if best is None or err < best[0]:
            best = (err, s)
    return best[1]


def visible_share(h):
    gx, gy = np.meshgrid(np.linspace(0, SW, 17), np.linspace(0, SH, 13))
    p = cv2.perspectiveTransform(np.float32(np.dstack([gx, gy]).reshape(1, -1, 2)), h)[0]
    return float(((p[:, 0] >= 0) & (p[:, 0] < FW) & (p[:, 1] >= 0) & (p[:, 1] < FH)).mean())


def cmd_track(clip):
    c = CLIPS[clip]
    n = frame_count(clip)
    # One anchor per segment: its artwork found in its seed frame by SIFT
    tmpls, anchors = [], {}
    for k, seg in enumerate(c['segments']):
        art = artwork(seg['art'])
        tmpls.append(grey(art))
        h0, inl = sift_seed(art, read_frame(clip, seg['seed']))
        if h0 is None or inl < 12:
            sys.exit(f'{clip}: segment {k} seed frame {seg["seed"]} matched only {inl} points')
        anchors[seg['seed']], cc0 = ecc(tmpls[k], grey(read_frame(clip, seg['seed'])), h0)
        print(f'{clip} segment {k}: frames {seg["frames"][0]}-{seg["frames"][1]}, seeded at {seg["seed"]} '
              f'({inl} points, match {cc0:.3f})')

    def template(f):
        seg = segment_of(clip, f)
        return tmpls[seg[0]] if seg is not None and seg[2] == 0 else None   # not in a dissolve

    # Forwards and backwards through the whole clip. Where neither pass could
    # fit the artwork, the two optical flow paths are blended, each trusted
    # more the nearer it is to its last fitted frame, so drift is pulled back.
    order = list(range(1, n + 1))
    fwd = track_pass(clip, order, anchors, template)
    bwd = track_pass(clip, order[::-1], anchors, template)
    sf, sb = since_fitted(fwd, order), since_fitted(bwd, order[::-1])
    raw, quality, flow_only = {}, {}, 0
    for f in order:
        a, b = fwd.get(f), bwd.get(f)
        if a and a[2] and (not (b and b[2]) or a[1] >= b[1]):
            raw[f], quality[f] = a[0], a[1]
        elif b and b[2]:
            raw[f], quality[f] = b[0], b[1]
        elif a or b:
            flow_only += 1
            if a and b and sf[f] is not None and sb[f] is not None:
                raw[f] = blend_h(a[0], b[0], sf[f] / (sf[f] + sb[f]))
            else:
                raw[f] = (a or b)[0]
            quality[f] = max(x[1] for x in (a, b) if x)
    worst = min(quality[f] for f in quality if fwd.get(f, (0, 0, False))[2] or bwd.get(f, (0, 0, False))[2])
    print(f'{clip}: fitted to the artwork in {len(raw) - flow_only} frames (match {worst:.3f} at worst), '
          f'by optical flow in {flow_only}')
    hs = smooth(raw)
    # Defocus per frame, then a running median: the camera's focus changes slowly
    arts = [tone(artwork(s['art'])) for s in c['segments']]
    sig = {}
    for f in sorted(hs):
        seg = segment_of(clip, f)
        if seg is None or visible_share(hs[f]) < 0.02:
            continue
        sig[f] = measure_blur(read_frame(clip, f), mix(arts, seg), hs[f], velocity(hs, f))
    keys = sorted(sig)
    sig = {f: float(np.median([sig[k] for k in keys[max(0, i - 3):i + 4]])) for i, f in enumerate(keys)}
    TRACKS.mkdir(exist_ok=True)
    out = {'source': c['source'], 'frames': n,
           'H': {str(f): np.round(hs[f], 10).tolist() for f in sorted(sig)},
           'match': {str(f): round(quality[f], 4) for f in sorted(sig) if f in quality},
           'sigma': {str(f): sig[f] for f in sorted(sig)}}
    (TRACKS / f'{clip}.json').write_text(json.dumps(out))
    print(f'wrote tracks/{clip}.json: {len(sig)} of {n} frames swapped')


def load_track(clip):
    t = json.loads((TRACKS / f'{clip}.json').read_text())
    return ({int(f): np.array(h) for f, h in t['H'].items()},
            {int(f): s for f, s in t['sigma'].items()}, t['frames'])


def cmd_check(clip, every):
    """A contact sheet of the track: each frame with its artwork laid over it
    in stripes, so text and edges run straight across where it fits."""
    c = CLIPS[clip]
    hs, sig, n = load_track(clip)
    arts = [artwork(s['art']) for s in c['segments']]
    tiles = []
    for f in range(1, n + 1, every):
        fr = read_frame(clip, f)
        seg = segment_of(clip, f)
        if f in hs and seg is not None:
            art = mix([a.astype(np.float32) for a in arts], seg).astype(np.uint8)
            w = cv2.warpPerspective(art, hs[f], (FW, FH))
            m = cv2.warpPerspective(np.ones((SH, SW), np.uint8), hs[f], (FW, FH)) > 0
            stripes = ((np.arange(FW) // 40) % 2 == 0)[None, :] & m
            fr = np.where(stripes[..., None], w, fr)
            cv2.polylines(fr, [np.int32(cv2.perspectiveTransform(CORNERS[None], hs[f])[0])], True, (0, 255, 255), 2)
        cv2.putText(fr, f'{f}  blur {sig.get(f, "-")}', (20, 60), cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 255), 4)
        tiles.append(cv2.resize(fr, (640, 360)))
    while len(tiles) % 4:
        tiles.append(np.zeros_like(tiles[0]))
    path = CACHE / f'{clip}-check.jpg'
    cv2.imwrite(str(path), np.vstack([np.hstack(tiles[i:i + 4]) for i in range(0, len(tiles), 4)]),
                [cv2.IMWRITE_JPEG_QUALITY, 85])
    print(path)


# ---------- Probe ----------

def cmd_probe(clip, arts, every, start=1, end=None):
    if not arts:
        arts = sorted({str(p.relative_to(ART)).replace('\\', '/') for s in CLIPS.get(clip, {}).get('segments', [])
                       for p in (ART / s['art']).parent.glob('*.png')})
    sift = cv2.SIFT_create(3000)
    feats = {}
    for a in arts:
        im = artwork(a)
        feats[a] = sift.detectAndCompute(cv2.cvtColor(im, cv2.COLOR_BGR2GRAY), None)
    n = frame_count(clip)
    for f in range(start, (end or n) + 1, every):
        kf, df = sift.detectAndCompute(cv2.cvtColor(read_frame(clip, f), cv2.COLOR_BGR2GRAY), None)
        scores = []
        for a, (ka, da) in feats.items():
            if df is None or da is None:
                continue
            good = [m for m, n2 in cv2.BFMatcher().knnMatch(da, df, k=2) if m.distance < 0.75 * n2.distance]
            inl = 0
            if len(good) >= 8:
                _, mask = cv2.findHomography(np.float32([ka[m.queryIdx].pt for m in good]),
                                             np.float32([kf[m.trainIdx].pt for m in good]), cv2.RANSAC, 3)
                inl = int(mask.sum()) if mask is not None else 0
            scores.append((inl, a))
        scores.sort(reverse=True)
        print(f, '  '.join(f'{a.split("/")[-1]}:{i}' for i, a in scores[:3]))


# ---------- Build ----------

def fnv(s):
    """FNV-1a over the string's code units, the same as madeFor() in js/demo.js."""
    h = 0x811c9dc5
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xffffffff
    return format(h, '08x')


def user_data(userid, cms):
    if cms:
        base = cms.rstrip('/') + '/api/'
        def get(path):
            try:
                with urllib.request.urlopen(base + path, timeout=15) as r:
                    return json.loads(r.read().decode('utf-8'))
            except Exception:
                return None
        config = get('config/' + urllib.request.quote(userid))
        seq = get('sequence/' + urllib.request.quote(userid))
        if config and 'config' in config:
            config = config['config']
        if seq and 'sequence' in seq:
            seq = seq['sequence']
        return config, seq
    js = ('global.window = global;'
          f'require({json.dumps(str(DEMO / "data" / "configs.js"))});'
          f'require({json.dumps(str(DEMO / "data" / "sequences.js"))});'
          f'const id = {json.dumps(userid.lower())};'
          'const c = (window.TI_CONFIGS || []).find(x => String(x.user_id).toLowerCase() === id) || null;'
          'const s = window.TI_SEQUENCES || {}; const k = Object.keys(s).find(x => x.toLowerCase() === id);'
          'console.log(JSON.stringify({ config: c, sequence: k ? s[k] : null }));')
    out = json.loads(subprocess.run(['node', '-e', js], check=True, capture_output=True, text=True).stdout)
    return out['config'], out['sequence']


DOOR_STEPS = {'open_pocket_take': 'take', 'check_in': 'return'}


def events(steps):
    """Each product taken or returned, with what its clip needs to show."""
    out, product, select = {}, None, None
    for i, s in enumerate(steps):
        t = s.get('type')
        p = s.get('params') or {}
        if t == 'select_product':
            product, select = p.get('product'), i
        elif (t == 'select_action' or t in DOOR_STEPS) and product:
            kind = DOOR_STEPS.get(t) or ('return' if p.get('action') == 'return' else 'take')
            period = None
            for s2 in steps[i + 1:]:
                if s2.get('type') in ('select_product', 'product_search'):
                    break
                if s2.get('type') == 'display_loan_period':
                    period = ((s2.get('text') or {}).get('period') or '').strip() or None
                    break
            out.setdefault((kind, product), {'kind': kind, 'product': product, 'select': select, 'period': period})
    return list(out.values())


def screen_spec(name, ev, steps):
    if name == 'take':
        return {'kind': 'instruction', 'title': 'Take', 'product': ev['product'],
                'line': 'Please, go to location {loc}, open door and get item.'}
    if name == 'return':
        return {'kind': 'instruction', 'title': 'Return', 'product': ev['product'],
                'line': 'Please return item to location {loc}, then close the door.'}
    if name == 'loan':
        return {'kind': 'loan', 'period': ev['period'] or '7 days'}
    if name == 'list':
        return {'kind': 'step', 'steps': steps, 'index': ev['select']}
    sys.exit(f'unknown screen {name}')


def browser():
    if os.environ.get('BROWSER'):
        return os.environ['BROWSER']
    for p in ('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
              'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
              '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'):
        if Path(p).exists():
            return p
    sys.exit('no browser found: set BROWSER')


def render_screens(config, screens, out_dir):
    job = {'theme': config.get('theme_colour') or '', 'button': config.get('button_colour') or '',
           'logo': config.get('logo') or '', 'screens': []}
    for k, spec in enumerate(screens):
        job['screens'].append(dict(spec, out=str(out_dir / f'screen-{k}.png')))
    (out_dir / 'job.json').write_text(json.dumps(job))
    subprocess.run(['node', str(HERE / 'render.js'), str(out_dir / 'job.json'), browser()], check=True)
    return [cv2.imread(s['out']) for s in job['screens']]


def composite(clip, ours, out_path, poster_path):
    """Swaps ours (one screen per segment, BGR, artwork px) into the clip."""
    c = CLIPS[clip]
    hs, sig, n = load_track(clip)
    arts = [tone(artwork(s['art'])) for s in c['segments']]
    ours = [tone(o) for o in ours]
    ones = np.ones((SH, SW), np.float32)
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{FW}x{FH}',
                            '-r', '30', '-i', '-', '-c:v', 'libx264', '-crf', '22', '-pix_fmt', 'yuv420p',
                            '-movflags', '+faststart', '-an', str(out_path)], stdin=subprocess.PIPE)
    for f in range(1, n + 1):
        frame = read_frame(clip, f)
        seg = segment_of(clip, f)
        if seg is not None and f in sig:
            frame = swap_frame(frame, hs, f, sig[f], mix(arts, seg), mix(ours, seg), ones)
        if f == 1:
            cv2.imwrite(str(poster_path), frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        enc.stdin.write(frame.tobytes())
    enc.stdin.close()
    if enc.wait():
        sys.exit('ffmpeg failed')


def swap_frame(frame, hs, f, s, art, ours, ones):
    h = hs[f]
    v = velocity(hs, f)
    k = motion_kernel(v)
    roi = roi_of(h, int(40 + 3 * s + np.hypot(*v)))
    x0, y0, x1, y1 = roi
    fr = frame[y0:y1, x0:x1].astype(np.float32)
    m = warp(ones, h, roi)
    model = blur(motion(warp(art, h, roi), k), s)
    new = blur(motion(warp(ours, h, roi), k), s)
    inner = cv2.erode((m > 0.99).astype(np.uint8), np.ones((9, 9), np.uint8)).astype(np.float32)
    a, b = fit(model, fr, inner)
    res = np.abs(fr - (model * a + b)).sum(2)
    # The hand: skin coloured and unlike the screen. Then fit again without it.
    occ = ((res > 60) & skin(fr)).astype(np.uint8)
    occ = cv2.morphologyEx(occ, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    occ = big_blobs(occ, 400)
    occ = cv2.morphologyEx(occ, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    occ = cv2.dilate(occ, np.ones((5, 5), np.uint8))
    a, b = fit(model, fr, inner * (1 - occ))
    model, new = model * a + b, new * a + b
    # The broad part of what the model misses (reflections, shading),
    # averaged over the screen without the hand.
    w = ((m > 0.5) * (1 - occ)).astype(np.float32)
    lp = cv2.GaussianBlur((fr - model) * w[..., None], (0, 0), LOW_PASS) / \
        np.maximum(cv2.GaussianBlur(w, (0, 0), LOW_PASS), 1e-3)[..., None]
    occ = cv2.GaussianBlur(occ.astype(np.float32), (0, 0), 1.5 + s * 0.5)
    # Where the swap reaches: the screen, spread by the blur
    reach = cv2.dilate((m > 0.01).astype(np.uint8), np.ones((3, 3), np.uint8),
                       iterations=int(2 + 2 * s + np.hypot(*v) * SHUTTER / 2)).astype(np.float32)
    alpha = (reach * (1 - np.clip(occ * 1.5, 0, 1)))[..., None]
    out = frame.copy()
    out[y0:y1, x0:x1] = np.clip(fr * (1 - alpha) + alpha * (new + lp), 0, 255).astype(np.uint8)
    return out


CUSTOM_JS = DEMO / 'data' / 'custom-clips.js'
CUSTOM_HEAD = '''/*
 * Take and return clips made for one user ID by tools/screen-swap: the
 * render with the user's own screens in it. Keyed by user ID in lower case,
 * then take or return, then product. made records the device, colours and
 * logo they were made with; the demo only uses them while the config still
 * matches.
 * Written by the tool, so don't edit it by hand.
 */
window.TI_CUSTOM_CLIPS = '''


def read_custom():
    if not CUSTOM_JS.exists():
        return {}
    text = CUSTOM_JS.read_text(encoding='utf-8')
    return json.loads(text[text.index('window.TI_CUSTOM_CLIPS = ') + 25:].rstrip().rstrip(';'))


def write_custom(data):
    CUSTOM_JS.write_text(CUSTOM_HEAD + json.dumps(data, indent=2) + ';\n', encoding='utf-8')


def cmd_build(userid, cms):
    config, seq = user_data(userid, cms)
    if not config:
        sys.exit(f'no config for {userid}')
    steps = (seq or {}).get('steps') or []
    uid = str(config['user_id']).lower()
    evs = events(steps)
    if not evs:
        print(f'{userid}: its sequence takes and returns nothing, so no clips')
    out_dir = DEMO / 'assets' / 'custom' / uid
    shutil.rmtree(out_dir, ignore_errors=True)
    out_dir.mkdir(parents=True)
    entry = {'made': {'solution': config['solution'],
                      'theme_colour': (config.get('theme_colour') or '').lower(),
                      'button_colour': (config.get('button_colour') or '').lower(),
                      'logo': fnv(config.get('logo') or '')}}
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for ev in evs:
            clip = f'{ev["kind"]}-{config["solution"]}'
            if clip not in CLIPS or not (TRACKS / f'{clip}.json').exists():
                print(f'{userid}: no tracked render for {clip} yet, so {ev["product"]} keeps the usual clip')
                continue
            specs = [screen_spec(s['screen'], ev, steps) for s in CLIPS[clip]['segments']]
            ours = render_screens(config, specs, tmp)
            name = f'{ev["kind"]}-{ev["product"]}'
            composite(clip, ours, out_dir / f'{name}.mp4', out_dir / f'{name}-start.jpg')
            rel = f'assets/custom/{uid}/{name}'
            entry.setdefault(ev['kind'], {})[ev['product']] = {
                'label': f'{CLIPS[clip]["solution"]} {ev["kind"]}, {userid}, {ev["product"]}',
                'video': rel + '.mp4', 'poster': rel + '-start.jpg'}
            print(f'{userid}: {rel}.mp4')
    data = read_custom()
    data[uid] = entry
    write_custom(data)
    print('wrote data/custom-clips.js')


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)
    p = sub.add_parser('probe')
    p.add_argument('clip')
    p.add_argument('arts', nargs='*')
    p.add_argument('--every', type=int, default=10)
    p.add_argument('--start', type=int, default=1)
    p.add_argument('--end', type=int)
    p = sub.add_parser('track')
    p.add_argument('clip')
    p = sub.add_parser('check')
    p.add_argument('clip')
    p.add_argument('--every', type=int, default=12)
    p = sub.add_parser('build')
    p.add_argument('userid')
    p.add_argument('--cms')
    args = ap.parse_args()
    if args.cmd == 'probe':
        cmd_probe(args.clip, args.arts, args.every, args.start, args.end)
    elif args.cmd == 'track':
        cmd_track(args.clip)
    elif args.cmd == 'check':
        cmd_check(args.clip, args.every)
    else:
        cmd_build(args.userid, args.cms)


if __name__ == '__main__':
    main()
