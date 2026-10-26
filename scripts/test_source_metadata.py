"""National observations and table-defined metadata preserve native source facts."""
import json
from pathlib import Path
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
    def test_sex_ratio_uses_matching_2024_acs_components(self):
        captured = {}

        def query_components(sql, variables, **kwargs):
            captured.update(sql=sql, variables=variables)
            self.assertIn("o.period=ANY(string_to_array(:'periods',',')::text[])", sql)
            # The 2023 male estimate is deliberately different. The adapter must
            # select the male and female components from the same ACS release.
            available = {
                ('01.03:B01001_002E', '2023'): 40,
                ('01.03:B01001_002E', '2024'): 50,
                ('01.03:B01001_026E', '2024'): 100,
            }
            periods = set(variables['periods'].split(','))
            male = next((value for (field, period), value in available.items()
                         if field == variables['f0'] and period in periods), None)
            female = next((value for (field, period), value in available.items()
                           if field == variables['f1'] and period in periods), None)
            return [{'geo_id': '06', 'geo_type': 'state', 'unit': 'persons',
                     'source_url': 'https://www.census.gov/',
                     'methodology_note': 'ACS estimate', 'source_release': '2024-acs-acs5',
                     'c0': male, 's0': 'census_acs', 'r0': '2024-acs-acs5',
                     'c1': female, 's1': 'census_acs', 'r1': '2024-acs-acs5'}]

        with patch.object(atlas_data, 'query', side_effect=query_components):
            data = atlas_data.observations('01.03:derived')

        self.assertEqual(captured['variables']['fields'],
                         '01.03:B01001_002E,01.03:B01001_026E')
        self.assertEqual(captured['variables']['periods'], '2024')
        self.assertEqual(data['period'], '2024')
        self.assertEqual(data['displayPeriod'], '2020–2024')
        self.assertEqual(data['sourceRelease'], 'Census ACS 2024')
        california = next(item for item in data['observations'] if item['id'] == '06')
        self.assertEqual(california, {
            'id': '06', 'value': 50, 'geoType': 'state', 'sourceGeoId': '06'})

    def test_rate_metadata_matches_retained_source_periods(self):
        contract = json.loads((Path(atlas_data.ROOT) / 'ux/metric-definitions.json').read_text())
        by_id = {metric['id']: metric for metric in contract['metrics']}
        self.assertEqual(by_id['murders']['rateMetadata']['denominatorPeriod'], '2024')
        self.assertIn('state-only', by_id['new-hiv-diagnoses']['method'])
        self.assertIn('no US or county value is inferred', by_id['new-hiv-diagnoses']['method'])
        self.assertIn('state-only', by_id['deaths-under-18']['method'])
        self.assertIn('no US or county value is inferred', by_id['deaths-under-18']['method'])

    def test_state_only_hiv_and_child_death_rates_do_not_emit_us(self):
        cases = (
            ('11.02:derived', '11.02', 'cdc_atlasplus', 10, 100000, 10),
            ('11.03:derived', '11.03', 'cdc_wonder', 5, 100000, 5),
        )
        for public_field, numerator_field, numerator_source, numerator, population, expected in cases:
            with self.subTest(field=public_field):
                def query_components(sql, variables, **kwargs):
                    self.assertIn("o.period=ANY(string_to_array(:'periods',',')::text[])", sql)
                    self.assertEqual(variables['fields'],
                                     numerator_field + ',01.01:pep_population_' +
                                     ('age_13_plus' if numerator_field == '11.02' else 'under_18'))
                    self.assertEqual(variables['periods'], '2024')
                    return [{
                        'geo_id': '06', 'geo_type': 'state', 'unit': 'persons',
                        'source_url': 'https://example.test/source',
                        'methodology_note': 'State-only fixture',
                        'source_release': 'state-only-fixture',
                        'c0': numerator, 's0': numerator_source, 'r0': 'numerator-fixture-2024',
                        'c1': population, 's1': 'census_acs', 'r1': 'pep-fixture-2024',
                    }]

                with patch.object(atlas_data, 'query', side_effect=query_components):
                    data = atlas_data.observations(public_field)

                self.assertEqual(data['observations'], [{
                    'id': '06', 'value': expected, 'geoType': 'state', 'sourceGeoId': '06'}])
                self.assertNotIn('US', [item['id'] for item in data['observations']])

    def test_published_nation_value_and_native_period_are_retained(self):
        rows = [row('06', value=39287377), row('US', 'nation', 334922499)]
        with patch.object(atlas_data, 'query', return_value=rows):
            data = atlas_data.observations('01.01:B01003_001E')
        self.assertEqual(data['period'], '2024')
        self.assertEqual(data['displayPeriod'], '2020–2024')
        # The normalized contract publishes the table unit, not the stored placeholder.
        self.assertEqual(data['sourceUnit'], 'people')
        self.assertEqual(data['unit'], 'people')
        nation = next(item for item in data['observations'] if item['id'] == 'US')
        self.assertEqual((nation['value'], nation['geoType'], nation['sourceGeoId']),
                         (334922499, 'nation', 'US'))
        # A normalized series publishes the reviewed method instead of the stored note.
        contract = json.loads((Path(atlas_data.ROOT) / 'ux/metric-definitions.json').read_text())
        definition = next(metric for metric in contract['metrics']
                          if metric.get('fieldId') == '01.01:B01003_001E')
        self.assertEqual(nation['methodologyNote'], definition['method'])

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
