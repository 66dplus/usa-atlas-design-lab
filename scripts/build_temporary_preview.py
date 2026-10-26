#!/usr/bin/env python3
"""Package the named read-only runtime assets, including the flat WebGL module."""
import argparse
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

try:
    from .runtime_conformance import CAPABILITIES
except ImportError:
    from runtime_conformance import CAPABILITIES

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = '''robots.txt sitemap.xml ux/index.html ux/advertise.html ux/ui-tokens.css ux/mobile-layout.css ux/studio.css ux/style.css ux/master.css ux/ui-overhaul.css ux/startup-guard.js ux/support-about.css ux/view-settings.json ux/startup/unemployment-BLS-LAUS-2024-2024-M12.json ux/county-boundary-repair.json ux/cities.json ux/assets/fonts.css ux/assets/geist-400.ttf ux/assets/geist-500.ttf ux/assets/geist-600.ttf ux/assets/geist-700.ttf ux/assets/san-francisco-photo.jpg ux/assets/creator-portrait.jpg node_modules/d3/dist/d3.min.js node_modules/topojson-client/dist/topojson-client.min.js node_modules/us-atlas/counties-10m.json node_modules/world-atlas/countries-110m.json'''.split()
PRIVATE = 'ux/journal.js scripts/atlas_data.py scripts/preview_server.py scripts/bug_reports.py scripts/seo_render.py ux/catalog.json ux/catalog-v2.json ux/catalog-proposals.json ux/acs-series.json ux/metric-definitions.json ux/selection-registry.json contracts/reader-contract.lock.json contracts/reader/v1/contract.json contracts/reader/v1/schema.sql contracts/reader/v1/fixtures/reader-fixture.sql contracts/reader/v1/fixtures/reader-query.sql'.split()
STATES = '01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split()
ICONS = 'search back saved check compare house shuffle close plus minus chevron-down location forward share indicators explorer'.split()
SOURCE_NAMES = '''robots.txt sitemap.xml ux/index.html ux/app.js ux/studio.js ux/ui-tokens.css ux/mobile-layout.css ux/master.css ux/ui-overhaul.css ux/startup-guard.js ux/support-about.css scripts/preview_server.py scripts/bug_reports.py ux/style.css'''.split()


