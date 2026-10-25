#!/usr/bin/env python3
"""Loopback prototype server with append-only, atomic feedback records."""
import argparse
import base64
import binascii
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import math
import os
from pathlib import Path
import re
import shutil
import struct
import tempfile
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

from feedback_sources import ROOT, resolve_sources
from view_settings import read_settings, save_settings
import atlas_data
import advertising
import analytics_config
from bug_reports import (MAX_REPORT_BODY, ReportRateLimiter, create_report_store,
                         report_rate_limit_identity, same_origin, trusted_proxy_networks,
                         validate_report)
from seo_render import articles, geography, metric_labels, redirect_target, render_route

MAX_BODY = 16 * 1024 * 1024
_SEO_CATALOG = None


def seo_catalog():
    global _SEO_CATALOG
    if _SEO_CATALOG is not None:
        return _SEO_CATALOG
    try:
        _SEO_CATALOG = atlas_data.catalog()
    except atlas_data.DatabaseUnavailable:
        return None
    return _SEO_CATALOG


def invalid_constant(value):
    raise ValueError('Non-finite JSON value: ' + value)


def sync_directory(folder):
    descriptor = os.open(folder, os.O_RDONLY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def finite(value, maximum=20000):
    return type(value) in (int, float) and math.isfinite(value) and 0 <= value <= maximum


def validate_payload(data):
    if not isinstance(data, dict) or set(data) != {'id', 'text', 'image', 'target', 'context', 'viewport', 'point', 'region'}:
        raise ValueError('Invalid comment fields')
    if str(UUID(data['id'], version=4)) != data['id']:
        raise ValueError('Invalid comment ID')
    if not isinstance(data['text'], str) or not data['text'].strip() or len(data['text']) > 10000:
        raise ValueError('Write a comment of 1–10000 characters')
    if len(json.dumps({k: v for k, v in data.items() if k != 'image'})) > 60000:
        raise ValueError('Comment metadata is too large')
    target = data['target']
    if not isinstance(target, dict) or not isinstance(target.get('component'), str):
        raise ValueError('Missing code component')
    if not isinstance(target.get('selector'), str) or len(target['selector']) > 1500:
        raise ValueError('Invalid element selector')
    if not isinstance(target.get('styleSelector', ''), str) or len(target.get('styleSelector', '')) > 200:
        raise ValueError('Invalid style selector')
    if not isinstance(data['context'], dict) or len(str(data['context'].get('url', ''))) > 4000:
        raise ValueError('Invalid view context')
    url = urlsplit(data['context'].get('url', ''))
    if url.scheme != 'http' or url.hostname not in ('127.0.0.1', 'localhost') or url.path != '/ux/':
        raise ValueError('Feedback must reference this local prototype')
    v, p, r = data['viewport'], data['point'], data['region']
    if not all(isinstance(x, dict) for x in (v, p, r)):
        raise ValueError('Invalid capture geometry')
    if not all(finite(v.get(k), 8192) and v[k] > 0 for k in ('width', 'height')):
        raise ValueError('Invalid viewport size')
    if not all(finite(p.get(k)) for k in ('x', 'y')) or not all(finite(r.get(k)) for k in ('x', 'y', 'width', 'height')):
        raise ValueError('Invalid capture coordinates')
    if not (r['width'] >= 1 and r['height'] >= 1 and r['x'] <= p['x'] <= r['x'] + r['width'] <= v['width'] + 1 and r['y'] <= p['y'] <= r['y'] + r['height'] <= v['height'] + 1):
        raise ValueError('The capture must contain its point inside the viewport')
    if not isinstance(data['image'], str) or not data['image'].startswith('data:image/png;base64,'):
        raise ValueError('A PNG capture is required')
    png = base64.b64decode(data['image'].split(',', 1)[1], validate=True)
    width, height = validate_png(png)
    sx, sy = width / r['width'], height / r['height']
    if not (.5 <= sx <= 2.02 and .5 <= sy <= 2.02 and abs(sx - sy) < .05):
        raise ValueError('Capture dimensions do not match its crop')
    return png, resolve_sources(target['component'], target.get('styleSelector', ''))


def validate_png(png):
    if len(png) > 12 * 1024 * 1024 or png[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Invalid or oversized PNG')
    offset, dimensions, image_data, ended = 8, None, False, False
    while offset + 12 <= len(png):
        size = struct.unpack('>I', png[offset:offset + 4])[0]
        kind = png[offset + 4:offset + 8]
        end = offset + 8 + size
        if end + 4 > len(png) or binascii.crc32(png[offset + 4:end]) & 0xffffffff != struct.unpack('>I', png[end:end + 4])[0]:
            raise ValueError('Damaged PNG')
        if offset == 8:
            if kind != b'IHDR' or size != 13:
                raise ValueError('PNG header missing')
            dimensions = struct.unpack('>II', png[offset + 8:offset + 16])
            if not all(0 < n <= 16384 for n in dimensions):
                raise ValueError('PNG dimensions out of bounds')
        image_data = image_data or kind == b'IDAT'
        offset = end + 4
        if kind == b'IEND':
            ended = size == 0 and offset == len(png)
            break
    if not ended or not image_data:
        raise ValueError('Incomplete PNG')
    return dimensions


def store_comment(folder, data, png, sources):
    digest = hashlib.sha256(json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()
    destination = folder / data['id']

    def existing():
        record = json.loads((destination / 'comment.json').read_text())
        if record['payloadSha256'] != digest:
            raise FileExistsError('This comment ID already contains different content')
        return record, False

    if destination.exists():
        return existing()
    record = {k: v for k, v in data.items() if k != 'image'}
    record.update({'createdAt': datetime.now(timezone.utc).isoformat(), 'sources': sources,
                   'image': 'capture.png', 'imageSha256': hashlib.sha256(png).hexdigest(),
                   'payloadSha256': digest, 'captureMethod': 'html2canvas 1.4.1 DOM reconstruction with actual WebGL pixels'})
    markdown = '# Prototype comment\n\n' + record['text'] + '\n\n![Selected region](capture.png)\n\n'
    markdown += 'View: ' + record['context']['url'] + '\n\nElement: `' + record['target']['selector'] + '`\n\n'
    markdown += '\n'.join('- ' + s['file'] + ':' + str(s['line']) + ' — ' + s['symbol'] + ' (SHA-256 ' + s['sha256'] + ')' for s in sources)
    markdown += '\n\nPoint, crop, camera and geographic context: [comment.json](comment.json).\n'
    staging = Path(tempfile.mkdtemp(prefix='.pending-', dir=folder))
    try:
        for name, content in [('capture.png', png), ('comment.json', (json.dumps(record, ensure_ascii=False, indent=2) + '\n').encode()), ('comment.md', markdown.encode())]:
            with (staging / name).open('wb') as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
        try:
            sync_directory(staging)
            os.rename(staging, destination)
        except OSError:
            if destination.exists():
                return existing()
            raise
        sync_directory(folder)
        return record, True
    finally:
        if staging.exists():
            shutil.rmtree(staging)  # Only this request's private, unpublished staging directory.


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def allowed_host(self):
        return self.headers.get('Host') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def end_headers(self):
        path = urlsplit(self.path).path
        if re.fullmatch(r'/ux/startup/[A-Za-z0-9._-]+\.json', path):
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        elif not path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def respond(self, code, body, extra=None):
        encoded = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(encoded)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for name, value in (extra or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(encoded)

    def seo_route(self):
        path = urlsplit(self.path).path
        if path not in ('/ux', '/ux/', '/ux/index.html') and not re.fullmatch(
                r'/(?:stats|support|about|blog(?:/[A-Za-z0-9-]{1,64})?|compare(?:/[A-Za-z0-9-]{1,64}){1,7}|united-states(?:/[A-Za-z0-9-]{1,64}){0,4})',
                path.rstrip('/') or '/'):
            return False
        topology = ROOT / 'node_modules/us-atlas/counties-10m.json'
        definitions = ROOT / 'ux/metric-definitions.json'
        journal = ROOT / 'ux/journal.js'
        geo, metrics, article_data = geography(str(topology)), metric_labels(str(definitions)), articles(str(journal))
        target = redirect_target(self.path, geo, metrics, article_data)
        if target:
            self.send_response(301)
            self.send_header('Location', target)
            self.send_header('Cache-Control', 'public, max-age=86400')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return True
        index = ROOT / 'ux/index.html'
        template = index.read_bytes()
        status, body = render_route(template, self.path, topology, definitions, journal)
        if status == 404:
            catalog = seo_catalog()
            if catalog:
                target = redirect_target(self.path, geo, metrics, article_data, catalog)
                if target:
                    self.send_response(301)
                    self.send_header('Location', target)
                    self.send_header('Cache-Control', 'public, max-age=86400')
                    self.send_header('Content-Length', '0')
                    self.end_headers()
                    return True
                status, body = render_route(template, self.path, topology, definitions, journal, catalog)
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
        return True

    def do_GET(self):
        if not self.allowed_host():
            return self.respond(403, {'error': 'Loopback Host required'})
        if self.seo_route():
            return
        path = urlsplit(self.path).path
        if path == '/api/analytics/config':
            try:
                return self.respond(200, analytics_config.public_config())
            except ValueError:
                return self.respond(503, {'error': 'Analytics configuration is invalid'})
        if path == '/api/advertising/config':
            return self.respond(200, {'enabled': advertising.configured()})
        if path in ('/api/atlas/catalog', '/api/atlas/observations'):
            try:
                params = parse_qs(urlsplit(self.path).query, keep_blank_values=True)
                if path.endswith('/catalog'):
                    if params:
                        raise ValueError('Catalog does not accept query parameters')
                    return self.respond(200, atlas_data.catalog())
                if set(params) != {'field'} or len(params['field']) != 1:
                    raise ValueError('Exactly one field parameter is required')
                return self.respond(200, atlas_data.observations(params['field'][0]))
            except ValueError as error:
                return self.respond(400, {'error': str(error)})
            except LookupError as error:
                return self.respond(404, {'error': str(error)})
            except atlas_data.DatabaseUnavailable as error:
                return self.respond(503, {'error': str(error)})
        if path == '/api/view-settings':
            try:
                return self.respond(200, read_settings(self.server.feedback_dir))
            except (OSError, ValueError, KeyError, TypeError):
                return self.respond(500, {'error': 'Saved view settings could not be read'})
        if path == '/api/feedback':
            records = []
            for child in self.server.feedback_dir.iterdir():
                if child.name.startswith('.') or not child.is_dir():
                    continue
                try:
                    records.append(json.loads((child / 'comment.json').read_text()))
                except (OSError, ValueError) as error:
                    return self.respond(500, {'error': 'A saved comment could not be read: ' + child.name})
            return self.respond(200, {'comments': sorted(records, key=lambda r: r['createdAt'], reverse=True)})
        match = re.fullmatch(r'/api/feedback/([0-9a-f-]{36})/capture.png', path)
        if match:
            image = self.server.feedback_dir / match.group(1) / 'capture.png'
            if not image.is_file():
                return self.respond(404, {'error': 'Capture not found'})
            content = image.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', 'image/png')
            self.send_header('Content-Length', str(len(content)))
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(content)
            return
        if path.startswith('/api/'):
            return self.respond(404, {'error': 'Unknown endpoint'})
        route_path=path.rstrip('/')
        if re.fullmatch(r'/(?:stats|support|about|blog(?:/[A-Za-z0-9-]{1,64})?|compare(?:/[A-Za-z0-9-]{1,64}){1,7}|united-states(?:/[A-Za-z0-9-]{1,64}){0,4})',route_path):
            query=urlsplit(self.path).query
            self.path='/ux/index.html'+('?' + query if query else '')
        # Local edits can have an earlier mtime than a previously cached checkout.
        # Always deliver the current UI, including after a data-model replacement.
        if 'If-Modified-Since' in self.headers:
            del self.headers['If-Modified-Since']
        super().do_GET()

    def do_HEAD(self):
        if not self.allowed_host():
            self.send_error(403, 'Loopback Host required')
            return
        if self.seo_route():
            return
        if urlsplit(self.path).path.startswith('/api/'):
            self.send_error(405, 'Use GET for feedback')
            return
        route_path=urlsplit(self.path).path.rstrip('/')
        if re.fullmatch(r'/(?:stats|support|about|blog(?:/[A-Za-z0-9-]{1,64})?|compare(?:/[A-Za-z0-9-]{1,64}){1,7}|united-states(?:/[A-Za-z0-9-]{1,64}){0,4})',route_path):
            self.path='/ux/index.html'
        super().do_HEAD()

    def do_POST(self):
        if not self.allowed_host():
            return self.respond(403, {'error': 'Same-origin requests only'})
        path = urlsplit(self.path).path
        if path not in ('/api/feedback', '/api/view-settings', '/api/advertising/request', '/api/bug-reports'):
            return self.respond(404, {'error': 'Unknown endpoint'})
        if path == '/api/bug-reports':
            if not same_origin(self.headers):
                return self.respond(403, {'error': 'Same-origin requests only'})
        elif self.headers.get('Origin') != 'http://' + self.headers.get('Host', ''):
            return self.respond(403, {'error': 'Same-origin requests only'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': 'JSON required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            limit = (4096 if path == '/api/view-settings' else advertising.MAX_REQUEST if path == '/api/advertising/request'
                     else MAX_REPORT_BODY if path == '/api/bug-reports' else MAX_BODY)
            if not 0 < length <= limit:
                message = 'Report exceeds the size limit' if path == '/api/bug-reports' else 'Comment exceeds size limit'
                return self.respond(413, {'error': message})
            self.connection.settimeout(15)
            body = self.rfile.read(length)
            if len(body) != length:
                raise ValueError('Incomplete request')
            data = json.loads(body, parse_constant=invalid_constant)
            if path == '/api/bug-reports':
                if self.server.bug_report_store is None:
                    return self.respond(503, {'error': 'Report storage is not available. Please retry later.'},
                                        {'Retry-After': '60'})
                identity = report_rate_limit_identity(self.client_address[0], self.headers,
                                                      self.server.trusted_proxies)
                if not self.server.bug_report_limiter.allow(identity):
                    return self.respond(429, {'error': 'Too many reports. Please try again later.'}, {'Retry-After': '3600'})
                report = validate_report(data)
                report_id = self.server.bug_report_store.save(report)
                return self.respond(201, {'id': report_id, 'saved': True})
            if path == '/api/advertising/request':
                if not advertising.configured():
                    return self.respond(503, {'error': 'Email delivery is not configured. Download your draft instead.'})
                return self.respond(200, advertising.send_request(data, atlas_data.catalog()['metrics']))
            if path == '/api/view-settings':
                return self.respond(200, save_settings(self.server.feedback_dir, data))
            png, sources = validate_payload(data)
            record, created = store_comment(self.server.feedback_dir, data, png, sources)
            self.respond(201 if created else 200, {'comment': record})
        except FileExistsError as error:
            if path == '/api/bug-reports':
                self.respond(503, {'error': 'Report storage is unavailable. Please retry.'}, {'Retry-After': '60'})
            else:
                self.respond(409, {'error': str(error)})
        except advertising.DeliveryUnavailable as error:
            self.respond(503, {'error': str(error)})
        except atlas_data.DatabaseUnavailable:
            self.respond(503, {'error': 'Indicators could not be validated. Keep the draft and retry.'})
        except (ValueError, KeyError, TypeError, AttributeError, binascii.Error) as error:
            self.respond(400, {'error': str(error)})
        except (OSError, TimeoutError) as error:
            if path == '/api/bug-reports':
                self.respond(503, {'error': 'Report storage is unavailable. Please retry.'}, {'Retry-After': '60'})
            else:
                self.respond(500, {'error': 'Save failed; keep the draft and retry'})


class AtlasHTTPServer(ThreadingHTTPServer):
    request_queue_size = 128
    daemon_threads = True


def create_server(port, feedback_dir, reports_dir=None, trusted_proxies=()):
    feedback_dir.mkdir(parents=True, exist_ok=True)
    server = AtlasHTTPServer(('127.0.0.1', port), Handler)
    server.feedback_dir = feedback_dir.resolve()
    server.bug_report_store = create_report_store(reports_dir, ROOT)
    server.bug_report_limiter = ReportRateLimiter()
    server.trusted_proxies = tuple(trusted_proxies)
    return server


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=4180)
    parser.add_argument('--feedback-dir', type=Path, default=ROOT.parent / 'feedback')
    parser.add_argument('--reports-dir', type=Path, help='Private, write-only bug report storage outside the served app tree')
    parser.add_argument('--trusted-proxy', action='append', default=[], metavar='IP_OR_CIDR',
                        help='Explicit trusted reverse proxy network for client rate limits; repeat as needed')
    args = parser.parse_args()
    server = create_server(args.port, args.feedback_dir, args.reports_dir,
                           trusted_proxies=trusted_proxy_networks(args.trusted_proxy))
    print(f'Atlas: http://127.0.0.1:{server.server_port}/ux/ | Bug reports: {"enabled" if args.reports_dir else "disabled"}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
