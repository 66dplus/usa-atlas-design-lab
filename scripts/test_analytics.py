"""Telemetry checks at configuration, Umami pagination and aggregate boundaries."""
import os
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch
from analytics_config import public_config
from analytics_api import UmamiAPI
from analytics_report import aggregate
from setup_analytics import initialize_secrets


class AnalyticsTests(unittest.TestCase):
    def test_public_configuration_is_opt_in_and_never_returns_secrets(self):
        with patch.dict(os.environ, {'UMAMI_ADMIN_PASSWORD': 'private'}, clear=True):
            self.assertEqual(public_config(), {'enabled': False})
        values = {'ATLAS_ANALYTICS_ENABLED': '1', 'ATLAS_ANALYTICS_URL': 'http://127.0.0.1:4300',
                  'ATLAS_ANALYTICS_WEBSITE_ID': '11111111-1111-4111-8111-111111111111', 'UMAMI_ADMIN_PASSWORD': 'private'}
        with patch.dict(os.environ, values, clear=True):
            self.assertEqual(set(public_config()), {'enabled', 'websiteId', 'scriptUrl'})
            for origin in ('https://user:secret@example.com', 'https://example.com/path', 'javascript:alert(1)'):
                os.environ['ATLAS_ANALYTICS_URL'] = origin
                with self.assertRaises(ValueError):
                    public_config()
            os.environ['ATLAS_ANALYTICS_URL'] = values['ATLAS_ANALYTICS_URL']
            os.environ['ATLAS_ANALYTICS_WEBSITE_ID'] = 'missing'
            with self.assertRaises(ValueError):
                public_config()

    def test_secrets_are_private_and_existing_values_are_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'private' / 'analytics.env'
            initialize_secrets(path)
            original = path.read_bytes()
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            initialize_secrets(path)
            self.assertEqual(path.read_bytes(), original)

    def test_pagination_preserves_every_event_once(self):
        rows = [{'eventId': str(i), 'propertyKeys': ['indicator_id'], 'propertyValues': ['rent']} for i in range(205)]
        api = UmamiAPI('http://localhost')
        calls = []
        def request(path, params):
            calls.append(params['page'])
            offset = (params['page'] - 1) * 100
            return {'data': rows[offset:offset + 100], 'count': len(rows)}
        api.request = request
        self.assertEqual(len(list(api.event_rows('website', 'atlas_indicator_select', 0, 1))), 205)
        self.assertEqual(calls, [1, 2, 3])

    def test_reverse_pairs_county_geography_and_attention(self):
        base = {'indicator_id': 'rent', 'place_type': 'county', 'place_id': '06075', 'state_id': '06',
                'comparison': 'places', 'other_indicator_id': 'rent', 'other_place_type': 'state', 'other_place_id': '48',
                'pair_key': 'county:06075|state:48', 'exploration_id': 'context-1'}
        reverse = {**base, 'place_type': 'state', 'place_id': '48', 'state_id': '48', 'other_place_type': 'county', 'other_place_id': '06075'}
        rows = [('initial_view', base), ('indicator_select', base), ('place_select', {**reverse, 'selected_place_id': '06075', 'selected_place_type': 'county'}),
                ('compare_view', base), ('compare_view', reverse), ('active_time', {**base, 'active_ms': '15000'}),
                ('active_time', {**base, 'active_ms': '10000'}), ('active_time', {**reverse, 'active_ms': '5000', 'exploration_id': 'context-2'}),
                ('compare_view', {**base, 'comparison': 'metrics'}),
                ('active_time', {**base, 'comparison': 'metrics', 'other_indicator_id': 'income', 'active_ms': '1000'})]
        result = aggregate(rows)
        self.assertEqual(result['indicators'], {'rent': 1})
        self.assertEqual(result['places'], {'county:06075': 1})
        self.assertEqual(result['comparisons'], {'county:06075|state:48': 2})
        self.assertEqual(result['activeTimeByIndicator']['rent'], {'totalMs': 30000, 'explorations': 2, 'averageMs': 15000})
        self.assertEqual(result['activeTimeByIndicator']['income|rent']['totalMs'], 1000)
        self.assertEqual(result['activeTimeByComparison'][base['pair_key']]['totalMs'], 30000)
        self.assertNotIn('sessionId', str(result))


if __name__ == '__main__':
    unittest.main()