class EntryAssets(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script' and attrs.get('src'):
            self.references.append(attrs['src'])
        if tag == 'link' and attrs.get('rel') == 'stylesheet' and attrs.get('href'):
            self.references.append(attrs['href'])


def validate_entry_assets(destination, manifest):
    """Fail packaging when an entry's stylesheet/script/font is not publicly mapped."""
    for relative in sorted(set(manifest.values())):
        references = []
        if relative.endswith('.html'):
            parser = EntryAssets()
            parser.feed((destination / relative).read_text())
            references = parser.references
        elif relative.endswith('.css'):
            references = re.findall(r'url\(([^)]+)\)', (destination / relative).read_text())
        for reference in references:
            reference = reference.strip().strip("\"'")
            if reference.startswith('data:'):
                continue
            resolved = urlsplit(urljoin('https://package.invalid/' + relative, reference))
            if resolved.netloc != 'package.invalid' or resolved.path not in manifest:
                raise ValueError(f'Unmapped entry asset in {relative}: {reference}')


def selected_reader_artifacts(lock_relative):
    lock_path = (ROOT / lock_relative).resolve()
    if not lock_path.is_relative_to(ROOT.resolve()) or not lock_path.is_file():
        raise ValueError('Selected reader contract lock must be an existing repository file')
    lock = json.loads(lock_path.read_bytes())
    artifact_root = (ROOT / lock.get('localArtifactPath', '')).resolve()
    if not artifact_root.is_relative_to(ROOT.resolve()):
        raise ValueError('Reader artifact path escapes the application repository')
    artifact_hashes = lock.get('artifacts')
    if not isinstance(artifact_hashes, dict) or not artifact_hashes:
        # The immutable v1 lock stores its three pinned files in named fields.
        artifact_hashes = {
            'contract.json': lock.get('contractSha256'),
            'schema.sql': lock.get('bootstrapSha256'),
            'fixtures/reader-fixture.sql': lock.get('fixtureSha256'),
        }
    paths = []
    for relative, expected in artifact_hashes.items():
        artifact = (artifact_root / relative).resolve()
        if (not artifact.is_relative_to(artifact_root) or not artifact.is_file() or
                not re.fullmatch(r'[0-9a-f]{64}', str(expected)) or
                hashlib.sha256(artifact.read_bytes()).hexdigest() != expected):
            raise ValueError(f'Reader artifact is missing or differs from selected lock: {relative}')
        paths.append(artifact.relative_to(ROOT.resolve()).as_posix())
    contract = json.loads((artifact_root / 'contract.json').read_bytes())
    if (hashlib.sha256((artifact_root / 'contract.json').read_bytes()).hexdigest() != lock.get('contractSha256') or
            contract.get('schema_fingerprint') != lock.get('schemaFingerprint') or
            contract.get('version') != lock.get('contractVersion')):
        raise ValueError('Reader contract identity does not match selected lock')
    return lock_path.relative_to(ROOT.resolve()).as_posix(), lock, paths


def build(destination, release, source_commit=None, previous_release=None,
          previous_build_sha256=None, emit=True, reader_lock_path='contracts/reader-contract.lock.json'):
    if destination.exists():
        raise ValueError('Use a fresh temporary build directory')
    if not re.fullmatch(r'[a-zA-Z0-9._-]{1,80}', release):
        raise ValueError('Invalid release identifier')
    head = subprocess.check_output(
        ['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    if source_commit is not None and source_commit != head:
        raise ValueError('source commit must equal the checkout HEAD')
    if not re.fullmatch(r'[0-9a-f]{40}', head):
        raise ValueError('Could not resolve a full source commit')
    if not previous_release or not re.fullmatch(r'[a-zA-Z0-9._-]{1,80}', previous_release):
        raise ValueError('previous release identity is required')
    if not re.fullmatch(r'[0-9a-f]{64}', str(previous_build_sha256 or '')):
        raise ValueError('previous raw build.json SHA256 is required')
    dirty = subprocess.check_output(
        ['git', '-C', str(ROOT), 'status', '--porcelain', '--untracked-files=all'], text=True)
    if dirty:
        raise ValueError('Packaging requires a clean committed checkout')
    destination.mkdir(parents=True)
    frontend = subprocess.run(['node', str(ROOT / 'scripts/build-frontend.mjs'), str(destination / 'ux'), '--inputs'], cwd=ROOT, capture_output=True, text=True)
    if frontend.returncode:
        raise ValueError('Frontend compilation failed: ' + frontend.stderr)
    frontend_inputs = json.loads(frontend.stdout)['inputs']
    compiled = ['ux/app.js', 'ux/studio.js']
    public = PUBLIC + compiled
    public += [f'ux/assets/articles/{name}.jpg' for name in
               ('ms-initial', 'ms-mobile', 'electricity-initial', 'electricity-mobile')]
    public += [f'ux/boundaries/{state}.json' for state in STATES]
    public += [f'ux/assets/brand-icons/{icon}.png' for icon in ICONS]
    selected_lock_path, selected_lock, selected_artifacts = selected_reader_artifacts(reader_lock_path)
    private = list(dict.fromkeys(PRIVATE + [selected_lock_path] + selected_artifacts))
    manifest = {}
    shipped = list(dict.fromkeys(public + private))
    for relative in shipped:
        source, target = ROOT / relative, destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if relative not in compiled:
            shutil.copyfile(source, target)
        if relative in public:
            manifest['/' + relative] = relative
    index = destination / 'ux/index.html'
    text = index.read_text()
    if 'data-runtime="preview"' not in text:
        text = text.replace('<body ', '<body data-runtime="preview" ', 1)
    index.write_text(text.replace('  <link rel="stylesheet" href="feedback.css">\n', ''))
    # The production define removes local review imports during compilation.
    if b'feedback.js' in (destination / 'ux/app.js').read_bytes():
        raise ValueError('Local review code must not enter the compiled public frontend')
    manifest['/ux/'] = 'ux/index.html'
    validate_entry_assets(destination, manifest)
    flags = dict(re.findall(r"'([0-9.]+)': (true|false)",
                            (ROOT / 'ux/indicator-visibility.js').read_text()))
    selection_registry = json.loads(subprocess.check_output(
        ['node', str(ROOT / 'scripts/selection_registry.mjs')], cwd=ROOT, text=True))
    if json.loads((ROOT / 'ux/selection-registry.json').read_text()) != selection_registry:
        raise ValueError('The packaged API selection registry is stale relative to the shared UI registry')
    metadata = {
        'release': release,
        'previousRelease': previous_release,
        'previousBuildSha256': previous_build_sha256,
        'builtAt': datetime.fromisoformat(subprocess.check_output(
            ['git', '-C', str(ROOT), 'show', '-s', '--format=%cI', head], text=True).strip()
        ).astimezone(timezone.utc).isoformat(),
        'sourceBaseCommit': head,
        'sourceCommit': head,
        'renderer2dDefault': 'webgl',
        'frontendFramework': 'react-typescript',
        'conformanceCapabilities': CAPABILITIES,
        'visibleFieldCount': selection_registry['selectionCounts']['primary'],
        'additionalVariantCount': selection_registry['selectionCounts']['variants'],
        'selectableSelectionCount': selection_registry['selectionCounts']['total'],
        'retainedSourceFieldCount': sum(value == 'true' for value in flags.values()),
        'selectableSelectionCounts': selection_registry['selectionCounts'],
        'selectableMetricIds': selection_registry['selectableIds'],
        'selectionSourceFieldCount': selection_registry['sourceFields'],
        'medicalFields': [key for key in ('11.01', '11.02', '11.03')
                          if flags.get(key) == 'true'],
        'sourceSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                         for name in SOURCE_NAMES},
        'assetSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                        for name in sorted(set(manifest.values()))},
        'shippedSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                          for name in sorted(shipped)},
        'dataContractSha256': {name: hashlib.sha256((destination / name).read_bytes()).hexdigest()
                              for name in ('scripts/atlas_data.py', 'scripts/preview_server.py', 'scripts/bug_reports.py', 'scripts/seo_render.py',
                                           'ux/acs-series.json', 'ux/catalog-v2.json', 'ux/metric-definitions.json',
                                           'ux/selection-registry.json',
                                           'contracts/reader-contract.lock.json', 'contracts/reader/v1/contract.json',
                                           'contracts/reader/v1/schema.sql', 'contracts/reader/v1/fixtures/reader-fixture.sql',
                                           'contracts/reader/v1/fixtures/reader-query.sql') +
                              tuple([selected_lock_path] + selected_artifacts
                                    if selected_lock_path != 'contracts/reader-contract.lock.json' else ())},
    }
    reader_lock = json.loads((destination / selected_lock_path).read_text())
    metadata['dataReaderLock'] = {
        'path': selected_lock_path,
        'sha256': hashlib.sha256((destination / selected_lock_path).read_bytes()).hexdigest(),
        'producerRepository': reader_lock['producerRepository'],
        'sourceCommit': reader_lock['sourceCommit'],
        'contractVersion': reader_lock['contractVersion'],
        'schemaFingerprint': reader_lock['schemaFingerprint'],
    }
    metadata['readerLockSha256'] = metadata['dataReaderLock']['sha256']
    metadata['readerSchemaFingerprint'] = reader_lock['schemaFingerprint']
    metadata['readerContractVersion'] = reader_lock['contractVersion']
    if (metadata['retainedSourceFieldCount'] != metadata['selectionSourceFieldCount'] or
            metadata['selectableSelectionCounts'] != {'primary': 41, 'variants': 4, 'total': 45} or
            metadata['visibleFieldCount'] != 41 or metadata['additionalVariantCount'] != 4 or
            metadata['selectableSelectionCount'] != 45 or
            len(metadata['medicalFields']) != 3):
        raise ValueError('The source-field and selectable-entry registries do not match the reviewed selection contract')
    (destination / 'ux/build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    manifest['/ux/build.json'] = 'ux/build.json'
    (destination / 'preview-assets.json').write_text(json.dumps(manifest, indent=2) + '\n')
    shutil.copyfile(ROOT / 'deploy/temporary-preview/Dockerfile', destination / 'Dockerfile')
    metadata['toolchainSha256'] = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in ('package-lock.json', 'deploy/temporary-preview/Dockerfile', 'scripts/runtime_conformance.py')
    }
    metadata['shippedSha256']['Dockerfile'] = hashlib.sha256(
        (destination / 'Dockerfile').read_bytes()).hexdigest()
    metadata['frontendSourceSha256'] = {
        name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
        for name in frontend_inputs
    }
    metadata['toolchainSha256']['frontendBuildSha256'] = hashlib.sha256(
        (ROOT / 'scripts/build-frontend.mjs').read_bytes()).hexdigest()
    metadata['toolchainSha256']['previewTransformSha256'] = hashlib.sha256(
        Path(__file__).read_bytes()).hexdigest()
    (destination / 'ux/build.json').write_text(json.dumps(metadata, indent=2) + '\n')
    result = {'publicAssets': len(manifest), 'privateInputs': len(private),
              'bytes': sum(file.stat().st_size for file in destination.rglob('*') if file.is_file()),
              'build': metadata}
    if emit:
        print(json.dumps(result))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('destination', type=Path)
    parser.add_argument('--release', default='20261015-webgl-medical38')
    parser.add_argument('--source-commit')
    parser.add_argument('--previous-release', required=True)
    parser.add_argument('--previous-build-sha256', required=True)
    parser.add_argument('--contracts-lock', type=Path, default=Path('contracts/reader-contract.lock.json'))
    arguments = parser.parse_args()
    build(arguments.destination, arguments.release, arguments.source_commit,
          arguments.previous_release, arguments.previous_build_sha256,
          reader_lock_path=str(arguments.contracts_lock))
