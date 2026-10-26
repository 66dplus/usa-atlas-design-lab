import os
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from scripts import atlas_data


class ReaderV2AppAdapterTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'local_review','ATLAS_READER_V2_DATABASE': 'app_adapter_test'})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_candidate_mode_requires_explicit_nonproduction_database(self):
        self.assertEqual(atlas_data.reader_v2_mode(), 'local_review')
        with patch.dict(os.environ, {'ATLAS_READER_V2_DATABASE':'usa_atlas'}):
            self.assertEqual(atlas_data.reader_v2_mode(), 'disabled')

    def test_production_mode_fails_closed_without_separate_v2_lock(self):
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted','ATLAS_READER_V2_DATABASE':''}), \
             patch.object(atlas_data, '_verified_reader_v2_lock', None):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable, 'not installed or does not match'):
                atlas_data.reader_v2_mode()

    def test_admitted_unemployment_uses_default_database_without_local_override(self):
        previous=atlas_data._verified_reader_v2_lock
        atlas_data._verified_reader_v2_lock={}
        had_database='ATLAS_READER_V2_DATABASE' in os.environ
        prior_database=os.environ.pop('ATLAS_READER_V2_DATABASE',None)
        try:
            with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted'}):
                self.assertEqual(atlas_data._reader_v2_database(),'usa_atlas')
                with patch.object(atlas_data,'reader_v2_unemployment_period',return_value={'period':'2025-M13'}) as read:
                    self.assertEqual(atlas_data.unemployment_period_observations('annual',2025),{'period':'2025-M13'})
                    read.assert_called_once_with('annual',2025,None)
        finally:
            atlas_data._verified_reader_v2_lock=previous
            if had_database:
                os.environ['ATLAS_READER_V2_DATABASE']=prior_database

    def test_disabled_mode_does_not_enable_production_candidate_reads(self):
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'disabled','ATLAS_READER_V2_DATABASE':''}):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable,'explicit reviewed mode'):
                atlas_data.unemployment_period_observations('annual',2025)

    def test_candidate_sql_filters_every_batch_role_to_the_selected_mode(self):
        for alias in ('rb', 'cb', 'pb', 'ab', 'eb', 'cf', 'gb'):
            with self.subTest(alias=alias), patch('scripts.atlas_data.subprocess.run') as run:
                run.return_value = SimpleNamespace(returncode=0, stdout='[]', stderr='')
                atlas_data.query(f"SELECT 1 WHERE {alias}.candidate_status IN ('local_review','admitted')")
                sql=run.call_args.kwargs['input']
                self.assertIn(f"{alias}.candidate_status='local_review'",sql)
                self.assertNotIn("IN ('local_review','admitted')",sql)

    def test_v1_read_does_not_require_a_v2_lock_during_rollback(self):
        previous=atlas_data._verified_reader_v2_lock
        atlas_data._verified_reader_v2_lock=None
        try:
            with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted','ATLAS_READER_V2_DATABASE':''}), \
                 patch('scripts.atlas_data.subprocess.run') as run:
                run.return_value=SimpleNamespace(returncode=0,stdout='[]',stderr='')
                atlas_data.query("SELECT 1 WHERE rb.candidate_status IN ('local_review','admitted')")
            self.assertIn("rb.candidate_status='admitted'",run.call_args.kwargs['input'])
        finally:
            atlas_data._verified_reader_v2_lock=previous

    def test_fbi_annual_targets_bind_all_seven_official_fields_and_same_unit(self):
        targets=[(key,value) for key,value in atlas_data.REFRESH_TARGETS.items() if key.startswith('fbi_')]
        self.assertEqual(len(targets),7)
        self.assertEqual({value['field'] for _,value in targets},{f'04.0{i}:derived' for i in range(1,8)})
        for _,target in targets:
            with self.subTest(field=target['field']):
                self.assertEqual(target['dataset'],'fbi_crime_rate')
                self.assertEqual(target['year'],2025)
                self.assertEqual(target['unit'],'per 100,000')
                self.assertEqual(target['geography'],'state')

    @staticmethod
    def period_row(month=1, value=0):
        return {
            'geo_id': '06', 'geo_type': 'state', 'value': value, 'unit': 'percent',
            'quality_status': 'observed', 'period_kind': 'monthly', 'period_year': 2025,
            'period_month': month, 'period_start_year': 2025, 'period_end_year': 2025,
            'source_period_code': f'M{month:02d}', 'source': 'bls_laus', 'source_release': 'laus-nsa-2025',
            'source_url': 'https://www.bls.gov/lau/', 'methodology_note': 'Fixture only',
            'retrieved_at': '2026-10-26T00:00:00Z', 'seasonal_adjustment': 'NSA',
            'catalog_release': 'laus-nsa-2025',
        }

    def test_exact_month_is_filtered_and_zero_is_observed(self):
        with patch.object(atlas_data, 'query', side_effect=[
            {'sourceRelease': 'laus-nsa-2025', 'seasonalAdjustment': 'NSA', 'sourceCode':'bls_laus'},
            [self.period_row()], {'maximum':3.2,'observations':2},
        ]) as query:
            result = atlas_data.reader_v2_unemployment_period('month', 2025, 1)
        self.assertEqual(result['period'], '2025-M01')
        self.assertEqual(result['sourceSeasonalAdjustment'], 'NSA')
        self.assertEqual(result['observations'][0]['value'], 0)
        self.assertEqual(result['fixedDomain'], [0,5])
        self.assertEqual(query.call_args_list[1].args[1]['period_kind'], 'monthly')
        self.assertEqual(query.call_args_list[1].args[1]['month'], 1)
        self.assertIn("i.status='pass'", query.call_args_list[1].args[0])
        self.assertIn("rb.candidate_status IN ('local_review','admitted')", query.call_args_list[1].args[0])

    def test_mismatched_exact_month_fails_closed(self):
        row = self.period_row(month=2)
        with patch.object(atlas_data, 'query', side_effect=[
            {'sourceRelease': 'laus-nsa-2025', 'seasonalAdjustment': 'NSA', 'sourceCode':'bls_laus'}, [row],
        ]):
            with self.assertRaises(atlas_data.DatabaseUnavailable):
                atlas_data.reader_v2_unemployment_period('month', 2025, 1)

    def test_unemployment_without_explicit_nsa_contract_fails_closed(self):
        with patch.object(atlas_data, 'query', return_value={
            'sourceRelease': 'laus-2025', 'seasonalAdjustment': None, 'sourceCode':'bls_laus',
        }):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable, 'explicit BLS LAUS NSA'):
                atlas_data.reader_v2_unemployment_period('annual', 2025)

    def test_released_unemployment_without_nsa_contract_fails_closed(self):
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'disabled','ATLAS_READER_V2_DATABASE': ''}):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable, 'explicit reviewed mode'):
                atlas_data.unemployment_period_observations('annual', 2025)

    def test_absent_month_is_a_missing_period_not_zero(self):
        with patch.object(atlas_data, 'query', side_effect=[
            {'sourceRelease': 'laus-nsa-2025', 'seasonalAdjustment': 'NSA', 'sourceCode':'bls_laus'}, [],
            {'maximum':3.2,'observations':2},
        ]):
            result = atlas_data.reader_v2_unemployment_period('month', 2025, 10)
        self.assertEqual(result['periodStatus'], 'missing')
        self.assertEqual(result['observations'], [])
        self.assertEqual(result['period'], '2025-M10')

    def test_month_series_keeps_gaps_and_shared_year_domain(self):
        rows=[]
        for month,value in ((1,3.2),(2,3.4),(11,4.0)):
            rows.append({
                'geo_id':'US','geo_type':'nation','value':value,'unit':'percent','quality_status':'observed',
                'period_month':month,'period_year':2025,'period_kind':'monthly','source':'bls_laus',
                'source_release':'laus-nsa-2025','source_url':'https://www.bls.gov/lau/',
                'methodology_note':'Fixture only','retrieved_at':'2026-10-26T00:00:00Z',
                'seasonal_adjustment':'NSA','source_period_code':f'M{month:02d}',
            })
        with patch.object(atlas_data,'query',side_effect=[
            {'sourceRelease':'laus-nsa-2025','seasonalAdjustment':'NSA','sourceCode':'bls_laus'},
            rows,{'maximum':4.0,'observations':100},
        ]):
            result=atlas_data.reader_v2_unemployment_month_series(2025,'nation','US')
        self.assertEqual(result['fixedDomain'],[0,5])
        self.assertEqual([row['month'] for row in result['observations']],[1,2,11])
        self.assertNotIn(10,{row['month'] for row in result['observations']})

    def test_m13_is_annual_and_never_a_month(self):
        with patch.object(atlas_data, 'query', side_effect=[
            {'sourceRelease': 'laus-nsa-2025', 'seasonalAdjustment': 'NSA', 'sourceCode':'bls_laus'}, [],
            {'maximum':3.2,'observations':2},
        ]) as query:
            result = atlas_data.reader_v2_unemployment_period('annual', 2025)
        self.assertEqual(result['period'], '2025-M13')
        self.assertEqual(result['periodType'], 'annual')
        self.assertIsNone(result['month'])
        self.assertEqual(query.call_args_list[1].args[1]['period_kind'], 'annual')
        self.assertEqual(query.call_args_list[1].args[1]['month'], '')

    def test_senate_no_election_remains_distinct(self):
        contest = {
            'contest_id':'fixture-no-election','geo_id':'20','geo_type':'state','state_fips':'20',
            'district_code':None,'boundary_vintage':None,'congress_session':None,'election_year':2024,
            'stage':'general','is_special':False,'is_runoff':False,'result_mode':'TOTAL',
            'reported_total_votes':None,'quality_status':'no_election','party_aggregation_status':'not_evaluated',
            'source_release':'medsl-fixture-v1','source_url':'https://example.test/source',
            'source_version':'fixture-v1',
            'geography_mapping_status':'mapped','methodology_note':'Fixture schedule says no race.',
            'party_votes':0,'share':None,'selected_quality':'no_election','candidates':None,
        }
        with patch.object(atlas_data, 'query', side_effect=[[contest], []]) as query:
            result=atlas_data._reader_v2_election_observations(
                'app_adapter_test','senate','DEMOCRAT',2024,'state')
        self.assertEqual(result['observations'][0]['qualityState'],'no_election')
        self.assertIsNone(result['observations'][0]['value'])
        self.assertIn("ci.status='pass'", query.call_args_list[0].args[0])
        self.assertEqual(query.call_args_list[0].args[1]['dataset_id'],'senate_election')
        self.assertEqual(query.call_args_list[1].args[1]['dataset_id'],'senate_election')

    def test_election_share_uses_candidate_party_result_and_normalizes_stage(self):
        contest={
            'contest_id':'fixture-senate','geo_id':'06','geo_type':'state','state_fips':'06',
            'district_code':None,'boundary_vintage':None,'congress_session':None,'election_year':2024,
            'stage':'GEN','is_special':False,'is_runoff':False,'result_mode':'TOTAL',
            'reported_total_votes':100,'quality_status':'observed','party_aggregation_status':'validated',
            'source_release':'dataverse-PEJ5QU-v8','source_url':'https://example.test/source',
            'source_version':'fixture-v1','geography_mapping_status':'mapped','methodology_note':'Fixture only',
            'party_votes':60,'share':60.0,'selected_quality':'observed','candidates':[{
                'candidate':'Candidate A','partyOriginal':'Democratic','party':'DEMOCRAT',
                'votes':60,'share':60.0,'sourceVotes':'60','sourceTotalVotes':'100','sourceVersion':'fixture-v1'}],
        }
        with patch.object(atlas_data,'query',side_effect=[[contest],[]]) as query:
            result=atlas_data._reader_v2_election_observations('app_adapter_test','senate','DEMOCRAT',2024,'state')
        row=result['observations'][0]
        self.assertEqual(row['value'],60.0)
        self.assertEqual(row['votes'],60)
        self.assertEqual(row['totalVotes'],100)
        self.assertEqual(row['stage'],'general')
        self.assertEqual(row['sourceStage'],'GEN')
        self.assertEqual(row['candidates'][0]['share'],60.0)
        self.assertEqual(query.call_args_list[0].args[1]['dataset_id'],'senate_election')
        self.assertIn('election_party_result',query.call_args_list[0].args[0])
        self.assertIn("upper(btrim(c.stage)) IN ('GEN','GENERAL')",query.call_args_list[0].args[0])

    def test_public_election_alias_routes_to_canonical_reader_dataset(self):
        with patch.object(atlas_data,'_reader_v2_database',return_value='review_db'), \
             patch.object(atlas_data,'_reader_v2_election_observations',return_value={'datasetId':'election_house_2024'}) as read:
            result=atlas_data.reader_v2_observations('election_house_2024','cycle',2024,
                'congressional_district','DEMOCRAT')
        self.assertEqual(result,{'datasetId':'election_house_2024'})
        read.assert_called_once_with('review_db','house','DEMOCRAT',2024,'congressional_district')

    def test_validated_contest_without_party_result_is_missing_not_zero(self):
        contest={
            'contest_id':'fixture-senate-missing-party','geo_id':'06','geo_type':'state','state_fips':'06',
            'district_code':None,'boundary_vintage':None,'congress_session':None,'election_year':2024,
            'stage':'GENERAL','is_special':False,'is_runoff':False,'result_mode':'TOTAL',
            'reported_total_votes':100,'quality_status':'observed','party_aggregation_status':'validated',
            'source_release':'dataverse-PEJ5QU-v8','source_url':'https://example.test/source',
            'source_version':'fixture-v1','geography_mapping_status':'mapped','methodology_note':'Fixture only',
            'party_votes':None,'share':None,'selected_quality':'missing','candidates':None,
        }
        with patch.object(atlas_data,'query',side_effect=[[contest],[]]):
            result=atlas_data._reader_v2_election_observations('app_adapter_test','senate','DEMOCRAT',2024,'state')
        row=result['observations'][0]
        self.assertIsNone(row['value'])
        self.assertEqual(row['qualityState'],'missing')
        self.assertIsNone(row['votes'])

    def test_aian_uses_broad_source_field_and_preserves_both_moes(self):
        row={
            'dataset_id':'aian_broad_share','field_id':'01.04:aian_share','geo_id':'US','geo_type':'nation',
            'value':2.38,'unit':'percent','quality_status':'observed','raw_estimate':'7990799',
            'raw_estimate_moe':'48461','raw_denominator':'334922499','raw_denominator_moe':'-555555555',
            'denominator_value':334922499,'source':'U.S. Census Bureau ACS 2024 5-year',
            'source_release':'acs-2024-5year','source_url':'https://api.census.gov/data/2024/acs/acs5',
            'methodology_note':'B02010_001E / B01003_001E * 100','period_kind':'multi_year',
            'period_year':2024,'period_month':None,'period_start_year':2020,'period_end_year':2024,
            'source_period_code':'2020-2024','retrieved_at':'2026-10-26T00:00:00Z',
        }
        with patch.object(atlas_data,'query',return_value=[row]) as query:
            result=atlas_data.reader_v2_observations('aian_broad_share','multi_year',2024,'state_and_county')
        self.assertEqual(result['fieldId'],'01.04:aian_share')
        self.assertEqual(result['sourceRelease'],'acs-2024-5year')
        self.assertEqual(result['geographyType'],'state_and_county')
        self.assertEqual(result['observations'][0]['countMoe'],'48461')
        self.assertEqual(result['observations'][0]['populationMoe'],'-555555555')
        self.assertIn("o.period_start_year=2020 AND o.period_end_year=2024",query.call_args.args[0])

    def test_explicit_zero_party_result_is_observed_zero(self):
        contest={
            'contest_id':'fixture-senate-zero','geo_id':'06','geo_type':'state','state_fips':'06',
            'district_code':None,'boundary_vintage':None,'congress_session':None,'election_year':2024,
            'stage':'GEN','is_special':False,'is_runoff':False,'result_mode':'TOTAL',
            'reported_total_votes':100,'quality_status':'observed','party_aggregation_status':'validated',
            'source_release':'dataverse-PEJ5QU-v8','source_url':'https://example.test/source',
            'source_version':'fixture-v1','geography_mapping_status':'mapped','methodology_note':'Fixture only',
            'party_votes':0,'share':0.0,'selected_quality':'observed','candidates':None,
        }
        with patch.object(atlas_data,'query',side_effect=[[contest],[]]):
            result=atlas_data._reader_v2_election_observations('app_adapter_test','senate','DEMOCRAT',2024,'state')
        row=result['observations'][0]
        self.assertEqual(row['value'],0.0)
        self.assertEqual(row['votes'],0)
        self.assertEqual(row['qualityState'],'observed')


if __name__ == '__main__':
    unittest.main()
