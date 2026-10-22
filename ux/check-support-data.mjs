import assert from 'node:assert/strict';
import {normalizeDonationMethods, normalizeSupportData, normalizeSupportGoal} from './support-data.js';

const unconfigured = normalizeSupportData(null);
assert.equal(unconfigured.status, 'unconfigured');
assert.equal(unconfigured.goal.status, 'unconfigured');
assert.equal(unconfigured.goal.goal, null, 'unconfigured funding must not become a fake $0');
assert.equal(unconfigured.donationMethods.status, 'unconfigured');
assert.deepEqual(unconfigured.donationMethods.wallets, []);

// Synthetic values exercise formatting and clamping only; no goal ships in project-content.json.
const goal = (raisedUsd, overrides = {}) => ({
  title: 'Next release package',
  targetUsd: 1000,
  raisedUsd,
  updatedAt: '2026-10-22',
  improvements: [
    {id: 'maps', title: 'Improve map labels', status: 'funded'},
    {id: 'sources', title: 'Add source notes', status: 'shipped'}
  ],
  ...overrides
});

const zero = normalizeSupportGoal(goal(0));
assert.equal(zero.status, 'available');
assert.equal(zero.goal.state, 'zero');
assert.equal(zero.goal.progress, 0);
assert.equal(zero.goal.progressPercent, 0);

const partial = normalizeSupportGoal(goal(420));
assert.equal(partial.goal.state, 'partial');
assert.equal(partial.goal.progress, 0.42);
assert.equal(partial.goal.progressPercent, 42);

const funded = normalizeSupportGoal(goal(1000));
assert.equal(funded.goal.state, 'funded');
assert.equal(funded.goal.progress, 1);
assert.equal(funded.goal.overageUsd, undefined);

const over = normalizeSupportGoal(goal(1180));
assert.equal(over.goal.state, 'over-goal');
assert.equal(over.goal.raisedUsd, 1180, 'retain the actual raised total');
assert.equal(over.goal.progress, 1, 'clamp only the progress track');
assert.equal(over.goal.progressPercent, 100);
assert.equal(over.goal.overageUsd, 180);

for (const invalid of [
  goal(-1), goal(NaN), goal(Infinity), goal(0.001), goal(1, {targetUsd: 0}),
  goal(1, {targetUsd: -10}), goal(1, {targetUsd: 1.001}),
  goal(1, {updatedAt: '2026-02-30'}), goal(1, {updatedAt: '2026-1-02'}),
  goal(1, {updatedAt: 'not-a-date'}), goal(1, {improvements: [{id:'x', title:'Invalid status', status:'done'}]}),
  goal(1, {improvements: [{id:'same', title:'One', status:'funded'}, {id:'same', title:'Two', status:'shipped'}]}),
  goal(1, {improvements: [{id:'x', title:'One', status:'funded'}, {id:' x ', title:'Two', status:'shipped'}]})
]) {
  assert.equal(normalizeSupportGoal(invalid).status, 'unavailable');
  assert.equal(normalizeSupportGoal(invalid).goal, null);
}
assert.equal(normalizeSupportGoal({title:'Missing target'}).status, 'unavailable');
assert.equal(normalizeSupportGoal({title:'Empty roadmap', targetUsd:1000, raisedUsd:0, updatedAt:'2026-10-22'}).status, 'unavailable');

const stages = normalizeSupportGoal(goal(500)).goal.improvements;
assert.equal(stages[0].status, 'funded');
assert.equal(stages[1].status, 'shipped');
assert.notEqual(stages[0].status, stages[1].status, 'funded is not shipped');

const channels = normalizeDonationMethods({
  externalLinks: [
    {id:'support-link', confirmed:true, label:'Contribution page', url:'https://example.org/support'}
  ],
  wallets: [
    {id:'bitcoin', confirmed:true, asset:'BTC', network:'Bitcoin', address:'confirmed-address', qrUrl:'https://example.org/qr/bitcoin.png'}
  ]
});
assert.equal(channels.status, 'available');
assert.deepEqual(channels.externalLinks.map(item => item.id), ['support-link']);
assert.deepEqual(channels.wallets.map(item => item.id), ['bitcoin']);
assert.equal(normalizeDonationMethods({externalLinks:[{id:'x',confirmed:true,label:'No URL'}]}).status, 'unavailable', 'incomplete confirmed link is explicitly unavailable');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:true,asset:'BTC',address:'address',qrUrl:'https://example.org/qr.png'}]}).status, 'unavailable', 'wallet is unavailable until its network is confirmed');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:true,asset:'BTC',network:'Bitcoin',address:'address',qrUrl:'javascript:alert(1)'}]}).status, 'unavailable', 'QR destinations must be HTTPS');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:true,asset:'BTC',network:'Bitcoin',address:'address',qrUrl:'/ux/assets/support/bitcoin.png'}]}).status, 'available', 'same-origin root-relative QR assets are allowed');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:true,asset:'BTC',network:'Bitcoin',address:'address',qrUrl:'//other.example/bitcoin.png'}]}).status, 'unavailable', 'protocol-relative QR URLs are rejected');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:true,asset:'BTC',network:'Bitcoin',address:'address',qrUrl:'/ux/assets/../private.png'}]}).status, 'unavailable', 'root-relative QR paths cannot traverse directories');
assert.equal(normalizeDonationMethods({externalLinks:[{id:'x',confirmed:true,label:'Missing destination'}]}).status, 'unavailable');
assert.equal(normalizeDonationMethods({externalLinks:[{id:'x',confirmed:true,label:'Insecure',url:'http://example.org/support'}]}).status, 'unavailable', 'external payment links remain HTTPS-only');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',confirmed:false,asset:'BTC',network:'Bitcoin',address:'unconfirmed',qrUrl:'https://example.org/qr.png'}]}).wallets.length, 0);
assert.equal(normalizeDonationMethods({externalLinks:'not-an-array'}).status, 'unavailable');
assert.equal(normalizeDonationMethods({wallets:[{id:'x',asset:'BTC',network:'Bitcoin',address:'address',qrUrl:'https://example.org/qr.png'}]}).status, 'unconfigured', 'unconfirmed destinations stay hidden');

assert.equal(normalizeSupportData({goal:goal(100), donationMethods:{}}).status, 'available');
assert.equal(normalizeSupportData({goal:goal(100), donationMethods:{}}).goal.goal.state, 'partial');
assert.equal(normalizeSupportData({goal:goal(100, {updatedAt:'bad'}), donationMethods:{}}).status, 'unavailable');
assert.equal(normalizeSupportData('invalid').status, 'unavailable');

console.log('Support data checks passed.');
