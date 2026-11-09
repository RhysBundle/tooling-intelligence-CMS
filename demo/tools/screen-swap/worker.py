"""
Keeps every user's branded videos up to date, for the CMS: asks the CMS for
its configs and sequences every so often, and for each user whose videos are
missing, or were made with something that has since changed (colours, logo,
location, login type, the sequence, or the renders), makes them into the
folder the CMS serves as custom/: the intro with intro.py (push in, login and
zoom), and a take or return video for each take and return in the sequence
with action.py. One user at a time, the longest-waiting first. Until a
user's videos are ready, the demo plays the usual ones.

    python demo/tools/screen-swap/worker.py --cms http://ti-cms:3000/ --out /custom
    npm run videos            (from the repo, for the CMS on this computer)

Needs what intro.py needs, and the renders (TI_RENDERS). --once makes
everything due and stops, and --only <id,id> limits it to those users, for
testing.

Per user, in <out>/<user id in lower case>/:
  intro.mp4, intro-start.jpg, intro-end.jpg   the intro and its first and last frames
  intro.json    the demo's entry for it, read by js/demo.js through the CMS
  take-*.mp4, return-*.mp4 and their -start.jpg   the take and return videos
  clips.json    the demo's entries for those
  status.json   waiting, making (with progress), ready, failed or none (can't
                be made), and when; the CMS shows it with a loading bar
A user deleted from the CMS has its folder removed. A failed make is tried
again when the user changes, or once when the worker restarts. <out>/_worker.json says
when the worker last looked, so the CMS can tell when it isn't running.
"""
import argparse
import json
import os
import re
import shutil
import sys
import time
import traceback
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import intro  # noqa: E402
import action  # noqa: E402

# User IDs that are safe as a folder name and in an address. The others
# (none so far) get no videos.
SAFE = re.compile(r'^[A-Za-z0-9_-]{1,64}$')
# How often progress is written while a video is made
PROGRESS_EVERY = 1.0


def log(msg):
    print(f'{datetime.now().strftime("%H:%M:%S")} {msg}', flush=True)


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def get(url):
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read().decode('utf-8'))


