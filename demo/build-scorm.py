"""
Builds a SCORM 1.2 package of the demo.

    python build-scorm.py                 -> ../dist/TI_Product_Demo_SCORM12.zip
    python build-scorm.py out/name.zip    -> that path

Standard library only. Lists every file in the manifest, and leaves out
this script, the README and anything not needed at runtime.
"""
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import quoteattr

ROOT = Path(__file__).resolve().parent
INCLUDE = ['index.html', 'css', 'js', 'data', 'assets']
SKIP_NAMES = {'README.txt', '.DS_Store', 'Thumbs.db'}
TITLE = 'Tooling Interactive Customised Product Experience'


def collect():
    files = []
    for entry in INCLUDE:
        p = ROOT / entry
        if p.is_file():
            files.append(p)
        elif p.is_dir():
            files.extend(f for f in sorted(p.rglob('*')) if f.is_file() and f.name not in SKIP_NAMES)
    return [f.relative_to(ROOT).as_posix() for f in files]


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


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'dist' / 'TI_Product_Demo_SCORM12.zip'
    out.parent.mkdir(parents=True, exist_ok=True)
    files = collect()
    if 'index.html' not in files:
        sys.exit('index.html not found next to this script')
    with zipfile.ZipFile(out, 'w') as z:
        z.writestr('imsmanifest.xml', manifest(files), compress_type=zipfile.ZIP_DEFLATED)
        for f in files:
            # Video and images are already compressed; storing them is faster.
            kind = zipfile.ZIP_STORED if f.endswith(('.mp4', '.webm', '.jpg', '.png', '.woff2')) else zipfile.ZIP_DEFLATED
            z.write(ROOT / f, f, compress_type=kind)
    size = out.stat().st_size / 1e6
    print(f'{out}  {len(files) + 1} files  {size:.1f} MB')


if __name__ == '__main__':
    main()
