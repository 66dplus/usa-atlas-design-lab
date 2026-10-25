"""Server-rendered route metadata and permanent legacy URL normalization."""
from functools import lru_cache
from html import escape
import json
from pathlib import Path
import re
from urllib.parse import parse_qs, urlencode, urlsplit

SITE_ORIGIN = 'https://usa-xray.online'
SITE_NAME = 'USA X-Ray'
SITE_DESCRIPTION = 'Explore U.S. places through source-based maps, geographic comparisons and public data.'
DEFAULT_PATH = '/united-states/unemployment'
INDICATOR_ALIASES = {
    'adjusted-gross-income-agi--per-resident': 'adjusted-gross-income-agi-per-resident',
    'crime-trends--04-09-aggravated-assault-yoy': 'crime-trends-aggravated-assault-year-over-year',
    'crime-trends--04-09-burglary-yoy': 'crime-trends-burglary-year-over-year',
    'crime-trends--04-09-homicide-yoy': 'crime-trends-homicide-year-over-year',
    'crime-trends--04-09-motor-vehicle-theft-yoy': 'crime-trends-motor-vehicle-theft-year-over-year',
    'crime-trends--04-09-rape-yoy': 'crime-trends-rape-year-over-year',
    'crime-trends--04-09-robbery-yoy': 'crime-trends-robbery-year-over-year',
    'electricity-price--08-05-sector-com': 'electricity-price-commercial',
    'electricity-price--08-05-sector-ind': 'electricity-price-industrial',
    'electricity-price--08-05-sector-res': 'electricity-price-residential',
    'electricity-price--08-05-sector-tra': 'electricity-price-transportation',
    'unemployment--03-06-employment': 'unemployment-employment',
    'unemployment--03-06-labor-force': 'unemployment-labor-force',
    'unemployment--03-06-unemployment': 'unemployment-count',
    'access-to-a-grocery-store--09-02-count': 'access-to-a-grocery-store-count',
}
INDICATOR_IDS_BY_SLUG = {slug: identifier for identifier, slug in INDICATOR_ALIASES.items()}
CITY_COUNTY_SLUGS = {
    '24510': 'baltimore-city-county', '29510': 'st-louis-city-county',
    '51600': 'fairfax-city-county', '51620': 'franklin-city-county',
    '51680': 'roanoke-city-county', '51760': 'richmond-city-county',
}
OPERATIONAL_QUERY_KEYS = ('embed', 'review', 'preview')


def slugify(text):
    return re.sub(r'[^a-z0-9]+', '-', str(text).lower()).strip('-')


def _county_base(name, identifier):
    return CITY_COUNTY_SLUGS.get(identifier, slugify(name) + '-county')


@lru_cache(maxsize=4)
def geography(topology_path):
    """Read the same published state/county names and slug rules used by routes.js."""
    data = json.loads(Path(topology_path).read_text())
    states = {}
    for item in data['objects']['states']['geometries']:
        identifier = str(item.get('id', '')).zfill(2)
        name = item.get('properties', {}).get('name')
        if identifier.isdigit() and int(identifier) < 60 and name:
            states[slugify(name)] = {'id': identifier, 'name': name, 'slug': slugify(name)}
    county_rows = []
    for item in data['objects']['counties']['geometries']:
        identifier = str(item.get('id', '')).zfill(5)
        name = item.get('properties', {}).get('name')
        if len(identifier) == 5 and identifier[:2] in {state['id'] for state in states.values()} and name:
            county_rows.append({'id': identifier, 'name': name, 'stateId': identifier[:2],
                                'base': _county_base(name, identifier)})
    grouped = {}
    for row in county_rows:
        grouped.setdefault((row['stateId'], row['base']), []).append(row)
    counties_by_state, counties_by_id, unique_counties = {}, {}, {}
    for (state_id, base), rows in grouped.items():
        scope = counties_by_state.setdefault(state_id, {})
        for row in rows:
            row['slug'] = base if len(rows) == 1 else f"{base}-{row['id']}"
            row['stateSlug'] = next((slug for slug, state in states.items() if state['id'] == state_id), None)
            scope[row['slug']] = row
            counties_by_id[row['id']] = row
            unique_counties.setdefault(row['slug'], []).append(row)
    unique_counties = {slug: rows[0] for slug, rows in unique_counties.items() if len(rows) == 1}
    states_by_id = {state['id']: state for state in states.values()}
    return {'states': states, 'statesById': states_by_id, 'countiesByState': counties_by_state,
            'countiesById': counties_by_id, 'uniqueCounties': unique_counties}


