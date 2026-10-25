"""Static revalidation saves transfer while new builds and data stay fresh."""
import gzip
import http.client
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from preview_server import PreviewServer


class PreviewCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.asset = self.root / 'icon.png'
        self.asset.write_bytes(b'original pixels' * 500)
        self.index = self.root / 'index.html'
        self.index.write_text('current UI')
        self.server = PreviewServer(('127.0.0.1', 0), {'/ux/icon.png': self.asset, '/ux/': self.index})
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, **headers):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        connection.request('GET', path, headers={'Host': f'127.0.0.1:{self.server.server_port}', **headers})
        response = connection.getresponse()
        result = response.status, dict(response.getheaders()), response.read()
        connection.close()
        return result

    def test_unchanged_static_asset_revalidates_without_transferring_its_body(self):
        status, headers, body = self.request('/ux/icon.png')
        self.assertEqual(status, 200)
        self.assertEqual(body, self.asset.read_bytes())
        self.assertEqual(headers['Cache-Control'], 'public, max-age=0, must-revalidate')
        status, revalidated, body = self.request('/ux/icon.png', **{'If-None-Match': headers['ETag']})
        self.assertEqual((status, body), (304, b''))
        self.assertNotIn('Content-Length', revalidated)
        self.assertEqual(revalidated['Vary'], 'Accept-Encoding')

    def test_new_bytes_at_the_same_url_are_never_hidden_by_an_old_validator(self):
        _, headers, _ = self.request('/ux/icon.png')
        self.asset.write_bytes(b'new approved pixels')
        status, updated, body = self.request('/ux/icon.png', **{'If-None-Match': headers['ETag']})
        self.assertEqual((status, body), (200, b'new approved pixels'))
        self.assertNotEqual(updated['ETag'], headers['ETag'])

    def test_weak_strong_and_list_validators_use_http_get_matching(self):
        _, headers, _ = self.request('/ux/icon.png')
        for validator in (headers['ETag'].removeprefix('W/'), '"unrelated", ' + headers['ETag'], '*'):
            self.assertEqual(self.request('/ux/icon.png', **{'If-None-Match': validator})[0], 304)

    def test_compressed_response_keeps_the_same_semantic_validator(self):
        _, plain, _ = self.request('/ux/icon.png')
        status, compressed, body = self.request('/ux/icon.png', **{'Accept-Encoding': 'gzip'})
        self.assertEqual(status, 200)
        self.assertEqual(gzip.decompress(body), self.asset.read_bytes())
        self.assertEqual(compressed['ETag'], plain['ETag'])

    def test_html_and_live_api_remain_no_store(self):
        _, html, _ = self.request('/ux/')
        self.assertEqual(html['Cache-Control'], 'no-store')
        self.assertNotIn('ETag', html)
        with patch('preview_server.atlas_data.catalog', return_value={'metrics': []}):
            _, api, _ = self.request('/api/atlas/catalog')
        self.assertEqual(api['Cache-Control'], 'no-store')
        self.assertNotIn('ETag', api)


if __name__ == '__main__':
    unittest.main()
