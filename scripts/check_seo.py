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

        with patch('preview_server.atlas_data.catalog', return_value={'metrics': []}):
            status, _, _ = http_response(server, '/united-states/not-a-real-place/unemployment')
        check(status == 404, 'unknown app routes should remain HTTP 404')

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

for path in ['/stats', '/blog', '/blog/mississippi', '/blog/electricity']:
    status, body = html_for(path)
    check(status == 200, f'{path} should resolve even while excluded from search')
    check(meta(body, 'name', 'robots') == 'noindex,follow', f'{path} should be excluded until analytics/content is ready')

check(html_for('/united-states/not-a-real-place/unemployment')[0] == 404,
      'unknown places should return 404 instead of a soft-404 app shell')

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
check('/blog' not in [re.sub(r'^https://usa-xray\.online', '', url) for url in urls],
      'the unpublished journal must not be in the sitemap')
check(any(url.endswith('/support') for url in urls) and any(url.endswith('/about') for url in urls),
      'public Support and About pages should remain in the sitemap')
robots = (ROOT / 'robots.txt').read_text()
check('Sitemap: https://usa-xray.online/sitemap.xml' in robots and 'Disallow: /api/' in robots,
      'robots.txt must advertise the sitemap and keep data API endpoints out of crawling')

builder = (ROOT / 'scripts/build_temporary_preview.py').read_text()
check('scripts/seo_render.py' in builder and "'scripts/seo_render.py'" in builder,
      'the server renderer must be packaged and included in release evidence')

print(f'PASS: server metadata, canonical redirects, noindex policy, {len(urls)} sitemap routes and release packaging')
