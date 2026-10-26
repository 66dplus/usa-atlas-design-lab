"""Read-only PostgreSQL boundary for the local atlas; no ingestion or inferred values."""
import calendar
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STATE_CODES = dict(zip(
    'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(),
    '01 02 04 05 06 08 09 10 11 12 13 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56'.split(),
))
DEFAULT_SERIES = {'03.06': '03.06:unemployment_rate', '04.09': '04.09:violent-crime:yoy',
                  '08.05': '08.05:sector_ALL', '09.02': '09.02:percent'}
# Original units/labels from the collector's USDA FEA 2025 VariableList.csv.
# Preserve stored values: the old UI catalog's per-10k label was incorrect.
USDA = {
    '09.01': ('Fast-food restaurants per 1,000 residents', 'per 1,000 people'),
    '09.02:count': ('Low access to a grocery store · population', 'people'),
    '09.02:percent': ('Low access to a grocery store · population share', '%'),
    '09.03': ("Farmers’ markets per 1,000 residents", 'per 1,000 people'),
    '09.04': ('Recreation & fitness facilities per 1,000 residents', 'per 1,000 people'),
}
SOURCE_NAMES = {'bls_laus': 'BLS LAUS', 'bea_rpp': 'BEA Regional Price Parities',
                'fbi_cde': 'FBI Crime Data Explorer', 'cdc_places': 'CDC PLACES',
                'census_acs': 'Census ACS', 'irs_soi': 'IRS Statistics of Income',
                'eia': 'EIA Electricity', 'usda_fea': 'USDA Food Environment Atlas',
                'cdc_uscs': 'CDC USCS', 'cdc_atlasplus': 'CDC AtlasPlus',
                'cdc_wonder': 'CDC WONDER'}
CD119_SOURCE_URL = 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip'
CD119_SOURCE_SHA256 = '2b4238aed7e865df75d0c9cfcd8dffa1b79007b24519ecc4b213e683078b031a'
CD119_GEOJSON_SHA256 = 'd47e9f48159fc581fa5b1a06a98ade5d696f06983480cf1ba15aa9d81d026a54'

