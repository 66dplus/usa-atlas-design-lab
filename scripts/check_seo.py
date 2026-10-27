#!/usr/bin/env python3
"""Check route metadata, redirect policy, sitemap and the packaged SEO renderer."""
import html
import http.client
import json
from pathlib import Path
import re
import sys
import threading
import xml.etree.ElementTree as ET
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from seo_render import (INDICATOR_ALIASES, articles, geography, metric_labels,
                        redirect_target, render_route)
from preview_server import PreviewServer

TOPOLOGY = ROOT / 'node_modules/us-atlas/counties-10m.json'
DEFINITIONS = ROOT / 'ux/metric-definitions.json'
JOURNAL = ROOT / 'ux/journal.js'
INDEX = ROOT / 'ux/index.html'
GEO = geography(str(TOPOLOGY))
METRICS = metric_labels(str(DEFINITIONS))
ARTICLES = articles(str(JOURNAL))


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def meta(body, attribute, name):
    pattern = re.compile(r'<meta\b(?=[^>]*\b' + attribute + r'=["\']' + re.escape(name) + r'["\'])[^>]*\bcontent=["\']([^"\']*)["\']', re.I)
    found = pattern.search(body.decode())
    return html.unescape(found.group(1)) if found else None


def html_for(url):
    return render_route(INDEX.read_bytes(), url, TOPOLOGY, DEFINITIONS, JOURNAL)


def http_response(server, path):
    connection = http.client.HTTPConnection('127.0.0.1', server.server_port, timeout=5)
    connection.request('GET', path, headers={'Host': f'127.0.0.1:{server.server_port}'})
    response = connection.getresponse()
    result = response.status, dict(response.getheaders()), response.read()
    connection.close()
    return result


def check_route_metadata(path, expected_title, expected_description, canonical_path=None,
                         robots='index,follow'):
    status, body = html_for(path)
    canonical = f'https://usa-xray.online{canonical_path or path.split("?", 1)[0]}'
    check(status == 200, f'{path} should return a successful route response')
    check(f'<title>{expected_title}</title>'.encode() in body,
          f'{path} should have its route-specific title in initial HTML')
    check(f'<link rel="canonical" href="{canonical}">'.encode() in body,
          f'{path} should have canonical {canonical}')
    check(meta(body, 'property', 'og:url') == canonical, f'{path} Open Graph URL should match its canonical')
    check(meta(body, 'name', 'description') == expected_description,
          f'{path} should have its route-specific description before JavaScript')
    check(meta(body, 'name', 'robots') == robots, f'{path} should have robots policy {robots}')
    check(body.count(b'rel="canonical"') == 1 and body.count(b'id="atlas-jsonld"') == 1,
          f'{path} should contain one canonical and one JSON-LD block')
    jsonld = re.search(rb'<script id="atlas-jsonld" type="application/ld\+json">(.*?)</script>', body, re.S)
    schema = json.loads(jsonld.group(1)) if jsonld else None
    check(schema is not None and schema.get('@type') == 'WebPage' and schema.get('url') == canonical,
          f'{path} should contain valid WebPage JSON-LD for its canonical')