@lru_cache(maxsize=4)
def metric_labels(definitions_path):
    data = json.loads(Path(definitions_path).read_text())
    labels, slugs = {}, {}
    for metric in data.get('metrics', []):
        if metric.get('id') and metric.get('label'):
            labels[metric['id']] = metric['label']
    for identifier, variants in data.get('variants', {}).items():
        for variant in variants:
            if variant.get('id') and variant.get('label'):
                labels[variant['id']] = variant['label']
    for identifier, slug in INDICATOR_ALIASES.items():
        slugs[slug] = identifier
    labels.update({
        'electricity-price--08-05-sector-com': 'Average electricity price · Commercial',
        'electricity-price--08-05-sector-ind': 'Average electricity price · Industrial',
        'electricity-price--08-05-sector-res': 'Average electricity price · Residential',
        'electricity-price--08-05-sector-tra': 'Average electricity price · Transportation',
        'unemployment--03-06-employment': 'Employment · people',
        'unemployment--03-06-labor-force': 'Labor force · people',
        'unemployment--03-06-unemployment': 'Unemployment · people',
        'access-to-a-grocery-store--09-02-count': 'Low access to a grocery store · population',
        'crime-trends--04-09-aggravated-assault-yoy': 'Crime trends · aggravated assault · year over year',
        'crime-trends--04-09-burglary-yoy': 'Crime trends · burglary · year over year',
        'crime-trends--04-09-homicide-yoy': 'Crime trends · homicide · year over year',
        'crime-trends--04-09-motor-vehicle-theft-yoy': 'Crime trends · motor vehicle theft · year over year',
        'crime-trends--04-09-rape-yoy': 'Crime trends · rape · year over year',
        'crime-trends--04-09-robbery-yoy': 'Crime trends · robbery · year over year',
    })
    return {'labels': labels, 'idsBySlug': slugs, 'slugsById': INDICATOR_ALIASES}


def _catalog_metrics(metrics, catalog):
    if not catalog or not isinstance(catalog, dict):
        return metrics
    merged = {key: dict(value) if isinstance(value, dict) else value for key, value in metrics.items()}
    merged['labels'] = dict(metrics['labels'])
    for item in catalog.get('metrics', []):
        if (item.get('availability') == 'loaded' and item.get('fieldId') and
                (item.get('stateSupported') or item.get('countySupported')) and item.get('id') and item.get('name')):
            merged['labels'][item['id']] = item['name']
    return merged


@lru_cache(maxsize=2)
def articles(journal_path):
    source = Path(journal_path).read_text()
    match = re.search(r'^export const articles=(\{.*\});\s*$', source, re.S | re.M)
    if not match:
        return {}
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        return {}


def _location(parts, geo):
    parts = list(parts or [])
    if not parts or parts == ['united-states']:
        return {'id': None, 'name': 'the United States', 'parts': []}
    if len(parts) == 1:
        state = geo['states'].get(parts[0])
        if state:
            return {'id': state['id'], 'name': state['name'], 'parts': [state['slug']]}
        county = geo['uniqueCounties'].get(parts[0])
        if county:
            return {'id': county['id'], 'name': county['name'],
                    'parts': [county['stateSlug'], county['slug']]}
        return None
    if len(parts) == 2:
        state = geo['states'].get(parts[0])
        county = geo['countiesByState'].get(state['id'], {}).get(parts[1]) if state else None
        if county:
            return {'id': county['id'], 'name': county['name'], 'parts': [state['slug'], county['slug']]}
    return None


