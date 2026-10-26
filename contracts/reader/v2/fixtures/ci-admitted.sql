-- Explicit synthetic PostgreSQL CI fixture. This promotes only the immutable
-- fixture batch to admitted so CI exercises the production read path and its
-- pass + admitted filters; this file is never a source-data artifact.
INSERT INTO usa_atlas.reader_batch
    (ingest_id,contract_version,collector_version,observation_release,candidate_status,input_manifest_sha256)
VALUES
    ('00000000-0000-4000-8000-000000000101','2.0.0','ci-fixture','ci-admitted-fixture','admitted',repeat('a',64));

UPDATE usa_atlas.reader_v2_catalog_field
SET candidate_status='admitted',
    contract=CASE WHEN catalog_field_id='03.06' THEN
      '{"periodKinds":["monthly","annual"],"unit":"percent","sourceRelease":"bls-2025-fixture","seasonalAdjustment":"NSA","sourceCode":"bls_laus"}'::jsonb
      ELSE contract END
WHERE source_release <> 'unadmitted-fixture';
UPDATE usa_atlas.reader_observation SET candidate_status='admitted'
WHERE ingest_id='00000000-0000-4000-8000-000000000101';
UPDATE usa_atlas.election_contest SET candidate_status='admitted'
WHERE ingest_id='00000000-0000-4000-8000-000000000101';
UPDATE usa_atlas.election_candidate SET candidate_status='admitted'
WHERE ingest_id='00000000-0000-4000-8000-000000000101';
UPDATE usa_atlas.election_availability SET candidate_status='admitted'
WHERE ingest_id='00000000-0000-4000-8000-000000000101';

INSERT INTO usa_atlas.election_party_result
    (contest_id,party_normalized,party_votes,reported_total_votes,share_all_votes,quality_status,
     party_aggregation_status,source_release,source_status,production_eligible,candidate_status,ingest_id)
VALUES
('fixture-house-2024-ca-cd06-general','DEMOCRAT',60,100,0.6,'observed','validated','medsl-fixture-v1',
 'fixture_public',false,'admitted','00000000-0000-4000-8000-000000000101'),
('fixture-house-2024-ca-cd06-general','REPUBLICAN',40,100,0.4,'observed','validated','medsl-fixture-v1',
 'fixture_public',false,'admitted','00000000-0000-4000-8000-000000000101');

INSERT INTO usa_atlas.election_contest
    (contest_id,dataset_id,field_id,catalog_field_id,office,election_year,election_date,stage,
     source_stage_values,source_mode_values,is_special,is_runoff,geography_type,geo_id,state_fips,
     result_mode,reported_total_votes,source_release,source_url,source_sha256,source_version,source_status,
     production_eligible,quality_status,geography_mapping_status,party_aggregation_status,methodology_note,
     candidate_status,ingest_id)
VALUES
('ci-president-2024-los-angeles','president_election','12.01','12.01','president',2024,'2024-11-05','general',
 ARRAY['GEN']::text[],ARRAY['TOTAL']::text[],false,false,'county','06037','06','TOTAL',100,
 'medsl-fixture-v1','https://example.test/medsl',repeat('3',64),'fixture-v1','fixture_public',false,
 'observed','mapped','validated','Synthetic CI presidential contest.','admitted',
 '00000000-0000-4000-8000-000000000101');

INSERT INTO usa_atlas.election_candidate
    (contest_id,source_row_id,candidate_id,candidate_label,candidate_kind,party_original,party_normalized,
     candidatevotes_raw,totalvotes_raw,candidate_votes,source_total_votes,result_mode,write_in,fusion_ticket,
     source_version,source_url,source_sha256,source_status,quality_status,candidate_status,ingest_id)
VALUES
('ci-president-2024-los-angeles','ci-president-dem','ci-dem','CI Democrat','candidate','DEMOCRAT','DEMOCRAT',
 '64','100',64,100,'TOTAL',false,false,'fixture-v1','https://example.test/medsl',repeat('3',64),
 'fixture_public','observed','admitted','00000000-0000-4000-8000-000000000101'),
('ci-president-2024-los-angeles','ci-president-rep','ci-rep','CI Republican','candidate','REPUBLICAN','REPUBLICAN',
 '36','100',36,100,'TOTAL',false,false,'fixture-v1','https://example.test/medsl',repeat('3',64),
 'fixture_public','observed','admitted','00000000-0000-4000-8000-000000000101');

INSERT INTO usa_atlas.election_party_result
    (contest_id,party_normalized,party_votes,reported_total_votes,share_all_votes,quality_status,
     party_aggregation_status,source_release,source_status,production_eligible,candidate_status,ingest_id)
VALUES
('ci-president-2024-los-angeles','DEMOCRAT',64,100,0.64,'observed','validated','medsl-fixture-v1',
 'fixture_public',false,'admitted','00000000-0000-4000-8000-000000000101'),
('ci-president-2024-los-angeles','REPUBLICAN',36,100,0.36,'observed','validated','medsl-fixture-v1',
 'fixture_public',false,'admitted','00000000-0000-4000-8000-000000000101');