# Explicit consumer aliases for the guarded local refresh batch. The source
# field IDs stay as recorded by the reader; public metric aliases are mapped
# only at this application boundary and remain candidate/nonreleased.
REFRESH_TARGETS = {
    'irs_agi_total_2023': {'metric_id':'adjusted-gross-income-agi','catalog':'07.01','dataset':'irs_agi','field':'07.01:agi_total','public_field':'07.01:derived:total','year':2023,'unit':'USD','display_unit':'USD','geography':'state_and_county','source_releases':('irs-soi-2023-pep-vintage-2025',),'source_release_label':'IRS SOI County 2023'},
    'irs_agi_per_resident_2023': {'metric_id':'adjusted-gross-income-agi--per-resident','catalog':'07.01','dataset':'irs_agi','field':'07.01:derived:per-resident','public_field':'07.01:derived:per-resident','year':2023,'unit':'USD/person','display_unit':'USD per resident','geography':'state_and_county','source_releases':('irs-soi-2023-pep-vintage-2025',),'source_release_label':'IRS SOI County 2023; Census PEP Vintage 2025'},
    'electricity_price_2025_all': {'metric_id':'electricity-price','catalog':'08.05','dataset':'electricity_price','field':'08.05:sector_ALL','public_field':'08.05:sector_ALL','year':2025,'unit':'cents/kWh','display_unit':'cents/kWh','geography':'state','source_releases':('EIA Electric Power Annual 2025',)},
    'cancer_2023': {'metric_id':'all-cancer-new-cases','catalog':'11.01','dataset':'cancer','field':'11.01','public_field':'11.01:derived','year':2023,'unit':'per 100,000','display_unit':'per 100,000','geography':'state_and_county',
      'source_releases':('2025 NPCR/SEER submission released June 2026; diagnosis year 2023','USCS 2026 submission; 2023 incidence')},
    'hiv_2024': {'metric_id':'new-hiv-diagnoses','catalog':'11.02','dataset':'hiv','field':'11.02','public_field':'11.02:derived','year':2024,'unit':'per 100,000','display_unit':'per 100,000','geography':'state_and_county','source_releases':('AtlasPlus observed 2026-10-11; 2024 diagnoses provisional, reported through December 2025 with 12-month reporting delay',)},
    'child_deaths_under18_2024': {'metric_id':'deaths-under-18','catalog':'11.03','dataset':'child_deaths_under18','field':'11.03','public_field':'11.03:derived','year':2024,'unit':'per 100,000','display_unit':'per 100,000','geography':'state_and_county','source_releases':('NCHS NVSS Mortality 2018-2024, CDC WONDER release 2026',)},
    'fbi_homicide_2025': {'metric_id':'murders','catalog':'04.01','dataset':'fbi_crime_rate','field':'04.01:derived','public_field':'04.01:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_violent_crime_2025': {'metric_id':'violent-crime','catalog':'04.02','dataset':'fbi_crime_rate','field':'04.02:derived','public_field':'04.02:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_robbery_2025': {'metric_id':'robbery','catalog':'04.03','dataset':'fbi_crime_rate','field':'04.03:derived','public_field':'04.03:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_aggravated_assault_2025': {'metric_id':'aggravated-assault','catalog':'04.04','dataset':'fbi_crime_rate','field':'04.04:derived','public_field':'04.04:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_burglary_2025': {'metric_id':'burglary','catalog':'04.05','dataset':'fbi_crime_rate','field':'04.05:derived','public_field':'04.05:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_motor_vehicle_theft_2025': {'metric_id':'motor-vehicle-theft','catalog':'04.06','dataset':'fbi_crime_rate','field':'04.06:derived','public_field':'04.06:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
    'fbi_rape_revised_2025': {'metric_id':'rape','catalog':'04.07','dataset':'fbi_crime_rate','field':'04.07:derived','public_field':'04.07:derived','year':2025,'unit':'per 100,000','display_unit':'per 100,000','geography':'state','include_native_us':True,'source_releases':('FBI SRS Estimated Crimes 1979-2025 (August 2026)',)},
}


class DatabaseUnavailable(RuntimeError):
    pass


def query(sql, variables=None, *, statement_timeout_ms=8000, database='usa_atlas'):
    # Keep v1 reads operational during an explicit v1 rollback even when this
    # package has the v2 runtime flag but its v2 lock is not shipped. V2 public
    # entrypoints verify the full lock before reaching this SQL wrapper.
    mode = os.environ.get('ATLAS_READER_V2_MODE', 'disabled')
    local_database = os.environ.get('ATLAS_READER_V2_DATABASE', '')
    status = 'local_review' if (mode == 'local_review' and
        re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', local_database) and local_database != 'usa_atlas') else 'admitted'
    for alias in ('rb', 'cb', 'pb', 'ab', 'eb', 'cf', 'gb'):
        sql = sql.replace(f"{alias}.candidate_status IN ('local_review','admitted')",
                          f"{alias}.candidate_status='{status}'")
    env = {**os.environ, 'PGCONNECT_TIMEOUT': '3',
           'PGAPPNAME': 'usa_atlas_ui',
           'PGOPTIONS': f'-c default_transaction_read_only=on -c statement_timeout={statement_timeout_ms}'}
    args = ['psql', '-X', '-w', '-qAt', '--dbname', database, '--set', 'ON_ERROR_STOP=1']
    for name, value in (variables or {}).items():
        args.extend(['--set', f'{name}={value}'])
    try:
        result = subprocess.run(args, input='BEGIN READ ONLY;\n' + sql + ';\nCOMMIT;\n',
                                text=True, capture_output=True, timeout=statement_timeout_ms / 1000 + 4, env=env)
        if result.returncode:
            raise DatabaseUnavailable('PostgreSQL is unavailable. Check the configured database connection and retry.')
        return json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        raise DatabaseUnavailable('PostgreSQL is unavailable. Check the configured database connection and retry.') from error


ACS_METADATA = json.loads((ROOT / 'ux/acs-series.json').read_text())
ACS_SERIES = ACS_METADATA['variables']

NORMALIZATION = json.loads((ROOT / 'ux/metric-definitions.json').read_text())
SELECTION_REGISTRY = json.loads((ROOT / 'ux/selection-registry.json').read_text())
NORMALIZED_BY_ID = {metric['id']: metric for metric in NORMALIZATION['metrics']}
NORMALIZED_BY_FIELD = {metric['fieldId']: metric for metric in NORMALIZATION['metrics'] if metric.get('fieldId')}
NORMALIZED_VARIANTS = NORMALIZATION['variants']
READER_V2_LOCK = ROOT / 'contracts/reader-v2-contract.lock.json'
_verified_reader_v2_lock = None


def presentation_metadata(field_id, source, unit, period, release):
    """Resolve native table units and the ACS five-year label without changing values."""
    display_unit = USDA[field_id][1] if field_id in USDA else {
        'index_us_100': 'index · US = 100', 'persons': 'people',
        'thousand_USD': 'thousand USD',
    }.get(unit, unit)
    metadata = {'unit': display_unit, 'displayPeriod': None, 'unitDefinition': None}
    variable = field_id.split(':', 1)[-1]
    if (source == 'census_acs' and variable in ACS_SERIES and
            re.fullmatch(r'[0-9]{4}', period) and
            ACS_METADATA['release'] == period + '-acs5' and
            release == period + '-acs-acs5'):
        table = variable.split('_', 1)[0]
        if unit == 'source_defined' and table in ACS_METADATA['tableUnits']:
            metadata['unit'] = ACS_METADATA['tableUnits'][table]
            metadata['unitDefinition'] = {
                'variable': variable, 'table': table,
                'url': f'https://data.census.gov/table/ACSDT5Y{period}.{table}',
            }
        metadata['displayPeriod'] = f'{int(period) - 4}–{period}'
    return metadata


def series_label(base, field):
    variable = field.split(':', 1)[-1]
    if variable in ACS_SERIES:
        metadata = ACS_SERIES[variable]
        return metadata['concept'] + ' · ' + metadata['label']
    if field in USDA:
        return USDA[field][0]
    if field.startswith('03.06:'):
        return {'employment': 'Employment · people', 'labor_force': 'Labor force · people',
                'unemployment': 'Unemployment · people', 'unemployment_rate': 'Unemployment rate'}.get(field.split(':')[1], base + ' · ' + field.split(':', 1)[1].replace('_', ' '))
    if field.startswith('08.05:sector_'):
        sector = field.split('_')[-1]
        return base + ' · ' + {'ALL': 'All sectors', 'RES': 'Residential', 'COM': 'Commercial',
                              'IND': 'Industrial', 'TRA': 'Transportation'}.get(sector, sector)
    if field.startswith('04.09:'):
        return 'Crime trends · ' + field.split(':')[1].replace('-', ' ') + ' · year over year'
    return base if ':' not in field else base + ' · ' + field.split(':', 1)[1].replace('_', ' ')


def public_definition(definition):
    return {key: definition.get(key) for key in
            ('formula', 'period', 'displayPeriod', 'unit', 'geography', 'scale',
             'minDenominator', 'source', 'method', 'sourceRelease', 'rateMetadata')
            if definition.get(key) is not None}


def apply_definition(metric, definition, field_id, label, unit, geography, formula=None):
    metric.update({
        'name': label, 'unit': unit, 'fieldId': field_id,
        'stateSupported': 'state' in geography, 'countySupported': 'county' in geography,
        'availability': 'loaded', 'plannedState': 'loaded',
        'source': definition['source'], 'sourceUrl': definition['sourceUrl'],
        'definition': public_definition({**definition, 'unit': unit,
                                         'formula': formula or definition['formula']}),
        'coverageNote': ('State and county observations; select a place.' if
                         {'state', 'county'} <= set(geography) else
                         'State observations only; no county value is inferred.' if 'state' in geography else
                         'County observations only; no state value is inferred.'),
    })


def variant_definition(base, variant):
    definition = {**base, 'label': variant['label'], 'fieldId': variant['fieldId'],
                  'formula': variant['formula'], 'unit': variant.get('unit', base['unit']),
                  'method': variant.get('method', base['method']),
                  'variants': None}
    derived = {**base['derived'], 'numerator': variant['numerator']}
    if 'denominator' in variant:
        derived.update(operation='ratio', denominator=variant['denominator'])
    definition['derived'] = derived
    return definition


for _base in NORMALIZATION['metrics']:
    for _variant in NORMALIZATION['variants'].get(_base['id'], []):
        NORMALIZED_BY_FIELD.setdefault(_variant['fieldId'], variant_definition(_base, _variant))


def catalog():
    # Probe each indexed (catalog, geography) range, skipping large tract/block-group
    # ranges. All probes still use the reader-granted view and passed ingests only.
    # Exact all-geography counts require scanning production's large observation view;
    # null means uncounted, never a fabricated zero or an ingest row_count sum.
    data = query("""
      WITH RECURSIVE inventory(catalog_field_id,geo_type) AS (
        SELECT c.catalog_field_id,o.geo_type FROM usa_atlas.catalog_field c
        CROSS JOIN LATERAL (
          SELECT o.geo_type FROM usa_atlas.observation o
          JOIN usa_atlas.ingest_run i USING(ingest_id)
          WHERE o.catalog_field_id=c.catalog_field_id AND i.status='pass'
          ORDER BY o.geo_type LIMIT 1
        ) o
        UNION ALL
        SELECT p.catalog_field_id,o.geo_type FROM inventory p
        CROSS JOIN LATERAL (
          SELECT o.geo_type FROM usa_atlas.observation o
          JOIN usa_atlas.ingest_run i USING(ingest_id)
          WHERE o.catalog_field_id=p.catalog_field_id AND o.geo_type>p.geo_type AND i.status='pass'
          ORDER BY o.geo_type LIMIT 1
        ) o
      ), geographies AS (
        SELECT catalog_field_id,array_agg(geo_type ORDER BY geo_type) geographies
        FROM inventory GROUP BY catalog_field_id
      ), series AS (
        SELECT c.catalog_field_id,o.* FROM usa_atlas.catalog_field c
        CROSS JOIN LATERAL (
          SELECT o.field_id,bool_or(o.geo_type='state') state_supported,
            bool_or(o.geo_type='county') county_supported
          FROM usa_atlas.observation o JOIN usa_atlas.ingest_run i USING(ingest_id)
          WHERE o.catalog_field_id=c.catalog_field_id
            AND o.geo_type IN ('state','county') AND i.status='pass'
          GROUP BY o.field_id
        ) o
      )
      SELECT json_build_object(
        'fields',(SELECT json_agg(t ORDER BY catalog_field_id) FROM (
          SELECT c.catalog_field_id,c.catalog_label,c.planned_state,c.contract,
            CASE WHEN g.geographies IS NULL THEN 0 ELSE NULL END rows,
            COALESCE(g.geographies,ARRAY[]::text[]) geographies
          FROM usa_atlas.catalog_field c LEFT JOIN geographies g USING(catalog_field_id)) t),
        'series',(SELECT COALESCE(json_agg(s ORDER BY field_id),'[]'::json) FROM series s))
    """, statement_timeout_ms=20000)
    field_rows = data['fields']
    fields = {row['catalog_label']: row for row in field_rows}
    original = json.loads((ROOT / 'ux/catalog.json').read_text())['metrics']
    proposals = json.loads((ROOT / 'ux/catalog-proposals.json').read_text())
    proposed = proposals['metrics']
    v2 = json.loads((ROOT / 'ux/catalog-v2.json').read_text())
    original_names = {m['name'] for m in original}
    v2_metrics = v2['metrics']
    v2_by_id = {m['catalogId']: m for m in v2_metrics}
    row_ids = [row['catalog_field_id'] for row in field_rows]
    base_ids = [m['id'] for m in original]
    proposal_ids = [m['id'] for m in proposed]
    if (len(fields) != len(field_rows) or len(set(row_ids)) != len(row_ids) or
            len(original_names) != len(original) or len(set(base_ids + proposal_ids)) != len(base_ids) + len(proposal_ids) or
            proposals['baseCatalogCount'] != len(original) or
            len(v2_metrics) != 6 or len(v2_by_id) != 6 or
            len(set(base_ids + [m['id'] for m in v2_metrics])) != len(base_ids) + len(v2_metrics) or
            v2.get('baseCatalogCount') != len(original) or v2.get('catalogCount') != len(original) + 6):
        raise DatabaseUnavailable('The database catalog does not match this atlas catalog.')
    extra_ids = set(v2_by_id)
    expected_parent_fields = {item['catalogId']: item['catalogLabel'] for item in v2.get('parentFields', [])}
    expected_parent_ids = set(expected_parent_fields)
    legacy_parent_ids = expected_parent_ids - extra_ids
    base_ids_by_label = {row['catalog_label']: row['catalog_field_id'] for row in field_rows}
    legacy_fields = (set(base_ids_by_label) == original_names and len(field_rows) == len(original) and
                     set(row_ids) == legacy_parent_ids and
                     all(expected_parent_fields[row['catalog_field_id']] == row['catalog_label']
                         for row in field_rows))
    v2_fields = (len(field_rows) == len(original) + len(v2_metrics) and
                 len(expected_parent_ids) == len(original) + len(v2_metrics) and
                 set(row_ids) == expected_parent_ids and
                 all(expected_parent_fields[row['catalog_field_id']] == row['catalog_label']
                     for row in field_rows) and
                 set(base_ids_by_label) == original_names | {m['catalogLabel'] for m in v2_metrics} and
                 extra_ids == {m['catalogId'] for m in v2_metrics} and
                 all(base_ids_by_label.get(m['catalogLabel']) == m['catalogId'] for m in v2_metrics))
    if legacy_fields:
        version_metrics = proposed
        published_count = len(original)
    elif v2_fields:
        version_metrics = v2_metrics
        published_count = len(original) + len(v2_metrics)
    else:
        raise DatabaseUnavailable('The database catalog does not match this atlas catalog.')
    metrics = []
    base_rows = [(base, fields[base['name']]) for base in original]
    if v2_fields:
        fields_by_id = {row['catalog_field_id']: row for row in field_rows}
        base_rows.extend((metadata, fields_by_id[metadata['catalogId']]) for metadata in v2_metrics)
    for base, field in base_rows:
        choices = [s for s in data['series'] if s['catalog_field_id'] == field['catalog_field_id']]
        default = DEFAULT_SERIES.get(field['catalog_field_id'], field['catalog_field_id'])
        if choices and default not in {s['field_id'] for s in choices}:
            default = next((choice['field_id'] for choice in choices
                            if re.fullmatch(r'[0-9]{2}\.[0-9]{2}:B[0-9]{5}_[0-9]{3}E', choice['field_id'])), choices[0]['field_id'])
        for choice in choices or [None]:
            m = {**base, 'catalogId': field['catalog_field_id'], 'observations': field['rows'],
                 'hasObservations': bool(field['geographies']),
                 'geographies': field['geographies'], 'plannedState': field['planned_state']}
            m.update(availability='loaded' if choice else 'unavailable',
                     stateSupported=bool(choice and choice['state_supported']),
                     countySupported=bool(choice and choice['county_supported']),
                     fieldId=choice['field_id'] if choice else None)
            if choice:
                m['name'] = series_label(base['name'], choice['field_id'])
                if choice['field_id'] != default:
                    m['id'] += '--' + re.sub(r'[^a-z0-9]+', '-', choice['field_id'].lower()).strip('-')
            m['coverageNote'] = ('Available from PostgreSQL; select a place for its observation.' if choice else
                'Collected at ' + ', '.join(field['geographies']) + ' level; no state/county allocation is inferred.' if field['geographies'] else
                'No observations have been loaded for this indicator.')
            metrics.append(m)
    switch_labels = {'01.04': 'Race / ethnicity', '07.01': 'Income measure'}
    additions = []
    for metric in metrics:
        definition = NORMALIZED_BY_ID.get(metric['id'])
        if not definition or metric['catalogId'] != definition['catalogId'] or metric['id'] != definition['id']:
            continue
        apply_definition(metric, definition, definition['fieldId'], definition['label'],
                         definition['unit'], definition['geography'])
        variants = NORMALIZED_VARIANTS.get(definition['id'], [])
        if not variants:
            continue
        group = definition['id']
        options = [{'id': definition['id'], 'label': definition['label']}]
        options.extend({'id': variant['id'], 'label': variant['label']} for variant in variants)
        metric['switchGroup'] = group
        metric['switchLabel'] = switch_labels.get(definition['catalogId'], 'Measure')
        metric['switchOptions'] = options
        for variant in variants:
            variant_definition_data = variant_definition(definition, variant)
            clone = {**metric, 'id': variant['id'], 'switchGroup': group,
                     'switchLabel': metric['switchLabel'], 'switchOptions': options}
            apply_definition(clone, variant_definition_data, variant['fieldId'], variant['label'],
                             variant.get('unit', definition['unit']), definition['geography'],
                             formula=variant['formula'])
            additions.append(clone)
    metrics.extend(additions)
    if legacy_fields:
        for proposal in proposed:
            metrics.append({**proposal, 'availability': 'unavailable', 'plannedState': 'proposed',
                            'observations': 0, 'hasObservations': False, 'geographies': [], 'stateSupported': False,
                            'countySupported': False, 'fieldId': None,
                            'coverageNote': proposal['note'] + ' No observations have been loaded.'})
    return {'metrics': metrics, 'catalogCount': len(original) + len(version_metrics),
            'publishedCatalogCount': published_count,
            'visibleFieldCount': SELECTION_REGISTRY['selectionCounts']['primary'],
            'additionalVariantCount': SELECTION_REGISTRY['selectionCounts']['variants'],
            'selectableSelectionCount': SELECTION_REGISTRY['selectionCounts']['total'],
            'retainedSourceFieldCount': SELECTION_REGISTRY['sourceFields'],
            'selectableMetricIds': SELECTION_REGISTRY['selectableIds'],
            'library': NORMALIZATION['library'],
            'availableSeries': len(data['series']), 'observationCount': (sum(f['rows'] for f in fields.values())
                if all(f['rows'] is not None for f in fields.values()) else None)}


def canonical_geo(source, kind, identifier):
    if kind == 'nation':
        return 'US' if identifier == 'US' else None
    if kind == 'county':
        return identifier if re.fullmatch(r'[0-9]{5}', identifier) else None
    if kind != 'state':
        return None
    if source == 'bea_rpp':
        if identifier == '00000':
            return 'US'
        identifier = identifier[:2] if re.fullmatch(r'[0-9]{2}000', identifier) else ''
    elif source in ('fbi_cde', 'eia'):
        return 'US' if identifier == 'US' else STATE_CODES.get(identifier)
    return identifier if identifier in STATE_CODES.values() else None


def _component_query(num_components, den_components):
    components = [('n', component) for component in num_components] + [('d', component) for component in den_components]
    variables = {
        'catalogs': ','.join(sorted({component['field'][:5] for _, component in components})),
        'fields': ','.join(component['field'] for _, component in components),
        'periods': ','.join(sorted({component['period'] for _, component in components})),
    }
    aggregates = []
    for index, (_, component) in enumerate(components):
        multiplier = component.get('multiplier', 1)
        aggregates.append(f"SUM(value * {multiplier}) FILTER (WHERE field_id=:'f{index}') AS c{index}")
        aggregates.append(f"MIN(source) FILTER (WHERE field_id=:'f{index}') AS s{index}")
        aggregates.append(f"MAX(source_release) FILTER (WHERE field_id=:'f{index}') AS r{index}")
        variables[f'f{index}'] = component['field']
    sql = f"""SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json) FROM (
      SELECT geo_id,geo_type,MIN(unit) AS unit,MIN(source_url) AS source_url,
        MIN(methodology_note) AS methodology_note,MAX(source_release) AS source_release,{','.join(aggregates)}
      FROM (
        SELECT DISTINCT ON (o.field_id,o.geo_id,o.geo_type) o.field_id,o.geo_id,o.geo_type,o.value,o.source_release,
          o.unit,o.source,o.source_url,o.methodology_note
        FROM usa_atlas.observation o JOIN usa_atlas.ingest_run i USING(ingest_id)
        WHERE o.catalog_field_id=ANY(string_to_array(:'catalogs',',')::text[])
          AND o.field_id=ANY(string_to_array(:'fields',',')::text[])
          AND o.period=ANY(string_to_array(:'periods',',')::text[])
          AND o.geo_type IN ('state','county','nation') AND i.status='pass'
        ORDER BY field_id,geo_id,geo_type,source_release DESC
      ) s GROUP BY geo_id,geo_type
    ) t"""
    return query(sql, variables, statement_timeout_ms=20000)


def derived_observations(definition):
    spec = definition['derived']
    numerator, denominator = spec['numerator'], spec['denominator']
    components = [('n', component) for component in numerator] + [('d', component) for component in denominator]
    rows = _component_query(numerator, denominator)
    values, sources, excluded, releases = {}, {}, [], {}
    for row in rows:
        for index, (side, component) in enumerate(components):
            raw_value, source, release = row.get(f'c{index}'), row.get(f's{index}'), row.get(f'r{index}')
            if raw_value is None:
                continue
            identifier = canonical_geo(source, row['geo_type'], row['geo_id'])
            if identifier is None:
                excluded.append(row['geo_id'])
                continue
            values.setdefault(index, {})[identifier] = raw_value
            sources.setdefault(index, row)
            releases.setdefault(index, set()).add(release)
    if any(len(found) > 1 for found in releases.values()):
        raise DatabaseUnavailable('The selected components span more than one release.')
    def total(side, identifier):
        indexes = [index for index, (component_side, _) in enumerate(components) if component_side == side]
        found = []
        for index in indexes:
            value = values.get(index, {}).get(identifier)
            if value is None:
                return None
            found.append(value)
        return sum(found)
    geography = definition['geography']
    minimum = definition.get('minDenominator')
    result_rows, suppressed, seen = [], [], set()
    def emit(identifier, value, numerator_total, denominator_total):
        if identifier in seen or not isinstance(value, (int, float)):
            return
        if minimum and denominator_total is not None and denominator_total < minimum:
            suppressed.append(identifier)
            return
        seen.add(identifier)
        result_rows.append({'id': identifier, 'value': value,
                            'geoType': 'nation' if identifier == 'US' else ('county' if len(identifier) == 5 else 'state'),
                            'sourceGeoId': identifier})
    def identifiers(*sides):
        found = set()
        for side in sides:
            for index, (component_side, _) in enumerate(components):
                if component_side == side:
                    found.update(values.get(index, {}))
        return found
    if spec['operation'] == 'sum':
        multiplier = spec.get('multiplier', 1)
        for identifier in identifiers('n'):
            if identifier == 'US' or (identifier in STATE_CODES.values() and set(geography) == {'county'}):
                continue
            value = total('n', identifier)
            if value is not None:
                emit(identifier, value * multiplier, value, None)
        if spec.get('aggregateState'):
            states = {}
            for identifier in identifiers('n'):
                if len(identifier) == 5:
                    states.setdefault(identifier[:2], []).append(identifier)
            for state, counties in states.items():
                emit(state, sum(total('n', county) or 0 for county in counties) * multiplier, None, None)
        if spec.get('aggregateUS'):
            counties = [identifier for identifier in identifiers('n') if len(identifier) == 5]
            emit('US', sum(total('n', county) or 0 for county in counties) * multiplier, None, None)
    else:
        for identifier in identifiers('n', 'd'):
            if identifier == 'US':
                continue
            numerator_total, denominator_total = total('n', identifier), total('d', identifier)
            if numerator_total is None or denominator_total in (None, 0):
                continue
            emit(identifier, numerator_total / denominator_total * spec['multiplier'], numerator_total, denominator_total)
        if spec.get('aggregateState'):
            states = {}
            for identifier in identifiers('n', 'd'):
                if len(identifier) == 5:
                    states.setdefault(identifier[:2], []).append(identifier)
            for state, geos in states.items():
                numerator_total = sum(total('n', geo) or 0 for geo in geos)
                denominator_total = sum(total('d', geo) or 0 for geo in geos)
                if denominator_total:
                    emit(state, numerator_total / denominator_total * spec['multiplier'], numerator_total, denominator_total)
        if spec.get('aggregateUS'):
            numerator_total, denominator_total = total('n', 'US'), total('d', 'US')
            if numerator_total is None:
                numerator_ids = identifiers('n')
                geos = [identifier for identifier in numerator_ids if len(identifier) == 5] or \
                       [identifier for identifier in numerator_ids if len(identifier) == 2]
                found = [value for value in (total('n', geo) for geo in geos) if value is not None]
                numerator_total = sum(found) if found else None
                if numerator_total is not None and denominator:
                    denominator_total = sum(
                        value for value in (total('d', geo) for geo in geos) if value is not None)
            if numerator_total is not None and denominator_total:
                emit('US', numerator_total / denominator_total * spec['multiplier'], numerator_total, denominator_total)
    result_rows.sort(key=lambda row: (row['geoType'], row['id']))
    primary = sources.get(0) or sources.get(len(numerator)) or {}
    return {'fieldId': definition['fieldId'], 'period': definition['period'],
            'displayPeriod': definition.get('displayPeriod'),
            'sourceUnit': primary.get('unit', definition['unit']), 'unit': definition['unit'],
            'source': definition['source'], 'sourceCode': primary.get('source'),
            'sourceRelease': definition.get('sourceRelease') or primary.get('source_release'),
            'definition': public_definition(definition),
            'scale': definition.get('scale'), 'geoLevel': 'county' if 'county' in definition['geography'] else 'state',
            'methodologyNote': definition['method'],
            'observations': result_rows, 'excludedGeographies': excluded,
            'suppressedGeographies': suppressed,
            'selection': 'Derived from published components in one latest release; no allocation or older-place fallback.'}


def observations(field_id):
    if not re.fullmatch(r'[0-9]{2}\.[0-9]{2}(?::[a-zA-Z0-9_:-]{1,80})?', field_id):
        raise ValueError('Invalid field identifier')
    definition = NORMALIZED_BY_FIELD.get(field_id)
    if definition and definition.get('derived'):
        return derived_observations(definition)
    rows = query("""
      WITH chosen AS (
        SELECT o.period,o.source_release FROM usa_atlas.observation o
        JOIN usa_atlas.ingest_run i USING(ingest_id)
        WHERE o.catalog_field_id=:'catalog_id' AND o.field_id=:'field_id'
          AND o.geo_type IN ('state','county') AND i.status='pass'
        ORDER BY o.period DESC,o.source_release DESC LIMIT 1
      )
      SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json) FROM (
        SELECT o.geo_id,o.geo_type,o.period,o.value,o.unit,o.source,o.source_release,
          o.source_url,o.methodology_note,o.retrieved_at
        FROM usa_atlas.observation o JOIN chosen c USING(period,source_release)
        JOIN usa_atlas.ingest_run i USING(ingest_id)
        WHERE o.catalog_field_id=:'catalog_id' AND o.field_id=:'field_id'
          AND o.geo_type IN ('state','county','nation') AND i.status='pass'
      ) t
    """, {'catalog_id': field_id[:5], 'field_id': field_id})
    if not rows:
        raise LookupError('No state/county observations exist for this series')
    identities = {(r['period'], r['unit'], r['source'], r['source_release']) for r in rows}
    if len(identities) != 1:
        raise DatabaseUnavailable('The selected snapshot has incompatible units or sources.')
    period, unit, source, release = next(iter(identities))
    result, excluded, seen = [], [], set()
    for row in rows:
        identifier = canonical_geo(row['source'], row['geo_type'], row['geo_id'])
        if identifier is None:
            excluded.append(row['geo_id'])
            continue
        if identifier in seen:
            raise DatabaseUnavailable('The selected snapshot has ambiguous geography identifiers.')
        seen.add(identifier)
        result.append({'id': identifier, 'geoType': row['geo_type'], 'sourceGeoId': row['geo_id'],
                       'value': row['value'], 'sourceUrl': row['source_url'],
                       'methodologyNote': row['methodology_note'], 'retrievedAt': row['retrieved_at']})
    if definition:
        unit = definition['unit']
        source = definition['source']
        release = definition.get('sourceRelease') or release
        for row in result:
            row['sourceUrl'] = definition['sourceUrl']
            row['methodologyNote'] = definition['method']
    metadata = presentation_metadata(field_id, source, unit, period, release)
    display_period = definition.get('displayPeriod') if definition and definition.get('displayPeriod') else metadata['displayPeriod']
    result_data = {'fieldId': field_id, 'period': period, 'sourceUnit': unit,
            **{**metadata, 'displayPeriod': display_period},
            'source': source, 'sourceCode': source, 'sourceRelease': release,
            'observations': result, 'excludedGeographies': excluded}
    if definition:
        result_data.update({'unit': definition['unit'], 'definition': public_definition(definition),
                            'scale': definition.get('scale'),
                            'geoLevel': 'county' if 'county' in definition['geography'] else 'state',
                            'suppressedGeographies': []})
    result_data['selection'] = 'Latest single period and release in the loaded database; no older-place fallback.'
    return result_data


def unemployment_period_observations(period_type, year, month=None):
    """Read one explicit LAUS period; M13 is an annual average, never a month."""
    if period_type not in ('annual', 'month') or not isinstance(year, int) or not 2000 <= year <= 2100:
        raise ValueError('Choose a supported unemployment period')
    if period_type == 'annual' and month is not None:
        raise ValueError('Annual average does not take a month')
    if period_type == 'month' and (not isinstance(month, int) or not 1 <= month <= 12):
        raise ValueError('Choose a month from January through December')
    _reader_v2_payload_identity()
    return reader_v2_unemployment_period(period_type, year, month)


def unemployment_month_series(year, geography_type, geography_id):
    """Read only observed Jan–Dec LAUS rows for one exact geography."""
    if not isinstance(year, int) or not 2000 <= year <= 2100:
        raise ValueError('Choose a supported unemployment year')
    _reader_v2_payload_identity()
    return reader_v2_unemployment_month_series(year, geography_type, geography_id)


def _verify_reader_v2_lock():
    """Verify the separate formal 2.0 bundle before public admitted reads."""
    global _verified_reader_v2_lock
    if _verified_reader_v2_lock is not None:
        return _verified_reader_v2_lock
    try:
        lock = json.loads(READER_V2_LOCK.read_bytes())
        root = (ROOT / 'contracts/reader/v2').resolve()
        if (lock.get('format') != 'usa_atlas_reader_lock' or lock.get('contractVersion') != '2.0.0' or
                not re.fullmatch(r'[0-9a-f]{40}', str(lock.get('sourceCommit', ''))) or
                not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('contractSha256', ''))) or
                not re.fullmatch(r'[0-9a-f]{64}', str(lock.get('schemaFingerprint', ''))) or
                lock.get('readOnly') is not True or
                lock.get('admissionFilter') != "usa_atlas.ingest_run.status = 'pass' AND usa_atlas.reader_batch.candidate_status = 'admitted'"):
            raise ValueError('reader lock fields are incomplete')
        contract_path = root / 'contract.json'
        contract_raw = contract_path.read_bytes()
        contract = json.loads(contract_raw)
        export = {
            'database/reader/v2/contract.json':'contract.json',
            'database/reader/v2/schema.sql':'schema.sql',
            'database/reader/v2/consumer-protocol.md':'consumer-protocol.md',
            'database/reader/v2/fixtures/reader-fixture.sql':'fixtures/reader-fixture.sql',
            'database/reader/v2/fixtures/reader-query.sql':'fixtures/reader-query.sql',
        }
        if (hashlib.sha256(contract_raw).hexdigest() != lock['contractSha256'] or
                contract.get('contract_version') != '2.0.0' or
                contract.get('format') != 'usa_atlas_reader_contract' or
                contract.get('contract_id') != 'usa_atlas.application_reader' or
                contract.get('schema_fingerprint') != lock['schemaFingerprint'] or
                contract.get('admission_filter') != "usa_atlas.ingest_run.status = 'pass'" or
                contract.get('additional_reader_filter') != "usa_atlas.reader_batch.candidate_status = 'admitted'"):
            raise ValueError('reader contract identity differs from lock')
        artifacts = lock.get('artifacts')
        if (lock.get('consumerExport') != export or not isinstance(artifacts, dict) or
                set(artifacts) != set(export.values()) or
                not isinstance(contract.get('artifact_sha256'), dict)):
            raise ValueError('reader lock does not pin the exact reviewed consumer export')
        for producer_path, local_path in export.items():
            if (producer_path != 'database/reader/v2/contract.json' and
                    contract['artifact_sha256'].get(producer_path) != artifacts.get(local_path)):
                raise ValueError('reader consumer copy is not bound to the frozen producer inventory')
        for relative, expected in artifacts.items():
            artifact = (root / relative).resolve()
            if (not artifact.is_relative_to(root) or not re.fullmatch(r'[0-9a-f]{64}', str(expected)) or
                    hashlib.sha256(artifact.read_bytes()).hexdigest() != expected):
                raise ValueError('reader artifact differs from lock')
        _verified_reader_v2_lock = lock
        return lock
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise DatabaseUnavailable('The admitted reader-v2 contract is not installed or does not match its lock.') from None


def reader_v2_mode():
    """Return disabled, local_review, or admitted; never infer admission from a DB name."""
    mode = os.environ.get('ATLAS_READER_V2_MODE', 'disabled')
    if mode == 'local_review':
        database = os.environ.get('ATLAS_READER_V2_DATABASE', '')
        return mode if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,62}', database) and database != 'usa_atlas' else 'disabled'
    if mode == 'admitted':
        if os.environ.get('ATLAS_READER_V2_DATABASE') not in (None, '', 'usa_atlas'):
            return 'disabled'
        _verify_reader_v2_lock()
        return mode
    return 'disabled'


def _reader_v2_payload_identity():
    mode = reader_v2_mode()
    if mode == 'local_review':
        return {'candidateStatus': 'local_candidate', 'localCandidatePreview': True, 'admissionStatus': 'candidate_nonreleased'}
    if mode == 'admitted':
        return {'candidateStatus': 'admitted', 'localCandidatePreview': False, 'admissionStatus': 'admitted'}
    raise DatabaseUnavailable('Reader-v2 data are unavailable until an explicit reviewed mode is configured.')


def _reader_v2_database():
    mode = reader_v2_mode()
    if mode == 'local_review':
        return os.environ['ATLAS_READER_V2_DATABASE']
    if mode == 'admitted':
        return 'usa_atlas'
    raise DatabaseUnavailable('Reader-v2 data are unavailable until an explicit reviewed mode is configured.')


def reader_v2_cd119_boundary(include_features=False):
    """Return the verified CD119 boundary on demand; production reads admitted DB rows."""
    mode=reader_v2_mode()
    unavailable={'available':False,'boundaryVintage':2024,'congressSession':'119'}
    filename=os.environ.get('ATLAS_CD119_GEOJSON','')
    expected=os.environ.get('ATLAS_CD119_GEOJSON_SHA256','').lower()
    if mode=='local_review' and filename:
        if expected!=CD119_GEOJSON_SHA256:
            return unavailable
        try:
            raw=Path(filename).read_bytes()
            source=json.loads(raw)
        except (OSError,UnicodeDecodeError,json.JSONDecodeError):
            return unavailable
        if hashlib.sha256(raw).hexdigest()!=CD119_GEOJSON_SHA256 or len(raw)>50_000_000:
            return unavailable
        source_rows=[]
        for original in source.get('features',[]):
            props=original.get('properties') or {}
            district=props.get('CD119FP')
            if district=='98':
                continue
            source_rows.append({'geo_id':props.get('GEOID'),'state_fips':props.get('STATEFP'),
              'district_code':district,'label':props.get('NAMELSAD') or props.get('NAME'),
              'is_at_large':district=='00','geometry':original.get('geometry'),
              'geometry_record_sha256':hashlib.sha256(json.dumps(original.get('geometry'),
                  sort_keys=True,separators=(',',':')).encode()).hexdigest(),
              'geometry_source_sha256':CD119_GEOJSON_SHA256,'geometry_source_url':CD119_SOURCE_URL})
    else:
        if mode not in ('local_review','admitted'):
            return unavailable
        database=_reader_v2_database()
        rows=query("""
          SELECT COALESCE(json_agg(t ORDER BY geo_id),'[]'::json)
          FROM (
            SELECT gb.geo_id,gb.state_fips,gb.district_code,gb.is_at_large,gb.seat_type,
              gb.label,gb.geometry_record_sha256,gb.geometry_source_sha256,
              gb.geometry_source_url,
              CASE WHEN :'include_geometry'='true' THEN gb.geometry_json ELSE NULL END AS geometry
            FROM usa_atlas.geography_boundary gb
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            JOIN usa_atlas.reader_batch rb USING (ingest_id)
            WHERE gb.boundary_vintage=2024 AND gb.congress_session='119'
              AND gb.geo_type='congressional_district'
              AND gb.source_release='census-cb-2024-cd119-500k'
              AND gb.geometry_source_url=:'source_url'
              AND gb.geometry_source_sha256=:'geometry_sha256'
              AND gb.candidate_status IN ('local_review','admitted')
              AND i.status='pass' AND rb.candidate_status IN ('local_review','admitted')
              AND gb.seat_type='voting_district'
          ) t
        """,{'source_url':CD119_SOURCE_URL,'geometry_sha256':CD119_GEOJSON_SHA256,
             'include_geometry':'true' if include_features else 'false'},
          statement_timeout_ms=12000,database=database)
        source_rows=rows or []
    ids=set();features=[]
    for row in source_rows:
        state=row.get('state_fips');district=row.get('district_code');geoid=row.get('geo_id')
        geometry=row.get('geometry')
        if (not isinstance(state,str) or not re.fullmatch(r'\d{2}',state) or
            not isinstance(district,str) or not re.fullmatch(r'\d{2}',district) or
            geoid!=state+district or district=='98' or geoid in ids or
            row.get('geometry_source_sha256')!=CD119_GEOJSON_SHA256 or
            row.get('geometry_source_url')!=CD119_SOURCE_URL or
            not re.fullmatch(r'[a-f0-9]{64}',str(row.get('geometry_record_sha256') or '')) or
            (mode=='admitted' and row.get('seat_type') not in (None,'voting_district'))):
            return unavailable
        if mode=='local_review' and not row.get('seat_type'):
            # Explicit file-based local review geometry has no reader table seat metadata.
            pass
        elif row.get('seat_type')!='voting_district':
            return unavailable
        if include_features:
            if not isinstance(geometry,dict) or not geometry:
                return unavailable
            geometry_hash=hashlib.sha256(json.dumps(geometry,sort_keys=True,separators=(',',':')).encode()).hexdigest()
            if geometry_hash!=row['geometry_record_sha256']:
                return unavailable
        ids.add(geoid)
        if include_features:
          features.append({'type':'Feature','id':geoid,'geometry':geometry,'properties':{
          'GEOID':geoid,'STATEFP':state,'CD119FP':district,'NAMELSAD':row.get('label'),
          'name':row.get('label'),'isAtLarge':district=='00'}})
    if len(ids)!=435 or not any(geoid.endswith('00') for geoid in ids):
        return unavailable
    # Keep the original archive and its normalized GeoJSON derivative distinct:
    # database geometry_source_sha256 is the latter, never the ZIP checksum.
    result={'available':True,'boundaryVintage':2024,'congressSession':'119',
      'source':'U.S. Census Bureau TIGER/Line 2024 CD119','sourceUrl':CD119_SOURCE_URL,
      'sourceSha256':CD119_SOURCE_SHA256,'geometryCollectionSha256':CD119_GEOJSON_SHA256,
      'sha256':CD119_GEOJSON_SHA256,'featureCount':len(ids)}
    if include_features:
        result['featureCollection']={'type':'FeatureCollection','features':features}
    return result


def _reader_v2_unemployment_contract(database):
    rows=query("""
      SELECT COALESCE(json_agg(t ORDER BY source_release),'[]'::json)
      FROM (
        SELECT cf.source_release,
          COALESCE(contract->>'sourceRelease',contract->>'source_release') AS "sourceRelease",
          COALESCE(contract->>'seasonalAdjustment',contract->>'seasonal_adjustment') AS "seasonalAdjustment",
          COALESCE(contract->>'sourceCode',contract->>'source_code') AS "sourceCode"
        FROM usa_atlas.reader_v2_catalog_field cf
        WHERE cf.catalog_field_id='03.06' AND cf.dataset_id='unemployment'
          AND cf.candidate_status IN ('local_review','admitted')
          AND COALESCE(contract->>'seasonalAdjustment',contract->>'seasonal_adjustment')='NSA'
      ) t
    """,database=database)
    records=rows if isinstance(rows,list) else ([rows] if rows else [])
    if (len(records)!=1 or records[0].get('seasonalAdjustment')!='NSA' or
            records[0].get('sourceRelease')!=(records[0].get('source_release') or records[0].get('sourceRelease')) or
            records[0].get('sourceCode')!='bls_laus'):
        raise DatabaseUnavailable('Reader-v2 catalog has no explicit BLS LAUS NSA source release contract.')
    return records[0]


def _reader_v2_unemployment_domain(database, year, source_release):
    result=query("""
      SELECT json_build_object('maximum',max(o.value),'observations',count(*))
      FROM usa_atlas.reader_observation o
      JOIN usa_atlas.ingest_run i USING (ingest_id)
      JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
        AND cf.source_release=o.source_release AND cf.dataset_id=o.dataset_id
      JOIN usa_atlas.reader_batch rb USING (ingest_id)
      WHERE o.dataset_id='unemployment' AND o.field_id='03.06:unemployment_rate'
        AND o.catalog_field_id='03.06' AND o.period_kind='monthly' AND o.period_year=:'year'::smallint
        AND o.source_release=:'source_release'
        AND COALESCE(cf.contract->>'seasonalAdjustment',cf.contract->>'seasonal_adjustment')='NSA'
        AND cf.candidate_status IN ('local_review','admitted')
        AND o.quality_status='observed'
        AND o.value IS NOT NULL AND o.unit IN ('percent','%')
        AND o.geo_type IN ('nation','state','county') AND i.status='pass'
        AND rb.candidate_status IN ('local_review','admitted')
    """,{'year':year,'source_release':source_release},database=database)
    maximum=result.get('maximum') if result else None
    if maximum is None or int(result.get('observations') or 0)<1 or not 0<=float(maximum)<=100:
        raise DatabaseUnavailable('No validated 2025 NSA monthly range is available for a shared map scale.')
    high=max(1,math.ceil(float(maximum)/5)*5)
    return [0,high]


def reader_v2_unemployment_period(period_type, year, month=None):
    database=_reader_v2_database()
    contract=_reader_v2_unemployment_contract(database)
    if period_type=='annual':
        if month is not None: raise ValueError('Annual average does not take a month')
    elif period_type=='month':
        if not isinstance(month,int) or not 1<=month<=12: raise ValueError('Invalid calendar month')
    else: raise ValueError('Invalid unemployment period type')
    native_period_kind='monthly' if period_type=='month' else 'annual'
    rows=query("""
      SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json)
      FROM (
        SELECT o.geo_id,o.geo_type,o.value,o.unit,o.quality_status,o.period_kind,
          o.period_year,o.period_month,o.period_start_year,o.period_end_year,
          o.source_period_code,o.source,o.source_release,o.source_url,o.methodology_note,
          o.retrieved_at,COALESCE(cf.contract->>'seasonalAdjustment',cf.contract->>'seasonal_adjustment') AS seasonal_adjustment
        FROM usa_atlas.reader_observation o
        JOIN usa_atlas.ingest_run i USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
          AND cf.source_release=o.source_release AND cf.dataset_id=o.dataset_id
        JOIN usa_atlas.reader_batch rb USING (ingest_id)
        WHERE o.dataset_id='unemployment' AND o.field_id='03.06:unemployment_rate'
          AND o.catalog_field_id='03.06' AND o.period_kind=:'period_kind'
          AND o.period_year=:'year'::smallint
          AND o.period_month IS NOT DISTINCT FROM NULLIF(:'month','')::smallint
          AND o.source_release=:'source_release' AND i.status='pass'
          AND rb.candidate_status IN ('local_review','admitted')
          AND cf.candidate_status IN ('local_review','admitted')
      ) t
    """, {'period_kind':native_period_kind,'year':year,'month':'' if month is None else month,
          'source_release':contract['sourceRelease']}, database=database)
    expected_month=month
    if any(row['seasonal_adjustment']!='NSA' for row in rows):
        raise DatabaseUnavailable('Candidate unemployment contract does not explicitly identify NSA observations.')
    observations=[]; releases=set(); source_periods=set()
    for row in rows or []:
        expected_period_code = f'M{month:02d}' if period_type == 'month' else 'M13'
        if (row['period_kind'] != native_period_kind or int(row['period_year']) != year or
                row['period_month'] != expected_month or row['period_start_year'] != year or
                row['period_end_year'] != year or row['source_period_code'] not in
                (expected_period_code, f'{year}-{expected_period_code}')):
            raise DatabaseUnavailable('Candidate unemployment response contains a different exact period.')
        if row['unit'] not in ('percent','%'):
            raise DatabaseUnavailable('Candidate unemployment observations do not use percent units.')
        if row['source'] not in ('bls_laus', 'BLS LAUS'):
            raise DatabaseUnavailable('Candidate unemployment observations do not identify BLS LAUS.')
        releases.add(row['source_release']); source_periods.add(row['source_period_code'])
        identifier=canonical_geo(row['source'],row['geo_type'],row['geo_id'])
        quality=row['quality_status']
        value=row['value'] if quality=='observed' else None
        if quality=='observed' and (value is None or not 0<=float(value)<=100):
            raise DatabaseUnavailable('Candidate unemployment rate is outside the percent range.')
        observations.append({'id':identifier or row['geo_id'],'geoType':row['geo_type'],
          'sourceGeoId':row['geo_id'],'value':value,'qualityState':quality,
          'sourceUrl':row['source_url'],'methodologyNote':row['methodology_note'],
          'sourceRelease':row['source_release'],'retrievedAt':row['retrieved_at']})
    if len(releases)>1 or (releases and releases!={contract['sourceRelease']}): raise DatabaseUnavailable('Candidate unemployment response mixed source releases.')
    fixed_domain=_reader_v2_unemployment_domain(database,year,contract['sourceRelease'])
    native_period=f'{year}-M13' if period_type=='annual' else f'{year}-M{month:02d}'
    display=f'Annual average {year}' if period_type=='annual' else f'{calendar.month_name[month]} {year}'
    release=next(iter(releases),contract['sourceRelease'])
    return {'datasetId':'unemployment',**_reader_v2_payload_identity(),'fieldId':'03.06:unemployment_rate',
      'period':native_period,'sourcePeriod':next(iter(source_periods),native_period),
      'periodType':period_type,'year':year,'month':month,'displayPeriod':display,
      'sourceSeasonalAdjustment':'NSA','sourceRelease':release,
      'sourceUnit':rows[0]['unit'] if rows else '%','unit':'%',
      'source':'BLS LAUS · not seasonally adjusted','sourceCode':'bls_laus',
      'scale':'linear','fixedDomain':fixed_domain,'periodStatus':'observed' if any(x['qualityState']=='observed' for x in observations) else 'missing',
      'observations':observations,'excludedGeographies':[],
      'selection':'Exact candidate period, source release and NSA contract identity.'}


def reader_v2_unemployment_month_series(year, geography_type, geography_id):
    database=_reader_v2_database()
    contract=_reader_v2_unemployment_contract(database)
    expected_type=('nation' if geography_id=='US' else 'state' if re.fullmatch(r'[0-9]{2}',geography_id or '')
                   else 'county' if re.fullmatch(r'[0-9]{5}',geography_id or '') else None)
    if geography_type!=expected_type: raise ValueError('Geography type does not match identifier.')
    rows=query("""
      SELECT COALESCE(json_agg(t ORDER BY period_month),'[]'::json)
      FROM (
        SELECT o.geo_id,o.geo_type,o.value,o.unit,o.quality_status,o.period_month,
          o.period_year,o.period_kind,o.source_period_code,o.source,o.source_release,o.source_url,
          o.methodology_note,o.retrieved_at,COALESCE(cf.contract->>'seasonalAdjustment',cf.contract->>'seasonal_adjustment') AS seasonal_adjustment
        FROM usa_atlas.reader_observation o JOIN usa_atlas.ingest_run i USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
          AND cf.source_release=o.source_release AND cf.dataset_id=o.dataset_id
        JOIN usa_atlas.reader_batch rb USING (ingest_id)
        WHERE o.dataset_id='unemployment' AND o.field_id='03.06:unemployment_rate'
          AND o.catalog_field_id='03.06' AND o.period_kind='monthly' AND o.period_year=:'year'::smallint
          AND o.period_month BETWEEN 1 AND 12 AND o.geo_id=:'geo_id' AND o.geo_type=:'geo_type'
          AND o.source_release=:'source_release' AND i.status='pass'
          AND cf.candidate_status IN ('local_review','admitted')
          AND rb.candidate_status IN ('local_review','admitted')
      ) t
    """,{'year':year,'geo_id':geography_id,'geo_type':geography_type,
          'source_release':contract['sourceRelease']},database=database)
    allowed_quality={'observed','missing','suppressed','invalid','nonmapping_geography'}
    if any(row['seasonal_adjustment']!='NSA' or row['quality_status'] not in allowed_quality or
           row['unit'] not in ('percent','%') or row['source'] not in ('bls_laus', 'BLS LAUS')
           for row in rows or []):
        raise DatabaseUnavailable('Monthly candidate series lacks verified NSA identity or valid observations.')
    if any(int(row['period_year']) != year or
           row['period_kind'] != 'monthly' or
           row['source_period_code'] not in (f'M{int(row["period_month"]):02d}',
                                             f'{year}-M{int(row["period_month"]):02d}')
           for row in rows or []):
        raise DatabaseUnavailable('Monthly candidate series returned a different exact period.')
    releases={row['source_release'] for row in rows or []}
    if len(releases)>1 or (releases and releases!={contract['sourceRelease']}): raise DatabaseUnavailable('Monthly candidate series mixed source releases.')
    fixed_domain=_reader_v2_unemployment_domain(database,year,contract['sourceRelease'])
    return {**_reader_v2_payload_identity(),'fieldId':'03.06:unemployment_rate','periodType':'month','year':year,
      'geographyType':geography_type,'geographyId':geography_id,'sourceSeasonalAdjustment':'NSA',
      'sourceRelease':next(iter(releases),contract['sourceRelease']),'unit':'%','source':'BLS LAUS · not seasonally adjusted',
      'fixedDomain':fixed_domain,
      'observations':[{'month':int(row['period_month']),'period':f'{year}-M{int(row["period_month"]):02d}',
        'value':row['value'] if row['quality_status']=='observed' else None,'qualityState':row['quality_status'],
        'unit':'%','sourceSeasonalAdjustment':'NSA','sourceRelease':row['source_release'],
        'sourceUrl':row['source_url'],'methodologyNote':row['methodology_note'],'retrievedAt':row['retrieved_at']}
        for row in rows or []],
      'selection':'Observed exact monthly candidate rows only; missing months are omitted.'}


def reader_v2_catalog():
    database = _reader_v2_database()
    identity = _reader_v2_payload_identity()
    # Avoid reading/decoding the large CD119 file during ordinary map startup.
    # The endpoint verifies bytes, hash and features when House geometry is requested.
    boundary=reader_v2_cd119_boundary(include_features=False)
    rows = query("""
      SELECT COALESCE(json_agg(t ORDER BY catalog_field_id),'[]'::json)
      FROM (
        SELECT cf.catalog_field_id,cf.catalog_label,cf.source_release,cf.contract,
          count(DISTINCT o.dataset_id) FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS dataset_count,
          min(o.dataset_id) FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS dataset_id,
          count(DISTINCT o.observation_id) FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS passed_rows,
          count(DISTINCT c.contest_id) FILTER (WHERE ci.status='pass' AND cb.candidate_status IN ('local_review','admitted')) AS passed_contests,
          count(DISTINCT COALESCE(o.source_release,c.source_release)) FILTER (WHERE
            (i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) OR
            (ci.status='pass' AND cb.candidate_status IN ('local_review','admitted'))) AS release_count,
          min(COALESCE(o.source_release,c.source_release)) FILTER (WHERE
            (i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) OR
            (ci.status='pass' AND cb.candidate_status IN ('local_review','admitted'))) AS data_release,
          bool_or(o.geo_type='county') FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS has_county,
          bool_or(o.geo_type='state') FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS has_state,
          bool_or(o.geo_type='congressional_district' AND o.boundary_vintage=2024
                  AND o.congress_session='119') FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS has_cd119,
          min(o.source) FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS source,
          min(o.source_url) FILTER (WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')) AS source_url,
          min(c.source_url) FILTER (WHERE ci.status='pass' AND cb.candidate_status IN ('local_review','admitted')) AS contest_source_url
        FROM usa_atlas.reader_v2_catalog_field cf
        LEFT JOIN usa_atlas.reader_observation o ON o.catalog_field_id=cf.catalog_field_id
          AND o.source_release=cf.source_release AND o.dataset_id=cf.dataset_id
        LEFT JOIN usa_atlas.ingest_run i USING (ingest_id)
        LEFT JOIN usa_atlas.reader_batch rb ON rb.ingest_id=o.ingest_id
        LEFT JOIN usa_atlas.election_contest c ON c.catalog_field_id=cf.catalog_field_id AND
          c.source_release=cf.source_release AND c.dataset_id=cf.dataset_id AND
          c.office=CASE cf.catalog_field_id WHEN '12.01' THEN 'president'
            WHEN '12.02' THEN 'senate' WHEN '12.03' THEN 'house' END
        LEFT JOIN usa_atlas.ingest_run ci ON ci.ingest_id=c.ingest_id
        LEFT JOIN usa_atlas.reader_batch cb ON cb.ingest_id=c.ingest_id
        WHERE cf.catalog_field_id IN ('01.04','12.01','12.02','12.03')
          AND cf.candidate_status IN ('local_review','admitted')
        GROUP BY cf.catalog_field_id,cf.catalog_label,cf.source_release,cf.contract
      ) t
    """, database=database)
    records = rows or []
    entries = []
    for row in records:
        field_id=row['catalog_field_id']
        entries.append({
            'id': {'01.04':'race-ethnicity--aian','12.01':'elections-president',
                   '12.02':'elections-senate','12.03':'elections-house'}.get(field_id),
            'catalogFieldId': field_id,
            'datasetId': ({'01.04':'aian_broad_share','12.01':'election_president_2024',
                           '12.02':'election_senate_2024','12.03':'election_house_2024'}.get(field_id)),
            'sourceRelease': row['data_release'] if int(row['release_count'] or 0)==1 else None,
            'source': row['source'] or ('MIT Election Lab / MEDSL' if field_id.startswith('12.') else None),
            'sourceUrl': row['source_url'] or row['contest_source_url'], 'candidateStatus': identity['candidateStatus'],
            'candidateAvailable': (int(row['release_count'] or 0)==1 and
                                  ((int(row['passed_rows'] or 0) > 0 and int(row['dataset_count'] or 0) == 1)
                                  or (int(row['passed_contests'] or 0) > 0 and
                                      (field_id!='12.03' or boundary['available'])))),
            'geographyType': ('congressional_district' if field_id=='12.03' or row['has_cd119'] else
                              'state_and_county' if row['has_county'] and row['has_state'] else
                              'county' if field_id=='12.01' else
                              'county' if row['has_county'] else 'state'),
            'boundaryVintage': 2024 if field_id=='12.03' and boundary['available'] else None,
            'congressSession': '119' if field_id=='12.03' and boundary['available'] else None,
            'geometryAvailable': boundary['available'] if field_id=='12.03' else None,
        })
    refresh_rows = query("""
      SELECT COALESCE(json_agg(t ORDER BY catalog_field_id,field_id),'[]'::json)
      FROM (
        SELECT o.catalog_field_id,o.dataset_id,o.field_id,o.period_year,o.period_kind,o.unit,
          count(*) AS row_count,count(*) FILTER (WHERE o.quality_status='observed') AS observed_count,
          array_agg(DISTINCT o.source_release ORDER BY o.source_release) AS source_releases,
          min(o.source) AS source,min(o.source_url) AS source_url,
          array_agg(DISTINCT o.source_version ORDER BY o.source_version) AS source_versions,
          count(DISTINCT o.geo_type) AS geography_count
        FROM usa_atlas.reader_observation o
        JOIN usa_atlas.ingest_run i USING (ingest_id)
        JOIN usa_atlas.reader_batch rb USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
          AND cf.source_release=o.source_release AND cf.dataset_id=o.dataset_id
        WHERE i.status='pass' AND rb.candidate_status IN ('local_review','admitted')
          AND cf.candidate_status IN ('local_review','admitted')
          AND o.period_kind='annual' AND o.period_month IS NULL
          AND ((o.catalog_field_id='07.01' AND o.dataset_id='irs_agi' AND o.field_id IN ('07.01:agi_total','07.01:derived:per-resident') AND o.period_year=2023)
            OR (o.catalog_field_id='08.05' AND o.dataset_id='electricity_price' AND o.field_id='08.05:sector_ALL' AND o.period_year=2025)
            OR (o.catalog_field_id='11.01' AND o.dataset_id='cancer' AND o.field_id='11.01' AND o.period_year=2023)
            OR (o.catalog_field_id='11.02' AND o.dataset_id='hiv' AND o.field_id='11.02' AND o.period_year=2024)
            OR (o.catalog_field_id='11.03' AND o.dataset_id='child_deaths_under18' AND o.field_id='11.03' AND o.period_year=2024)
            OR (o.catalog_field_id IN ('04.01','04.02','04.03','04.04','04.05','04.06','04.07')
              AND o.dataset_id='fbi_crime_rate' AND o.field_id=o.catalog_field_id || ':derived' AND o.period_year=2025))
        GROUP BY o.catalog_field_id,o.dataset_id,o.field_id,o.period_year,o.period_kind,o.unit
      ) t
    """,database=database)
    refresh_lookup={(target['catalog'],target['field'],target['dataset'],target['year']):target
                    for target in REFRESH_TARGETS.values()}
    for row in refresh_rows or []:
        target=refresh_lookup.get((row['catalog_field_id'],row['field_id'],row['dataset_id'],int(row['period_year'])))
        if not target: continue
        releases=row['source_releases'] or []
        entries.append({'id':target['metric_id'],
          'catalogFieldId':target['catalog'],'datasetId':next(key for key,value in REFRESH_TARGETS.items() if value is target),
          'readerDatasetId':target['dataset'],'fieldId':target['public_field'],'readerFieldId':target['field'],
          'candidateStatus':identity['candidateStatus'],'candidateAvailable':int(row['observed_count'])>0,
          'sourceRelease':releases[0] if len(releases)==1 else None,'sourceReleases':releases,
          'sourceReleaseLabel':target.get('source_release_label'),
          'source':row['source'],'sourceUrl':row['source_url'],'sourceVersions':row['source_versions'],
          'periodType':'annual','year':int(row['period_year']),'period':str(row['period_year']),
          'geographyType':target['geography'],'unit':target['display_unit'],'sourceUnit':row['unit'],
          'rowCount':int(row['row_count']),'observedCount':int(row['observed_count'])})
    return {'contractStatus':'admitted' if identity['candidateStatus']=='admitted' else 'candidate_nonreleased',
      'localCandidatePreview':identity['localCandidatePreview'],'admissionStatus':identity['admissionStatus'],
      'cd119BoundaryAvailable':boundary['available'],'metrics':entries}


def reader_v2_observations(dataset_id, period_type, year, geography_type, party=None):
    database = _reader_v2_database()
    if dataset_id not in ('unemployment', 'aian_broad_share', 'election_president_2024',
                          'election_senate_2024', 'election_house_2024'):
        if dataset_id not in REFRESH_TARGETS: raise ValueError('Unknown local candidate dataset')
    if not isinstance(year, int) or not 2000 <= year <= 2100:
        raise ValueError('Invalid candidate period')
    if period_type not in ('annual', 'month', 'multi_year', 'cycle'):
        raise ValueError('Invalid candidate period type')
    if dataset_id.startswith('election_'):
        if year != 2024 or period_type != 'cycle' or party not in ('DEMOCRAT','REPUBLICAN'):
            raise ValueError('Only the selected 2024 election party is available in local review.')
        office = {'election_president_2024':'president','election_senate_2024':'senate',
                  'election_house_2024':'house'}[dataset_id]
        geo = {'president':'county','senate':'state','house':'congressional_district'}[office]
        if geography_type != geo:
            raise ValueError('Election geography does not match the selected office.')
        return _reader_v2_election_observations(database, office, party, year, geo)
    if dataset_id in REFRESH_TARGETS:
        target=REFRESH_TARGETS[dataset_id]
        if period_type!='annual' or year!=target['year'] or geography_type!=target['geography']:
            raise ValueError('The local refreshed field requires its exact annual period and supported geography.')
        rows=query("""
          SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json)
          FROM (
            SELECT o.geo_id,o.geo_type,o.value,o.unit,o.quality_status,o.source_value_status,
              o.source,o.source_release,o.source_version,o.source_url,o.methodology_note,
              cf.candidate_status AS catalog_candidate_status,
              o.raw_estimate,o.raw_estimate_moe,o.raw_denominator,o.raw_denominator_moe,
              o.denominator_value,o.period_kind,o.period_year,o.period_month,
              o.period_start_year,o.period_end_year,o.source_period_code,o.retrieved_at
            FROM usa_atlas.reader_observation o
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            JOIN usa_atlas.reader_batch rb USING (ingest_id)
            JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
              AND cf.dataset_id=o.dataset_id AND cf.source_release=o.source_release
            WHERE o.catalog_field_id=:'catalog' AND o.dataset_id=:'reader_dataset'
              AND o.field_id=:'reader_field' AND o.period_kind='annual'
              AND o.period_year=:'year'::smallint AND o.period_month IS NULL
              AND o.period_start_year=:'year'::smallint AND o.period_end_year=:'year'::smallint
              AND o.unit=:'unit' AND i.status='pass'
              AND rb.candidate_status IN ('local_review','admitted')
              AND cf.candidate_status IN ('local_review','admitted')
              AND o.geo_type IN ('nation','state','county')
              AND (o.geo_type<>'nation' OR o.geo_id='US')
              AND (:'geography_type'='state_and_county' OR o.geo_type=:'geography_type'
                OR (:'include_native_us'='true' AND o.geo_type='nation' AND o.geo_id='US'))
          ) t
        """,{'catalog':target['catalog'],'reader_dataset':target['dataset'],'reader_field':target['field'],
              'year':year,'unit':target['unit'],'geography_type':geography_type,
              'include_native_us':'true' if target.get('include_native_us') else 'false'},database=database)
        observations=[]; releases=set(); versions=set(); sources=set(); urls=set()
        for row in rows or []:
            allowed_geo_types=(('state','county','nation') if geography_type=='state_and_county' else
                (('state','nation') if target.get('include_native_us') else (geography_type,)))
            if row['geo_type'] not in allowed_geo_types or (row['geo_type']=='nation' and row['geo_id']!='US'):
                raise DatabaseUnavailable('Refreshed candidate returned an unsupported geography type or national ID.')
            if row['period_kind']!='annual' or row['period_month'] is not None or int(row['period_year'])!=year or row['period_start_year']!=year or row['period_end_year']!=year:
                raise DatabaseUnavailable('Refreshed candidate returned a different annual period.')
            if row['unit']!=target['unit'] or row['quality_status'] not in ('observed','missing','suppressed','invalid','nonmapping_geography'):
                raise DatabaseUnavailable('Refreshed candidate unit or quality status is invalid.')
            expected_catalog_status='local_review' if reader_v2_mode()=='local_review' else 'admitted'
            if row.get('catalog_candidate_status')!=expected_catalog_status:
                raise DatabaseUnavailable('Refreshed candidate catalog field is not admitted in the selected reader mode.')
            if row['quality_status']=='observed' and (row['value'] is None or not math.isfinite(float(row['value']))):
                raise DatabaseUnavailable('Observed refreshed candidate values must be finite.')
            releases.add(row['source_release']); versions.add(row['source_version']); sources.add(row['source']); urls.add(row['source_url'])
            identifier=canonical_geo(row['source'],row['geo_type'],row['geo_id'])
            observations.append({'id':identifier or row['geo_id'],'geoType':row['geo_type'],
              'sourceGeoId':row['geo_id'],'value':row['value'] if row['quality_status']=='observed' else None,
              'qualityState':row['quality_status'],'sourceRelease':row['source_release'],
              'sourceVersion':row['source_version'],'sourceUrl':row['source_url'],
              'methodologyNote':row['methodology_note'],'sourceUnit':row['unit'],
              'numerator':row['raw_estimate'],'numeratorMoe':row['raw_estimate_moe'],
              'denominator':row['raw_denominator'],'denominatorMoe':row['raw_denominator_moe'],
              'denominatorValue':row['denominator_value'],'sourcePeriod':row['source_period_code'],
              'retrievedAt':row['retrieved_at']})
        if any(release not in target.get('source_releases', ()) for release in releases):
            raise DatabaseUnavailable('Refreshed candidate returned a source release outside the reviewed field allowlist.')
        if releases != set(target['source_releases']):
            raise DatabaseUnavailable('Refreshed candidate is missing one of the reviewed source releases.')
        if len(releases)>1 and dataset_id not in ('cancer_2023',):
            raise DatabaseUnavailable('Refreshed candidate mixed source releases for one field.')
        if len(versions)>1 and dataset_id not in ('cancer_2023',):
            raise DatabaseUnavailable('Refreshed candidate mixed source versions for one field.')
        return {'datasetId':dataset_id,**_reader_v2_payload_identity(),
          'fieldId':target['public_field'],'readerFieldId':target['field'],'period':str(year),'displayPeriod':str(year),
          'periodType':'annual','year':year,'geographyType':geography_type,
          'sourceRelease':next(iter(releases)) if len(releases)==1 else None,
          'sourceReleases':sorted(releases),'sourceVersion':next(iter(versions)) if len(versions)==1 else None,
          'sourceVersions':sorted(versions),'source':next(iter(sources)) if len(sources)==1 else None,
          'sourceUrls':sorted(urls),'sourceUnit':target['unit'],'unit':target['display_unit'],
          'unitDefinition':target['unit'],'sourceReleaseLabel':target.get('source_release_label'),
          'observations':observations,
          'selection':'Exact reader field and annual source period; availability follows the selected reader mode.'}
    if dataset_id == 'unemployment':
        raise DatabaseUnavailable('Unemployment candidate records require explicit NSA source metadata before map display.')
    field_id = '01.04:aian_share'
    if period_type != 'multi_year' or year != 2024 or geography_type not in ('nation','state','county','state_and_county'):
        raise ValueError('AIAN candidate selection must be ACS 2024 five-year nation/state/county data.')
    rows = query("""
      SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json)
      FROM (
        SELECT o.dataset_id,o.field_id,o.geo_id,o.geo_type,o.value,o.unit,o.quality_status,
          o.raw_estimate,o.raw_estimate_moe,o.raw_denominator,o.raw_denominator_moe,
          o.denominator_value,o.source,o.source_release,o.source_url,o.methodology_note,
          o.period_kind,o.period_year,o.period_month,o.period_start_year,o.period_end_year,
          o.source_period_code,o.retrieved_at
        FROM usa_atlas.reader_observation o JOIN usa_atlas.ingest_run i USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=o.catalog_field_id
          AND cf.source_release=o.source_release AND cf.dataset_id=o.dataset_id
        JOIN usa_atlas.reader_batch rb USING (ingest_id)
        WHERE o.dataset_id=:'dataset_id' AND o.field_id=:'field_id' AND o.catalog_field_id='01.04'
          AND o.period_kind='multi_year' AND o.period_year=2024 AND o.period_month IS NULL
          AND o.period_start_year=2020 AND o.period_end_year=2024
          AND i.status='pass' AND rb.candidate_status IN ('local_review','admitted')
          AND cf.candidate_status IN ('local_review','admitted')
          AND o.geo_type IN ('nation','state','county')
          AND (:'geography_type'='state_and_county' OR o.geo_type=:'geography_type')
      ) t
    """, {'dataset_id':dataset_id,'field_id':field_id,
          'geography_type':geography_type}, database=database)
    observations=[]; releases=set()
    for row in rows or []:
        releases.add(row['source_release'])
        identifier=canonical_geo('census_acs',row['geo_type'],row['geo_id'])
        quality=row['quality_status']
        observations.append({'id':identifier or row['geo_id'],'value':row['value'] if quality=='observed' else None,
          'qualityState':quality,'count':row['raw_estimate'],'countMoe':row['raw_estimate_moe'],
          'population':row['raw_denominator'],'populationMoe':row['raw_denominator_moe'],
          'sourceUrl':row['source_url'],'methodologyNote':row['methodology_note'],
          'sourceRelease':row['source_release'],'sourcePeriod':row['source_period_code'],
          'geoType':row['geo_type'],'sourceGeoId':row['geo_id'],'retrievedAt':row['retrieved_at']})
    if len(releases)>1: raise DatabaseUnavailable('Candidate ACS rows mix source releases.')
    return {'datasetId':dataset_id,**_reader_v2_payload_identity(),'fieldId':field_id,
      'period':'2020–2024','periodType':'multi_year','year':2024,'geographyType':geography_type,
      'sourceRelease':next(iter(releases),None),
      'unit':'%','source':'U.S. Census Bureau ACS 2024 5-year','sourceSeasonalAdjustment':None,
      'observations':observations,'selection':'ACS 2024 five-year broad AIAN estimate; availability follows the selected reader mode.'}


def _reader_v2_election_observations(database, office, party, year, geography_type):
    catalog_field = {'president':'12.01','senate':'12.02','house':'12.03'}[office]
    reader_dataset = {'president':'president_election','senate':'senate_election',
                      'house':'house_election'}[office]
    map_geo = {'president':'county','senate':'state','house':'congressional_district'}[office]
    rows = query("""
      WITH selected AS (
        SELECT c.*
        FROM usa_atlas.election_contest c
        JOIN usa_atlas.ingest_run ci USING (ingest_id)
        JOIN usa_atlas.reader_batch cb USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=c.catalog_field_id
          AND cf.source_release=c.source_release AND cf.dataset_id=:'dataset_id'
        WHERE c.office=:'office' AND c.election_year=2024
          AND c.catalog_field_id=:'catalog_field'
          AND c.geography_type=:'geography_type'
          AND upper(btrim(c.stage)) IN ('GEN','GENERAL')
          AND c.is_special=false AND c.is_runoff=false AND c.result_mode='TOTAL'
          AND ci.status='pass' AND cb.candidate_status IN ('local_review','admitted')
          AND cf.candidate_status IN ('local_review','admitted')
          AND (c.office<>'house' OR (c.boundary_vintage=2024 AND c.congress_session='119'))
      )
      SELECT COALESCE(json_agg(t ORDER BY geo_type,geo_id),'[]'::json)
      FROM (
        SELECT c.contest_id,c.geo_id,c.geography_type AS geo_type,c.state_fips,
          c.district_code,c.boundary_vintage,c.congress_session,c.election_year,
          c.stage,c.source_stage_values,c.is_special,c.is_runoff,c.result_mode,c.reported_total_votes,
          c.quality_status,c.party_aggregation_status,c.source_release,c.source_url,
          c.source_version,c.geography_mapping_status,c.methodology_note,
          p.party_votes,p.reported_total_votes AS party_total_votes,p.quality_status AS party_quality,
          p.party_aggregation_status AS party_result_aggregation,
          CASE WHEN c.quality_status='observed' AND c.party_aggregation_status='validated'
                     AND p.quality_status='observed' AND p.party_aggregation_status='validated'
                     AND p.reported_total_votes=c.reported_total_votes AND c.reported_total_votes>0
            THEN 100*p.party_votes::numeric/c.reported_total_votes ELSE NULL END AS share,
          CASE WHEN c.quality_status='no_election' THEN 'no_election'
               WHEN c.quality_status='suppressed' THEN 'suppressed'
               WHEN c.quality_status='invalid' THEN 'invalid'
               WHEN c.geography_mapping_status<>'mapped' THEN 'nonmapping_geography'
               WHEN c.quality_status='observed' AND c.party_aggregation_status='validated'
                     AND p.quality_status='observed' AND p.party_aggregation_status='validated'
                     AND p.reported_total_votes=c.reported_total_votes AND c.reported_total_votes>0 THEN 'observed'
               ELSE 'missing' END AS selected_quality,
          cand.candidates
        FROM selected c
        LEFT JOIN usa_atlas.election_party_result p ON p.contest_id=c.contest_id
          AND p.party_normalized=:'party' AND p.source_release=c.source_release
        LEFT JOIN usa_atlas.ingest_run pi ON pi.ingest_id=p.ingest_id AND pi.status='pass'
        LEFT JOIN usa_atlas.reader_batch pb ON pb.ingest_id=p.ingest_id
          AND pb.candidate_status IN ('local_review','admitted')
        LEFT JOIN LATERAL (
          SELECT json_agg(json_build_object('candidateId',e.candidate_id,'candidate',e.candidate_label,
            'votes',e.candidate_votes,'share',CASE WHEN c.reported_total_votes>0
              THEN 100*e.candidate_votes::numeric/c.reported_total_votes ELSE NULL END,
            'sourceVotes',e.candidatevotes_raw,'sourceTotalVotes',e.totalvotes_raw,
            'partyOriginal',e.party_original,'party',e.party_normalized,'writeIn',e.write_in,
            'fusionTicket',e.fusion_ticket,'sourceVersion',e.source_version) ORDER BY e.candidate_label) AS candidates
          FROM usa_atlas.election_candidate e
          JOIN usa_atlas.ingest_run ei ON ei.ingest_id=e.ingest_id AND ei.status='pass'
          JOIN usa_atlas.reader_batch eb ON eb.ingest_id=e.ingest_id
            AND eb.candidate_status IN ('local_review','admitted')
          WHERE e.contest_id=c.contest_id AND e.result_mode='TOTAL'
            AND e.candidate_kind='candidate' AND e.quality_status='observed'
            AND e.party_normalized=:'party'
        ) cand ON true
        WHERE (p.contest_id IS NULL OR (pi.ingest_id IS NOT NULL AND pb.ingest_id IS NOT NULL))
      ) t
    """, {'catalog_field':catalog_field,'dataset_id':reader_dataset,'office':office,'geography_type':map_geo,
          'party':party}, database=database)
    observations=[]; identities=set(); seen=set()
    for row in rows or []:
        identity=(row['source_release'],row['source_version'],row['stage'],
                  row['is_special'],row['is_runoff'],row['result_mode'])
        identities.add(identity)
        if office=='house':
            identifier=row['state_fips']+row['district_code']
        else:
            identifier=row['geo_id']
        if identifier in seen:
            raise DatabaseUnavailable('Multiple election contests map to one place; select a contest identity before display.')
        seen.add(identifier)
        quality=row['selected_quality']
        observations.append({'id':identifier,'geoType':row['geo_type'],
          'value':row['share'] if quality=='observed' else None,'qualityState':quality,
          'votes':row['party_votes'] if quality=='observed' else None,
          'totalVotes':row['reported_total_votes'],'party':party,
          'sourceUrl':row['source_url'],'methodologyNote':row['methodology_note'],
          'sourceRelease':row['source_release'],'contestId':row['contest_id'],
          'electionYear':row['election_year'],'stage':'general','sourceStage':row.get('source_stage_values') or row['stage'],
          'isSpecial':row['is_special'],'isRunoff':row['is_runoff'],
          'resultMode':row['result_mode'],'boundaryVintage':row['boundary_vintage'],
          'congressSession':row['congress_session'],'sourceVersion':row['source_version'],
          'candidates':row['candidates'] or [],
          'geographyMappingStatus':row['geography_mapping_status']})
    availability=query("""
      SELECT COALESCE(json_agg(t ORDER BY geo_id),'[]'::json)
      FROM (
        SELECT a.geo_id,a.quality_status,a.reason,a.source_release,a.stage
        FROM usa_atlas.election_availability a
        JOIN usa_atlas.ingest_run i USING (ingest_id)
        JOIN usa_atlas.reader_batch ab USING (ingest_id)
        JOIN usa_atlas.reader_v2_catalog_field cf ON cf.catalog_field_id=:'catalog_field'
          AND cf.dataset_id=:'dataset_id' AND cf.source_release=a.source_release
        WHERE a.office=:'office' AND a.election_year=2024
          AND a.field_id=:'catalog_field' AND a.geography_type=:'geography_type'
          AND upper(btrim(a.stage)) IN ('GEN','GENERAL')
          AND a.is_special=false AND a.is_runoff=false AND i.status='pass'
          AND ab.candidate_status IN ('local_review','admitted')
          AND cf.candidate_status IN ('local_review','admitted')
      ) t
    """,{'catalog_field':catalog_field,'dataset_id':reader_dataset,
         'office':office,'geography_type':map_geo},database=database)
    for row in availability or []:
        if row['geo_id'] in seen: continue
        if row['quality_status'] not in ('no_election','missing','suppressed','invalid','nonmapping_geography'):
            continue
        identifier=row['geo_id']
        observations.append({'id':identifier,'geoType':geography_type,'value':None,
          'qualityState':row['quality_status'],'sourceRelease':row['source_release'],
          'methodologyNote':row['reason'],'party':party,'electionYear':2024,
          'stage':'general','sourceStage':row['stage'],'isSpecial':False,'isRunoff':False,'resultMode':'TOTAL'})
    if len(identities)>1:
        raise DatabaseUnavailable('Election response mixed contest identity, mode, or source release.')
    catalog_release=next(iter(identities))[0] if identities else None
    catalog_version=next(iter(identities))[1] if identities else None
    identity = _reader_v2_payload_identity()
    lock = _verify_reader_v2_lock() if identity['candidateStatus']=='admitted' else None
    return {'datasetId':f'election_{office}_2024',**identity,
      'contractVersion':lock['contractVersion'] if lock else '2.0.0-candidate',
      'fieldId':catalog_field,
      'selectedParty':party,
      'period':'2024','periodType':'cycle','year':2024,'sourceRelease':catalog_release,
      'unit':'%','fixedDomain':[0,100],'source':'MIT Election Lab / MEDSL',
      'sourceVersion':catalog_version,
      'geographyType':geography_type,'observations':observations,
      'selection':'Selected party votes divided by one contest reported total.'}
