"""Actual read-only PostgreSQL and HTTP checks; writes only to a temporary feedback folder."""
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.parse import quote

import atlas_data
from serve import create_server


class AtlasDataIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='atlas-data-http-')
        cls.server = create_server(0, Path(cls.temp.name))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, method='GET', headers=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=15)
        connection.request(method, path, headers=headers or {})
        response = connection.getresponse()
        body = response.read()
        result = response.status, body, dict(response.getheaders())
        connection.close()
        return result

    def series(self, field):
        code, body, _ = self.request('/api/atlas/observations?field=' + quote(field))
        self.assertEqual(code, 200, body)
        return json.loads(body)

    def test_catalog_retains_uncollected_and_other_geographies(self):
        code, body, _ = self.request('/api/atlas/catalog')
        self.assertEqual(code, 200, body)
        data = json.loads(body)
        self.assertEqual(data['catalogCount'], 84)
        self.assertEqual(data['publishedCatalogCount'], 81)
        self.assertEqual(len({m['catalogId'] for m in data['metrics']}), 84)
        self.assertEqual(len({m['id'] for m in data['metrics']}), len(data['metrics']))
        by_id = {m['id']: m for m in data['metrics']}
        self.assertEqual(by_id['unemployment']['fieldId'], '03.06:unemployment_rate')
        self.assertEqual(by_id['adjusted-gross-income-agi']['geographies'], ['zip'])
        self.assertEqual(by_id['pm2-5']['geographies'], ['monitor'])
        self.assertIsNone(by_id['pm2-5']['fieldId'])
        self.assertIsNone(by_id['median-household-income']['fieldId'])
        self.assertTrue(by_id['unemployment']['countySupported'])
        self.assertFalse(by_id['murders']['countySupported'])
        for identifier in ('data-centers', 'residential-water-price', 'billion-dollar-companies'):
            self.assertEqual(by_id[identifier]['plannedState'], 'proposed')
            self.assertIsNone(by_id[identifier]['fieldId'])
            self.assertEqual(by_id[identifier]['observations'], 0)
        self.assertIsNotNone(by_id['electricity-price']['fieldId'])

    def test_real_source_samples_and_parameter_changes(self):
        cases = [('03.06:unemployment_rate', '06', 5.4),
                 ('03.06:unemployment_rate', '06037', 5.5),
                 ('03.06:unemployment_rate', '48', 4.1),
                 ('02.10', '06', 110.72), ('04.01', '06', 1915),
                 ('05.14', '06037', 26.4), ('08.05:sector_ALL', '06', 27.04),
                 ('09.01', '06037', 0.879006267), ('09.02:percent', '06037', 6.531888485)]
        cache = {}
        for field, identifier, expected in cases:
            with self.subTest(field=field, geo=identifier):
                if field not in cache:
                    cache[field] = self.series(field)
                data = cache[field]
                row = next(r for r in data['observations'] if r['id'] == identifier)
                self.assertEqual(row['value'], expected)
                self.assertTrue(row['sourceUrl'].startswith('https://'))
                self.assertTrue(row['retrievedAt'])
        self.assertEqual(cache['03.06:unemployment_rate']['period'], '2024-M12')
        self.assertEqual(cache['09.01']['unit'], 'per 1,000 people')
        self.assertEqual(cache['09.01']['sourceUnit'], 'source_defined')
        self.assertEqual(cache['09.02:percent']['unit'], '%')

    def test_state_only_and_geographic_identifiers(self):
        data = self.series('04.01')
        self.assertTrue(all(r['geoType'] == 'state' and len(r['id']) == 2 for r in data['observations']))
        self.assertIn('PR', data['excludedGeographies'])
        data = self.series('02.10')
        self.assertEqual(next(r['value'] for r in data['observations'] if r['id'] == 'US'), 100)
        self.assertEqual(atlas_data.canonical_geo('bea_rpp', 'state', '06037'), None)
        self.assertEqual(atlas_data.canonical_geo('irs_soi', 'zip', '06037'), None)
        self.assertEqual(atlas_data.canonical_geo('epa_airdata', 'monitor', '06037'), None)

    def test_query_transaction_is_actually_read_only(self):
        self.assertEqual(atlas_data.query("SELECT to_json(current_setting('transaction_read_only'))"), 'on')
        with patch.dict(os.environ, {'PGDATABASE': 'postgres'}):
            self.assertEqual(atlas_data.query('SELECT to_json(current_database())'), 'usa_atlas')

    def test_invalid_input_unknown_series_and_write_routes(self):
        paths = ['/api/atlas/observations', '/api/atlas/observations?field=03.06&field=04.01',
                 '/api/atlas/observations?field=' + quote("03.06'; DROP SCHEMA usa_atlas; --"),
                 '/api/atlas/catalog?unexpected=yes']
        for path in paths:
            with self.subTest(path=path):
                self.assertEqual(self.request(path)[0], 400)
        self.assertEqual(self.request('/api/atlas/observations?field=99.99')[0], 404)
        self.assertEqual(self.request('/api/atlas/catalog', headers={'Host': 'foreign.example'})[0], 403)
        origin = f'http://127.0.0.1:{self.server.server_port}'
        self.assertEqual(self.request('/api/atlas/catalog', 'POST', {'Origin': origin})[0], 404)

    def test_connection_failure_is_explicit_and_client_safe(self):
        # Only this test process's child psql gets an unreachable port, not the owner's database.
        with patch.dict(os.environ, {'PGHOST': '127.0.0.1', 'PGPORT': '1'}):
            code, body, _ = self.request('/api/atlas/observations?field=03.06')
        self.assertEqual(code, 503)
        self.assertIn(b'PostgreSQL is unavailable', body)
        self.assertNotIn(b'psql:', body)

    def test_local_sources_do_not_reuse_a_future_cached_revision(self):
        code, body, headers = self.request('/ux/app.js', headers={'If-Modified-Since': 'Wed, 01 Jan 2031 00:00:00 GMT'})
        self.assertEqual(code, 200)
        self.assertIn(b'createDataStore', body)
        self.assertEqual(headers['Cache-Control'], 'no-store')


if __name__ == '__main__':
    unittest.main()
