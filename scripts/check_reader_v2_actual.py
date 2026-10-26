"""Read-only smoke checks for the explicitly named disposable candidate DB."""
import os
import sys
import json
from scripts import atlas_data


EXPECTED_DB = 'reader_v2_worker_integration_20261026'
EXPECTED_SOCKET = '/tmp/usa-maps-data-flow-20261026/pgsocket'


def main():
    if os.environ.get('ATLAS_READER_V2_DATABASE') != EXPECTED_DB:
        raise SystemExit('Set ATLAS_READER_V2_DATABASE to the named nonreleased candidate DB.')
    if os.environ.get('PGHOST') != EXPECTED_SOCKET or os.environ.get('PGUSER') != 'atlas_reader':
        raise SystemExit('Use the approved read-only local PostgreSQL socket and atlas_reader role.')
    if not os.environ.get('ATLAS_CD119_GEOJSON') or not os.environ.get('ATLAS_CD119_GEOJSON_SHA256'):
        raise SystemExit('Configure the verified local CD119 candidate geometry for this check.')

    annual = atlas_data.unemployment_period_observations('annual', 2025)
    january = atlas_data.unemployment_period_observations('month', 2025, 1)
    october = atlas_data.unemployment_period_observations('month', 2025, 10)
    monthly = atlas_data.unemployment_month_series(2025, 'state', '06')
    assert annual['period'] == '2025-M13' and annual['sourcePeriod'].endswith('M13')
    assert january['period'] == '2025-M01' and january['sourceSeasonalAdjustment'] == 'NSA'
    assert october['periodStatus'] == 'missing'
    assert len(annual['observations']) == len(january['observations']) == 3195
    assert annual['fixedDomain'] == january['fixedDomain'] == monthly['fixedDomain'] == [0, 25]
    assert next(row for row in annual['observations'] if row['id'] == '06')['value'] == 5.5
    assert next(row for row in january['observations'] if row['id'] == '06')['value'] == 5.6
    october_slot = next(row for row in monthly['observations'] if row['month'] == 10)
    assert october_slot['value'] is None and october_slot['qualityState'] == 'missing'

    aian = atlas_data.reader_v2_observations('aian_broad_share', 'multi_year', 2024, 'state_and_county')
    assert len(aian['observations']) == 3275
    assert aian['sourceRelease'] == 'acs-2024-5year'
    assert next(row for row in aian['observations'] if row['id'] == 'US')['count'] == '7990799'

    president = atlas_data.reader_v2_observations('election_president_2024', 'cycle', 2024, 'county', 'DEMOCRAT')
    senate = atlas_data.reader_v2_observations('election_senate_2024', 'cycle', 2024, 'state', 'DEMOCRAT')
    house = atlas_data.reader_v2_observations('election_house_2024', 'cycle', 2024, 'congressional_district', 'DEMOCRAT')
    assert next(row for row in president['observations'] if row['id'] == '06037')['value'] == 64.82918936055339
    no_election = next(row for row in senate['observations'] if row['id'] == '20')
    assert no_election['qualityState'] == 'no_election' and no_election['value'] is None
    cd06 = next(row for row in house['observations'] if row['id'] == '0606')
    assert cd06['value'] == 57.618994537955636 and cd06['boundaryVintage'] == 2024
    assert cd06['congressSession'] == '119' and cd06['resultMode'] == 'TOTAL'
    assert next(row for row in house['observations'] if row['id'] == '1198')['geoType'] == 'congressional_district'

    boundary=atlas_data.reader_v2_cd119_boundary(include_features=True)
    assert boundary['available'] and boundary['featureCount']==435
    assert boundary['sourceSha256']=='2b4238aed7e865df75d0c9cfcd8dffa1b79007b24519ecc4b213e683078b031a'
    assert boundary['featureCollection']['features'][0]['properties']['GEOID']

    catalog = atlas_data.reader_v2_catalog()
    by_id = {row['id']: row for row in catalog['metrics']}
    assert by_id['elections-president']['sourceUrl'] == 'https://doi.org/10.7910/DVN/VOQCHQ'
    assert by_id['elections-senate']['sourceUrl'] == 'https://doi.org/10.7910/DVN/PEJ5QU'
    assert by_id['elections-president']['source'] == 'MIT Election Lab / MEDSL'
    refreshed = {
        'adjusted-gross-income-agi': ('irs_agi_total_2023','07.01:derived:total', 2023, 'USD'),
        'adjusted-gross-income-agi--per-resident': ('irs_agi_per_resident_2023','07.01:derived:per-resident', 2023, 'USD per resident'),
        'electricity-price': ('electricity_price_2025_all','08.05:sector_ALL', 2025, 'cents/kWh'),
        'all-cancer-new-cases': ('cancer_2023','11.01:derived', 2023, 'per 100,000'),
        'new-hiv-diagnoses': ('hiv_2024','11.02:derived', 2024, 'per 100,000'),
        'deaths-under-18': ('child_deaths_under18_2024','11.03:derived', 2024, 'per 100,000'),
    }
    entries={row['id']:row for row in catalog['metrics']}
    for metric_id,(dataset_id,field_id,event_year,unit) in refreshed.items():
        entry=entries[metric_id]
        assert entry['candidateAvailable'] and entry['fieldId']==field_id and entry['year']==event_year
        assert entry['unit']==unit
        result=atlas_data.reader_v2_observations(dataset_id,'annual',event_year,entry['geographyType'])
        assert result['fieldId']==field_id and result['year']==event_year and result['unit']==unit
        assert result['observations'] and all(row['sourceRelease'] for row in result['observations'])
    per_resident=atlas_data.reader_v2_observations('irs_agi_per_resident_2023','annual',2023,'state_and_county')
    assert per_resident['sourceUnit']=='USD/person'
    assert next(row for row in per_resident['observations'] if row['id']=='06')['denominatorValue'] is not None
    cancer=atlas_data.reader_v2_observations('cancer_2023','annual',2023,'state_and_county')
    assert len(cancer['sourceReleases'])==2 and all(row['sourceRelease'] for row in cancer['observations'])
    assert catalog['contractStatus'] == 'candidate_nonreleased'
    assert atlas_data.reader_v2_cd119_boundary()['featureCount'] == 435

    expected_counts={
        'irs_agi_total_2023':3195,'irs_agi_per_resident_2023':3195,'electricity_price_2025_all':51,
        'cancer_2023':52,'hiv_2024':52,'child_deaths_under18_2024':52,
        **{alias:52 for alias in atlas_data.REFRESH_TARGETS if alias.startswith('fbi_')},
    }
    expected_ca={
        'irs_agi_total_2023':2050839816000.0,'irs_agi_per_resident_2023':52341.82139315308,
        'electricity_price_2025_all':27.03,'cancer_2023':501.6453230537639,
        'hiv_2024':13.43271133386734,'child_deaths_under18_2024':35.64507832515024,
        'fbi_homicide_2025':3.4811059417676025,'fbi_violent_crime_2025':432.7243371408925,
        'fbi_robbery_2025':94.92239026760024,'fbi_aggravated_assault_2025':300.95812486188333,
        'fbi_burglary_2025':275.10900752932724,'fbi_motor_vehicle_theft_2025':316.676461617923,
        'fbi_rape_revised_2025':33.36271606964133,
    }
    expected_us_fbi={
        'fbi_homicide_2025':4.121013471348732,'fbi_violent_crime_2025':327.6236430802433,
        'fbi_robbery_2025':49.424951556586954,'fbi_aggravated_assault_2025':237.9929898415599,
        'fbi_burglary_2025':193.6305797187498,'fbi_motor_vehicle_theft_2025':197.04383801883884,
        'fbi_rape_revised_2025':36.084688210747736,
    }
    formal=json.loads((atlas_data.ROOT/'contracts/reader/v2/contract.json').read_text())
    for alias,target in atlas_data.REFRESH_TARGETS.items():
        result=atlas_data.reader_v2_observations(alias,'annual',target['year'],target['geography'])
        assert result['periodType']=='annual' and result['year']==target['year']
        assert result['readerFieldId']==target['field'] and result['sourceUnit']==target['unit']
        assert len(result['observations'])==expected_counts[alias],(alias,len(result['observations']))
        assert set(result['sourceReleases'])==set(target['source_releases'])
        ca=next(row for row in result['observations'] if row['id']=='06')
        assert abs(ca['value']-expected_ca[alias])<1e-9,(alias,ca['value'])
        assert ca['sourceRelease'] in target['source_releases'] and ca['sourceUnit']==target['unit']
        if alias.startswith('irs_agi_'):
            assert result['sourceReleases']==[formal['source_releases']['irs_agi']]
            assert result['sourceReleaseLabel']==target['source_release_label']
        if alias.startswith('fbi_'):
            us=next(row for row in result['observations'] if row['id']=='US')
            assert us['geoType']=='nation' and us['sourceGeoId']=='US'
            assert abs(us['value']-expected_us_fbi[alias])<1e-9,(alias,us['value'])
    assert len(atlas_data.REFRESH_TARGETS)==13
    print('PASS: actual read-only DB full candidate periods, source identity, all 13 refreshed aliases, exact CA values, seven native FBI US rows, and existing AIAN/election/CD119 checks')


if __name__ == '__main__':
    try:
        main()
    except (AssertionError, atlas_data.DatabaseUnavailable, KeyError, StopIteration) as error:
        print(f'FAIL: {type(error).__name__}: {error}', file=sys.stderr)
        raise