def check_preview_http_dispatch():
    assets = {
        '/node_modules/us-atlas/counties-10m.json': TOPOLOGY,
        '/ux/index.html': INDEX,
        '/robots.txt': ROOT / 'robots.txt',
    }
    server = PreviewServer(('127.0.0.1', 0), assets)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        for source, destination in [
            ('/united-states/california-vs-texas/unemployment/',
             '/compare/places/unemployment/california/vs/texas'),
            ('/united-states/unemployment/', '/united-states/unemployment'),
            ('/UNIted-states/California/Unemployment/?embed=1',
             '/united-states/california/unemployment?embed=1'),
        ]:
            status, headers, _ = http_response(server, source)
            check(status == 301 and headers.get('Location') == destination,
                  f'HTTP {source} should redirect to {destination}; got {status} {headers.get("Location")}')

        # Operational selections survive path normalization and a full HTTP
        # follow. The final document still describes only the clean base route.
        def check_operational_redirect(source, destination):
            status, headers, _ = http_response(server, source)
            check(status == 301 and headers.get('Location') == destination,
                  f'HTTP {source} should retain operational state at {destination}; got {status} {headers.get("Location")}')
            final_status, final_headers, body = http_response(server, destination)
            check(final_status == 200 and 'Location' not in final_headers,
                  f'HTTP follow of {source} should reach a stable rendered route')
            base_path = destination.split('?', 1)[0]
            canonical = f'https://usa-xray.online{base_path}'
            jsonld = re.search(rb'<script id="atlas-jsonld" type="application/ld\+json">(.*?)</script>', body, re.S)
            schema = json.loads(jsonld.group(1)) if jsonld else None
            check(f'<link rel="canonical" href="{canonical}">'.encode() in body and
                  meta(body, 'property', 'og:url') == canonical and
                  meta(body, 'name', 'description') and
                  meta(body, 'name', 'robots') in ('index,follow', 'noindex,follow') and
                  body.count(b'rel="canonical"') == 1 and
                  schema is not None and schema.get('@type') == 'WebPage' and schema.get('url') == canonical,
                  f'HTTP follow of {source} should retain valid query-free canonical metadata')

        for period in ('2025-M01', '2025-M10', '2025'):
            check_operational_redirect(
                f'/UNIted-states/Unemployment/?period={period}',
                f'/united-states/unemployment?period={period}')
        check_operational_redirect(
            '/UNIted-states/California/Elections-President/?party=REPUBLICAN',
            '/united-states/california/elections-president?party=REPUBLICAN')
        check_operational_redirect(
            '/UNIted-states/Elections-House/?district=0606&party=REPUBLICAN',
            '/united-states/elections-house?party=REPUBLICAN&district=0606')
        check_operational_redirect(
            '/UNIted-states/Elections-House/?district=9999',
            '/united-states/elections-house?district=9999')
        check_operational_redirect(
            '/UNIted-states/Elections-House/?district=0606&party=REPUBLICAN&compare=places&secondDistrict=0607',
            '/united-states/elections-house?party=REPUBLICAN&district=0606&compare=places&secondDistrict=0607')
        check_operational_redirect(
            '/UNIted-states/Elections-House/?district=0606&compare=metrics&metricA=elections-house&metricB=unemployment',
            '/united-states/elections-house?district=0606&compare=metrics&metricA=elections-house&metricB=unemployment')

        # Only the first bounded value is considered; unrelated or invalid
        # values are removed, and an over-wide query is discarded as a whole.
        check_operational_redirect(
            '/united-states/unemployment?period=2025-M01&period=2025-M10&party=REPUBLICAN&party=DEMOCRAT&theme=dark',
            '/united-states/unemployment?period=2025-M01&party=REPUBLICAN')
        check_operational_redirect(
            '/united-states/unemployment?period=2026-M01&party=OTHER&theme=dark&embed=1',
            '/united-states/unemployment?embed=1')
        invalid_house = http_response(
            server,
            '/united-states/elections-house?district=0606&party=OTHER&compare=places&secondDistrict=0606&theme=dark')
        check(invalid_house[0] == 301 and
              invalid_house[1].get('Location') == '/united-states/elections-house?district=0606',
              'invalid House state and unrelated query values should normalize away')
        invalid_metric_comparison = http_response(
            server,
            '/united-states/elections-house?district=0606&compare=metrics&metricA=unknown&metricB=unknown')
        check(invalid_metric_comparison[0] == 301 and
              invalid_metric_comparison[1].get('Location') == '/united-states/elections-house?district=0606',
              'unrecognized House metric operands should not survive normalization')
        too_many = '&'.join(['period=2025-M01'] + [f'x{i}=1' for i in range(32)])
        bounded = http_response(server, '/united-states/unemployment?' + too_many)
        check(bounded[0] == 301 and bounded[1].get('Location') == '/united-states/unemployment',
              'queries beyond the bounded parser limit should not retain partial state')

        with patch('preview_server.atlas_data.catalog', return_value={'metrics': []}):
            status, _, _ = http_response(server, '/united-states/not-a-real-place/unemployment')
        check(status == 404, 'unknown app routes should remain HTTP 404')

        for path, title in [
            ('/united-states/race-ethnicity--aian', 'American Indian and Alaska Native in the United States | USA X-Ray'),
            ('/united-states/california/san-francisco-county/elections-president', 'President in San Francisco | USA X-Ray'),
            ('/united-states/california/elections-senate', 'Senate in California | USA X-Ray'),
            ('/united-states/elections-house?district=0606', 'House in the United States | USA X-Ray'),
        ]:
            status, _, body = http_response(server, path)
            canonical_path = path.split('?', 1)[0]
            canonical = f'https://usa-xray.online{canonical_path}'
            check(status == 200, f'HTTP {path} should resolve as a direct route, got {status}')
            check(f'<title>{title}</title>'.encode() in body,
                  f'HTTP {path} should render its route title')
            check(meta(body, 'name', 'robots') == 'index,follow' and
                  f'<link rel="canonical" href="{canonical}">'.encode() in body,
                  f'HTTP {path} should render indexable metadata for {canonical}')
            check(b'"@type":"WebPage"' in body and canonical.encode() in body,
                  f'HTTP {path} should render WebPage JSON-LD for its canonical')
        check(http_response(server, '/united-states/not-a-real-place/elections-house')[0] == 404,
              'unknown consumer metric paths should remain HTTP 404')

        # Static and API requests must stay outside route-index loading and redirects.
        with patch('preview_server.geography', side_effect=AssertionError('loaded route geography')):
            with patch('preview_server.redirect_target', side_effect=AssertionError('checked app redirect')):
                check(http_response(server, '/robots.txt')[0] == 200,
                      'static requests should bypass app route indices')
                check(http_response(server, '/api/analytics/config')[0] == 200,
                      'API requests should bypass app route indices')
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


