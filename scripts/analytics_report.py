"""Aggregate local Atlas telemetry through Umami API, without exposing sessions."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from analytics_api import UmamiAPI, read_env

EVENTS = ('initial_view', 'indicator_select', 'place_select', 'compare_view', 'active_time', 'sources_open', 'save_success', 'share_success', 'view_select', 'view_restore', 'comparison_mode_select')


def aggregate(rows):
    indicators, places, pairs, pair_indicators, counts = Counter(), Counter(), Counter(), defaultdict(Counter), Counter()
    active, explorations = Counter(), defaultdict(set)
    active_places = Counter()
    active_pairs, active_pair_indicators = Counter(), defaultdict(Counter)
    for name, data in rows:
        counts[name] += 1
        indicator = data.get('selected_indicator_id') or data['indicator_id']
        place = data.get('selected_place_type', data['place_type']) + ':' + data.get('selected_place_id', data['place_id'])
        if name == 'indicator_select':
            indicators[indicator] += 1
        elif name == 'place_select':
            places[place] += 1
        elif name == 'compare_view':
            pair = data['pair_key']
            # Two-metric comparisons remain distinct from two-place interest.
            if data['comparison'] == 'places':
                pairs[pair] += 1
                pair_indicators[pair][indicator] += 1
        elif name == 'active_time':
            milliseconds = max(0, float(data['active_ms']))
            key = '|'.join(sorted([indicator, data['other_indicator_id']])) if data.get('comparison') == 'metrics' else indicator
            active[key] += milliseconds
            explorations[key].add(data['exploration_id'])
            active_places[data['place_type'] + ':' + data['place_id']] += milliseconds
            if data.get('comparison') == 'places':
                active_pairs[data['pair_key']] += milliseconds
                active_pair_indicators[data['pair_key']][indicator] += milliseconds
    return {'eventCounts': dict(counts), 'indicators': dict(indicators.most_common()), 'places': dict(places.most_common()),
            'comparisons': dict(pairs.most_common()), 'comparisonIndicators': {key: dict(value.most_common()) for key, value in pair_indicators.items()},
            'activeTimeByIndicator': {key: {'totalMs': int(value), 'explorations': len(explorations[key]), 'averageMs': round(value / len(explorations[key]))} for key, value in active.most_common()},
            'activeTimeByPrimaryPlace': {key: int(value) for key, value in active_places.most_common()},
            'activeTimeByComparison': {key: {'totalMs': int(value), 'indicators': {indicator: int(duration) for indicator, duration in active_pair_indicators[key].most_common()}} for key, value in active_pairs.most_common()}}


def report(api, website, start, end):
    prefix = '/api/websites/' + website
    rows = ((name, data) for name in EVENTS for data in api.event_rows(website, 'atlas_' + name, start, end))
    return {'period': {'startAt': start, 'endAt': end, 'timezone': 'UTC'}, 'websiteId': website,
            'traffic': api.request(prefix + '/stats', params={'startAt': start, 'endAt': end}),
            'onlineNow': api.request(prefix + '/active'), 'onlineWindowMinutes': 5, **aggregate(rows)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--secrets-file', type=Path, default=Path.home() / '.config/usa-atlas/analytics.env')
    parser.add_argument('--test', action='store_true', help='Read the isolated Browser QA website')
    parser.add_argument('--days', type=int, choices=(7, 30, 90), default=30)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    values = read_env(args.secrets_file)
    api = UmamiAPI(values['ATLAS_ANALYTICS_URL'])
    api.login(values['UMAMI_ADMIN_PASSWORD'])
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=args.days)
    result = report(api, values['ATLAS_ANALYTICS_TEST_WEBSITE_ID' if args.test else 'ATLAS_ANALYTICS_WEBSITE_ID'], int(start.timestamp()*1000), int(end.timestamp()*1000))
    output = json.dumps(result, indent=2)
    if args.output:
        args.output.write_text(output + '\n')
    else:
        print(output)
