"""Compile the owner-approved Interface Thin and Lucide thematic exports."""
import argparse
import hashlib
import json
from pathlib import Path
import re
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
INTERFACE = 'search location map explorer cube compare indicators sources saved share external shuffle back forward chevron-up chevron-down close plus minus check uptrend downtrend fit rotate menu house'.split()


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from strings(child)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--design-root', type=Path, required=True)
    args = parser.parse_args()
    design = args.design_root.resolve()
    native = design / 'paper-nav-advertising-20261009/fixed-nav-revision/master-final-native.json'
    native_text = re.sub(r'\s+', '', '\n'.join(strings(json.loads(native.read_text()))))
    mapping_file = design / 'paper-master-20261008/indicator-icons.json'
    mappings = json.loads(mapping_file.read_text())
    thematic_names = sorted({row['icon'].split(':')[1] for row in mappings['metrics']} |
                            {value.split(':')[1] for value in mappings['additionalVisibleLabels'].values()})
    records = []

    def read_icon(path, kind, name):
        text = path.read_text().strip()
        root = ElementTree.fromstring(text)
        for node in root.iter():
            if node.tag.rsplit('}', 1)[-1] not in {'svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g'}:
                raise ValueError('Unexpected SVG element: ' + str(path))
            if any(key.lower().startswith('on') or 'href' in key for key in node.attrib):
                raise ValueError('Unexpected active SVG attribute')
        body = text[text.index('>') + 1:text.rindex('</svg>')].strip().replace('#F4F1E8', 'currentColor')
        paths = [node.attrib['d'] for node in root.iter() if 'd' in node.attrib]
        records.append({'kind': kind, 'name': name, 'source': str(path.relative_to(design)),
                        'sha256': digest(path), 'viewBox': root.attrib['viewBox'],
                        'pathCount': len(paths),
                        'pathsPresentInFinalNative': sum(re.sub(r'\s+', '', value) in native_text for value in paths)})
        return {'viewBox': root.attrib['viewBox'], 'body': body}

    overrides = {'location': design / 'paper-master-20261008/assets/icons/map-pin.svg',
                 'house': design / 'paper-master-20261008/assets/icons/house.svg'}
    interface = {name: read_icon(overrides.get(name, design / 'brand-o2-thin-20261008/svg' / (name + '.svg')), 'interface', name)
                 for name in INTERFACE}
    thematic = {name: read_icon(design / 'paper-master-20261008/assets/icons' / (name + '.svg'), 'thematic', name)
                for name in thematic_names}
    ids = {row['id']: row['icon'].split(':')[1] for row in mappings['metrics']}
    labels = {key: value.split(':')[1] for key, value in mappings['additionalVisibleLabels'].items()}
    license_text = (design / 'paper-master-20261008/assets/icons/LICENSE').read_text()
    output = '/* Owner-approved O2 Interface Thin and Lucide thematic source exports.\n' + license_text + '\n*/\n'
    for name, value in [('interfaceIcons', interface), ('thematicIcons', thematic),
                        ('indicatorIcons', ids), ('additionalIndicatorIcons', labels)]:
        output += 'export const ' + name + '=' + json.dumps(value, ensure_ascii=False, separators=(',', ':')) + ';\n'
    (ROOT / 'ux/approved-icons.js').write_text(output)
    record = {'source': 'Final Desktop/Mobile masters, 9 October 2026; accepted Interface Thin and Lucide thematic mapping',
              'nativeSourceSha256': digest(native), 'mappingSha256': digest(mapping_file),
              'interfaceCount': len(interface), 'thematicCount': len(thematic), 'catalogMappings': len(ids),
              'moduleBytes': len(output.encode()), 'icons': records}
    (ROOT / 'docs/approved-icon-mapping.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({key: value for key, value in record.items() if key != 'icons'}, indent=2))
    print(json.dumps({'interfaceNativePathMatches': {row['name']: [row['pathsPresentInFinalNative'], row['pathCount']]
                     for row in records if row['kind'] == 'interface'}}, indent=2))


if __name__ == '__main__':
    main()
