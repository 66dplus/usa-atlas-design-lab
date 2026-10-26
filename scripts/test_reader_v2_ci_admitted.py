"""End-to-end app adapter checks on admitted v2 rows in isolated CI PostgreSQL."""
import os
import unittest
from unittest.mock import patch

from scripts import atlas_data


class AdmittedReaderV2PostgresTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if os.environ.get('PGDATABASE') != 'usa_atlas':
            raise RuntimeError('Reader-v2 CI checks require the isolated usa_atlas database.')
        password = os.environ.get('ATLAS_CI_READER_PASSWORD')
        if not password:
            raise RuntimeError('Reader-v2 CI checks require the test-only read-only reader credential.')
        cls.mode = patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted',
                                           'PGUSER':'atlas_reader','PGPASSWORD':password})
        cls.mode.start()
        atlas_data._verified_reader_v2_lock = None
        atlas_data._verify_reader_v2_lock()

    @classmethod
    def tearDownClass(cls):
        atlas_data._verified_reader_v2_lock = None
        cls.mode.stop()

    def test_unemployment_exact_annual_month_missing_zero_and_domain(self):
        january = atlas_data.reader_v2_unemployment_period('month', 2025, 1)
        annual = atlas_data.reader_v2_unemployment_period('annual', 2025)
        october = atlas_data.reader_v2_unemployment_period('month', 2025, 10)
        self.assertEqual(january['candidateStatus'], 'admitted')
        self.assertEqual(january['sourceSeasonalAdjustment'], 'NSA')
        ca = next(row for row in january['observations'] if row['sourceGeoId'] == '06')
        self.assertEqual(ca['value'], 4.5)
        self.assertEqual(january['fixedDomain'], [0, 5])
        annual_ca = next(row for row in annual['observations'] if row['sourceGeoId'] == '06')
        self.assertEqual((annual['period'], annual['periodType'], annual['month']), ('2025-M13','annual',None))
        self.assertEqual(annual_ca['value'], 4.7)
        self.assertEqual(october['periodStatus'], 'missing')
        self.assertEqual(october['observations'], [])

    def test_aian_and_all_three_2024_election_offices_use_admitted_rows(self):
        aian = atlas_data.reader_v2_observations('aian_broad_share','multi_year',2024,'state_and_county')
        ca = next(row for row in aian['observations'] if row['sourceGeoId'] == '06001')
        self.assertEqual((aian['candidateStatus'],ca['value']),('admitted',3.25))
        president = atlas_data.reader_v2_observations('election_president_2024','cycle',2024,'county','DEMOCRAT')
        la = next(row for row in president['observations'] if row['id'] == '06037')
        self.assertEqual((la['value'],la['votes'],la['totalVotes']),(64.0,64,100))
        house = atlas_data.reader_v2_observations('election_house_2024','cycle',2024,'congressional_district','DEMOCRAT')
        cd06 = next(row for row in house['observations'] if row['id'] == '0606')
        self.assertEqual((cd06['value'],cd06['boundaryVintage'],cd06['congressSession']),(60.0,2024,'119'))
        senate = atlas_data.reader_v2_observations('election_senate_2024','cycle',2024,'state','DEMOCRAT')
        kansas = next(row for row in senate['observations'] if row['id'] == '20')
        self.assertEqual(kansas['qualityState'],'no_election')
        self.assertIsNone(kansas['value'])
        missing = next(row for row in senate['observations'] if row['id'] == '12')
        self.assertEqual(missing['qualityState'],'missing')
        self.assertIsNone(missing['value'])


if __name__ == '__main__':
    unittest.main()