def _metric(segment, metrics):
    if not segment:
        return None
    identifier = metrics['idsBySlug'].get(segment, segment)
    if identifier not in metrics['labels']:
        return None
    return {'id': identifier, 'slug': metrics['slugsById'].get(identifier, identifier),
            'name': metrics['labels'][identifier]}


def _pair(segment):
    bits = str(segment or '').split('-vs-')
    return bits if len(bits) == 2 and all(bits) else None


def _parse_app_route(path, geo, metrics, article_data):
    path = path.rstrip('/') or '/'
    bits = path.strip('/').split('/') if path != '/' else []
    if path in ('/stats', '/support', '/about', '/blog'):
        return {'kind': 'screen', 'page': {'/stats': 'stats', '/support': 'support', '/about': 'info', '/blog': 'blog'}[path], 'canonical': path}
    if path.startswith('/blog/') and len(bits) == 2 and bits[1] in article_data:
        return {'kind': 'article', 'slug': bits[1], 'canonical': path}
    if bits and bits[0] == 'compare':
        if len(bits) >= 6 and bits[1] == 'places':
            try:
                vs = bits.index('vs', 3)
            except ValueError:
                vs = -1
            left, right = (bits[3:vs], bits[vs + 1:]) if vs >= 0 else ([], [])
            metric = _metric(bits[2], metrics)
            a, b = _location(left, geo), _location(right, geo)
            if metric and a and b and a['id'] != b['id']:
                canonical = f"/compare/places/{metric['slug']}/{'/'.join(a['parts'] or ['united-states'])}/vs/{'/'.join(b['parts'] or ['united-states'])}"
                return {'kind': 'compare-places', 'metric': metric, 'left': a, 'right': b, 'canonical': canonical}
            return None
        if len(bits) in (3, 5, 6) and bits[1] == 'indicators':
            pair = _pair(bits[2])
            if pair:
                a, b = _metric(pair[0], metrics), _metric(pair[1], metrics)
                place = _location(bits[4:], geo) if len(bits) >= 5 and bits[3] == 'in' else ({'id': None, 'name': 'the United States', 'parts': []} if len(bits) == 3 else None)
                if a and b and a['id'] != b['id'] and place:
                    canonical = f"/compare/indicators/{a['slug']}-vs-{b['slug']}" + (f"/in/{'/'.join(place['parts'])}" if place['parts'] else '')
                    return {'kind': 'compare-metrics', 'metric': a, 'secondMetric': b, 'place': place, 'canonical': canonical}
            return None
        return None
    if not bits or bits[0] != 'united-states':
        return None
    segments = bits[1:]
    if not segments:
        loc, metric = _location([], geo), _metric('unemployment', metrics)
        return {'kind': 'map', 'place': loc, 'metric': metric, 'canonical': DEFAULT_PATH} if metric else None

    # Read the old clean place-comparison paths and redirect them to /compare/.
    last_pair = _pair(segments[-1])
    if last_pair:
        indicators = [_metric(token, metrics) for token in last_pair]
        if all(indicators) and indicators[0]['id'] != indicators[1]['id']:
            place = _location(segments[:-1], geo)
            if place:
                canonical = f"/compare/indicators/{indicators[0]['slug']}-vs-{indicators[1]['slug']}" + (f"/in/{'/'.join(place['parts'])}" if place['parts'] else '')
                return {'kind': 'compare-metrics', 'metric': indicators[0], 'secondMetric': indicators[1], 'place': place, 'canonical': canonical}

    metric = _metric(segments[-1], metrics)
    place_parts = segments[:-1] if metric else segments
    if metric:
        # Old /united-states/california-vs-texas/unemployment aliases.
        pair = _pair(place_parts[-1]) if place_parts else None
        if pair and len(place_parts) == 1:
            left, right = _location([pair[0]], geo), _location([pair[1]], geo)
            if left and right and left['id'] != right['id']:
                canonical = f"/compare/places/{metric['slug']}/{'/'.join(left['parts'] or ['united-states'])}/vs/{'/'.join(right['parts'] or ['united-states'])}"
                return {'kind': 'compare-places', 'metric': metric, 'left': left, 'right': right, 'canonical': canonical}
    else:
        metric = _metric('unemployment', metrics)
    place = _location(place_parts, geo)
    if not metric or not place:
        return None
    canonical = f"/united-states/{'/'.join(place['parts']) + '/' if place['parts'] else ''}{metric['slug']}"
    return {'kind': 'map', 'place': place, 'metric': metric, 'canonical': canonical}


