"""
Builds the zoom and login clips, SmartDrawer's and SupplySystem's, from the
phase 1 renders.

    python tools/build-login-clips.py     (from the demo folder)

Needs Pillow (pip install pillow) and ffmpeg on the PATH.

Inputs, from GDrive-example/Videos/ActionVideos: one render per product and
login type. Each zooms from the cabinet in a grey studio onto its screen, logs
in, then carries on into a whole phase 1 transaction. Only the zoom and login
are wanted, so each is cut at the first moment after the login when the camera
has settled and the hand is out of the frame (END, checked frame by frame):

  SmartDrawer   rfid     SD_RFID_login.mp4      8.53s  on Check in (the clip
                                                        has picked an item)
                barcode  SD_Bardcord_Login.mp4  7.63s  on Select Product, after
                                                        Login Allocation Code
                userid   SD_UserID_login.mp4    10.50s on Login Allocation Code;
                                                        the hand never leaves,
                                                        see the patches
  SupplySystem  rfid     CV_RFID_SignIn.mp4     5.03s  on Items checked out
                barcode  CV_Barcode.mp4         6.83s  on Select Product, after
                                                        Login Allocation Code
                userid   SV_UserID.mp4          9.30s  on Select Product

All three SmartDrawer clips end on one framing, the monitor at an angle.
SupplySystem's RFID and typed clips end on one, its barcode clip 43.9px higher.
Where the screen sits in each is in js/media.js (login_screen), fitted against
the artwork.

The last frame stays up behind the HTML screens for the whole sequence, so at
the cut nothing may move: the hand's reflection is often still in the glass
under the screen, and on SmartDrawer's typed clip the hand itself rests at the
bottom of the frame. Each gets a patch (PATCH), faded in over the clip's last
few frames (from FADE_FROM) as the hand moves away:
  - 'shift' copies the same frame's own glass from further along, where it is
    clean; under the screen it is plain bands, sloping on SmartDrawer
  - 'clip' copies the end of another clip with the same framing and a clean
    frame there

Output, in assets/:
  video/zoom-login-<name>.mp4      web copy, H.264 CRF 22, no audio
  img/zoom-login-<name>-start.jpg  its first frame
  img/zoom-login-<name>-end.jpg    its last frame, for the device layer

Rerun it if any of these renders change.
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

DEMO = Path(__file__).resolve().parent.parent
SRC = DEMO.parent.parent / 'GDrive-example' / 'Videos' / 'ActionVideos'
OUT_VIDEO = DEMO / 'assets' / 'video'
OUT_IMG = DEMO / 'assets' / 'img'
TMP = DEMO / 'tools' / '_tmp'

FPS = 30
# name: (source, last frame, frame the patches start to fade in from)
CLIPS = {
    'smartdrawer-phase1-rfid':    ('SmartDrawer/SD_RFID_login.mp4', 255, 249),
    'smartdrawer-phase1-barcode': ('SmartDrawer/SD_Bardcord_Login.mp4', 228, 222),
    'smartdrawer-phase1-userid':  ('SmartDrawer/SD_UserID_login.mp4', 314, 304),
    'supplysystem-rfid':          ('SupplyVend/CV_RFID_SignIn.mp4', 150, None),
    'supplysystem-barcode':       ('SupplyVend/CV_Barcode.mp4', 204, 200),
    'supplysystem-userid':        ('SupplyVend/SV_UserID.mp4', 278, 272),
}

# The glass under SmartDrawer's screen, its top just inside the screen's
# bottom edge, which slopes up to the right
SD_GLASS = [(860, 739), (1235, 724), (1235, 866), (860, 880)]
SD_SLOPE = (729.0 - 761.25) / (1259 - 421)   # the screen's bottom edge, px per px
# The typed clip's reflection is fainter but wider
SD_GLASS_WIDE = [(790, 742), (1250, 723), (1250, 866), (790, 884)]

# name: [(polygon, source)]
PATCH = {
    'smartdrawer-phase1-rfid':    [(SD_GLASS, ('shift', -360, -360 * SD_SLOPE))],
    'smartdrawer-phase1-barcode': [(SD_GLASS, ('shift', -360, -360 * SD_SLOPE))],
    'smartdrawer-phase1-userid':  [(SD_GLASS_WIDE, ('shift', -360, -360 * SD_SLOPE)),
                                   ([(870, 870), (1550, 870), (1550, 1090), (870, 1090)], ('clip', 'smartdrawer-phase1-rfid'))],
    'supplysystem-barcode':       [([(1040, 818), (1410, 818), (1410, 1000), (1040, 1000)], ('shift', -400, 0))],
    'supplysystem-userid':        [([(990, 860), (1290, 860), (1290, 990), (990, 990)], ('clip', 'supplysystem-rfid'))],
}
FEATHER = 6   # px of blur on a patch's edges


def run(args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def frame_of(video, index, out):
    run(['ffmpeg', '-v', 'error', '-y', '-i', str(video), '-vf', f'select=eq(n\\,{index})',
         '-frames:v', '1', str(out)])
    return Image.open(out).convert('RGB')


def last_frame(video, out):
    run(['ffmpeg', '-v', 'error', '-y', '-sseof', '-0.1', '-i', str(video), '-update', '1', str(out)])
    return Image.open(out).convert('RGB')


def patch_image(name, last, ends):
    """The clip's patches as one full frame, clear outside them."""
    out = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
    for poly, (kind, *arg) in PATCH[name]:
        if kind == 'shift':
            dx, dy = arg
            # each pixel from (x + dx, y + dy) of the same frame
            pixels = last.transform(last.size, Image.AFFINE, (1, 0, dx, 0, 1, dy), resample=Image.BICUBIC)
        else:
            pixels = ends[arg[0]]
        mask = Image.new('L', (1920, 1080), 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        mask = mask.filter(ImageFilter.GaussianBlur(FEATHER))
        layer = pixels.convert('RGBA')
        layer.putalpha(mask)
        out = Image.alpha_composite(out, layer)
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
    for src, _, _ in CLIPS.values():
        if not (SRC / src).exists():
            sys.exit(f'Missing {SRC / src}')
    only = sys.argv[1:]
    ends = {}
    # Clips with no patch first: their ends are clean glass for the others
    order = sorted(CLIPS, key=lambda n: n in PATCH)
    for name in order:
        src_name, end, fade_from = CLIPS[name]
        src = SRC / src_name
        video = OUT_VIDEO / f'zoom-login-{name}.mp4'
        if name in PATCH:
            last = frame_of(src, end, TMP / 'last.png')
            patch = patch_image(name, last, ends)
        else:
            patch = None
        if not only or name in only or not video.exists():
            encode(src, end, video, patch, fade_from)
            frame_of(video, 0, TMP / 'start.png').save(OUT_IMG / f'zoom-login-{name}-start.jpg', quality=90)
            print(f'{name}: {(end + 1) / FPS:.2f}s, {video.stat().st_size // 1024} KB')
        ends[name] = last_frame(video, TMP / f'{name}-end.png')
        ends[name].save(OUT_IMG / f'zoom-login-{name}-end.jpg', quality=92)

    for f in TMP.iterdir():
        f.unlink()
    TMP.rmdir()
    print('Done.')


if __name__ == '__main__':
    main()
