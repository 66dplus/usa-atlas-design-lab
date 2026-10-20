"""Mocked compatibility checks for the legacy and v2 PostgreSQL catalogs."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch

import atlas_data


ROOT = Path(atlas_data.ROOT)
LEGACY = json.loads((ROOT / 'ux/catalog.json').read_text())['metrics']
V2 = json.loads((ROOT / 'ux/catalog-v2.json').read_text())


def catalog_payload(extra_count=6, *, unknown=False, loaded=False):
    rows = []
    legacy_fields = {item['catalogId']: item['catalogLabel'] for item in V2['parentFields']
                     if item['catalogId'] not in {metric['catalogId'] for metric in V2['metrics']}}
    for field_id, label in legacy_fields.items():
        metric = next(metric for metric in LEGACY if metric['name'] == label)
        rows.append({'catalog_field_id': field_id, 'catalog_label': metric['name'],
                     'planned_state': 'run_now', 'contract': {}, 'rows': 0, 'geographies': []})
    for metric in V2['metrics'][:extra_count]:
        rows.append({'catalog_field_id': metric['catalogId'], 'catalog_label': metric['catalogLabel'],
                     'planned_state': metric['plannedState'],
                     'contract': {'catalog_source': metric['catalogSource'],
                                  'catalog_note': metric['catalogNote']},
                     'rows': 0, 'geographies': []})
    if unknown:
        rows.append({'catalog_field_id': '99.99', 'catalog_label': 'Unrecognized parent',
                     'planned_state': 'unknown', 'contract': {}, 'rows': 0, 'geographies': []})
    series = []
    if loaded:
        for suffix in ('all-cancer', 'hiv-new', 'under-18', 'county-detail', 'state-detail'):
            series.append({'catalog_field_id': '11.01', 'field_id': '11.01:' + suffix,
                           'state_supported': True, 'county_supported': suffix == 'county-detail'})
        for suffix in ('estimate', 'count', 'share', 'mean', 'median'):
            series.append({'catalog_field_id': '07.02', 'field_id': '07.02:' + suffix,
                           'state_supported': True, 'county_supported': False})
        rows[-3]['rows'] = 5
        rows[-3]['geographies'] = ['state', 'county']
    return {'fields': rows, 'series': series}


class CatalogV2Tests(unittest.TestCase):
    def run_catalog(self, payload):
        with patch.object(atlas_data, 'query', return_value=payload):
            return atlas_data.catalog()

    def test_legacy_81_keeps_the_three_proposals(self):
        result = self.run_catalog(catalog_payload(extra_count=0))
        self.assertEqual((result['catalogCount'], result['publishedCatalogCount']), (84, 81))
        by_id = {metric['id']: metric for metric in result['metrics']}
        for identifier in ('data-centers', 'residential-water-price', 'billion-dollar-companies'):
            self.assertEqual(by_id[identifier]['plannedState'], 'proposed')
        self.assertEqual(len({metric['catalogId'] for metric in result['metrics']}), 84)

    def test_v2_87_promotes_proposals_and_does_not_duplicate_them(self):
        result = self.run_catalog(catalog_payload())
        self.assertEqual((result['catalogCount'], result['publishedCatalogCount']), (87, 87))
        by_id = {metric['id']: metric for metric in result['metrics']}
        self.assertEqual(len(result['metrics']), 87)
        for identifier in ('data-centers', 'residential-water-price', 'billion-dollar-companies'):
            self.assertEqual(by_id[identifier]['catalogId'], next(
                m['catalogId'] for m in V2['metrics'] if m['id'] == identifier))
            self.assertNotEqual(by_id[identifier]['plannedState'], 'proposed')
        self.assertEqual({m['catalogId'] for m in result['metrics'] if m['catalogId'].startswith('11.')},
                         {'11.01', '11.02', '11.03'})

    def test_partial_or_unknown_extra_parent_sets_are_rejected(self):
        for payload in (catalog_payload(extra_count=5), catalog_payload(unknown=True)):
            with self.subTest(parent_count=len(payload['fields'])):
                with self.assertRaises(atlas_data.DatabaseUnavailable):
                    self.run_catalog(payload)

    def test_loaded_v2_series_use_db_availability_and_contract_metadata(self):
        result = self.run_catalog(catalog_payload(loaded=True))
        loaded = [m for m in result['metrics'] if m['catalogId'] == '11.01']
        self.assertEqual(len(loaded), 5)
        self.assertTrue(all(m['availability'] == 'loaded' for m in loaded))
        first = next(m for m in loaded if m['fieldId'] == '11.01:all-cancer')
        definition = next(m for m in V2['metrics'] if m['catalogId'] == '11.01')
        self.assertEqual(first['catalogLabel'], definition['catalogLabel'])
        self.assertEqual(first['catalogSource'], definition['catalogSource'])
        self.assertEqual(first['catalogNote'], definition['catalogNote'])
        self.assertEqual(first['contractUnit'], 'cases')

    def test_medical_placeholders_match_the_v2_contract_metadata(self):
        result = self.run_catalog(catalog_payload())
        by_id = {m['id']: m for m in result['metrics']}
        expected = {
            'all-cancer-new-cases': ('11.01', 'cases', 'actual calendar-year count of new all-cancer cases'),
            'new-hiv-diagnoses': ('11.02', 'diagnoses', 'actual calendar-year count of new HIV diagnoses'),
            'deaths-under-18': ('11.03', 'deaths', 'actual calendar-year count of deaths at age <18'),
        }
        for identifier, (catalog_id, unit, note) in expected.items():
            metric = by_id[identifier]
            self.assertEqual(metric['catalogId'], catalog_id)
            self.assertEqual(metric['contractUnit'], unit)
            self.assertEqual(metric['note'], note)
            self.assertEqual(metric['source'], 'Pending review')

    def test_five_07_02_series_use_the_generic_series_label(self):
        result = self.run_catalog(catalog_payload(loaded=True))
        metrics = [m for m in result['metrics'] if (m.get('fieldId') or '').startswith('07.02:')]
        self.assertEqual(len(metrics), 5)
        self.assertTrue(all(m['name'].startswith('High-income taxpayers / returns · ') for m in metrics))
        self.assertFalse(any('net worth' in m['name'].lower() for m in metrics))


if __name__ == '__main__':
    unittest.main()