check_preview_http_dispatch()


# Consumer-only route labels must resolve through the complete renderer, at
# their supported geographic scopes. The House query remains operational
# state on the national House path and never becomes a county route.
consumer_routes = [
    ('/united-states/race-ethnicity--aian', 'American Indian and Alaska Native in the United States | USA X-Ray',
     'Explore American Indian and Alaska Native in the United States with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
    ('/united-states/california/race-ethnicity--aian', 'American Indian and Alaska Native in California | USA X-Ray',
     'Explore American Indian and Alaska Native in California with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
    ('/united-states/california/san-francisco-county/race-ethnicity--aian', 'American Indian and Alaska Native in San Francisco | USA X-Ray',
     'Explore American Indian and Alaska Native in San Francisco with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
    ('/united-states/california/san-francisco-county/elections-president', 'President in San Francisco | USA X-Ray',
     'Explore President in San Francisco with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
    ('/united-states/california/elections-senate', 'Senate in California | USA X-Ray',
     'Explore Senate in California with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
    ('/united-states/elections-house', 'House in the United States | USA X-Ray',
     'Explore House in the United States with source-based observations, reference periods and geographic coverage on the USA X-Ray map.'),
]
for route_path, title, description in consumer_routes:
    check_route_metadata(route_path, title, description)
check_route_metadata('/united-states/elections-house?district=0606',
                     'House in the United States | USA X-Ray',
                     'Explore House in the United States with source-based observations, reference periods and geographic coverage on the USA X-Ray map.',
                     '/united-states/elections-house')
check_route_metadata('/united-states/elections-house?district=0606&review=1',
                     'House in the United States | USA X-Ray',
                     'Explore House in the United States with source-based observations, reference periods and geographic coverage on the USA X-Ray map.',
                     '/united-states/elections-house',
                     robots='noindex,follow')


check(len(GEO['statesById']) == 51 and len(GEO['countiesById']) == 3142,
      'server URL index must match the browser geography (50 states, DC and 3,142 counties)')
check(INDICATOR_ALIASES == dict(re.findall(
    r"'([^']+)': '([^']+)'", re.search(r'const INDICATOR_ALIASES = \{(.*?)\n\};',
    (ROOT / 'ux/routes.js').read_text(), re.S).group(1))),
      'server and browser indicator aliases must stay in sync')

for path, expected_title in [
    ('/united-states/unemployment', 'Unemployment rate in the United States | USA X-Ray'),
    ('/united-states/california/san-francisco-county/unemployment', 'Unemployment rate in San Francisco | USA X-Ray'),
    ('/compare/places/unemployment/california/vs/texas', 'Unemployment rate: California vs Texas | USA X-Ray'),
    ('/compare/indicators/unemployment-vs-adjusted-gross-income-agi', 'Unemployment rate vs Income before deductions | USA X-Ray'),
    ('/support', 'Support USA X-Ray | USA X-Ray'),
    ('/about', 'About USA X-Ray | USA X-Ray'),
    ('/blog', 'USA X-Ray journal | USA X-Ray'),
]:
    status, body = html_for(path)
    check(status == 200, f'{path} should return a successful route response')
    check(f'<title>{expected_title}</title>'.encode() in body, f'{path} should have its route-specific title in initial HTML')
    canonical = f'https://usa-xray.online{path}'
    check(f'<link rel="canonical" href="{canonical}">'.encode() in body, f'{path} should have a self-referencing canonical')
    check(meta(body, 'property', 'og:url') == canonical, f'{path} Open Graph URL should match its canonical')
    check(meta(body, 'name', 'description'), f'{path} should have a non-empty description before JavaScript')
    check(meta(body, 'name', 'robots') == 'index,follow', f'{path} should be indexable')
    check(body.count(b'rel="canonical"') == 1 and body.count(b'id="atlas-jsonld"') == 1,
          f'{path} should contain one canonical and one JSON-LD block')
    jsonld = re.search(rb'<script id="atlas-jsonld" type="application/ld\+json">(.*?)</script>', body, re.S)
    check(jsonld is not None and json.loads(jsonld.group(1)), f'{path} should contain valid JSON-LD')

for path in ['/stats', '/blog/mississippi', '/blog/electricity']:
    status, body = html_for(path)
    check(status == 200, f'{path} should resolve even while excluded from search')
    check(meta(body, 'name', 'robots') == 'noindex,follow', f'{path} should be excluded until analytics/content is ready')

check(html_for('/united-states/not-a-real-place/unemployment')[0] == 404,
      'unknown places should return 404 instead of a soft-404 app shell')
for path in ['/united-states/not-a-real-place/race-ethnicity--aian',
             '/united-states/california/not-a-real-place/elections-president',
             '/united-states/not-a-real-place/elections-senate',
             '/united-states/not-a-real-place/elections-house']:
    check(html_for(path)[0] == 404, f'unknown route {path} should remain a hard 404')

redirect_cases = {
    '/ux/?place=06075&metric=unemployment&view=3d&theme=dark': '/united-states/california/san-francisco-county/unemployment',
    '/ux/?place=06075&metric=unemployment&theme=dark&embed=1': '/united-states/california/san-francisco-county/unemployment?embed=1',
    '/ux/?page=info&theme=dark': '/about',
    '/ux/?page=stats': '/stats',
    '/ux/?page=article&article=mississippi': '/blog/mississippi',
    '/ux/?concept=compare&comparison=places&place=06&other=48&metric=unemployment&theme=dark': '/compare/places/unemployment/california/vs/texas',
    '/united-states/california-vs-texas/unemployment/': '/compare/places/unemployment/california/vs/texas',
    '/united-states/unemployment-vs-adjusted-gross-income-agi': '/compare/indicators/unemployment-vs-adjusted-gross-income-agi',
    '/united-states/california/unemployment?theme=dark': '/united-states/california/unemployment',
    '/UNIted-states/California/Unemployment/': '/united-states/california/unemployment',
}
for source, destination in redirect_cases.items():
    check(redirect_target(source, GEO, METRICS, ARTICLES) == destination,
          f'{source} should permanently redirect to {destination}')

namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
sitemap = ET.parse(ROOT / 'sitemap.xml').getroot()
urls = [node.text for node in sitemap.findall('.//sm:loc', namespace)]
check(len(urls) == len(set(urls)) and urls, 'sitemap must have unique absolute URLs')
for url in urls:
    parsed_path = re.sub(r'^https://usa-xray\.online', '', url)
    check(parsed_path.startswith('/') and '?' not in parsed_path, f'{url} must be an absolute clean URL')
    check(redirect_target(parsed_path, GEO, METRICS, ARTICLES) is None,
          f'{url} must already be canonical and must not redirect')
    check(html_for(parsed_path)[0] == 200, f'{url} must resolve successfully')
check('/stats' not in [re.sub(r'^https://usa-xray\.online', '', url) for url in urls],
      'the disconnected analytics page must not be in the sitemap')
expected_blog_urls = {'https://usa-xray.online/blog'} | {
    f'https://usa-xray.online/blog/{slug}'
    for slug, article in ARTICLES.items()
    if article.get('published') is True
}
actual_blog_urls = {
    url for url in urls
    if re.fullmatch(r'https://usa-xray\.online/blog(?:/[^/]+)?', url)
}
check(actual_blog_urls == expected_blog_urls,
      'the journal sitemap must contain /blog and exactly the published article routes')
check(any(url.endswith('/support') for url in urls) and any(url.endswith('/about') for url in urls),
      'public Support and About pages should remain in the sitemap')
robots = (ROOT / 'robots.txt').read_text()
check('Sitemap: https://usa-xray.online/sitemap.xml' in robots and 'Disallow: /api/' in robots,
      'robots.txt must advertise the sitemap and keep data API endpoints out of crawling')

builder = (ROOT / 'scripts/build_temporary_preview.py').read_text()
check('scripts/seo_render.py' in builder and "'scripts/seo_render.py'" in builder,
      'the server renderer must be packaged and included in release evidence')

print(f'PASS: server metadata, canonical redirects, noindex policy, {len(urls)} sitemap routes and release packaging')
