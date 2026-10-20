"""National observations and table-defined metadata preserve native source facts."""
import unittest
from unittest.mock import patch

import atlas_data


def row(identifier, geography='state', value=1, **changes):
    return {'geo_id': identifier, 'geo_type': geography, 'value': value,
            'period': '2024', 'unit': 'source_defined', 'source': 'census_acs',
            'source_release': '2024-acs-acs5', 'source_url': 'https://www.census.gov/',
            'methodology_note': 'Native estimate', 'retrieved_at': '2026-09-28T00:00:00Z',
            **changes}


class SourceMetadataTests(unittest.TestCase):
    def test_published_nation_value_and_native_period_are_retained(self):
        rows = [row('06', value=39287377), row('US', 'nation', 334922499)]
        with patch.object(atlas_data, 'query', return_value=rows):
            data = atlas_data.observations('01.01:B01003_001E')
        self.assertEqual(data['period'], '2024')
        self.assertEqual(data['displayPeriod'], '2020–2024')
        self.assertEqual(data['sourceUnit'], 'source_defined')
        self.assertEqual(data['unit'], 'people')
        nation = next(item for item in data['observations'] if item['id'] == 'US')
        self.assertEqual((nation['value'], nation['geoType'], nation['sourceGeoId']),
                         (334922499, 'nation', 'US'))
        self.assertEqual(nation['methodologyNote'], 'Native estimate')

    def test_unknown_nation_identifier_does_not_become_the_us(self):
        with patch.object(atlas_data, 'query', return_value=[row('06'), row('CA', 'nation', 99)]):
            data = atlas_data.observations('01.01:B01003_001E')
        self.assertNotIn('US', [item['id'] for item in data['observations']])
        self.assertIn('CA', data['excludedGeographies'])

    def test_units_follow_table_values_not_words_in_the_title(self):
        money = atlas_data.presentation_metadata('02.01:B19013_001E', 'census_acs',
                                                 'source_defined', '2024', '2024-acs-acs5')
        households = atlas_data.presentation_metadata('02.09:B19001_017E', 'census_acs',
                                                      'source_defined', '2024', '2024-acs-acs5')
        rent = atlas_data.presentation_metadata('02.06:B25070_001E', 'census_acs',
                                                'source_defined', '2024', '2024-acs-acs5')
        self.assertEqual(money['unit'], 'USD')
        self.assertEqual(households['unit'], 'households')
        self.assertEqual(rent['unit'], 'renter-occupied housing units')
        self.assertEqual(households['unitDefinition']['variable'], 'B19001_017E')

    def test_unverified_release_or_variable_is_not_relabelled(self):
        for field, period, release in [('02.01:B19013_001E', '2023', '2023-acs-acs5'),
                                        ('02.01:B99999_001E', '2024', '2024-acs-acs5'),
                                        ('02.01:B19013_001E', '2024', '2024-acs-acs1')]:
            with self.subTest(field=field, release=release):
                result = atlas_data.presentation_metadata(field, 'census_acs', 'source_defined', period, release)
                self.assertEqual(result['unit'], 'source_defined')
                self.assertIsNone(result['displayPeriod'])

    def test_no_national_aggregate_is_synthesized(self):
        rows = [row('06', value=100), row('48', value=200)]
        with patch.object(atlas_data, 'query', return_value=rows):
            data = atlas_data.observations('01.01:B01003_001E')
        self.assertEqual([item['value'] for item in data['observations']], [100, 200])
        self.assertNotIn('US', [item['id'] for item in data['observations']])

    def test_duplicate_canonical_us_observations_are_rejected(self):
        rows = [row('US', 'nation'), row('US', 'nation')]
        with patch.object(atlas_data, 'query', return_value=rows):
            with self.assertRaises(atlas_data.DatabaseUnavailable):
                atlas_data.observations('01.01:B01003_001E')

    def test_non_acs_units_and_periods_remain_native(self):
        result = atlas_data.presentation_metadata('03.06:unemployment_rate', 'bls_laus',
                                                  '%', '2024-M12', 'BLS-LAUS-2024')
        self.assertEqual(result['unit'], '%')
        self.assertIsNone(result['displayPeriod'])
        self.assertEqual(atlas_data.presentation_metadata('07.01:amount', 'irs_soi',
                         'thousand_USD', '2023', 'IRS')['unit'], 'thousand USD')


if __name__ == '__main__':
    unittest.main()
