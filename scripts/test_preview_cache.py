"""Static revalidation saves transfer while new builds and data stay fresh."""
import gzip
import http.client
from pathlib import Path
import socket
import tempfile
import threading
import time
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

    def test_slow_active_reader_gets_complete_response_past_scaled_request_timeout(self):
        # Deterministic transport bytes exercise the real reply() socket write;
        # their contents carry no application or data-source meaning.
        body = bytes(range(256)) * 8192
        asset = self.root / 'slow-reader.bin'
        asset.write_bytes(body)
        server = PreviewServer(('127.0.0.1', 0), {'/slow-reader.bin': asset})
        server.request_timeout = 0.2  # Scale the production 10 second timeout for this check.
        server.response_write_timeout = 1.0
        original_get_request = server.get_request

        def small_send_buffer():
            connection, address = original_get_request()
            connection.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 4096)
            return connection, address

        server.get_request = small_send_buffer
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = socket.create_connection(server.server_address, timeout=5)
        client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
        client.sendall((f'GET /slow-reader.bin HTTP/1.1\r\nHost: 127.0.0.1:{server.server_port}\r\n'
                        'Connection: close\r\n\r\n').encode())
        response = http.client.HTTPResponse(client)
        try:
            response.begin()
            self.assertEqual(response.status, 200)
            self.assertEqual(int(response.getheader('Content-Length')), len(body))
            received = bytearray()
            start = time.monotonic()
            while True:
                chunk = response.read(8192)
                if not chunk:
                    break
                received.extend(chunk)
                time.sleep(0.001)
            elapsed = time.monotonic() - start
            self.assertGreater(elapsed, server.request_timeout)
            self.assertEqual(bytes(received), body)
        finally:
            client.close()
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_stalled_reader_is_closed_within_bounded_response_timeout(self):
        body = bytes(range(256)) * 8192
        asset = self.root / 'stalled-reader.bin'
        asset.write_bytes(body)
        server = PreviewServer(('127.0.0.1', 0), {'/stalled-reader.bin': asset})
        server.request_timeout = 0.2
        server.response_write_timeout = 0.4
        original_get_request = server.get_request

        def small_send_buffer():
            connection, address = original_get_request()
            connection.setsockopt(socket.SOL_SOCKET, socket.SO_SNDBUF, 4096)
            return connection, address

        server.get_request = small_send_buffer
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = socket.create_connection(server.server_address, timeout=5)
        client.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 4096)
        client.sendall((f'GET /stalled-reader.bin HTTP/1.1\r\nHost: 127.0.0.1:{server.server_port}\r\n'
                        'Connection: close\r\n\r\n').encode())
        response = http.client.HTTPResponse(client)
        try:
            response.begin()
            self.assertEqual(int(response.getheader('Content-Length')), len(body))
            start = time.monotonic()
            time.sleep(server.response_write_timeout + 0.1)
            with self.assertRaises(http.client.IncompleteRead) as truncated:
                response.read()
            elapsed = time.monotonic() - start
            self.assertLess(elapsed, 2)
            self.assertEqual(truncated.exception.partial, body[:len(truncated.exception.partial)])
            self.assertLess(len(truncated.exception.partial), len(body))
        finally:
            client.close()
            server.shutdown()
            server.server_close()
            thread.join(2)

    def test_incomplete_request_headers_keep_their_separate_read_timeout(self):
        server = PreviewServer(('127.0.0.1', 0), {})
        server.request_timeout = 0.2
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        client = socket.create_connection(server.server_address, timeout=2)
        client.sendall((f'GET / HTTP/1.1\r\nHost: 127.0.0.1:{server.server_port}\r\n'
                        'X-Incomplete:').encode())
        try:
            start = time.monotonic()
            self.assertEqual(client.recv(1), b'')
            self.assertLess(time.monotonic() - start, 1)
        finally:
            client.close()
            server.shutdown()
            server.server_close()
            thread.join(2)


if __name__ == '__main__':
    unittest.main()