def _legacy_query_route(query, geo, metrics, article_data):
    try:
        params = parse_qs(query, keep_blank_values=True, max_num_fields=32)
    except ValueError:
        return None
    one = lambda key, default=None: params.get(key, [default])[0]
    page, article = one('page'), one('article')
    if article and article in article_data:
        return f'/blog/{article}'
    page_path = {'stats': '/stats', 'support': '/support', 'info': '/about', 'about': '/about', 'blog': '/blog'}
    if page in page_path:
        return page_path[page]
    def id_to_loc(value):
        if not value or value == 'US':
            return {'id': None, 'name': 'the United States', 'parts': []}
        state = geo['statesById'].get(value)
        if state:
            return {'id': state['id'], 'name': state['name'], 'parts': [state['slug']]}
        county = geo['countiesById'].get(value)
        if county:
            return {'id': county['id'], 'name': county['name'],
                    'parts': [county['stateSlug'], county['slug']]}
        return None
    concept = one('concept')
    if page == 'compare' or concept == 'compare':
        metric = _metric(one('metric') or 'unemployment', metrics) or _metric('unemployment', metrics)
        if one('comparison') == 'metrics':
            a, b = metric, _metric(one('metric2'), metrics)
            place = id_to_loc(one('place'))
            if a and b and a['id'] != b['id'] and place:
                return f"/compare/indicators/{a['slug']}-vs-{b['slug']}" + (f"/in/{'/'.join(place['parts'])}" if place['parts'] else '')
            return None
        left = id_to_loc(one('place'))
        right = id_to_loc(one('other') or '48')
        if not one('place'):
            left = id_to_loc('06')
        if metric and left and right and left['id'] != right['id']:
            return f"/compare/places/{metric['slug']}/{'/'.join(left['parts'] or ['united-states'])}/vs/{'/'.join(right['parts'] or ['united-states'])}"
        return None
    metric = _metric(one('metric') or 'unemployment', metrics)
    place = id_to_loc(one('place'))
    if metric and place:
        return f"/united-states/{'/'.join(place['parts']) + '/' if place['parts'] else ''}{metric['slug']}"
    if not one('metric') and not one('place'):
        return DEFAULT_PATH
    return None


def redirect_target(request_target, geo, metrics, article_data, catalog=None):
    """Return a 301 destination for old app URLs and noncanonical route spellings."""
    metrics = _catalog_metrics(metrics, catalog)
    split = urlsplit(request_target)
    path = split.path or '/'
    if path in ('/', '/ux', '/ux/', '/ux/index.html'):
        target_path = _legacy_query_route(split.query, geo, metrics, article_data) if split.query else DEFAULT_PATH
        if target_path:
            try:
                old_params = parse_qs(split.query, keep_blank_values=True, max_num_fields=32)
            except ValueError:
                old_params = {}
            retained = {key: old_params[key][0] for key in OPERATIONAL_QUERY_KEYS
                        if old_params.get(key) and old_params[key][0]}
            query = urlencode(retained)
            if query:
                target_path += '?' + query
            return target_path
        return None
    if path.startswith('/ux/'):
        return None
    route = _parse_app_route(path.lower(), geo, metrics, article_data)
    if not route:
        return None
    retained = {}
    try:
        params = parse_qs(split.query, keep_blank_values=True, max_num_fields=32)
    except ValueError:
        params = {}
    for key in OPERATIONAL_QUERY_KEYS:
        value = params.get(key, [None])[0]
        if value:
            retained[key] = value
    query = urlencode(retained)
    target = route['canonical'] + (f'?{query}' if query else '')
    if target != request_target:
        return target
    return None


