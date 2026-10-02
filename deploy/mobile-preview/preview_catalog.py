"""Bounded catalog for the temporary public preview of a large live database."""
import json
import re
import threading
import time

import atlas_data


def _build_catalog():
    # Three indexed witnesses per field keep the preview responsive as the
    # observation table grows. Geography coverage here is a sample, not an
    # exhaustive inventory of the source's native levels.
    records = atlas_data.query("""
      SELECT COALESCE(json_agg(t ORDER BY catalog_field_id), '[]'::json) FROM (
        SELECT c.catalog_field_id,c.catalog_label,c.planned_state,c.contract,
          (SELECT o.geo_type FROM usa_atlas.observation o
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            WHERE o.catalog_field_id=c.catalog_field_id AND i.status='pass'
            ORDER BY o.geo_type LIMIT 1) first_geo,
          (SELECT o.field_id FROM usa_atlas.observation o
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            WHERE o.catalog_field_id=c.catalog_field_id AND o.geo_type='state'
              AND i.status='pass'
              AND (o.source <> 'census_acs' OR o.field_id LIKE '%E')
            LIMIT 1) state_field,
          (SELECT o.field_id FROM usa_atlas.observation o
            JOIN usa_atlas.ingest_run i USING (ingest_id)
            WHERE o.catalog_field_id=c.catalog_field_id AND o.geo_type='county'
              AND i.status='pass'
              AND (o.source <> 'census_acs' OR o.field_id LIKE '%E')
            LIMIT 1) county_field
        FROM usa_atlas.catalog_field c
      ) t
    """)
    original = json.loads((atlas_data.ROOT / 'ux/catalog.json').read_text())['metrics']
    fields = {row['catalog_label']: row for row in records}
    if len(fields) != 81 or set(fields) != {metric['name'] for metric in original}:
        raise atlas_data.DatabaseUnavailable('The database catalog does not match this atlas catalog.')
    metrics = []
    for base in original:
        field = fields[base['name']]
        state_field, county_field = field['state_field'], field['county_field']
        field['geographies'] = list(dict.fromkeys(
            geography for present, geography in (
                (state_field, 'state'), (county_field, 'county'),
                (field['first_geo'], field['first_geo'])) if present))
        choices = []
        for field_id, geography in ((state_field, 'state'), (county_field, 'county')):
            if not field_id:
                continue
            choice = next((item for item in choices if item['field_id'] == field_id), None)
            if choice is None:
                choice = {'field_id': field_id, 'state_supported': False, 'county_supported': False}
                choices.append(choice)
            choice[geography + '_supported'] = True
        if field['catalog_field_id'] == '03.06' and choices:
            # These published BLS series are used by the prototype's quick stats.
            for suffix in ('employment', 'labor_force', 'unemployment'):
                choices.append({'field_id': '03.06:' + suffix,
                                'state_supported': True, 'county_supported': True})
        default = atlas_data.DEFAULT_SERIES.get(field['catalog_field_id'], field['catalog_field_id'])
        if choices and default not in {item['field_id'] for item in choices}:
            default = choices[0]['field_id']
        for choice in choices or [None]:
            metric = {**base, 'catalogId': field['catalog_field_id'],
                      'observations': int(bool(field['geographies'])),
                      'geographies': field['geographies'], 'plannedState': field['planned_state']}
            metric.update(availability='loaded' if choice else 'unavailable',
                          stateSupported=bool(choice and choice['state_supported']),
                          countySupported=bool(choice and choice['county_supported']),
                          fieldId=choice['field_id'] if choice else None)
            if choice:
                metric['name'] = atlas_data.series_label(base['name'], choice['field_id'])
                if choice['field_id'] != default:
                    metric['id'] += '--' + re.sub(r'[^a-z0-9]+', '-', choice['field_id'].lower()).strip('-')
            metric['coverageNote'] = (
                'Available from PostgreSQL; select a place for its observation.' if choice else
                'Collected at ' + ', '.join(field['geographies']) + ' level; no state/county allocation is inferred.'
                if field['geographies'] else 'No observations have been loaded for this indicator.'
            )
            metrics.append(metric)
    return {'metrics': metrics, 'catalogCount': len(original),
            'availableSeries': sum(metric['fieldId'] is not None for metric in metrics),
            'observationCount': None}


_cache_lock = threading.Lock()
_cached_catalog = None
_cached_at = 0.0


def catalog():
    global _cached_catalog, _cached_at
    if _cached_catalog is not None and time.monotonic() - _cached_at < 300:
        return _cached_catalog
    with _cache_lock:
        if _cached_catalog is not None and time.monotonic() - _cached_at < 300:
            return _cached_catalog
        try:
            fresh = _build_catalog()
        except atlas_data.DatabaseUnavailable:
            if _cached_catalog is not None:
                return _cached_catalog
            raise
        _cached_catalog, _cached_at = fresh, time.monotonic()
        return fresh
