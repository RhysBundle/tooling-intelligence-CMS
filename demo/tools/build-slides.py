"""
Builds the slide image for each environment and works out how far it slides.

    python tools/build-slides.py                 (from the demo folder)

Needs numpy and opencv-python (pip install numpy opencv-python), plus ffmpeg
on the PATH.

Inputs, from GDrive-example:
  Videos/<env>_End.png                       the video's last frame
  2305_Product Demo_Screen Artwork/SupplyDrawer/
    Stretched_*.png, Streteched_*.png        the same frame with the left side
                                             extended, for the SmartDrawer
    Stretched_Right_*.jpg                    the same frame with the right
                                             side extended, for the SupplyVend
                                             (made with Gemini, 9 Oct)

Neither set is a pixel copy of the End frame. The left ones are rescaled by
0.1 to 0.6 percent, shifted by part of a pixel, and the F1 one is about 7
levels darker. The right ones are rescaled by 2 to 11 percent, by different
amounts across and down, and redrawn in places. Used as they are, the swap
from the video would visibly jump. So for each environment and side this:
  1. registers the extended image to the End frame (OpenCV ECC, affine). The
     right ones are rescaled too far for ECC to start from nothing, so SIFT
     features give the first guess, and they are fitted again on the
     SEAM_FIT px next to the join, which is where they have to line up
  2. resamples its extension into the End frame's pixel grid
  3. matches its colour to the End frame
  4. keeps the exact End.png in the middle, blended into the extension over
     FEATHER px on the left and FEATHER_RIGHT px on the right, so the image
     matches the video's last frame

Output:
  assets/img/env-<name>-slide.jpg   (ext + 1920 + EXT_RIGHT) x 1080
  tools/pan-fit.json                ext, ext_right and slide distances,
                                    copied into js/media.js

Slide distance: how far the image moves so the product stands where it does in
the first frame of its zoom clip. Positive moves the image right (to the
SmartDrawer), negative left (to the SupplyVend).
  SmartDrawer: found from its eight red SUPPLYPRO drawer labels, against the
  placeholder zoom. The phase 1 SmartDrawer login renders start on the same
  framing, to 1px.
  SupplyVend: its centre between the cabinet's outer edges, measured in each
  End frame (SUPPLYVEND_X) and in the first frame of its login renders.
"""
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np

DEMO = Path(__file__).resolve().parent.parent
GD = DEMO.parent.parent / 'GDrive-example'
VIDEOS = GD / 'Videos'
STRETCHED = GD / '2305_Product Demo_Screen Artwork' / 'SupplyDrawer'
OUT_IMG = DEMO / 'assets' / 'img'
ZOOM = VIDEOS / '11_Smartdraw_ZoomIn.mp4'

FEATHER = 96             # px blend from the left extension into the exact End frame
FEATHER_RIGHT = 32       # the same on the right. Short, as the right images are
                         # redrawn: a wider blend shows things twice (F1's hose)
EXT_RIGHT = 320          # px of right extension kept; the SupplyVend needs up to 308
SEAM_FIT = 480           # px strip left of the right-hand join, fitted again and
                         # used for the colour match
ZOOM_CABINET_X = 963     # SmartDrawer centre in the zoom clip's first frame (measured)
SUPPLYVEND_ZOOM_X = 953  # SupplyVend centre in the first frame of its three login
                         # renders, between its outer edges (708 and 1198)

ECC_CRITERIA = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)

ENVS = {
    #                     slug                 End frame                       left extension                              right extension
    'f1_automotive':     ('f1-automotive',     'F1_Garage_End.png',            'Streteched_F1_Garage_End.png',            'Stretched_Right_F1_Garage_End.jpg'),
    'aircraft_hangar':   ('aircraft-hangar',   'Hanger_End.png',               'Streteched_Hanger_End.png',               'Stretched_Right_Hanger_End.jpg'),
    'cnc_machine_shop':  ('cnc-machine-shop',  'CNC_Factory_End.png',          'Stretched_CNC_Factory_End.png',           'Stretched_Right_CNC_Factory_End.jpg'),
    'medical_cleanroom': ('medical-cleanroom', 'Medical_Cleanroom_End.png',    'Streteched_Medical_Cleanroom_End.png.png', 'Stretched_Right_Medical_Cleanroom_End.jpg'),
    'rail_depot':        ('rail-depot',        'TrainWorkshop_End.png',        'Streteched_TrainWorkshop_End.png',        'Stretched_Right_TrainWorkshop_End.jpg'),
    'amazon_warehouse':  ('warehouse',         'Amazonlike_Warehouse_End.png', 'Streteched_Amazonlike_Warehouse_End.png', 'Stretched_Right_Amazonlike_Warehouse_End.jpg'),
}

