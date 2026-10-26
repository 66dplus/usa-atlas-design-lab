import assert from 'node:assert/strict';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const events = new Set(['initial_view', 'indicator_select', 'place_select', 'compare_view',
  'active_time', 'sources_open', 'save_success', 'share_success', 'view_select',
  'view_restore', 'comparison_mode_select'].map(name => 'atlas_' + name));
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function keys(value, required, optional = []) {
  assert.ok(object(value) && required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => required.includes(key) || optional.includes(key)),
  'Telemetry must contain only the approved schema; no creative/contact/private fields');
}
function place(data, prefix = '') {
  const type = data[prefix + 'place_type'], id = data[prefix + 'place_id'], state = data[prefix + 'state_id'];
  assert.ok(typeof id === 'string' && typeof state === 'string', 'Telemetry place IDs must be strings');
  assert.ok((type === 'us' && id === 'US' && state === '') ||
    (type === 'state' && /^\d{2}$/.test(id) && state === id) ||
    (type === 'county' && /^\d{5}$/.test(id) && state === id.slice(0, 2)), 'Telemetry geography must use typed FIPS');
}

/** Test boundary only: classify each actual POST, never modify or suppress telemetry. */
export function assertStudioPost(request, base, websiteIds, indicators = new Set(['unemployment'])) {
  const url = new URL(request.url), origin = new URL(base);
  assert.ok(request.method === 'POST' && url.origin === origin.origin &&
    url.pathname === '/analytics/api/send' && !url.search && !url.hash && !url.username && !url.password,
  'Unexpected POST destination; advertising/contact/draft delivery remains forbidden');
  assert.ok(request.headers['content-type']?.split(';')[0].trim().toLowerCase() === 'application/json',
    'Telemetry must be JSON');
  assert.ok(!request.headers.authorization && !request.headers.cookie, 'Anonymous telemetry cannot carry credentials');
  assert.ok(typeof request.body === 'string' && Buffer.byteLength(request.body) <= 8192, 'Telemetry body must be bounded');
  let body;
  try { body = JSON.parse(request.body); } catch { assert.fail('Telemetry must contain valid JSON'); }
  keys(body, ['type', 'payload']);
  assert.ok(body.type === 'event', 'Only approved anonymous event telemetry is allowed');
  const p = body.payload;
  keys(p, ['website', 'screen', 'language', 'title', 'hostname', 'url', 'referrer'], ['tag', 'name', 'data']);
  assert.ok(websiteIds.has(p.website) && uuid.test(p.website), 'Telemetry website must match observed public runtime configuration');
  assert.ok(p.hostname === origin.hostname && p.title === 'USA X-Ray' && p.referrer === '' &&
    (p.tag === undefined || p.tag === null), 'Telemetry cannot contain identifying titles, referrers or tags');
  assert.ok(typeof p.screen === 'string' && /^[1-9]\d{0,4}x[1-9]\d{0,4}$/.test(p.screen) &&
    typeof p.language === 'string' && /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(p.language), 'Invalid anonymous telemetry dimensions/language');
  assert.ok(['/ux/', '/ux/explorer', '/ux/compare', '/ux/trends'].includes(p.url), 'Telemetry URL must be sanitized; no query/fragment or draft URL');
  if (p.name === undefined) {
    assert.ok(p.data === undefined && p.url === '/ux/', 'Anonymous initial pageview must not contain custom data');
    return;
  }
  assert.ok(events.has(p.name), 'Unapproved telemetry event');
  const d = p.data;
  const required = ['schema_version', 'surface', 'indicator_id', 'place_type', 'place_id', 'state_id', 'comparison', 'exploration_id'];
  const comparison = d?.comparison;
  if (comparison) required.push('other_indicator_id', 'other_place_type', 'other_place_id', 'other_state_id', 'pair_key');
  if (p.name === 'atlas_active_time') required.push('active_ms');
  const optional = p.name === 'atlas_place_select' ? ['selected_place_type', 'selected_place_id', 'selected_state_id'] :
    p.name === 'atlas_indicator_select' ? ['selected_indicator_id'] : p.name === 'atlas_view_select' ? ['entry'] : [];
  keys(d, required, optional);
  assert.ok(d.schema_version === 1 && ['explorer', 'compare', 'trends'].includes(d.surface) &&
    p.url === '/ux/' + d.surface && uuid.test(d.exploration_id) && indicators.has(d.indicator_id), 'Invalid approved Atlas context');
  assert.ok(['', 'places', 'metrics'].includes(comparison), 'Invalid telemetry comparison');
  assert.ok((d.surface === 'compare') === Boolean(comparison), 'Comparison must match its surface');
  place(d);
  if (comparison) {
    place(d, 'other_');
    const pair = [d.place_type + ':' + d.place_id, d.other_place_type + ':' + d.other_place_id].sort().join('|');
    assert.ok(d.surface === 'compare' && d.pair_key === pair && indicators.has(d.other_indicator_id), 'Invalid comparison attribution');
  }
  if (Object.hasOwn(d, 'active_ms')) assert.ok(Number.isSafeInteger(d.active_ms) && d.active_ms > 0 && d.active_ms <= 86400000, 'Invalid active time');
  if (['selected_place_type', 'selected_place_id', 'selected_state_id'].some(key => Object.hasOwn(d, key))) place(d, 'selected_');
  if (Object.hasOwn(d, 'selected_indicator_id')) assert.ok(indicators.has(d.selected_indicator_id), 'Unapproved selected indicator');
  if (Object.hasOwn(d, 'entry')) assert.ok(d.entry === 'prompt', 'Unapproved telemetry entry');
}
