"""
Builds a SCORM 1.2 package of the demo, or a plain HTML export of it.

    python build-scorm.py                   -> ../dist/TI_Product_Demo_SCORM12.zip
    python build-scorm.py out/name.zip      -> that path
    python build-scorm.py --html            -> ../dist/TI_Product_Demo_HTML.zip
    python build-scorm.py --html out.zip    -> that path

The HTML export is the same files with no manifest, index.html at the root,
for a plain web host such as SAGA. js/scorm.js is still in it and does
nothing there.

Standard library only. Lists every file in the manifest, and leaves out
this script, the README, tools/ and anything not needed at runtime.

The demo loads the CMS's own catalogue, event types and validator from
../shared. The package puts them in shared/ next to index.html, and the
index.html it packs has those paths rewritten to match.
"""
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import quoteattr

ROOT = Path(__file__).resolve().parent
SHARED = ROOT.parent / 'shared'
INCLUDE = ['index.html', 'css', 'js', 'data', 'assets']
SHARED_FILES = ['catalogue.js', 'event-types.js', 'sequence-validator.js']
SKIP_NAMES = {'README.txt', '.DS_Store', 'Thumbs.db'}
TITLE = 'Tooling Interactive Customised Product Experience'


def collect():
    """Returns (path in the package, file on disk) pairs."""
    files = []
    for entry in INCLUDE:
        p = ROOT / entry
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            files.extend(f for f in sorted(p.rglob('*')) if f.is_file() and f.name not in SKIP_NAMES)
    pairs = [(f.relative_to(ROOT).as_posix(), f) for f in files]
    pairs += [('shared/' + name, SHARED / name) for name in SHARED_FILES]
    return pairs


def manifest(files):
    rows = '\n'.join('      <file href=%s/>' % quoteattr(f) for f in files)
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="com.bundletraining.ti.productdemo" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="ORG-TI-DEMO">
    <organization identifier="ORG-TI-DEMO">
      <title>{TITLE}</title>
      <item identifier="ITEM-TI-DEMO" identifierref="RES-TI-DEMO">
        <title>{TITLE}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-TI-DEMO" type="webcontent" adlcp:scormtype="sco" href="index.html">
{rows}
    </resource>
  </resources>
</manifest>
'''


def check_paths(names):
    """Sorts the assets/ paths the code asks for that are not in the package.
    Returns (wrong case, not there). A wrong case is an error: Windows
    forgives it, a web host does not. A file that is not there is a media
    slot still waiting for its render, which shows a placeholder."""
    wanted = set()
    for name, src in collect():
        if name.endswith(('.html', '.js', '.css')):
            wanted.update(re.findall(r"assets/[\w./-]+\.\w+", src.read_text(encoding='utf-8')))
    lower = {n.lower() for n in names}
    absent = [w for w in sorted(wanted) if w not in names]
    return [w for w in absent if w.lower() in lower], [w for w in absent if w.lower() not in lower]


def main():
    args = sys.argv[1:]
    html_only = '--html' in args
    args = [a for a in args if a != '--html']
    default = 'TI_Product_Demo_HTML.zip' if html_only else 'TI_Product_Demo_SCORM12.zip'
    out = Path(args[0]) if args else ROOT.parent / 'dist' / default
    out.parent.mkdir(parents=True, exist_ok=True)
    pairs = collect()
    names = [name for name, _ in pairs]
    if 'index.html' not in names:
        sys.exit('index.html not found next to this script')
    missing = [str(src) for _, src in pairs if not src.is_file()]
    if missing:
        sys.exit('missing: ' + ', '.join(missing))
    wrong_case, waiting = check_paths(set(names))
    if wrong_case:
        sys.exit('asked for in a different case from the file: ' + ', '.join(wrong_case))
    for w in waiting:
        print('  no file yet, shows a placeholder: ' + w)
    with zipfile.ZipFile(out, 'w') as z:
        if not html_only:
            z.writestr('imsmanifest.xml', manifest(names), compress_type=zipfile.ZIP_DEFLATED)
        for name, src in pairs:
            if name == 'index.html':
                html = src.read_text(encoding='utf-8').replace('src="../shared/', 'src="shared/')
                z.writestr(name, html, compress_type=zipfile.ZIP_DEFLATED)
                continue
            # Video and images are already compressed; storing them is faster.
            kind = zipfile.ZIP_STORED if name.endswith(('.mp4', '.webm', '.jpg', '.png', '.woff2')) else zipfile.ZIP_DEFLATED
            z.write(src, name, compress_type=kind)
    size = out.stat().st_size / 1e6
    print(f'{out}  {len(names) + (0 if html_only else 1)} files  {size:.1f} MB')


if __name__ == '__main__':
    main()
