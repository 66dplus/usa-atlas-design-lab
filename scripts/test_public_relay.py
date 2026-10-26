"""Actual TCP relay -> actual private bug-report handler; no external services."""
import gzip
import http.client
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from preview_server import PreviewServer, PreviewHandler
from bug_reports import ReportRateLimiter, trusted_proxy_networks
from scripts.test_bug_reports import payload

spec = importlib.util.spec_from_file_location('permanent_public_relay', ROOT / 'deploy/public-relay/proxy.py')
relay = importlib.util.module_from_spec(spec)
spec.loader.exec_module(relay)


class CaptureHandler(PreviewHandler):
    def do_POST(self):
        self.server.observed_headers = dict(self.headers)
        super().do_POST()

    def log_message(self, *args):
        pass


class PublicRelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='atlas-relay-')
        root = Path(self.temp.name)
        self.sample = root / 'sample.json'
        self.sample.write_bytes(json.dumps({'sample': 'x' * 10000}).encode())
        self.backend = PreviewServer(('127.0.0.1', 0), {'/sample.json': self.sample},
                                     reports_dir=root / 'private-reports',
                                     trusted_proxies=trusted_proxy_networks(['127.0.0.1/32']))
        self.backend.RequestHandlerClass = CaptureHandler
        self.proxy = relay.Server(('127.0.0.1', 0), origin_host='127.0.0.1',
                                  origin_port=self.backend.server_port,
                                  origin_host_header=f'127.0.0.1:{self.backend.server_port}')
        self.threads = []
        for server in (self.backend, self.proxy):
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.threads.append(thread)

    def tearDown(self):
        for server in (self.proxy, self.backend):
            server.shutdown()
            server.server_close()
        for thread in self.threads:
            thread.join(3)
        self.temp.cleanup()

    def post(self, *, origin='https://usa-xray.online', fetch_site='same-origin', content_type='application/json', extra=None):
        headers = {'Host': 'usa-xray.online', 'Content-Type': content_type}
        if origin is not None:
            headers['Origin'] = origin
        if fetch_site is not None:
            headers['Sec-Fetch-Site'] = fetch_site
        headers.update(extra or {})
        connection = http.client.HTTPConnection('127.0.0.1', self.proxy.server_address[1], timeout=3)
        connection.request('POST', '/api/bug-reports', body=json.dumps(payload('unused')), headers=headers)
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        return response.status, json.loads(raw) if raw else None

    def test_real_saved_ack_and_only_selected_headers_cross_boundary(self):
        status, ack = self.post(extra={'X-Forwarded-For': '198.51.100.1, 127.0.0.1',
            'Cookie': 'synthetic=private', 'Authorization': 'Bearer synthetic',
            'Proxy-Authorization': 'synthetic', 'X-Unapproved': 'private',
            'Connection': 'keep-alive, X-Unapproved', 'Upgrade': 'websocket', 'TE': 'trailers'})
        self.assertEqual(status, 201)
        self.assertTrue(ack['saved'])
        self.assertEqual(UUID(ack['id']).version, 4)
        headers = {key.lower(): value for key, value in self.backend.observed_headers.items()}
        self.assertEqual(headers['host'], f'127.0.0.1:{self.backend.server_port}')
        self.assertEqual(headers['origin'], 'https://usa-xray.online')
        self.assertEqual(headers['content-type'], 'application/json')
        self.assertEqual(headers['sec-fetch-site'], 'same-origin')
        self.assertEqual(headers['x-forwarded-for'], '198.51.100.1, 127.0.0.1')
        self.assertEqual(headers['connection'], 'close')
        self.assertEqual(headers['accept-encoding'], 'identity')
        self.assertTrue(set(headers) <= {'host', 'origin', 'content-type', 'sec-fetch-site',
                                         'x-forwarded-for', 'connection', 'accept-encoding', 'content-length'})
        self.assertEqual({path.name for path in self.backend.bug_report_store.directory.iterdir()}, {ack['id'] + '.json'})

    def test_missing_cross_site_and_disallowed_origin_remain_forbidden(self):
        for values in ({'origin': None}, {'origin': 'https://elsewhere.test'},
                       {'fetch_site': 'cross-site'}, {'fetch_site': 'none'},
                       {'origin': 'https://usa-xray.online.evil.test'}):
            with self.subTest(values=values):
                self.assertEqual(self.post(**values)[0], 403)
        self.assertEqual(list(self.backend.bug_report_store.directory.iterdir()), [])

    def test_json_type_is_preserved_and_required(self):
        self.assertEqual(self.post(content_type='text/plain')[0], 415)
        self.assertEqual(self.post(content_type='application/json; charset=utf-8')[0], 201)

    def test_trusted_nginx_chain_produces_distinct_bounded_client_limits(self):
        self.backend.bug_report_limiter = ReportRateLimiter(limit=1)
        self.assertEqual(self.post(extra={'X-Forwarded-For': '198.51.100.1, 127.0.0.1'})[0], 201)
        self.assertEqual(self.post(extra={'X-Forwarded-For': '198.51.100.1'})[0], 429)
        self.assertEqual(self.post(extra={'X-Forwarded-For': '198.51.100.2'})[0], 201)

    def test_backend_never_trusts_client_chain_without_explicit_proxy_network(self):
        self.backend.trusted_proxies = ()
        self.backend.bug_report_limiter = ReportRateLimiter(limit=1)
        self.assertEqual(self.post(extra={'X-Forwarded-For': '198.51.100.1'})[0], 201)
        self.assertEqual(self.post(extra={'X-Forwarded-For': '198.51.100.2'})[0], 429)

    def test_duplicate_metadata_framing_and_invalid_chains_fail_before_upstream(self):
        for name, values in [('Origin', ['https://usa-xray.online', 'https://elsewhere.test']),
                             ('X-Forwarded-For', ['198.51.100.1', '198.51.100.2']),
                             ('Content-Length', ['0', '0']),
                             ('Transfer-Encoding', ['chunked']),
                             ('X-Forwarded-For', ['not-an-ip'])]:
            with self.subTest(header=name):
                connection = http.client.HTTPConnection('127.0.0.1', self.proxy.server_address[1], timeout=3)
                connection.putrequest('POST', '/api/bug-reports')
                for value in values:
                    connection.putheader(name, value)
                connection.endheaders()
                response = connection.getresponse()
                self.assertEqual(response.status, 400)
                response.read()
                connection.close()
        self.assertFalse(hasattr(self.backend, 'observed_headers'))

    def test_connection_nominated_origin_is_not_forwarded(self):
        self.assertEqual(self.post(extra={'Connection': 'Origin'})[0], 403)

    def test_real_static_gzip_response_preserves_exact_payload(self):
        connection = http.client.HTTPConnection('127.0.0.1', self.proxy.server_address[1], timeout=3)
        connection.request('GET', '/sample.json', headers={'Accept-Encoding': 'gzip'})
        response = connection.getresponse()
        raw = response.read()
        self.assertEqual(response.status, 200)
        self.assertEqual(response.getheader('Content-Encoding'), 'gzip')
        self.assertEqual(int(response.getheader('Content-Length')), len(raw))
        self.assertEqual(gzip.decompress(raw), self.sample.read_bytes())
        connection.close()