def read_json(p):
    try:
        return json.loads(Path(p).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


def write_json(p, value):
    """Written whole under another name, then renamed, so a reader never sees
    half of it. On Windows the rename fails while the CMS is sending the old
    file to a browser, so it tries again for up to a second."""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.part')
    tmp.write_text(json.dumps(value, indent=1), encoding='utf-8')
    for attempt in range(20):
        try:
            os.replace(tmp, p)
            return
        except PermissionError:
            if attempt == 19:
                raise
            time.sleep(0.05)


def heartbeat(out, busy=None):
    write_json(out / '_worker.json', {'at': now(), 'busy': busy})


def users(cms):
    """{ folder name: (config, sequence) } for every user the CMS has."""
    configs = get(cms + 'api/configs')
    seqs = {str(s['user_id']): s for s in get(cms + 'api/sequences')}
    out = {}
    for c in configs:
        uid = str(c.get('user_id') or '')
        # Two IDs that differ only in case would share a folder; the CMS lists
        # the latest change first, and that one wins
        if SAFE.match(uid) and uid.lower() not in out:
            out[uid.lower()] = (c, seqs.get(uid))
    return out


def wanted(c, s):
    """What a user's videos should be made with: {'intro': made or None,
    'clips': plan or None}, and why there are none if neither can be made."""
    why_intro = intro.can_build(c)
    why_clips = action.can_build(c)
    want = {'intro': None if why_intro else intro.made_for(c, s),
            'clips': None if why_clips or not action.wanted_clips(s) else action.plan_for(c, s)}
    why = why_intro if want['intro'] is None and want['clips'] is None else None
    return want, why


def have(d):
    """What the videos in folder d were made with, as wanted() says it."""
    return {'intro': (read_json(d / 'intro.json') or {}).get('made'),
            'clips': (read_json(d / 'clips.json') or {}).get('plan')}


def due(out, found):
    """The users whose videos need making, longest waiting first, as
    (key, config, sequence, want). Writes status none for users that can't
    have any, ready for those up to date, and waiting with their place in
    line for the rest."""
    todo = []
    for key, (c, s) in found.items():
        d = out / key
        status = read_json(d / 'status.json') or {}
        want, why = wanted(c, s)
        if why:
            if status.get('state') != 'none' or status.get('why') != why:
                write_json(d / 'status.json', {'state': 'none', 'why': why, 'at': now()})
            continue
        if have(d) == want:
            if status.get('state') != 'ready':
                write_json(d / 'status.json', {'state': 'ready', 'want': want, 'at': now(), 'videos': count_videos(d, want)})
            continue
        # A make that failed isn't tried again until something changes
        if status.get('state') == 'failed' and status.get('want') == want:
            continue
        todo.append((str(c.get('updated_at') or ''), key, c, s, want))
    todo.sort(key=lambda t: t[0])
    # The first is made next, so the place counts those waiting behind it
    for place, (_, key, c, s, want) in enumerate(todo):
        status = read_json(out / key / 'status.json') or {}
        if status.get('state') != 'waiting' or status.get('place') != place or status.get('want') != want:
            write_json(out / key / 'status.json', {'state': 'waiting', 'place': place, 'want': want,
                                                   'since': status.get('since') if status.get('state') == 'waiting' else now()})
    return [t[1:] for t in todo]


def count_videos(d, want):
    """How many videos the user has: the intro, and each take and return."""
    clips = read_json(d / 'clips.json') or {}
    return (1 if want['intro'] else 0) + sum(len(clips.get(k) or {}) for k in ('take', 'return'))


def make(out, key, c, s, want):
    d = out / key
    got = have(d)
    parts = []
    if want['intro'] and got['intro'] != want['intro']:
        parts.append('intro')
    if want['clips'] != got['clips']:
        parts.append('clips')
    total = ((intro.frame_count(c) if 'intro' in parts else 0) +
             (action.frame_count(c, s) if 'clips' in parts and want['clips'] else 0))
    since = now()
    progress = {'done': 0, 'part': '', 'written': 0.0}

    def write(force=False):
        t = time.time()
        if not force and t - progress['written'] < PROGRESS_EVERY:
            return
        progress['written'] = t
        # Progress is only for show, so one that can't be written is skipped
        # rather than stopping the video
        try:
            write_json(d / 'status.json', {'state': 'making', 'want': want, 'since': since, 'part': progress['part'],
                                           'done': progress['done'], 'total': total,
                                           'percent': round(100 * progress['done'] / max(total, 1))})
            heartbeat(out, str(c['user_id']))
        except OSError as e:
            log(f'{c["user_id"]}: progress not written ({e})')

    def tick():
        progress['done'] += 1
        write()

    def step(label):
        progress['part'] = label
        write(True)

    log(f'{c["user_id"]}: making {" and ".join(parts)} ({total} frames)')
    start = time.time()
    try:
        if 'intro' in parts:
            step('Intro')
            made = intro.build(c, s, d, log=log, tick=tick)
            write_json(d / 'intro.json', intro.entry_for(c, made, '', bust=True))
        if 'clips' in parts:
            if want['clips']:
                entry = action.build(c, s, d, '', bust=True, log=log, tick=tick, step=step)
                write_json(d / 'clips.json', entry)
            else:
                # The sequence no longer takes or returns anything
                (d / 'clips.json').unlink(missing_ok=True)
                for old in list(d.glob('take-*')) + list(d.glob('return-*')):
                    old.unlink()
        write_json(d / 'status.json', {'state': 'ready', 'want': want, 'at': now(), 'videos': count_videos(d, want),
                                       'seconds': round(time.time() - start)})
        log(f'{c["user_id"]}: ready in {time.time() - start:.0f}s')
    except (Exception, SystemExit) as e:
        write_json(d / 'status.json', {'state': 'failed', 'want': want, 'at': now(), 'error': str(e) or type(e).__name__})
        log(f'{c["user_id"]}: failed\n{traceback.format_exc()}')


def tidy(out, found):
    """Removes the folders of users no longer in the CMS (only ours: they
    have a status.json)."""
    for d in out.iterdir():
        if d.is_dir() and d.name not in found and (d / 'status.json').exists():
            shutil.rmtree(d, ignore_errors=True)
            log(f'{d.name}: no longer in the CMS, its videos removed')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cms', default=os.environ.get('TI_CMS_URL', 'http://ti-cms:3000/'))
    ap.add_argument('--out', default=os.environ.get('TI_CUSTOM_DIR', '/custom'))
    ap.add_argument('--every', type=float, default=10, help='seconds between looks at the CMS')
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--only', help='comma-separated user IDs to look after, and no others')
    args = ap.parse_args()
    only = {u.strip().lower() for u in args.only.split(',')} if args.only else None
    cms = args.cms.rstrip('/') + '/'
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log(f'watching {cms}, videos in {out}')
    # A make that failed waits for a change; a restart gives each one more
    # try too, in case what failed was the computer rather than the user
    for st_path in out.glob('*/status.json'):
        st = read_json(st_path) or {}
        if st.get('state') == 'failed':
            st.pop('want', None)
            write_json(st_path, st)
    while True:
        try:
            heartbeat(out)
            found = users(cms)
            if only is not None:
                found = {k: v for k, v in found.items() if k in only}
            else:
                tidy(out, found)
            todo = due(out, found)
            if args.once:
                for item in todo:
                    make(out, *item)
                return
            # One, then look again: the CMS may have changed while it was made
            if todo:
                make(out, *todo[0])
                continue
        except Exception as e:
            log(f"couldn't check the CMS: {e}")
            if args.once:
                sys.exit(1)
        time.sleep(args.every)


if __name__ == '__main__':
    main()
