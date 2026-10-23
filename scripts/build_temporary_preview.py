#!/usr/bin/env python3
"""Package the named read-only runtime assets, including the flat WebGL module."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = '''ux/index.html ux/advertise.html ux/app.js ux/bottom-sheet.js ux/viewport.js ux/ui-tokens.css ux/mobile-layout.css ux/studio.js ux/pages.js ux/settings.js ux/model.js ux/map.js ux/flat-map.js ux/geometry.js ux/motion.js ux/icons.js ux/analytics.js ux/advertising/creative.js ux/advertising/request.js ux/style.css ux/master.css ux/ui-overhaul.css ux/startup-guard.js ux/studio.css ux/view-settings.json ux/startup/unemployment-BLS-LAUS-2024-2024-M12.json ux/county-boundary-repair.json ux/cities.json ux/assets/fonts.css ux/assets/geist-400.ttf ux/assets/geist-500.ttf ux/assets/geist-600.ttf ux/assets/geist-700.ttf ux/assets/san-francisco-photo.jpg node_modules/d3/dist/d3.min.js node_modules/topojson-client/dist/topojson-client.min.js node_modules/us-atlas/counties-10m.json node_modules/world-atlas/countries-110m.json'''.split()
THREE = '''build/three.module.js build/three.core.js examples/jsm/controls/OrbitControls.js examples/jsm/lines/LineSegments2.js examples/jsm/lines/LineSegmentsGeometry.js examples/jsm/lines/LineMaterial.js examples/jsm/utils/BufferGeometryUtils.js'''.split()
PRIVATE = 'scripts/atlas_data.py scripts/preview_server.py ux/catalog.json ux/catalog-v2.json ux/catalog-proposals.json ux/acs-series.json ux/metric-definitions.json'.split()
STATES = '01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split()
ICONS = 'search back saved check compare house shuffle close plus minus chevron-down location forward share indicators explorer'.split()


def build(destination, release):
    if destination.exists():
        raise ValueError('Use a fresh temporary build directory')
    if not re.fullmatch(r'[a-zA-Z0-9._-]{1,80}', release):
        raise ValueError('Invalid release identifier')
    destination.mkdir(parents=True)
    public = PUBLIC + ['ux/journal.js', 'ux/journal-view.js']
    public += [f'ux/assets/articles/{name}.jpg' for name in
               ('ms-initial', 'ms-mobile', 'electricity-initial', 'electricity-mobile')]
    public += ['node_modules/three/' + name for name in THREE]
    public += [f'ux/boundaries/{state}.json' for state in STATES]
    public += [f'ux/assets/brand-icons/{icon}.png' for icon in ICONS]
    public.append('ux/indicator-visibility.js')
    public.append('ux/approved-icons.js')
    manifest = {}
    for relative in public + PRIVATE:
        source, target = ROOT / relative, destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if relative in public:
            manifest['/' + relative] = relative
    index = destination / 'ux/index.html'
    text = index.read_text()
    if 'data-runtime="preview"' not in text:
        text = text.replace('<body ', '<body data-runtime="preview" ', 1)
    index.write_text(text.replace('  <link rel="stylesheet" href="feedback.css">\n', ''))
    # The public release has no local review panel: the hook is removed, not hidden.
    app = destination / 'ux/app.js'
    app_text = app.read_text()
    if 'if(reviewOn){' not in app_text:
        raise ValueError('The local review hook is missing from ux/app.js')
    app.write_text(app_text.replace('if(reviewOn){', 'if(false){', 1))
    manifest['/ux/'] = 'ux/index.html'
    flags = dict(re.findall(r"'([0-9.]+)': (true|false)",
                            (destination / 'ux/indicator-visibility.js').read_text()))
    metadata = {
        'release': release,
        'builtAt': datetime.now(timezone.utc).isoformat(),
        'sourceBaseCommit': subprocess.check_output(
            ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
        'renderer2dDefault': 'webgl',
        'visibleFieldCount': sum(value == 'true' for value in flags.values()),
        'medicalFields': [key for key in ('11.01', '11.02', '11.03')
                          if flags.get(key) == 'true'],
        'sourceSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                         for name in ('ux/app.js', 'ux/bottom-sheet.js', 'ux/viewport.js',
                                      'ux/ui-tokens.css', 'ux/mobile-layout.css', 'ux/map.js', 'ux/flat-map.js',
                                      'ux/indicator-visibility.js', 'ux/model.js',
                                      'ux/motion.js', 'ux/master.css', 'ux/ui-overhaul.css',
                                      'ux/startup-guard.js', 'ux/pages.js',
                                      'ux/icons.js', 'ux/approved-icons.js', 'ux/style.css')},
        'dataContractSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                              for name in ('scripts/atlas_data.py', 'scripts/preview_server.py', 'ux/acs-series.json',
                                           'ux/catalog-v2.json', 'ux/metric-definitions.json')},
    }
    if metadata['visibleFieldCount'] != 39 or len(metadata['medicalFields']) != 3:
        raise ValueError('This release must retain all 39 admitted display fields')
    (destination / 'ux/build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    manifest['/ux/build.json'] = 'ux/build.json'
    (destination / 'preview-assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(ROOT / 'deploy/temporary-preview/Dockerfile', destination / 'Dockerfile')
    print(json.dumps({'publicAssets': len(manifest), 'privateInputs': len(PRIVATE),
                      'bytes': sum(file.stat().st_size for file in destination.rglob('*') if file.is_file()),
                      'build': metadata}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    parser.add_argument('--release', default='20261015-webgl-medical38')
    arguments = parser.parse_args()
    build(arguments.destination, arguments.release)
