"""
Makes H.264 copies of Emil's ProRes renders, to keep on the server instead:
about a fifth of the size, and they decode as the tools read them (8-bit) to
within a level of the ProRes (47.8 dB PSNR on rail_depot_take, 11 Nov). Same
chroma, bit depth and BT.709 tags as each source, CRF 10.

Only renders without an alpha channel are copied: the alpha passes stay
ProRes, since a lossless copy saved only 6% (the reflections are noisy) and
their mattes must stay exact. So do the hand mattes, which are small.

    python demo/tools/screen-swap/compress_renders.py <renders folder> [--replace]

Writes <name>.mp4 next to each <name>.mov, checks it has every frame, and with
--replace then deletes the .mov. intro.py's render_path() takes the .mp4
where there's no .mov. Copies already made are skipped, so it can be run
again after new renders are added.
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path

CRF = 10


def probe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets',
                          '-show_entries', 'stream=pix_fmt,nb_read_packets', '-of', 'json', str(path)],
                         capture_output=True, text=True, check=True)
    s = json.loads(out.stdout)['streams'][0]
    return s['pix_fmt'], int(s['nb_read_packets'])


def target_format(pix_fmt):
    """The source's chroma at 10 bits, which x264 can write."""
    for chroma in ('444', '422', '420'):
        if f'yuv{chroma}' in pix_fmt or f'yuvj{chroma}' in pix_fmt:
            return f'yuv{chroma}p10le'
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--replace', action='store_true', help='delete each .mov once its copy is checked')
    args = ap.parse_args()
    movs = sorted(Path(args.folder).rglob('*.mov'))
    before = after = 0
    for mov in movs:
        mp4 = mov.with_suffix('.mp4')
        pix_fmt, frames = probe(mov)
        fmt = target_format(pix_fmt)
        if 'yuva' in pix_fmt or 'matte' in mov.stem or not fmt:
            print(f'kept    {mov.name} ({pix_fmt})', flush=True)
            continue
        if not mp4.exists():
            part = mp4.with_name(mp4.stem + '.part.mp4')
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(mov), '-map', '0:v:0',
                            '-c:v', 'libx264', '-preset', 'slow', '-crf', str(CRF), '-pix_fmt', fmt,
                            '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
                            '-movflags', '+faststart', str(part)], check=True)
            got = probe(part)[1]
            if got != frames:
                part.unlink()
                sys.exit(f'{mov.name}: copy has {got} frames, the render {frames}')
            part.replace(mp4)
        before += mov.stat().st_size
        after += mp4.stat().st_size
        print(f'copied  {mov.name}: {mov.stat().st_size / 1e6:.0f} MB to {mp4.stat().st_size / 1e6:.0f} MB', flush=True)
        if args.replace:
            mov.unlink()
    print(f'done: {before / 1e9:.1f} GB of ProRes as {after / 1e9:.1f} GB of H.264', flush=True)


if __name__ == '__main__':
    main()
