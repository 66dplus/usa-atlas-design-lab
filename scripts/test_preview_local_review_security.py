"""Local candidate data stays unavailable to forwarded and remote clients."""
import http.client
import threading
import unittest
from unittest.mock import patch

from preview_server import PreviewServer, local_review_client_allowed


class LocalReviewEndpointSecurityTests(unittest.TestCase):
    def setUp(self):
        self.server = PreviewServer(('127.0.0.1', 0), {})
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        connection.request('GET', path, headers={
            'Host': f'127.0.0.1:{self.server.server_port}', **(headers or {})})
        response = connection.getresponse()
        result = response.status, response.read()
        connection.close()
        return result

    def test_client_policy_rejects_remote_peer_and_forwarded_loopback(self):
        self.assertFalse(local_review_client_allowed('203.0.113.9', {}))
        self.assertFalse(local_review_client_allowed('127.0.0.1', {'X-Forwarded-For': '203.0.113.9'}))
        self.assertFalse(local_review_client_allowed('127.0.0.1', {'Forwarded': 'for=203.0.113.9'}))
        self.assertTrue(local_review_client_allowed('127.0.0.1', {}))

    def test_every_candidate_observation_endpoint_rejects_forwarded_requests_before_read(self):
        paths = (
            '/api/atlas/reader/v2/observations?dataset_id=unemployment&period_type=month&year=2025&geography_type=state',
            '/api/atlas/period-observations?field=03.06%3Aunemployment_rate&period_type=month&year=2025&month=1',
            '/api/atlas/unemployment-months?year=2025&geography_type=state&geography_id=06',
        )
        with patch('preview_server.atlas_data.reader_v2_mode', return_value='local_review'), \
             patch('preview_server.atlas_data.unemployment_period_observations') as period_read, \
             patch('preview_server.atlas_data.unemployment_month_series') as series_read, \
             patch('preview_server.atlas_data.reader_v2_observations') as candidate_read:
            for path in paths:
                with self.subTest(path=path):
                    self.assertEqual(self.request(path, {'X-Forwarded-For': '203.0.113.9'})[0], 404)
            period_read.assert_not_called()
            series_read.assert_not_called()
            candidate_read.assert_not_called()


if __name__ == '__main__':
    unittest.main()
