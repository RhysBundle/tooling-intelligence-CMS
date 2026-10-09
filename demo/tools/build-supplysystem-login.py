"""
Builds the SupplySystem zoom and login clips and the stills that go with them.

    python tools/build-supplysystem-login.py     (from the demo folder)

Needs Pillow (pip install pillow) and ffmpeg on the PATH.

Inputs, from GDrive-example/Videos/ActionVideos/SupplyVend: the phase 1
SupplyVend renders, one per login type. Each zooms from the cabinet in a grey
studio onto its screen, logs in, then carries on into a whole phase 1
transaction. Only the zoom and login are wanted, so each is cut at the first
moment after the login when the camera has settled and the hand is clear of
the frame (END_FRAME, checked frame by frame):

  rfid     CV_RFID_SignIn.mp4  5.00s  on "Items checked out by you"
  barcode  CV_Barcode.mp4      6.80s  on Select Product, after the Login
                                      Allocation Code screen
  userid   SV_UserID.mp4       9.27s  on Select Product

The RFID and typed clips share one camera move and end on the same framing.
The barcode clip's camera ends 43.9px higher, at the same scale.

On that framing the screen shows the device's 1024x768 UI as it is, not
widened to 16:9 as on SmartDrawer, at 0.834 scale with its top left corner at
549, 227.9 (UI below). Fitted against the artwork for Select Product
(15_Search_4) and "Items checked out" (SupplySystem_Items) to within 2px.

Output, in assets/:
  video/zoom-login-supplysystem-<type>.mp4      web copy, H.264 CRF 22, no audio
  img/zoom-login-supplysystem-<type>-start.jpg  its first frame
  img/zoom-login-supplysystem-<type>-end.jpg    its last frame, for the device
                                                layer to sit on
  img/login-supplysystem-clean.jpg              log out screen, RFID and typed
  img/login-supplysystem-barcode-clean.jpg      log out screen, barcode

No clip shows the login screen at the settled framing without a hand on it, so
the log out screens are put together. At LOGIN_FRAME both the RFID and the
typed clip show the login screen: the RFID one with the badge at the reader,
which shades the screen's right edge, the typed one with a finger on the lower
middle. The screen comes from the RFID frame, its right edge from the typed
one, the reader (idle light) from the typed one, and the rest of the frame from
the hand-free end of the RFID clip. The barcode one is the same screen moved up
43.9px onto the end of the barcode clip. Both have the welcome text taken out,
since it says "Welcome to SmartDrawer"; demo.js sets the log out message there.

At the cut, the typed and barcode clips' hand has just left the bottom of the
frame, but its reflection is still in the glass under the screen, and the last
frame stays up for the whole sequence. So each gets a patch of clean glass,
faded in over its last few frames (from FADE_FROM) as the hand moves away. The
typed clip's comes from the end of the RFID clip, which has the same framing
and no reflection. No frame on the barcode clip's framing has clean glass there
(later ones have the arm's shadow), but the glass under the screen is plain
horizontal bands, so its patch copies the same rows from BARCODE_DX to the
left, where they are clean.

Rerun it if any of these renders change. The numbers here go in js/media.js.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

DEMO = Path(__file__).resolve().parent.parent
SRC = DEMO.parent.parent / 'GDrive-example' / 'Videos' / 'ActionVideos' / 'SupplyVend'
OUT_VIDEO = DEMO / 'assets' / 'video'
OUT_IMG = DEMO / 'assets' / 'img'
TMP = DEMO / 'tools' / '_tmp'

FPS = 30
CLIPS = {
    'rfid':    ('CV_RFID_SignIn.mp4', 150),
    'barcode': ('CV_Barcode.mp4', 204),
    'userid':  ('SV_UserID.mp4', 278),
}
LOGIN_FRAME = 114               # 3.80s, login screen in both the RFID and typed clips
UI = (549.0, 227.9, 0.834)      # left, top, scale of the 1024x768 UI
BARCODE_DY = -43.9              # the barcode clip's framing against the others
EDGE_X = 1365                   # from here right, the screen comes from the typed clip
READER = (1440, 230, 1640, 520)  # the badge reader, from the typed clip
# The glass under the screen where the hand's reflection sits at the cut,
# and the frame the patch starts to fade in from
PATCH = {
    'userid':  {'box': (990, 864, 1290, 990), 'fade_from': 272},
    'barcode': {'box': (1040, 822, 1410, 1000), 'fade_from': 200},
}
BARCODE_DX = -400               # where the barcode clip's patch is copied from
FEATHER = 16                    # px, at the patch's sides and foot (its top meets the screen)


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def frame_of(video, index, out):
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vf', f'select=eq(n\\,{index})',
         '-frames:v', '1', str(out)])
    return Image.open(out).convert('RGB')


def last_frame(video, out):
    run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', str(video), '-update', '1', str(out)])
    return Image.open(out).convert('RGB')


def ui_box(dy=0.0, margin=2):
    left, top, s = UI
    return (int(left) - margin, int(top + dy) - margin,
            int(left + 1024 * s) + 1 + margin, int(top + dy + 768 * s) + 1 + margin)


def clear_welcome(im, dy=0.0):
    """Takes the welcome text out of the login panel, filling each row from the
    panel's own colour either side of the text."""
    left, top, s = UI
    def X(ax): return round(left + ax * s)
    def Y(ay): return round(top + dy + ay * s)
    # The text sits between artwork y 226 and 324, inside the panel 248 to 717
    x0, x1 = X(262), X(703)
    px = im.load()
    for y in range(Y(222), Y(326)):
        a = sorted(px[x, y] for x in range(x0 - 8, x0))[4]
        b = sorted(px[x, y] for x in range(x1, x1 + 8))[4]
        for x in range(x0, x1):
            t = (x - x0) / (x1 - x0)
            px[x, y] = tuple(round(a[c] + (b[c] - a[c]) * t) for c in range(3))
    return im