def _map_metadata(route):
    metric = route['metric']['name']
    if route['kind'] == 'compare-metrics':
        place = route['place']['name']
        second = route['secondMetric']['name']
        scoped = bool(route['place']['parts'])
        return (f"{metric} vs {second}{f' in {place}' if scoped else ''} | {SITE_NAME}",
                f"Compare {metric} and {second}{f' in {place}' if scoped else ' across the United States'} using the atlas’s source, period and geography details.")
    if route['kind'] == 'compare-places':
        left, right = route['left']['name'], route['right']['name']
        return (f"{metric}: {left} vs {right} | {SITE_NAME}",
                f"Compare {metric} for {left} and {right}. Explore published observations with their source, reference period and geographic coverage.")
    place = route['place']['name']
    return (f"{metric} in {place} | {SITE_NAME}",
            f"Explore {metric} in {place} with source-based observations, reference periods and geographic coverage on the USA X-Ray map.")


def metadata_for(path, query, route, article_data):
    noindex = any(key in parse_qs(query, keep_blank_values=True) for key in ('review', 'preview')) or parse_qs(query, keep_blank_values=True).get('embed') == ['1']
    if route['kind'] in ('map', 'compare-metrics', 'compare-places'):
        title, description = _map_metadata(route)
        canonical = SITE_ORIGIN + route['canonical']
        schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title,
                  'description': description, 'url': canonical,
                  'isPartOf': {'@type': 'WebSite', 'name': SITE_NAME, 'url': SITE_ORIGIN}}
        return _metadata(title, description, canonical, noindex, schema)
    if route['kind'] == 'screen':
        pages = {
            'stats': ('Atlas statistics | USA X-Ray', 'Explore how visitors use USA X-Ray. Visitor analytics are not connected yet.'),
            'support': ('Support USA X-Ray | USA X-Ray', 'Learn how to support the maps, data and stories behind USA X-Ray. Contributions are not open yet.'),
            'info': ('About USA X-Ray | USA X-Ray', 'Learn how USA X-Ray maps public data to places, preserves source units and periods, and handles gaps.'),
            'blog': ('USA X-Ray journal | USA X-Ray', 'Explore stories about public data, places and the sources behind the map.'),
        }
        title, description = pages[route['page']]
        canonical = SITE_ORIGIN + route['canonical']
        if route['page'] == 'blog':
            schema = {'@context': 'https://schema.org', '@type': 'Blog', 'name': SITE_NAME + ' journal',
                      'description': description, 'url': canonical,
                      'publisher': {'@type': 'Organization', 'name': SITE_NAME, 'url': SITE_ORIGIN}}
        else:
            schema = {'@context': 'https://schema.org', '@type': 'WebPage', 'name': title,
                      'description': description, 'url': canonical,
                      'isPartOf': {'@type': 'WebSite', 'name': SITE_NAME, 'url': SITE_ORIGIN}}
        page_noindex = noindex or route['page'] == 'stats' or (
            route['page'] == 'blog' and not any(
                not re.search(r'owner review pending', item.get('meta', ''), re.I)
                for item in article_data.values()))
        return _metadata(title, description, canonical, page_noindex, schema,
                         'article' if route['page'] == 'article' else 'website')
    article = article_data.get(route.get('slug'), {})
    title = f"{article.get('title', 'Article')} | {SITE_NAME}"
    description = article.get('description') or 'A USA X-Ray journal article.'
    draft = bool(re.search(r'owner review pending', article.get('meta', ''), re.I))
    canonical = SITE_ORIGIN + route['canonical']
    schema = {'@context': 'https://schema.org', '@type': 'Article', 'headline': title,
              'description': description, 'mainEntityOfPage': canonical,
              'publisher': {'@type': 'Organization', 'name': SITE_NAME, 'url': SITE_ORIGIN}}
    return _metadata(title, description, canonical, noindex or draft, schema, 'article')


