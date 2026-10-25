"""Real HTTP integration tests; all writes stay in a temporary directory."""
import base64
import binascii
from concurrent.futures import ThreadPoolExecutor
import hashlib
import http.client
import json
from pathlib import Path
import struct
import tempfile
import threading
import unittest
from uuid import uuid4
import zlib

from serve import create_server, MAX_BODY
from view_settings import DEFAULTS


def png(width=80, height=80):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', binascii.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\xcc\xaa' * width) * height)) + chunk(b'IEND', b'')


class FeedbackIntegration(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='atlas-feedback-http-')
        self.folder = Path(self.temp.name)
        self.start()

    def start(self):
        self.server = create_server(0, self.folder)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def tearDown(self):
        self.stop()
        self.temp.cleanup()

    def payload(self):
        return {'id': str(uuid4()), 'text': 'Check <script>alert(1)</script> and Cyrillic: карта',
                'image': 'data:image/png;base64,' + base64.b64encode(png()).decode(),
                'target': {'component': 'inspector', 'selector': '#inspector > h2', 'styleSelector': '.inspector'},
                'context': {'url': f'http://127.0.0.1:{self.port}/ux/?concept=explorer', 'view': {'selected': '06'}},
                'viewport': {'width': 800, 'height': 600}, 'point': {'x': 120, 'y': 120},
                'region': {'x': 100, 'y': 100, 'width': 80, 'height': 80}}

    def request(self, method, path, data=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.port, timeout=5)
        head = {'Content-Type': 'application/json', 'Origin': f'http://127.0.0.1:{self.port}'}
        head.update(headers or {})
        conn.request(method, path, json.dumps(data).encode() if data is not None else None, head)
        response = conn.getresponse()
        body = response.read()
        status = response.status
        conn.close()
        return status, body

    def test_persistence_sources_image_and_restart(self):
        data = self.payload()
        status, body = self.request('POST', '/api/feedback', data)
        self.assertEqual(status, 201, body)
        record = json.loads(body)['comment']
        directory = self.folder / data['id']
        self.assertEqual(set(p.name for p in directory.iterdir()), {'comment.json', 'comment.md', 'capture.png'})
        self.assertEqual((directory / 'capture.png').read_bytes(), png())
        self.assertEqual(record['imageSha256'], hashlib.sha256(png()).hexdigest())
        self.assertEqual(record['sources'][0]['symbol'], 'renderInspector')
        relative_source = record['sources'][0]['file'].removeprefix('usa-atlas-design-lab/')
        source = Path(__file__).resolve().parents[1] / relative_source
        self.assertIn('function renderInspector(', source.read_text().splitlines()[record['sources'][0]['line'] - 1])
        self.stop()
        self.start()
        status, body = self.request('GET', '/api/feedback')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['comments'][0]['text'], data['text'])
        status, image = self.request('GET', f'/api/feedback/{data["id"]}/capture.png')
        self.assertEqual((status, image), (200, png()))

    def test_concurrent_retry_is_one_record_and_conflict_never_overwrites(self):
        data = self.payload()
        with ThreadPoolExecutor(max_workers=5) as pool:
            responses = list(pool.map(lambda _: self.request('POST', '/api/feedback', data), range(5)))
        self.assertEqual(sorted(code for code, _ in responses), [200, 200, 200, 200, 201])
        self.assertEqual(len(list(self.folder.iterdir())), 1)
        data['text'] = 'Different content'
        self.assertEqual(self.request('POST', '/api/feedback', data)[0], 409)
        self.assertNotEqual(json.loads((self.folder / data['id'] / 'comment.json').read_text())['text'], data['text'])

    def test_validation_origin_paths_and_limits(self):
        data = self.payload()
        for headers, code in [({'Origin': 'https://attacker.example'}, 403), ({'Host': 'attacker.example'}, 403), ({'Content-Type': 'text/plain'}, 415), ({'Content-Length': str(MAX_BODY + 1)}, 413)]:
            self.assertEqual(self.request('POST', '/api/feedback', data, headers)[0], code)
        self.assertEqual(self.request('GET', '/api/feedback/../../comment.json')[0], 404)
        for change in [{'id': '../../escape'}, {'text': ''}, {'image': 'data:image/png;base64,eA=='}, {'target': {'component': '../../secrets', 'selector': 'body'}}, {'region': {'x': 700, 'y': 500, 'width': 80, 'height': 80}}, {'context': {'url': 'https://example.com/'}}]:
            invalid = {**data, **change}
            self.assertEqual(self.request('POST', '/api/feedback', invalid)[0], 400, change)
        self.assertEqual(list(self.folder.iterdir()), [])

    def test_unknown_api_and_source_keys_fail_closed(self):
        self.assertEqual(self.request('POST', '/api/other', self.payload())[0], 404)
        self.assertEqual(self.request('GET', '/api/feedback', headers={'Host': 'foreign.example'})[0], 403)
        status, _ = self.request('GET', '/ux/')
        self.assertEqual(status, 301)
        status, body = self.request('GET', '/united-states/unemployment')
        self.assertEqual(status, 200)
        self.assertIn(b'<link rel="canonical"', body)

    def test_settings_defaults_save_restart_and_rejection(self):
        status, body = self.request('GET', '/api/view-settings')
        self.assertEqual(status, 200)
        self.assertIsNone(json.loads(body)['savedAt'])
        chosen = {'version': 1, 'settings': {**DEFAULTS['settings'], 'tilt': 42, 'duration': 1200, 'hover': 3.5}}
        status, body = self.request('POST', '/api/view-settings', chosen)
        self.assertEqual(status, 200, body)
        saved = (self.folder / 'view-settings.json').read_bytes()
        for change in [{'tilt': 56}, {'rotation': 1}, {'hover': float('nan')}, {'cameraSide': 'west'}, {'minZoom': 3}, {'unknown': 1}]:
            invalid = {'version': 1, 'settings': {**chosen['settings'], **change}}
            self.assertEqual(self.request('POST', '/api/view-settings', invalid)[0], 400)
            self.assertEqual((self.folder / 'view-settings.json').read_bytes(), saved)
        self.assertEqual(self.request('POST', '/api/view-settings', chosen, {'Origin': 'https://foreign.example'})[0], 403)
        self.stop()
        self.start()
        self.assertEqual(json.loads(self.request('GET', '/api/view-settings')[1])['settings'], chosen['settings'])
        self.assertEqual(json.loads(self.request('GET', '/api/feedback')[1])['comments'], [])


if __name__ == '__main__':
    unittest.main()
