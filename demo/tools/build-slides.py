"""
Builds the slide image for each environment and works out how far it slides.

    python tools/build-slides.py                 (from the demo folder)

Needs numpy and opencv-python (pip install numpy opencv-python), plus ffmpeg
on the PATH.

Inputs, from GDrive-example:
  Videos/<env>_End.png                                  the video's last frame
  2305_Product Demo_Screen Artwork/SupplyDrawer/*.png   the same frame with the
                                                        left side extended

The extended images are not pixel copies of the End frame: each is rescaled by
0.1 to 0.6 percent, shifted by part of a pixel, and the F1 one is about 7
levels darker. Used as they are, the swap from the video would visibly jump.
So for each environment this:
  1. registers the extended image to the End frame (OpenCV ECC, affine)
  2. resamples its left extension into the End frame's pixel grid
  3. matches its colour to the End frame
  4. puts the exact End.png on the right, feathered into the extension over
     FEATHER px, so the image matches the video's last frame exactly

Output:
  assets/img/env-<name>-slide.jpg   (1920 + ext) x 1080, End frame on the right
  tools/pan-fit.json                ext and slide distance, copied into js/media.js

Slide distance: how far right the image moves so the SmartDrawer cabinet is
centred, the way it sits in the first frame of the zoom clip. The cabinet is
found from its eight red SUPPLYPRO drawer labels.
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

FEATHER = 96          # px blend from the extension into the exact End frame
ZOOM_CABINET_X = 963  # cabinet centre in the zoom clip's first frame (measured)

ENVS = {
    'f1_automotive':     ('f1-automotive',     'F1_Garage_End.png',            'Streteched_F1_Garage_End.png'),
    'aircraft_hangar':   ('aircraft-hangar',   'Hanger_End.png',               'Streteched_Hanger_End.png'),
    'cnc_machine_shop':  ('cnc-machine-shop',  'CNC_Factory_End.png',          'Stretched_CNC_Factory_End.png'),
    'medical_cleanroom': ('medical-cleanroom', 'Medical_Cleanroom_End.png',    'Streteched_Medical_Cleanroom_End.png.png'),
    'rail_depot':        ('rail-depot',        'TrainWorkshop_End.png',        'Streteched_TrainWorkshop_End.png'),
    'amazon_warehouse':  ('warehouse',         'Amazonlike_Warehouse_End.png', 'Streteched_Amazonlike_Warehouse_End.png'),
}


def first_frame(video):
    png = subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', str(video),
                          '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'],
                         check=True, capture_output=True).stdout
    return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_COLOR)


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
    g1 = cv2.cvtColor(end, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    g2 = cv2.cvtColor(stretched, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
    W = np.array([[1, 0, x0], [0, 1, y0]], np.float32)
    cc, W = cv2.findTransformECC(g1, g2, W, cv2.MOTION_AFFINE,
                                 (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), None, 5)
    return W, cc


def main():
    zoom_pts = drawer_labels(first_frame(ZOOM), 50, 1.5)
    if len(zoom_pts) != 8:
        sys.exit(f'zoom clip: expected 8 drawer labels, found {len(zoom_pts)}')

    result = {'feather': FEATHER}
    for env, (slug, end_name, str_name) in ENVS.items():
        end = cv2.imread(str(VIDEOS / end_name))
        stretched = cv2.imread(str(STRETCHED / str_name), cv2.IMREAD_COLOR)
        W, cc = register(end, stretched)

        # How much extension there is to the left of the End frame, in End px,
        # keeping 4 px clear of the image edge.
        ext = int(np.floor(W[0, 2] / W[0, 0])) - 4
        width = ext + 1920

        # Resample the whole stretched image onto the canvas grid: canvas x = p.x + ext.
        Wc = W.copy()
        Wc[:, 2] = W[:, 2] - W[:, 0] * ext
        warped = cv2.warpAffine(stretched, Wc, (width, 1080),
                                flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP,
                                borderMode=cv2.BORDER_REPLICATE).astype(np.float32)

        # Colour: per-channel gain and offset, fitted where the two overlap.
        ov = warped[:, ext:]
        endf = end.astype(np.float32)
        for c in range(3):
            a, b = ov[..., c].ravel(), endf[..., c].ravel()
            gain = b.std() / max(a.std(), 1e-6)
            off = b.mean() - gain * a.mean()
            warped[..., c] = warped[..., c] * gain + off

        # Exact End frame on the right, feathered into the extension.
        canvas = warped
        ramp = np.clip((np.arange(1920) / FEATHER), 0, 1).astype(np.float32)[None, :, None]
        canvas[:, ext:] = warped[:, ext:] * (1 - ramp) + endf * ramp
        canvas = np.clip(canvas, 0, 255).astype(np.uint8)

        # How close the visible frame is to the End frame at the swap.
        diff = np.abs(canvas[:, ext:].astype(float) - endf).mean()

        cv2.imwrite(str(OUT_IMG / f'env-{slug}-slide.jpg'), canvas, [cv2.IMWRITE_JPEG_QUALITY, 90])

        cx = cabinet_centre_x(end, zoom_pts)
        slide = round(960 - cx, 1)
        if slide > ext:
            sys.exit(f'{env}: needs {slide}px of extension, has {ext}px')
        result[env] = {'ext': ext, 'smartdrawer': {'slide': slide}}
        print(f'{env:18s} ECC {cc:.4f}  ext {ext}px  swap diff {diff:.2f}  cabinet x {cx:.1f}  slide right {slide}px')

    (DEMO / 'tools' / 'pan-fit.json').write_text(json.dumps(result, indent=2))
    print('wrote tools/pan-fit.json and assets/img/env-*-slide.jpg')


if __name__ == '__main__':
    main()
