"""
Keeps every user's intro up to date, for the CMS on SAGA: asks the CMS for
its configs and sequences every so often, and for each user whose intro is
missing, or was made with something that has since changed (colours, logo,
location, login type, the sequence's first screen, or the renders), makes it
with intro.py into the folder the CMS serves as custom/. One at a time, the
longest-waiting first. Until a user's intro is ready, the demo plays the
usual clip.

    python demo/tools/screen-swap/worker.py --cms http://ti-cms:3000/ --out /custom
    python demo/tools/screen-swap/worker.py --cms http://localhost:3000/ --out ../custom --once

Needs what intro.py needs, and the renders (TI_RENDERS). --once makes
everything due and stops, and --only <id,id> limits it to those users, for
testing.

Per user, in <out>/<user id in lower case>/:
  intro.mp4, intro-start.jpg, intro-end.jpg   the clip and its first and last frames
  intro.json    the demo's entry for it, read by js/demo.js through the CMS
  status.json   making, ready, failed or none (can't be made), and when
A user deleted from the CMS has its folder removed.
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

# User IDs that are safe as a folder name and in an address. The others
# (none so far) get no intro.
SAFE = re.compile(r'^[A-Za-z0-9_-]{1,64}$')


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
    half of it."""
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.part')
    tmp.write_text(json.dumps(value, indent=1), encoding='utf-8')
    os.replace(tmp, p)


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


def due(out, found):
    """The users whose intro needs making, longest waiting first, as
    (key, config, sequence, made). Writes status none for users that can't
    have one."""
    todo = []
    for key, (c, s) in found.items():
        d = out / key
        status = read_json(d / 'status.json') or {}
        why = intro.can_build(c)
        if why:
            if status.get('state') != 'none' or status.get('why') != why:
                write_json(d / 'status.json', {'state': 'none', 'why': why, 'at': now()})
            continue
        made = intro.made_for(c, s)
        if (read_json(d / 'intro.json') or {}).get('made') == made:
            if status.get('state') != 'ready':
                write_json(d / 'status.json', {'state': 'ready', 'made': made, 'at': now()})
            continue
        # A build that failed isn't tried again until something changes
        if status.get('state') == 'failed' and status.get('made') == made:
            continue
        todo.append((str(c.get('updated_at') or ''), key, c, s, made))
    todo.sort(key=lambda t: t[0])
    return [t[1:] for t in todo]


def make(out, key, c, s, made):
    d = out / key
    write_json(d / 'status.json', {'state': 'making', 'made': made, 'since': now()})
    log(f'{c["user_id"]}: making its intro')
    start = time.time()
    try:
        got = intro.build(c, s, d, log=log)
        write_json(d / 'intro.json', intro.entry_for(c, got, '', bust=True))
        write_json(d / 'status.json', {'state': 'ready', 'made': got, 'at': now(), 'seconds': round(time.time() - start)})
        log(f'{c["user_id"]}: ready in {time.time() - start:.0f}s')
    except (Exception, SystemExit) as e:
        write_json(d / 'status.json', {'state': 'failed', 'made': made, 'at': now(), 'error': str(e) or type(e).__name__})
        log(f'{c["user_id"]}: failed\n{traceback.format_exc()}')


def tidy(out, found):
    """Removes the folders of users no longer in the CMS (only ours: they
    have a status.json)."""
    for d in out.iterdir():
        if d.is_dir() and d.name not in found and (d / 'status.json').exists():
            shutil.rmtree(d, ignore_errors=True)
            log(f'{d.name}: no longer in the CMS, its intro removed')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cms', default=os.environ.get('TI_CMS_URL', 'http://ti-cms:3000/'))
    ap.add_argument('--out', default=os.environ.get('TI_CUSTOM_DIR', '/custom'))
    ap.add_argument('--every', type=float, default=20, help='seconds between looks at the CMS')
    ap.add_argument('--once', action='store_true')
    ap.add_argument('--only', help='comma-separated user IDs to look after, and no others')
    args = ap.parse_args()
    only = {u.strip().lower() for u in args.only.split(',')} if args.only else None
    cms = args.cms.rstrip('/') + '/'
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log(f'watching {cms}, intros in {out}')
    while True:
        try:
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