def patch_image(pixels, box):
    """A full frame, clear but for pixels in box, feathered at its sides and foot."""
    w, h = box[2] - box[0], box[3] - box[1]
    mask = Image.new('L', (w, h), 0)
    draw = ImageDraw.Draw(mask)
    for i in range(FEATHER):
        draw.rectangle((i, 0, w - 1 - i, h - 1 - i), fill=round(255 * (i + 1) / FEATHER))
    out = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    tile = pixels.convert('RGBA')
    tile.putalpha(mask)
    out.paste(tile, box[:2])
    return out


def encode(src, end, video, patch=None, fade_from=None):
    args = ['ffmpeg', '-v', 'error', '-y', '-i', str(src)]
    if patch:
        patch.save(TMP / 'patch.png')
        st, d = fade_from / FPS, (end - fade_from) / FPS
        args += ['-framerate', str(FPS), '-loop', '1', '-i', str(TMP / 'patch.png'), '-filter_complex',
                 f'[1:v]format=rgba,fade=t=in:st={st:.4f}:d={d:.4f}:alpha=1[p];[0:v][p]overlay=0:0:shortest=1[v]',
                 '-map', '[v]']
    args += ['-frames:v', str(end + 1), '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
             '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(video)]
    run(args)


def main():
    TMP.mkdir(exist_ok=True)
    for name, _ in CLIPS.values():
        if not (SRC / name).exists():
            sys.exit(f'Missing {SRC / name}')
    ends = {}
    # RFID first: its end frame is the clean glass for the typed clip's patch
    for kind in ('rfid', 'userid', 'barcode'):
        name, end = CLIPS[kind]
        src = SRC / name
        video = OUT_VIDEO / f'zoom-login-supplysystem-{kind}.mp4'
        patch = None
        if kind in PATCH:
            box = PATCH[kind]['box']
            if kind == 'userid':
                clean = ends['rfid'].crop(box)
            else:
                last = frame_of(src, end, TMP / 'last.png')
                clean = last.crop((box[0] + BARCODE_DX, box[1], box[2] + BARCODE_DX, box[3]))
            patch = patch_image(clean, box)
        encode(src, end, video, patch, PATCH.get(kind, {}).get('fade_from'))
        frame_of(video, 0, TMP / 'start.png').save(OUT_IMG / f'zoom-login-supplysystem-{kind}-start.jpg', quality=90)
        ends[kind] = last_frame(video, TMP / f'{kind}-end.png')
        ends[kind].save(OUT_IMG / f'zoom-login-supplysystem-{kind}-end.jpg', quality=92)
        print(f'{kind}: {(end + 1) / FPS:.2f}s, {video.stat().st_size // 1024} KB')

    # Log out screen on the RFID and typed framing
    rfid = frame_of(SRC / CLIPS['rfid'][0], LOGIN_FRAME, TMP / 'rfid-login.png')
    typed = frame_of(SRC / CLIPS['userid'][0], LOGIN_FRAME, TMP / 'typed-login.png')
    screen = rfid.copy()
    box = ui_box()
    screen.paste(typed.crop((EDGE_X, box[1], box[2], box[3])), (EDGE_X, box[1]))
    logout = ends['rfid'].copy()
    logout.paste(screen.crop(box), box[:2])
    logout.paste(typed.crop(READER), READER[:2])
    clear_welcome(logout).save(OUT_IMG / 'login-supplysystem-clean.jpg', quality=92)

    # The same screen on the barcode framing
    moved = logout.transform(logout.size, Image.AFFINE, (1, 0, 0, 0, 1, -BARCODE_DY), resample=Image.BICUBIC)
    logout_b = ends['barcode'].copy()
    box_b = ui_box(BARCODE_DY, margin=0)
    logout_b.paste(moved.crop(box_b), box_b[:2])
    logout_b.save(OUT_IMG / 'login-supplysystem-barcode-clean.jpg', quality=92)

    for f in TMP.iterdir():
        f.unlink()
    TMP.rmdir()
    print('Done.')


if __name__ == '__main__':
    main()
