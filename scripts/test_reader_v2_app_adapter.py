import os
import json
import tempfile
from pathlib import Path
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
             patch.object(atlas_data, '_verified_reader_v2_lock', None), \
             patch.object(atlas_data, 'READER_V2_LOCK', atlas_data.ROOT / 'contracts/missing-v2-lock.json'):
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

    def test_admitted_cd119_database_requires_archive_identity_and_verifies_each_geometry(self):
        rows=self.cd119_rows()
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted','ATLAS_READER_V2_DATABASE':''}), \
             patch.object(atlas_data,'_verified_reader_v2_lock',{}), \
             patch.object(atlas_data,'query',return_value=rows) as read:
            result=atlas_data.reader_v2_cd119_boundary(include_features=True)
        self.assertTrue(result['available'])
        self.assertEqual(result['featureCount'],435)
        self.assertEqual(result['sourceSha256'],atlas_data.CD119_SOURCE_SHA256)
        self.assertEqual(result['geometryCollectionSha256'],atlas_data.CD119_GEOJSON_SHA256)
        self.assertEqual(len(result['featureCollection']['features']),435)
        self.assertEqual(read.call_args.args[1]['source_sha256'],atlas_data.CD119_SOURCE_SHA256)
        self.assertIn("gb.geometry_source_sha256=:'source_sha256'",read.call_args.args[0])

        for bad_hash in ('0'*64,atlas_data.CD119_GEOJSON_SHA256):
            bad_rows=[dict(row) for row in rows]
            bad_rows[0]['geometry_source_sha256']=bad_hash
            with self.subTest(source_hash=bad_hash), \
                 patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted','ATLAS_READER_V2_DATABASE':''}), \
                 patch.object(atlas_data,'_verified_reader_v2_lock',{}), \
                 patch.object(atlas_data,'query',return_value=bad_rows):
                self.assertFalse(atlas_data.reader_v2_cd119_boundary(include_features=True)['available'])

        bad_geometry_rows=[dict(row) for row in rows]
        bad_geometry_rows[0]['geometry']={'type':'Point','coordinates':[0,0]}
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted','ATLAS_READER_V2_DATABASE':''}), \
             patch.object(atlas_data,'_verified_reader_v2_lock',{}), \
             patch.object(atlas_data,'query',return_value=bad_geometry_rows):
            self.assertFalse(atlas_data.reader_v2_cd119_boundary(include_features=True)['available'])

    def test_local_cd119_file_mode_keeps_the_trusted_geojson_hash(self):
        features=[]
        for row in self.cd119_rows():
            features.append({'type':'Feature','properties':{
                'GEOID':row['geo_id'],'STATEFP':row['state_fips'],
                'CD119FP':row['district_code'],'NAMELSAD':row['label']},
                'geometry':row['geometry']})
        raw=json.dumps({'type':'FeatureCollection','features':features},
                       sort_keys=True,separators=(',',':')).encode()
        geojson_sha256=atlas_data.hashlib.sha256(raw).hexdigest()
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'cd119.geojson'
            path.write_bytes(raw)
            with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'local_review',
                    'ATLAS_READER_V2_DATABASE':'app_adapter_test','ATLAS_CD119_GEOJSON':str(path),
                    'ATLAS_CD119_GEOJSON_SHA256':geojson_sha256}), \
                 patch.object(atlas_data,'CD119_GEOJSON_SHA256',geojson_sha256):
                result=atlas_data.reader_v2_cd119_boundary(include_features=True)
        self.assertTrue(result['available'])
        self.assertEqual(result['featureCount'],435)
        self.assertEqual(result['sourceSha256'],atlas_data.CD119_SOURCE_SHA256)
        self.assertEqual(result['geometryCollectionSha256'],geojson_sha256)

    @staticmethod
    def cd119_rows():
        rows=[]
        geometry={'type':'Polygon','coordinates':[[[0,0],[1,0],[1,1],[0,0]]]}
        geometry_hash=atlas_data.hashlib.sha256(json.dumps(
            geometry,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        for index in range(435):
            state=f'{index // 99 + 1:02d}'
            district=f'{index % 99 + (index % 99 >= 98):02d}'
            rows.append({'geo_id':state+district,'state_fips':state,'district_code':district,
                'is_at_large':district=='00','seat_type':'voting_district','label':state+district,
                'geometry_record_sha256':geometry_hash,
                'geometry_source_sha256':atlas_data.CD119_SOURCE_SHA256,
                'geometry_source_url':atlas_data.CD119_SOURCE_URL,'geometry':geometry})
        return rows

    def test_candidate_sql_filters_every_batch_role_to_the_selected_mode(self):
        for alias in ('rb', 'cb', 'pb', 'ab', 'eb', 'cf'):
            with self.subTest(alias=alias), patch('scripts.atlas_data.subprocess.run') as run:
                run.return_value = SimpleNamespace(returncode=0, stdout='[]', stderr='')
                atlas_data.query(f"SELECT 1 WHERE {alias}.candidate_status IN ('local_review','admitted')")
                sql=run.call_args.kwargs['input']
                self.assertIn(f"{alias}.candidate_status='local_review'",sql)
                self.assertNotIn("IN ('local_review','admitted')",sql)

    def test_boundary_row_state_is_preserved_while_batch_admission_is_strict(self):
        with patch.dict(os.environ, {'ATLAS_READER_V2_MODE':'admitted'}), \
             patch('scripts.atlas_data.subprocess.run') as run:
            run.return_value=SimpleNamespace(returncode=0,stdout='[]',stderr='')
            atlas_data.query("SELECT 1 WHERE gb.candidate_status IN ('local_review','admitted') "
                             "AND rb.candidate_status IN ('local_review','admitted')")
        sql=run.call_args.kwargs['input']
        self.assertIn("gb.candidate_status IN ('local_review','admitted')",sql)
        self.assertIn("rb.candidate_status='admitted'",sql)

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
                self.assertTrue(target['include_native_us'])

    def test_irs_targets_match_the_frozen_reader_contract_and_reject_legacy_labels(self):
        contract=json.loads((atlas_data.ROOT/'contracts/reader/v2/contract.json').read_text())
        pinned=contract['source_releases']['irs_agi']
        self.assertEqual(pinned,'irs-soi-2023-pep-vintage-2025')
        for alias in ('irs_agi_total_2023','irs_agi_per_resident_2023'):
            target=atlas_data.REFRESH_TARGETS[alias]
            self.assertEqual(target['source_releases'],(pinned,))
            self.assertTrue(target['source_release_label'])
            base=self.refreshed_row(target, '06', 'state', pinned)
            with patch.object(atlas_data,'query',return_value=[base]):
                result=atlas_data.reader_v2_observations(alias,'annual',2023,'state_and_county')
            self.assertEqual(result['sourceReleases'],[pinned])
            self.assertEqual(result['sourceReleaseLabel'],target['source_release_label'])
            for old_label in ('IRS SOI County 2023','IRS SOI County 2023; Census PEP Vintage 2025'):
                with self.subTest(alias=alias,old_label=old_label), patch.object(
                    atlas_data,'query',return_value=[self.refreshed_row(target,'06','state',old_label)]):
                    with self.assertRaisesRegex(atlas_data.DatabaseUnavailable,'outside the reviewed field allowlist'):
                        atlas_data.reader_v2_observations(alias,'annual',2023,'state_and_county')

    @staticmethod
    def refreshed_row(target, geo_id, geo_type, release):
        return {'geo_id':geo_id,'geo_type':geo_type,'value':52341.82 if target['unit']=='USD/person' else 1_000_000,
            'unit':target['unit'],'quality_status':'observed','period_kind':'annual','period_year':target['year'],
            'period_month':None,'period_start_year':target['year'],'period_end_year':target['year'],
            'source_version':'2025','source':'irs_soi','source_release':release,
            'source_url':'https://www.irs.gov/statistics/soi-tax-stats-county-data','methodology_note':'Fixture source metadata',
            'raw_estimate':1,'raw_estimate_moe':None,'raw_denominator':1,'raw_denominator_moe':None,
            'denominator_value':100,'source_period_code':'2023','retrieved_at':'2026-10-26T00:00:00Z',
            'catalog_candidate_status':'local_review'}

    def test_fbi_target_returns_only_native_us_nation_summary_without_synthesizing_it(self):
        target=atlas_data.REFRESH_TARGETS['fbi_homicide_2025']
        release=target['source_releases'][0]
        state=self.refreshed_row(target,'06','state',release)
        nation=self.refreshed_row(target,'US','nation',release)
        state['value']=3.4811059417676025
        nation['value']=5.47
        with patch.object(atlas_data,'query',return_value=[state,nation]) as read:
            result=atlas_data.reader_v2_observations('fbi_homicide_2025','annual',2025,'state')
        self.assertEqual(len(result['observations']),2)
        self.assertEqual(next(row for row in result['observations'] if row['id']=='US')['value'],5.47)
        self.assertEqual(next(row for row in result['observations'] if row['id']=='US')['geoType'],'nation')
        self.assertIn("o.geo_type='nation' AND o.geo_id='US'",read.call_args.args[0])
        self.assertEqual(read.call_args.args[1]['include_native_us'],'true')
        with patch.object(atlas_data,'query',return_value=[{**nation,'geo_id':'CA'}]):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable,'unsupported geography type or national ID'):
                atlas_data.reader_v2_observations('fbi_homicide_2025','annual',2025,'state')
        with patch.object(atlas_data,'query',return_value=[state]):
            absent=atlas_data.reader_v2_observations('fbi_homicide_2025','annual',2025,'state')
        self.assertNotIn('US',{row['id'] for row in absent['observations']})

    def test_refreshed_cancer_joins_versioned_catalog_and_only_accepts_two_reviewed_releases(self):
        target=atlas_data.REFRESH_TARGETS['cancer_2023']
        allowed=set(target['source_releases'])
        self.assertEqual(allowed,{
            '2025 NPCR/SEER submission released June 2026; diagnosis year 2023',
            'USCS 2026 submission; 2023 incidence',
        })
        base={'geo_id':'06','geo_type':'state','value':501.645,'unit':'per 100,000',
              'quality_status':'observed','period_kind':'annual','period_year':2023,'period_month':None,
              'period_start_year':2023,'period_end_year':2023,'source_version':'2026','source':'cdc_uscs',
              'source_url':'https://gis.cdc.gov/Cancer/USCS/','methodology_note':'2023 crude rate',
              'raw_estimate':1,'raw_estimate_moe':None,'raw_denominator':1,'raw_denominator_moe':None,
              'denominator_value':100000,'source_period_code':'2023','retrieved_at':'2026-10-26T00:00:00Z',
              'catalog_candidate_status':'local_review'}
        with patch.object(atlas_data,'query',return_value=[{**base,'source_release':release} for release in sorted(allowed)]) as read:
            result=atlas_data.reader_v2_observations('cancer_2023','annual',2023,'state_and_county')
        self.assertEqual(result['sourceReleases'],sorted(allowed))
        self.assertEqual(result['observations'][0]['value'],501.645)
        sql=read.call_args.args[0]
        self.assertIn('JOIN usa_atlas.reader_v2_catalog_field cf',sql)
        self.assertIn('cf.catalog_field_id=o.catalog_field_id',sql)
        self.assertIn('cf.dataset_id=o.dataset_id',sql)
        self.assertIn('cf.source_release=o.source_release',sql)
        self.assertIn('cf.candidate_status IN (\'local_review\',\'admitted\')',sql)
        with patch.object(atlas_data,'query',return_value=[{**base,'source_release':'unreviewed-extra-release'}]):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable,'outside the reviewed field allowlist'):
                atlas_data.reader_v2_observations('cancer_2023','annual',2023,'state_and_county')
        with patch.object(atlas_data,'query',return_value=[{**base,'source_release':sorted(allowed)[0],
                                                           'catalog_candidate_status':'draft'}]):
            with self.assertRaisesRegex(atlas_data.DatabaseUnavailable,'catalog field is not admitted'):
                atlas_data.reader_v2_observations('cancer_2023','annual',2023,'state_and_county')

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
