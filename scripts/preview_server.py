#!/usr/bin/env python3
"""Bounded app runtime with a read-only data API and optional write-only private reports."""
from collections import OrderedDict
import gzip
import hashlib
import ipaddress
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import socket
from socketserver import ThreadingMixIn
import threading
import time
from urllib.parse import parse_qs, urlsplit

import atlas_data
from bug_reports import (MAX_REPORT_BODY, ReportRateLimiter, create_report_store,
                         report_rate_limit_identity, same_origin, trusted_proxy_networks,
                         validate_report)
from seo_render import articles, geography, metric_labels, redirect_target, render_route

ROOT = Path(__file__).resolve().parents[1]


def local_review_client_allowed(address, headers):
    try:
        local = ipaddress.ip_address(address).is_loopback
    except ValueError:
        local = False
    return local and not bool(headers.get('Forwarded') or headers.get('X-Forwarded-For'))


class Busy(RuntimeError):
    pass


class ReadCache:
    """One successful result per key; failures are never cached or served stale."""
    def __init__(self, ttl=300, max_entries=64, max_bytes=64 * 1024 * 1024):
        self.ttl, self.max_entries, self.max_bytes = ttl, max_entries, max_bytes
        self.lock = threading.Lock()
        self.entries, self.pending = OrderedDict(), {}
        self.queries = threading.BoundedSemaphore(2)

    def get(self, key, read):
        with self.lock:
            cached = self.entries.get(key)
            if cached and time.monotonic() - cached[0] < self.ttl:
                self.entries.move_to_end(key)
                return cached[1]
            if key in self.pending:
                event, owner = self.pending[key], False
            else:
                event, owner = threading.Event(), True
                self.pending[key] = event
        if not owner:
            if not event.wait(25):
                raise Busy('The data service is busy. Please retry.')
            with self.lock:
                cached = self.entries.get(key)
                if cached and time.monotonic() - cached[0] < self.ttl:
                    return cached[1]
            raise Busy('This read did not complete. Please retry.')
        try:
            if not self.queries.acquire(timeout=2):
                raise Busy('The data service is busy. Please retry.')
            try:
                value = read()
            finally:
                self.queries.release()
            size = len(json.dumps(value).encode())
            if size <= self.max_bytes:
                with self.lock:
                    self.entries[key] = (time.monotonic(), value, size)
                    self.entries.move_to_end(key)
                    while len(self.entries) > self.max_entries or sum(item[2] for item in self.entries.values()) > self.max_bytes:
                        self.entries.popitem(last=False)
            return value
        finally:
            with self.lock:
                self.pending.pop(key, None)
                event.set()


class PreviewServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    request_queue_size = 16

    def __init__(self, address, assets, cache=None, reports_dir=None, trusted_proxies=()):
        self.assets, self.cache = assets, cache or ReadCache()
        self.workers = threading.BoundedSemaphore(16)
        self.bug_report_store = create_report_store(reports_dir, ROOT)
        self.bug_report_limiter = ReportRateLimiter()
        self.trusted_proxies = tuple(trusted_proxies)
        super().__init__(address, PreviewHandler)

    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(10)
        return connection, address

    def process_request(self, request, address):
        if not self.workers.acquire(blocking=False):
            try:
                request.sendall(b'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nRetry-After: 2\r\nContent-Length: 0\r\n\r\n')
            except OSError:
                pass  # The overloaded client may already have disconnected.
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, address)
        except BaseException:
            self.workers.release()
            raise

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.workers.release()


