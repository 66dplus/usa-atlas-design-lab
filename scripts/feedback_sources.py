"""Authored component ownership. Client keys never become filesystem paths."""
from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    'about': ('ux/react/support-about.tsx', 'export function AboutPage(', 'AboutPage'),
    'support': ('ux/react/support-about.tsx', 'export function SupportPage(', 'SupportPage'),
    'reading-pages': ('ux/react/reading.tsx', 'export function ReadingPages(', 'ReadingPages'),
    'app-dialog': ('ux/react/dialogs.tsx', 'export function Dialog(', 'Dialog'),
    'source-popup': ('ux/react/reading.tsx', 'export function SourceDialog(', 'SourceDialog'),
    'view-settings': ('ux/settings.js', 'export async function loadViewSettings(', 'loadViewSettings'),
    'focus-controls': ('ux/map.js', '  exitFocus()', 'ExplorerMap.exitFocus'),
    'shell': ('ux/react/main.tsx', 'function Header(', 'Header'),
    'concept-tabs': ('ux/react/use-atlas.ts', 'async function navigate(', 'useAtlas.navigate'),
    'metric-select': ('ux/react/use-atlas.ts', 'function showMetricLibrary(', 'useAtlas.showMetricLibrary'),
    'view-controls': ('ux/react/main.tsx', 'function onClick(', 'App.onClick'),
    'breadcrumbs': ('ux/react/maps.tsx', 'function Breadcrumbs(', 'Breadcrumbs'),
    'place-search': ('ux/react/use-atlas.ts', 'function showPlaceLibrary(', 'useAtlas.showPlaceLibrary'),
    'region-jumps': ('ux/react/main.tsx', 'function onClick(', 'App.onClick'),
    'inspector': ('ux/react/data-views.tsx', 'export function InspectorContent(', 'InspectorContent'),
    'comparison': ('ux/react/data-views.tsx', 'export function CompareContent(', 'CompareContent'),
    'stories': ('ux/react/drawers.tsx', 'export function Drawers(', 'Drawers'),
    'metric-library': ('ux/react/data-views.tsx', 'export function MetricItems(', 'MetricItems'),
    'place-library': ('ux/react/drawers.tsx', 'function PlaceItems(', 'PlaceItems'),
    'camera-controls': ('ux/map.js', '  zoom(factor)', 'ExplorerMap.zoom'),
    'place-profile': ('ux/react/explorer.tsx', 'export function ExplorerPanel(', 'ExplorerPanel'),
    'quick-stats': ('ux/react/data-views.tsx', 'export function QuickStatsContent(', 'QuickStatsContent'),
    'rankings': ('ux/react/data-views.tsx', 'export function RankList(', 'RankList'),
    'saved': ('ux/react/saved.tsx', 'export function SavedContent(', 'SavedContent'),
    'legend': ('ux/react/explorer.tsx', 'export function Legend(', 'Legend'),
    'map-2d': ('ux/flat-map.js', 'export class FlatMapRenderer', 'FlatMapRenderer orthographic county surfaces'),
    'map-webgl-2d': ('ux/flat-map.js', 'export class FlatMapRenderer', 'FlatMapRenderer orthographic county surfaces'),
    'map-3d': ('ux/map.js', '  buildTerrain(', 'ExplorerMap.buildTerrain'),
    'map-globe': ('ux/react/use-atlas.ts', 'export function initialState(', 'initialState legacy mode normalization'),
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