# SupplyVend centre in each End frame, halfway between the cabinet's outer
# edges (rows 650 to 950, measured 9 Oct). Measured by hand rather than found
# each run: the hangar's dark curtains and the warehouse's skirting sit right
# against the cabinet. Measure again if an environment render changes.
SUPPLYVEND_X = {
    'f1_automotive': 1198.0,      # edges 972 and 1424
    'aircraft_hangar': 1260.5,    # 1025 and 1496
    'cnc_machine_shop': 1128.5,   # 961 and 1296
    'medical_cleanroom': 1188.5,  # 976 and 1401
    'rail_depot': 1162.0,         # 972 and 1352
    'amazon_warehouse': 1204.0,   # 1021 and 1387
}


def first_frame(video):
    png = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video),
                          '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
                         check=True, capture_output=True).stdout
    return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)


def grey(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255


def drawer_labels(img, min_red, ratio):
    """Centres of the SUPPLYPRO labels: the tallest column of wide red blobs."""
    b, g, r = [img[..., i].astype(int) for i in range(3)]
    mask = ((r > min_red) & (r > g * ratio) & (r > b * ratio)).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, _, stats, cents = cv2.connectedComponentsWithStats(mask, 8)
    blobs = [(cents[i][0], cents[i][1], stats[i][2])
             for i in range(1, n) if stats[i][4] > 60 and stats[i][2] > 1.8 * stats[i][3]]
    best = []
    for c in blobs:
        col = [d for d in blobs if abs(d[0] - c[0]) < 25 and abs(d[2] - c[2]) < 0.4 * c[2]]
        if len(col) > len(best):
            best = col
    best.sort(key=lambda d: d[1])
    return np.array([(x, y) for x, y, _ in best], float)


def cabinet_centre_x(end, zoom_pts):
    pts = drawer_labels(end, 110, 1.8)
    if len(pts) != 8:
        sys.exit(f'expected 8 drawer labels, found {len(pts)}')
    pm, qm = pts.mean(0), zoom_pts.mean(0)
    s = ((pts - pm) * (zoom_pts - qm)).sum() / ((pts - pm) ** 2).sum()
    tx = qm[0] - s * pm[0]
    return (ZOOM_CABINET_X - tx) / s


def register(end, stretched):
    """Affine W with stretched(W p) = end(p), p in End frame pixels."""
    res = cv2.matchTemplate(stretched.astype(np.float32), end.astype(np.float32), cv2.TM_SQDIFF_NORMED)
    _, _, (x0, y0), _ = cv2.minMaxLoc(res)
    W = np.array([[1, 0, x0], [0, 1, y0]], np.float32)
    cc, W = cv2.findTransformECC(grey(end), grey(stretched), W, cv2.MOTION_AFFINE, ECC_CRITERIA, None, 5)
    return W, cc


def register_right(end, extended):
    """The same for a right extension: SIFT for the first guess, ECC over the
    whole frame, then ECC again on the strip next to the join."""
    sift = cv2.SIFT_create(4000)
    ke, de = sift.detectAndCompute(cv2.cvtColor(end, cv2.COLOR_BGR2GRAY), None)
    kx, dx = sift.detectAndCompute(cv2.cvtColor(extended, cv2.COLOR_BGR2GRAY), None)
    good = [a for a, b in cv2.BFMatcher().knnMatch(de, dx, k=2) if a.distance < 0.7 * b.distance]
    W, _ = cv2.estimateAffine2D(np.float32([ke[m.queryIdx].pt for m in good]),
                                np.float32([kx[m.trainIdx].pt for m in good]), ransacReprojThreshold=3)
    g1, g2 = grey(end), grey(extended)
    _, W = cv2.findTransformECC(g1, g2, W.astype(np.float32), cv2.MOTION_AFFINE, ECC_CRITERIA, None, 5)
    # ECC takes the strip as its template, so W moves to the strip's origin and back.
    x0 = 1920 - SEAM_FIT
    W[:, 2] += W[:, 0] * x0
    cc, W = cv2.findTransformECC(np.ascontiguousarray(g1[:, x0:]), g2, W, cv2.MOTION_AFFINE, ECC_CRITERIA, None, 5)
    W[:, 2] -= W[:, 0] * x0
    return W, cc


def match_colour(img, sample, ref):
    """Per-channel gain and offset that take sample (part of img) to ref, applied to all of img."""
    for c in range(3):
        a, b = sample[..., c].ravel(), ref[..., c].ravel()
        gain = b.std() / max(a.std(), 1e-6)
        img[..., c] = img[..., c] * gain + (b.mean() - gain * a.mean())


def main():
    zoom_pts = drawer_labels(first_frame(ZOOM), 50, 1.5)
    if len(zoom_pts) != 8:
        sys.exit(f'zoom clip: expected 8 drawer labels, found {len(zoom_pts)}')

    result = {'feather': FEATHER, 'feather_right': FEATHER_RIGHT}
    for env, (slug, end_name, left_name, right_name) in ENVS.items():
        end = cv2.imread(str(VIDEOS / end_name))
        endf = end.astype(np.float32)

        # Left: how much extension there is, in End px, keeping 4 px clear of
        # the image edge. Canvas x = End x + ext.
        stretched = cv2.imread(str(STRETCHED / left_name), cv2.IMREAD_COLOR)
        W, cc = register(end, stretched)
        ext = int(np.floor(W[0, 2] / W[0, 0])) - 4
        Wc = W.copy()
        Wc[:, 2] = W[:, 2] - W[:, 0] * ext
        left = cv2.warpAffine(stretched, Wc, (ext + 1920, 1080),
                              flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                              borderMode=cv2.BORDER_REPLICATE).astype(np.float32)
        match_colour(left, left[:, ext:], endf)

        # Right: resampled onto End px 0 to 1920 + EXT_RIGHT. Its few rows
        # short at the top and bottom are filled by reflection.
        extended = cv2.imread(str(STRETCHED / right_name), cv2.IMREAD_COLOR)
        Wr, cc_r = register_right(end, extended)
        h, w = extended.shape[:2]
        reach = (cv2.invertAffineTransform(Wr) @ np.array([[w, 0, 1], [w, h, 1]], float).T)[0].min()
        if reach < 1920 + EXT_RIGHT + 4:
            sys.exit(f'{env}: right extension reaches x {reach:.0f}, needs {1920 + EXT_RIGHT + 4}')
        right = cv2.warpAffine(extended, Wr, (1920 + EXT_RIGHT, 1080),
                               flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                               borderMode=cv2.BORDER_REFLECT_101).astype(np.float32)
        match_colour(right, right[:, 1920 - SEAM_FIT:1920], endf[:, 1920 - SEAM_FIT:])

        # Exact End frame in the middle, blended into each extension.
        canvas = np.empty((1080, ext + 1920 + EXT_RIGHT, 3), np.float32)
        x = np.arange(1920, dtype=np.float32)[None, :, None]
        to_left = np.clip(1 - x / FEATHER, 0, 1)
        to_right = np.clip((x - (1920 - FEATHER_RIGHT)) / FEATHER_RIGHT, 0, 1)
        canvas[:, :ext] = left[:, :ext]
        canvas[:, ext:ext + 1920] = endf * (1 - to_left - to_right) + left[:, ext:] * to_left + right[:, :1920] * to_right
        canvas[:, ext + 1920:] = right[:, 1920:]
        canvas = np.clip(canvas, 0, 255).astype(np.uint8)

        # How close the visible frame is to the End frame at the swap.
        diff = np.abs(canvas[:, ext:ext + 1920].astype(float) - endf).mean()

        cv2.imwrite(str(OUT_IMG / f'env-{slug}-slide.jpg'), canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])

        sd = round(960 - cabinet_centre_x(end, zoom_pts), 1)
        sv = round(SUPPLYVEND_ZOOM_X - SUPPLYVEND_X[env], 1)
        if sd > ext:
            sys.exit(f'{env}: SmartDrawer needs {sd}px of extension, has {ext}px')
        if -sv > EXT_RIGHT:
            sys.exit(f'{env}: SupplyVend needs {-sv}px of extension, has {EXT_RIGHT}px')
        result[env] = {'ext': ext, 'ext_right': EXT_RIGHT,
                       'smartdrawer': {'slide': sd}, 'supplysystem': {'slide': sv}}
        print(f'{env:18s} ECC {cc:.4f} / {cc_r:.4f}  ext {ext}px + {EXT_RIGHT}px  swap diff {diff:.2f}  '
              f'slide SmartDrawer {sd}px, SupplyVend {sv}px')

    (DEMO / 'tools' / 'pan-fit.json').write_text(json.dumps(result, indent=2))
    print('wrote tools/pan-fit.json and assets/img/env-*-slide.jpg')


if __name__ == '__main__':
    main()
