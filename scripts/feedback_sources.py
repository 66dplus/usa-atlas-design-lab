"""Authored component ownership. Client keys never become filesystem paths."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'view-settings': ('ux/settings.js', 'export function initViewSettings(', 'initViewSettings'),
    'focus-controls': ('ux/map.js', '  exitFocus()', 'ExplorerMap.exitFocus'),
    'shell': ('ux/index.html', '<header class="app-header">', 'App shell'),
    'concept-tabs': ('ux/app.js', 'function changeConcept(', 'changeConcept'),
    'metric-select': ('ux/app.js', 'function showMetricLibrary(', 'showMetricLibrary'),
    'view-controls': ('ux/app.js', 'if(button.dataset.mode)', 'Map dimension handler'),
    'share': ('ux/app.js', 'async function copyLink(', 'copyLink'),
    'breadcrumbs': ('ux/app.js', 'function renderBreadcrumbs(', 'renderBreadcrumbs'),
    'place-search': ('ux/app.js', 'function showPlaceLibrary(', 'showPlaceLibrary'),
    'region-jumps': ('ux/app.js', 'if(button.dataset.jump)', 'Region jump handler'),
    'inspector': ('ux/app.js', 'function renderInspector(', 'renderInspector'),
    'comparison': ('ux/app.js', 'function renderCompare(', 'renderCompare'),
    'stories': ('ux/app.js', "$('#story-list').innerHTML=", 'Story rail in render'),
    'metric-library': ('ux/app.js', 'function renderMetrics(', 'renderMetrics'),
    'place-library': ('ux/app.js', 'function renderPlaces(', 'renderPlaces'),
    'camera-controls': ('ux/app.js', 'function cameraTools(', 'cameraTools'),
    'place-profile': ('ux/app.js', 'function renderExplorer(', 'renderExplorer'),
    'quick-stats': ('ux/app.js', 'function renderQuickStats(', 'renderQuickStats'),
    'rankings': ('ux/app.js', 'function rankingMarkup(', 'rankingMarkup'),
    'saved': ('ux/app.js', 'function showSaved(', 'showSaved'),
    'surprise': ('ux/app.js', 'function showSurprise(', 'showSurprise'),
    'legend': ('ux/index.html', '<div class="map-footer">', 'Map legend and provenance'),
    'map-2d': ('ux/map.js', 'this.countyPaths=this.countyLayer', 'ExplorerMap SVG county paths'),
    'map-webgl-2d': ('ux/flat-map.js', 'export class FlatMapRenderer', 'FlatMapRenderer orthographic county surfaces'),
    'map-3d': ('ux/map.js', '  buildTerrain(', 'ExplorerMap.buildTerrain'),
    'map-globe': ('ux/app.js', "if(!['2d','3d'].includes(state.mode))", 'Legacy Globe link → terrain'),
}


def resolve_sources(key, style_selector):
    if key not in SOURCES:
        raise ValueError('Unknown component key')
    filename, needle, symbol = SOURCES[key]
    source = (ROOT / filename).read_bytes()
    lines = source.decode('utf-8').splitlines()
    matches = [i + 1 for i, line in enumerate(lines) if needle in line]
    if len(matches) != 1:
        raise ValueError('Source anchor needs updating: ' + key)
    refs = [{'file': 'usa-atlas-design-lab/' + filename, 'line': matches[0],
             'symbol': symbol, 'sha256': hashlib.sha256(source).hexdigest()}]
    css = ROOT / 'ux/style.css'
    # A selector helps locate a rule in this existing compact stylesheet; it is not a path.
    if style_selector and style_selector in css.read_text():
        text = css.read_text()
        refs.append({'file': 'usa-atlas-design-lab/ux/style.css',
                     'line': text[:text.index(style_selector)].count('\n') + 1,
                     'symbol': style_selector, 'sha256': hashlib.sha256(css.read_bytes()).hexdigest()})
    return refs