def _metadata(title, description, canonical, noindex, schema, page_type='website'):
    return {'title': title, 'description': description, 'canonical': canonical,
            'robots': 'noindex,follow' if noindex else 'index,follow',
            'ogType': page_type, 'schema': schema}


def _set_meta(document, attribute, name, value):
    escaped_value = escape(str(value), quote=True)
    escaped_name = escape(str(name), quote=True)
    pattern = re.compile(r'<meta\b(?=[^>]*\b' + re.escape(attribute) + r'=["\']' + re.escape(name) + r'["\'])[^>]*>', re.I)
    tag = f'<meta {attribute}="{escaped_name}" content="{escaped_value}">'
    if pattern.search(document):
        return pattern.sub(tag, document, count=1)
    return document.replace('</head>', '  ' + tag + '\n</head>', 1)


def render_html(document, metadata):
    if isinstance(document, bytes):
        document = document.decode('utf-8')
    document = re.sub(r'<title\b[^>]*>.*?</title>', '<title>' + escape(metadata['title']) + '</title>', document, count=1, flags=re.I | re.S)
    names = {'description': metadata['description'], 'robots': metadata['robots'],
             'twitter:card': 'summary', 'twitter:title': metadata['title'], 'twitter:description': metadata['description']}
    properties = {'og:type': metadata['ogType'], 'og:title': metadata['title'],
                  'og:description': metadata['description'], 'og:url': metadata['canonical'],
                  'og:site_name': SITE_NAME, 'og:locale': 'en_US'}
    for key, value in names.items():
        document = _set_meta(document, 'name', key, value)
    for key, value in properties.items():
        document = _set_meta(document, 'property', key, value)
    document = re.sub(r'<link\b(?=[^>]*\brel=["\']canonical["\'])[^>]*>\s*', '', document, flags=re.I)
    canonical = '<link rel="canonical" href="' + escape(metadata['canonical'], quote=True) + '">\n'
    document = document.replace('</head>', '  ' + canonical + '</head>', 1)
    schema = json.dumps(metadata['schema'], ensure_ascii=False, separators=(',', ':')).replace('<', r'\u003c')
    script = '<script id="atlas-jsonld" type="application/ld+json">' + schema + '</script>'
    pattern = re.compile(r'<script\b(?=[^>]*\bid=["\']atlas-jsonld["\'])[^>]*>.*?</script>', re.I | re.S)
    if pattern.search(document):
        document = pattern.sub(script, document, count=1)
    else:
        document = document.replace('</head>', '  ' + script + '\n</head>', 1)
    return document.encode('utf-8') if isinstance(document, str) else document


def render_route(document, request_target, topology_path, definitions_path, journal_path, catalog=None):
    split = urlsplit(request_target)
    geo, metrics, article_data = geography(str(topology_path)), metric_labels(str(definitions_path)), articles(str(journal_path))
    metrics = _catalog_metrics(metrics, catalog)
    route = _parse_app_route(split.path, geo, metrics, article_data)
    if not route:
        canonical = SITE_ORIGIN + (split.path or '/')
        return 404, render_html(document, _metadata('Page not found | USA X-Ray', SITE_DESCRIPTION,
            canonical, True, {'@context': 'https://schema.org', '@type': 'WebPage',
            'name': 'Page not found | USA X-Ray', 'url': canonical,
            'isPartOf': {'@type': 'WebSite', 'name': SITE_NAME, 'url': SITE_ORIGIN}}))
    return 200, render_html(document, metadata_for(split.path, split.query, route, article_data))
