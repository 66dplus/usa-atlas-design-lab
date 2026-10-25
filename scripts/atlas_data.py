"""Read-only PostgreSQL boundary for the local atlas; no ingestion or inferred values."""
import json
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


class DatabaseUnavailable(RuntimeError):
    pass


def query(sql, variables=None, *, statement_timeout_ms=8000, database='usa_atlas'):
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
NORMALIZED_BY_ID = {metric['id']: metric for metric in NORMALIZATION['metrics']}
NORMALIZED_BY_FIELD = {metric['fieldId']: metric for metric in NORMALIZATION['metrics'] if metric.get('fieldId')}
NORMALIZED_VARIANTS = NORMALIZATION['variants']


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
             'minDenominator', 'source', 'method', 'sourceRelease')
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
            'visibleFieldCount': NORMALIZATION['visibleCount'],
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