class PreviewHandler(BaseHTTPRequestHandler):
    server_version = 'AtlasPreview'
    sys_version = ''

    def log_message(self, *_):
        # Avoid logging query/contact text and external identifiers on this preview.
        pass

    def reply(self, status, payload, content_type='application/json; charset=utf-8', extra=None, cache_control='no-store'):
        body = payload if isinstance(payload, bytes) else json.dumps(payload, ensure_ascii=False).encode()
        compressed = 'gzip' in self.headers.get('Accept-Encoding', '') and len(body) > 1000
        if compressed:
            body = gzip.compress(body, compresslevel=5)
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        if status != 304:
            self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', cache_control)
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'self'")
        self.send_header('Connection', 'close')
        if compressed:
            self.send_header('Content-Encoding', 'gzip')
            if not extra or 'Vary' not in extra:
                self.send_header('Vary', 'Accept-Encoding')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        if self.command != 'HEAD':
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError, socket.timeout):
                pass  # No persistence or retry is implied by a disconnected read.

    def do_GET(self):
        if len(self.path) > 2048 or self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
            return self.reply(400, {'error': 'Invalid request'})
        path = urlsplit(self.path).path
        if path.startswith('/api/atlas/reader/v2/'):
            try:
                mode = atlas_data.reader_v2_mode()
            except atlas_data.DatabaseUnavailable as error:
                return self.reply(503, {'error': str(error)})
            if mode == 'disabled':
                return self.reply(404, {'error': 'Reader-v2 data are unavailable.'})
            if mode == 'local_review' and not local_review_client_allowed(self.client_address[0], self.headers):
                return self.reply(404, {'error': 'Local candidate preview is available only over loopback.'})
        route_path = path.lower().rstrip('/') or '/'
        app_route = route_path in ('/', '/ux', '/ux/index.html') or re.fullmatch(
            r'/(?:stats|support|about|blog(?:/[a-z0-9-]{1,64})?|compare(?:/[a-z0-9-]{1,64}){1,7}|united-states(?:/[a-z0-9-]{1,64}){0,4})', route_path)
        if not app_route:
            return self.serve_asset(path)
        if path == '/':
            return self.reply(301, b'', extra={'Location': '/united-states/unemployment'},
                              cache_control='public, max-age=86400')
        try:
            topology = self.server.assets['/node_modules/us-atlas/counties-10m.json']
            definitions = ROOT / 'ux/metric-definitions.json'
            journal = ROOT / 'ux/journal.js'
            target = redirect_target(self.path, geography(str(topology)), metric_labels(str(definitions)),
                                     articles(str(journal)))
            if target:
                return self.reply(301, b'', extra={'Location': target},
                                  cache_control='public, max-age=86400')
            if path in ('/ux', '/ux/'):
                try:
                    catalog = self.server.cache.get('catalog', atlas_data.catalog)
                except (Busy, atlas_data.DatabaseUnavailable):
                    catalog = None
                target = redirect_target(self.path, geography(str(topology)), metric_labels(str(definitions)),
                                         articles(str(journal)), catalog)
                if target:
                    return self.reply(301, b'', extra={'Location': target},
                                      cache_control='public, max-age=86400')
                return self.reply(404, {'error': 'Legacy atlas URL could not be resolved'})
        except KeyError:
            return self.reply(503, {'error': 'The route index is unavailable'}, extra={'Retry-After': '2'})
        return self.serve_asset(path, app_route=True, topology=topology,
                                definitions=definitions, journal=journal)

    def serve_asset(self, path, app_route=False, topology=None, definitions=None, journal=None):
        try:
            if path == '/api/atlas/catalog':
                return self.reply(200, self.server.cache.get('catalog', atlas_data.catalog))
            if path == '/api/atlas/observations':
                parameters = parse_qs(urlsplit(self.path).query, keep_blank_values=True, max_num_fields=2)
                if set(parameters) != {'field'} or len(parameters['field']) != 1:
                    return self.reply(400, {'error': 'Choose one published field'})
                field = parameters['field'][0]
                catalog = self.server.cache.get('catalog', atlas_data.catalog)
                if field not in {metric['fieldId'] for metric in catalog['metrics'] if metric.get('fieldId')}:
                    return self.reply(404, {'error': 'Field is not in the published map catalog'})
                return self.reply(200, self.server.cache.get(field, lambda: atlas_data.observations(field)))
            if path == '/api/atlas/period-observations':
                parameters = parse_qs(urlsplit(self.path).query, keep_blank_values=True, max_num_fields=4)
                period_type = parameters.get('period_type', [''])[0]
                expected = {'field', 'period_type', 'year'} | ({'month'} if period_type == 'month' else set())
                if set(parameters) != expected or any(len(values) != 1 for values in parameters.values()):
                    return self.reply(400, {'error': 'Choose one explicit unemployment period'})
                field = parameters['field'][0]
                if field != '03.06:unemployment_rate':
                    return self.reply(404, {'error': 'Explicit periods are not available for this field'})
                year_text = parameters['year'][0]
                if not re.fullmatch(r'(?:20|21)[0-9]{2}', year_text):
                    return self.reply(400, {'error': 'Choose a four-digit period year'})
                year = int(year_text)
                month = None
                if period_type == 'month':
                    month_text = parameters['month'][0]
                    if not re.fullmatch(r'(?:0?[1-9]|1[0-2])', month_text):
                        return self.reply(400, {'error': 'Choose a month from January through December'})
                    month = int(month_text)
                elif period_type != 'annual':
                    return self.reply(400, {'error': 'Choose annual average or a month'})
                key = f'unemployment-period:{period_type}:{year}:{month or "annual"}'
                response = self.server.cache.get(
                    key, lambda: atlas_data.unemployment_period_observations(period_type, year, month))
                return self.reply(200, response)
            if path == '/api/atlas/unemployment-months':
                parameters = parse_qs(urlsplit(self.path).query, keep_blank_values=True, max_num_fields=3)
                if set(parameters) != {'year', 'geography_type', 'geography_id'} or any(
                        len(values) != 1 for values in parameters.values()):
                    return self.reply(400, {'error': 'Choose one place and one unemployment year'})
                year_text = parameters['year'][0]
                if not re.fullmatch(r'(?:20|21)[0-9]{2}', year_text):
                    return self.reply(400, {'error': 'Choose a four-digit period year'})
                year = int(year_text)
                geography_type = parameters['geography_type'][0]
                geography_id = parameters['geography_id'][0]
                key = f'unemployment-months:{year}:{geography_type}:{geography_id}'
                response = self.server.cache.get(key, lambda: atlas_data.unemployment_month_series(
                    year, geography_type, geography_id))
                return self.reply(200, response)
            if path == '/api/atlas/reader/v2/catalog':
                return self.reply(200, self.server.cache.get('reader-v2-catalog', atlas_data.reader_v2_catalog))
            if path == '/api/atlas/reader/v2/cd119-boundary':
                boundary=atlas_data.reader_v2_cd119_boundary(include_features=True)
                if not boundary['available']:
                    return self.reply(503, {'error':'Local 2024 CD119 geometry is unavailable.'}, extra={'Retry-After':'2'})
                return self.reply(200,boundary)
            if path == '/api/atlas/reader/v2/observations':
                parameters = parse_qs(urlsplit(self.path).query, keep_blank_values=True, max_num_fields=6)
                required = {'dataset_id','period_type','year','geography_type'}
                if not required <= set(parameters) or not set(parameters) <= required | {'party'} or any(
                        len(values) != 1 for values in parameters.values()):
                    return self.reply(400, {'error':'Choose one candidate dataset, period and geography.'})
                dataset_id=parameters['dataset_id'][0]
                if dataset_id not in ({'unemployment','aian_broad_share','election_president_2024',
                                      'election_senate_2024','election_house_2024'} | set(atlas_data.REFRESH_TARGETS)):
                    return self.reply(404, {'error':'Candidate dataset is not in the local preview contract.'})
                year_text=parameters['year'][0]
                if not re.fullmatch(r'(?:20|21)[0-9]{2}',year_text):
                    return self.reply(400, {'error':'Choose a four-digit year.'})
                period_type=parameters['period_type'][0]
                geography_type=parameters['geography_type'][0]
                party=parameters.get('party',[''])[0] or None
                key='reader-v2:'+':'.join([dataset_id,period_type,year_text,geography_type,party or ''])
                response=self.server.cache.get(key,lambda:atlas_data.reader_v2_observations(
                    dataset_id,period_type,int(year_text),geography_type,party))
                return self.reply(200,response)
            if path == '/api/analytics/config':
                return self.reply(200, {'enabled': False})
            if path == '/api/view-settings':
                defaults = json.loads((ROOT / 'ux/view-settings.json').read_text())
                return self.reply(200, {**defaults, 'savedAt': None})
            asset = self.server.assets.get('/ux/index.html') if app_route else self.server.assets.get(path)
            if asset is None:
                return self.reply(404, {'error': 'Not found'})
            content = asset.read_bytes()
            content_type = mimetypes.guess_type(asset.name)[0] or 'application/octet-stream'
            if asset.suffix == '.html':
                if app_route:
                    status, rendered = render_route(content, self.path, topology, definitions, journal)
                    if status == 404:
                        try:
                            catalog = self.server.cache.get('catalog', atlas_data.catalog)
                        except (Busy, atlas_data.DatabaseUnavailable):
                            catalog = None
                        if catalog:
                            target = redirect_target(self.path, geography(str(topology)), metric_labels(str(definitions)),
                                                     articles(str(journal)), catalog)
                            if target:
                                return self.reply(301, b'', extra={'Location': target},
                                                  cache_control='public, max-age=86400')
                            status, rendered = render_route(content, self.path, topology, definitions, journal, catalog)
                    content = rendered
                    return self.reply(status, content, content_type)
                return self.reply(200, content, content_type)
            # Revalidate every time: unchanged large geometry/fonts/icons can use
            # browser-cached bytes, while a changed build never serves stale code.
            etag = 'W/"' + hashlib.sha256(content).hexdigest() + '"'
            validators = [value.strip().removeprefix('W/') for value in self.headers.get('If-None-Match', '').split(',')]
            headers = {'ETag': etag, 'Vary': 'Accept-Encoding'}
            if '*' in validators or etag.removeprefix('W/') in validators:
                return self.reply(304, b'', content_type, extra=headers,
                                  cache_control='public, max-age=0, must-revalidate')
            return self.reply(200, content, content_type, extra=headers,
                              cache_control='public, max-age=0, must-revalidate')
        except ValueError:
            return self.reply(400, {'error': 'Invalid request'})
        except (Busy, atlas_data.DatabaseUnavailable) as error:
            return self.reply(503, {'error': str(error)}, extra={'Retry-After': '2'})
        except OSError:
            return self.reply(503, {'error': 'This preview asset is unavailable'})

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        try:
            request_path = urlsplit(self.path).path
        except ValueError:
            return self.reply(400, {'error': 'Invalid request'})
        if len(self.path) > 2048 or self.headers.get('Host') != f'127.0.0.1:{self.server.server_port}':
            return self.reply(400, {'error': 'Invalid request'})
        if request_path != '/api/bug-reports':
            return self.reject_method()
        if not same_origin(self.headers):
            return self.reply(403, {'error': 'Same-origin requests only'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.reply(415, {'error': 'JSON required'})
        if self.server.bug_report_store is None:
            return self.reply(503, {'error': 'Report storage is not available. Please retry later.'},
                              extra={'Retry-After': '60'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_REPORT_BODY:
                return self.reply(413, {'error': 'Report exceeds the size limit'})
            identity = report_rate_limit_identity(self.client_address[0], self.headers,
                                                  self.server.trusted_proxies)
            if not self.server.bug_report_limiter.allow(identity):
                return self.reply(429, {'error': 'Too many reports. Please try again later.'}, extra={'Retry-After': '3600'})
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('Incomplete request')
            data = json.loads(body, parse_constant=lambda value: (_ for _ in ()).throw(ValueError('Invalid JSON number')))
            report = validate_report(data)
            report_id = self.server.bug_report_store.save(report)
            return self.reply(201, {'id': report_id, 'saved': True})
        except (ValueError, TypeError, UnicodeDecodeError) as error:
            return self.reply(400, {'error': str(error)})
        except OSError:
            return self.reply(503, {'error': 'Report storage is unavailable. Please retry.'})

    def reject_method(self):
        try:
            path = urlsplit(self.path).path
        except ValueError:
            return self.reply(400, {'error': 'Invalid request'})
        if path == '/api/bug-reports':
            return self.reply(405, {'error': 'Only POST is allowed'}, extra={'Allow': 'POST'})
        return self.reply(405, {'error': 'This preview is read-only'}, extra={'Allow': 'GET, HEAD'})

    do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_TRACE = reject_method


def load_assets(root=ROOT):
    manifest = json.loads((root / 'preview-assets.json').read_text())
    assets = {}
    for url, relative in manifest.items():
        file = root / relative
        if not url.startswith('/') or '%' in url or '..' in url.split('/') or file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root.resolve()):
            raise ValueError('Invalid preview asset manifest')
        assets[url] = file
    return assets


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', default='0.0.0.0')
    parser.add_argument('--port', type=int, default=4429)
    parser.add_argument('--secret-file', type=Path, default=Path('/run/secrets/reader_password'))
    parser.add_argument('--reports-dir', type=Path, help='Private, write-only bug report storage outside the served app tree')
    parser.add_argument('--trusted-proxy', action='append', default=[], metavar='IP_OR_CIDR',
                        help='Explicit trusted reverse proxy network for client rate limits; repeat as needed')
    args = parser.parse_args()
    if (os.environ.get('ATLAS_DISABLE_SECRET_FILE') != '1' and
            not os.environ.get('PGPASSWORD') and args.secret_file.is_file()):
        os.environ['PGPASSWORD'] = args.secret_file.read_text().strip()
    server = PreviewServer((args.host, args.port), load_assets(), reports_dir=args.reports_dir,
                           trusted_proxies=trusted_proxy_networks(args.trusted_proxy))
    print(f'Temporary Atlas preview listening on {args.host}:{server.server_port}; bug reports {"enabled" if args.reports_dir else "disabled"}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
