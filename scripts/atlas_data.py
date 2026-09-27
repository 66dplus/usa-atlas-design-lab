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
                'eia': 'EIA Electricity', 'usda_fea': 'USDA Food Environment Atlas'}


class DatabaseUnavailable(RuntimeError):
    pass


def query(sql, variables=None):
    env = {**os.environ, 'PGCONNECT_TIMEOUT': '3',
           'PGAPPNAME': 'usa_atlas_ui',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=8000'}
    args = ['psql', '-X', '-w', '-qAt', '--dbname', 'usa_atlas', '--set', 'ON_ERROR_STOP=1']
    for name, value in (variables or {}).items():
        args.extend(['--set', f'{name}={value}'])
    try:
        result = subprocess.run(args, input='BEGIN READ ONLY;\n' + sql + ';\nCOMMIT;\n',
                                text=True, capture_output=True, timeout=12, env=env)
        if result.returncode:
            raise DatabaseUnavailable('PostgreSQL is unavailable. Check the local database connection and retry.')
        return json.loads(result.stdout)
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as error:
        raise DatabaseUnavailable('PostgreSQL is unavailable. Check the local database connection and retry.') from error


def series_label(base, field):
    if field in USDA:
        return USDA[field][0]
    if field.startswith('03.06:'):
        return {'employment': 'Employment · people', 'labor_force': 'Labor force · people',
                'unemployment': 'Unemployment · people', 'unemployment_rate': 'Unemployment rate'}[field.split(':')[1]]
    if field.startswith('08.05:sector_'):
        sector = field.split('_')[-1]
        return base + ' · ' + {'ALL': 'All sectors', 'RES': 'Residential', 'COM': 'Commercial',
                              'IND': 'Industrial', 'TRA': 'Transportation'}.get(sector, sector)
    if field.startswith('04.09:'):
        return 'Crime trends · ' + field.split(':')[1].replace('-', ' ') + ' · year over year'
    return base if ':' not in field else base + ' · ' + field.split(':', 1)[1].replace('_', ' ')


def catalog():
    # Collapse observations before joining ingests: sorting a million raw rows
    # made catalog reloads time out. The small result still admits only passed runs.
    data = query("""
      WITH counts AS MATERIALIZED (
        SELECT catalog_field_id,
          CASE WHEN geo_type IN ('state','county') THEN field_id END field_id,
          geo_type,ingest_id,count(*) rows
        FROM usa_atlas.observation GROUP BY 1,2,3,4
      ), passed AS (
        SELECT c.catalog_field_id,c.field_id,c.geo_type,c.rows
        FROM counts c JOIN usa_atlas.ingest_run i USING (ingest_id) WHERE i.status='pass'
      ), inventory AS (
        SELECT catalog_field_id,sum(rows) rows,array_agg(DISTINCT geo_type ORDER BY geo_type) geographies
        FROM passed GROUP BY catalog_field_id
      ), series AS (
        SELECT catalog_field_id,field_id,bool_or(geo_type='state') state_supported,
          bool_or(geo_type='county') county_supported
        FROM passed WHERE geo_type IN ('state','county') GROUP BY catalog_field_id,field_id
      )
      SELECT json_build_object(
        'fields',(SELECT json_agg(t ORDER BY catalog_field_id) FROM (
          SELECT c.catalog_field_id,c.catalog_label,c.planned_state,c.contract,
            COALESCE(i.rows,0) rows,COALESCE(i.geographies,ARRAY[]::text[]) geographies
          FROM usa_atlas.catalog_field c LEFT JOIN inventory i USING(catalog_field_id)) t),
        'series',(SELECT COALESCE(json_agg(s ORDER BY field_id),'[]'::json) FROM series s))
    """)
    fields = {row['catalog_label']: row for row in data['fields']}
    original = json.loads((ROOT / 'ux/catalog.json').read_text())['metrics']
    if len(fields) != 81 or set(fields) != {m['name'] for m in original}:
        raise DatabaseUnavailable('The database catalog does not match this atlas catalog.')
    metrics = []
    for base in original:
        field = fields[base['name']]
        choices = [s for s in data['series'] if s['catalog_field_id'] == field['catalog_field_id']]
        default = DEFAULT_SERIES.get(field['catalog_field_id'], field['catalog_field_id'])
        if choices and default not in {s['field_id'] for s in choices}:
            default = choices[0]['field_id']
        for choice in choices or [None]:
            m = {**base, 'catalogId': field['catalog_field_id'], 'observations': field['rows'],
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
                'Collected at ' + ', '.join(field['geographies']) + ' level; no state/county allocation is inferred.' if field['rows'] else
                'No observations have been loaded for this indicator.')
            metrics.append(m)
    return {'metrics': metrics, 'catalogCount': len(original),
            'availableSeries': len(data['series']), 'observationCount': sum(f['rows'] for f in fields.values())}


def canonical_geo(source, kind, identifier):
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


def observations(field_id):
    if not re.fullmatch(r'[0-9]{2}\.[0-9]{2}(?::[a-zA-Z0-9_:-]{1,80})?', field_id):
        raise ValueError('Invalid field identifier')
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
          AND o.geo_type IN ('state','county') AND i.status='pass'
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
    return {'fieldId': field_id, 'period': period, 'sourceUnit': unit,
            'unit': USDA[field_id][1] if field_id in USDA else
                    {'index_us_100': 'index · US = 100', 'persons': 'people'}.get(unit, unit),
            'source': SOURCE_NAMES.get(source, source), 'sourceRelease': release,
            'observations': result, 'excludedGeographies': excluded,
            'selection': 'Latest single period and release in the loaded database; no older-place fallback.'}
