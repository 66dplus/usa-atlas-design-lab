import assert from 'node:assert/strict';
import { assertStudioPost } from './studio-request-contract.mjs';
const base = 'http://127.0.0.1:52938', website = '11111111-1111-4111-8111-111111111111';
const websites = new Set([website]);
const payload = { website, screen: '390x844', language: 'en-US', title: 'USA X-Ray',
  hostname: '127.0.0.1', url: '/ux/', referrer: '', tag: null };
const data = { schema_version: 1, surface: 'explorer', indicator_id: 'unemployment',
  place_type: 'state', place_id: '06', state_id: '06', comparison: '',
  exploration_id: '22222222-2222-4222-8222-222222222222' };
const request = p => ({ url: base + '/analytics/api/send', method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'event', payload: p }) });
const event = { ...payload, url: '/ux/explorer', name: 'atlas_initial_view', data };
for (const value of [payload, event, { ...event, name: 'atlas_active_time', data: { ...data, active_ms: 15000 } }])
  assertStudioPost(request(value), base, websites);
let rejected = 0;
for (const invalid of [
  { ...request(payload), url: base + '/api/advertising' },
  { ...request(payload), url: 'https://elsewhere.test/analytics/api/send' },
  { ...request(payload), url: base + '/analytics/api/send?contact=private' },
  { ...request(payload), body: '{invalid' },
  { ...request(payload), headers: { 'content-type': 'text/plain' } },
  { ...request(payload), headers: { 'content-type': 'application/json', authorization: 'private' } },
  { ...request(payload), headers: { 'content-type': 'application/json', cookie: 'private' } },
  request({ ...payload, website: '33333333-3333-4333-8333-333333333333' }),
  request({ ...payload, title: 'A private creative headline' }),
  request({ ...payload, url: '/ux/?contact=private' }),
  request({ ...payload, referrer: '/private?description=private' }),
  request({ ...payload, tag: 'private@example.test' }),
  request({ ...event, data: { ...data, contact: 'private@example.test' } }),
  request({ ...event, data: { ...data, creative: { headline: 'private' } } }),
  request({ ...event, data: { ...data, description: 'private' } }),
  request({ ...event, data: { ...data, indicator_id: 'private-contact' } }),
  request({ ...event, data: { ...data, selected_place_type: 'private@example.test' }, name: 'atlas_place_select' }),
  request({ ...event, data: { ...data, exploration_id: 'private' } }),
  request({ ...event, data: { ...data, state_id: '36' } }),
  request({ ...event, name: 'atlas_contact_send' }),
  { ...request(payload), body: JSON.stringify({ type: 'identify', payload }) },
]) { assert.throws(() => assertStudioPost(invalid, base, websites)); rejected++; }
console.log(`PASS: studio request contract; 3 approved telemetry cases, ${rejected} privacy/unknown-POST negatives; no payloads logged`);
