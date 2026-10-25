#!/usr/bin/env python3
"""Temporary, bounded, read-only UI server. Never imports the local review server."""
from collections import OrderedDict
import gzip
import hashlib
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
from seo_render import articles, geography, metric_labels, redirect_target, render_route

ROOT = Path(__file__).resolve().parents[1]


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

    def __init__(self, address, assets, cache=None):
        self.assets, self.cache = assets, cache or ReadCache()
        self.workers = threading.BoundedSemaphore(16)
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
        app_route = path in ('/', '/ux', '/ux/', '/ux/index.html') or re.fullmatch(
            r'/(?:stats|support|about|blog(?:/[A-Za-z0-9-]{1,64})?|compare(?:/[A-Za-z0-9-]{1,64}){1,7}|united-states(?:/[A-Za-z0-9-]{1,64}){0,4})', path)
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
        return self.reply(405, {'error': 'This preview is read-only'}, extra={'Allow': 'GET, HEAD'})

    do_PUT = do_PATCH = do_DELETE = do_OPTIONS = do_POST


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
    args = parser.parse_args()
    if (os.environ.get('ATLAS_DISABLE_SECRET_FILE') != '1' and
            not os.environ.get('PGPASSWORD') and args.secret_file.is_file()):
        os.environ['PGPASSWORD'] = args.secret_file.read_text().strip()
    server = PreviewServer((args.host, args.port), load_assets())
    print(f'Temporary read-only Atlas preview listening on {args.host}:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
