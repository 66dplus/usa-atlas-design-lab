"""Exercise local HTTP intake and the provider boundary without sending mail."""
import io
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import URLError
from urllib.request import Request, urlopen
from urllib.error import HTTPError

import advertising
from serve import create_server

METRICS = [{'id': 'employment', 'name': 'Employment', 'fieldId': 'employment'}]
ENV = {'RESEND_API_KEY': 'test-key', 'ATLAS_AD_FROM': 'Atlas <ads@example.com>', 'ATLAS_AD_TO': 'owner@example.com'}


def draft():
    return {'version': 1, 'requestId': 'da2a3c64-7c43-4b10-8bb9-a75660a86a03',
            'creative': {'format': 'banner', 'headline': 'Find your next place.',
                         'subtitle': 'Housing made simple', 'cta': 'Explore homes',
                         'url': 'https://example.com', 'theme': 'graphite',
                         'image': advertising.SAMPLE_IMAGE, 'imageArea': 50,
                         'imageZoom': 100, 'imagePosition': 50, 'speed': 'normal',
                         'indicators': ['employment'], 'devices': ['desktop', 'mobile']},
            'contact': {'name': 'Example advertiser', 'company': 'Example',
                        'email': 'advertiser@example.com', 'message': 'Test only'}}


class AdvertisingTests(unittest.TestCase):
    def test_provider_receives_fixed_recipient_creative_and_reply_to(self):
        seen = []
        def provider(request, timeout):
            seen.append(request)
            return io.BytesIO(b'{"id":"test-email"}')
        with patch.dict(os.environ, ENV, clear=True):
            for _ in range(2):
                self.assertEqual(advertising.send_request(draft(), METRICS, provider), {'id': 'test-email'})
        message = json.loads(seen[0].data)
        self.assertEqual(message['to'], ['owner@example.com'])
        self.assertEqual(message['reply_to'], 'advertiser@example.com')
        self.assertIn('Employment', message['text'])
        self.assertEqual([a['filename'] for a in message['attachments']], ['ad-request.json', 'example-photo.jpg'])
        self.assertEqual(seen[0].get_header('Idempotency-key'), seen[1].get_header('Idempotency-key'))
        self.assertEqual(seen[0].full_url, 'https://api.resend.com/emails')

    def test_invalid_input_never_reaches_provider(self):
        mutations = [('url', 'javascript:alert(1)'), ('indicators', ['missing']),
                     ('devices', []), ('image', 'data:image/png;base64,YWJj'),
                     ('imageArea', float('nan')), ('headline', 'x' * 71)]
        with patch.dict(os.environ, ENV, clear=True):
            for key, value in mutations:
                with self.subTest(key=key):
                    data = draft();data['creative'][key] = value
                    with self.assertRaises(ValueError):
                        advertising.send_request(data, METRICS, lambda *_args, **_kwargs: self.fail('Provider called'))

    def test_unconfirmed_delivery_is_explicit(self):
        def unavailable(*args, **kwargs):
            raise URLError('not connected')
        with patch.dict(os.environ, ENV, clear=True):
            with self.assertRaisesRegex(advertising.DeliveryUnavailable, 'not confirmed'):
                advertising.send_request(draft(), METRICS, unavailable)

    def test_catalog_indicator_without_observations_is_targetable(self):
        self.assertIsNotNone(advertising.validate(draft(), [{'id': 'employment', 'name': 'Employment'}]))
        with self.assertRaisesRegex(ValueError, 'catalog indicators'):
            advertising.validate(draft(), [{'id': 'employment', 'name': 'Employment', 'plannedState': 'proposed'}])

    def test_loopback_http_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            server = create_server(0, Path(directory))
            worker = threading.Thread(target=server.serve_forever, daemon=True);worker.start()
            base = f'http://127.0.0.1:{server.server_port}'
            try:
                with patch.dict(os.environ, {}, clear=True):
                    self.assertEqual(json.load(urlopen(base + '/api/advertising/config')), {'enabled': False})
                for origin in ['https://other.example', base]:
                    request = Request(base + '/api/advertising/request', json.dumps(draft()).encode(), headers={'Content-Type': 'application/json', 'Origin': origin})
                    with patch.dict(os.environ, {}, clear=True), self.assertRaises(HTTPError) as error:
                        urlopen(request)
                    self.assertEqual(error.exception.code, 403 if origin != base else 503)
                with patch.dict(os.environ, ENV, clear=True), patch('serve.atlas_data.catalog', return_value={'metrics': METRICS}), patch('serve.advertising.send_request', return_value={'id': 'http-test'}) as send:
                    request = Request(base + '/api/advertising/request', json.dumps(draft()).encode(), headers={'Content-Type': 'application/json', 'Origin': base})
                    self.assertEqual(json.load(urlopen(request)), {'id': 'http-test'})
                    send.assert_called_once()
            finally:
                server.shutdown();server.server_close();worker.join(timeout=3)


if __name__ == '__main__':
    unittest.main()
