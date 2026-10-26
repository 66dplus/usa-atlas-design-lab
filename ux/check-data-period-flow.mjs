import assert from 'node:assert/strict';
import { createDataStore, formatValue, parseUnemploymentPeriod, prepareLayer, unemploymentPeriodKey } from './model.js';

assert.deepEqual(parseUnemploymentPeriod('2025'), { type: 'annual', year: 2025 });
assert.deepEqual(parseUnemploymentPeriod('2025-M12'), { type: 'month', year: 2025, month: 12 });
assert.equal(unemploymentPeriodKey({ type: 'annual', year: 2025 }), '2025-M13');
assert.equal(parseUnemploymentPeriod('2025-M13').type, 'annual');

const metric = { id: 'unemployment', fieldId: '03.06:unemployment_rate', catalogId: '03.06',
  periodControl: 'unemployment-2025', stateSupported: true, countySupported: true, hasObservations: true };
const geo = { byId: new Map([['US', { id: 'US' }], ['06', { id: '06' }], ['20', { id: '20' }]]) };
const response = (data) => ({ ok: true, json: async () => data });
const payload = (periodType, month, value, extra = {}) => ({
  fieldId: metric.fieldId, periodType, year: 2025, month,
  period: periodType === 'annual' ? '2025-M13' : `2025-M${String(month).padStart(2, '0')}`,
  sourceSeasonalAdjustment: 'NSA', sourceRelease: 'bls-laus-nsa-2025', unit: '%',
  scale: 'linear', fixedDomain: [0, 20], periodStatus: value == null ? 'missing' : 'observed',
  observations: value == null ? [] : [{ id: 'US', geoType: 'nation', value }], ...extra,
});

const requests = [];
const store = createDataStore(geo, () => {}, async (url) => {
  requests.push(url);
  const u = new URL(url, 'http://localhost');
  const m = u.searchParams.get('month');
  return response(payload(u.searchParams.get('period_type'), m == null ? null : Number(m), 0));
});
const zero = await store.load(metric, { period: { type: 'month', year: 2025, month: 1 } });
assert.equal(new URL(requests[0], 'http://localhost').searchParams.get('month'), '1');
assert.equal(zero.observations.get('US').value, 0, 'a true zero stays observed');
assert.deepEqual(zero.domain, [0, 20], 'monthly map domain is fixed across periods');

const missingStore = createDataStore(geo, () => {}, async () => response(payload('month', 10, null)));
const missing = await missingStore.load(metric, { period: { type: 'month', year: 2025, month: 10 } });
assert.equal(missing.status, 'ready');
assert.equal(missing.observations.has('US'), false, 'no row is not a zero');

const mismatchStore = createDataStore(geo, () => {}, async () => response(payload('month', 11, 2)));
assert.equal((await mismatchStore.load(metric, { period: { type: 'month', year: 2025, month: 10 } })).status, 'error',
  'the body must prove its exact requested month');
const seasonalStore = createDataStore(geo, () => {}, async () => response(payload('month', 10, 2, { sourceSeasonalAdjustment: undefined })));
assert.equal((await seasonalStore.load(metric, { period: { type: 'month', year: 2025, month: 10 } })).status, 'error',
  'BLS source alone does not prove NSA identity');
const wrongAnnualStore = createDataStore(geo, () => {}, async () => response(payload('month', 1, 2)));
assert.equal((await wrongAnnualStore.load(metric, { period: { type: 'annual', year: 2025 } })).status, 'error',
  'annual M13 must never resolve to January');
const aboveDomainStore = createDataStore(geo, () => {}, async () => response(payload('month', 10, 20, { fixedDomain: [0, 15] })));
assert.equal((await aboveDomainStore.load(metric, { period: { type: 'month', year: 2025, month: 10 } })).status, 'error',
  'the API cannot silently clip an observation above the shared scale');

const layer = prepareLayer({ unit: '%', scale: 'linear', fixedDomain: [0, 20], observations: [
  { id: 'US', value: 0 }, { id: '01', value: null, qualityState: 'no_election' },
] }, { byId: new Map([['US', {}], ['01', {}]]) });
assert.equal(layer.observations.get('US').value, 0);
assert.equal(layer.observations.get('01').qualityState, 'no_election');
assert.equal(layer.domain[1], 20);
assert.equal(formatValue(60, '%'), '60%', 'party shares stay percentage points through cards and comparisons');

// Requests for separate periods keep separate cache identities; an older late response
// cannot relabel the current period because each result remains keyed to its own selector.
let resolveJan, resolveFeb;
const raceStore = createDataStore(geo, () => {}, (url) => new Promise((resolve) => {
  const month = Number(new URL(url, 'http://localhost').searchParams.get('month'));
  (month === 1 ? (resolveJan = resolve) : (resolveFeb = resolve));
}));
const jan = raceStore.load(metric, { period: { type: 'month', year: 2025, month: 1 } });
const feb = raceStore.load(metric, { period: { type: 'month', year: 2025, month: 2 } });
await Promise.resolve();
resolveFeb(response(payload('month', 2, 4)));
await feb;
resolveJan(response(payload('month', 1, 3)));
await jan;
assert.equal(raceStore.get(metric, { period: { type: 'month', year: 2025, month: 2 } }).observations.get('US').value, 4);
assert.equal(raceStore.get(metric, { period: { type: 'month', year: 2025, month: 1 } }).observations.get('US').value, 3);

const aianMetric = { id: 'race-ethnicity--aian', catalogId: '01.04', consumerDataset: 'aian_broad_share',
  candidateAvailable: true, candidateSourceRelease: 'acs-2024-5year', availability: 'local_candidate',
  periodType: 'multi_year', periodYear: 2024, geographyType: 'state_and_county',
  switchGroup: 'race-ethnicity', hasObservations: true };
const aianData = { datasetId: aianMetric.consumerDataset, candidateStatus: 'local_candidate', localCandidatePreview: true, admissionStatus: 'candidate_nonreleased',
  fieldId: '01.04:aian_share', periodType: 'multi_year', year: 2024, geographyType: 'state_and_county',
  sourceRelease: 'acs-2024-5year', unit: '%', period: '2020–2024', observations: [] };
let aianRequest;
const aianStore = createDataStore(geo, () => {}, async (url) => {
  aianRequest = new URL(url, 'http://localhost'); return response(aianData);
});
assert.equal((await aianStore.load(aianMetric)).status, 'ready');
assert.equal(aianRequest.searchParams.get('period_type'), 'multi_year');
assert.equal(aianRequest.searchParams.get('geography_type'), 'state_and_county');
const wrongCandidateStore = createDataStore(geo, () => {}, async () => response({ ...aianData, sourceRelease: 'different-release' }));
assert.equal((await wrongCandidateStore.load(aianMetric)).status, 'error', 'candidate rows cannot cross source releases');
let staleFormulaRequested=false;
const unavailableRefresh={id:'adjusted-gross-income-agi--per-resident',fieldId:'07.01:derived:per-resident',catalogId:'07.01',
  consumerDataset:'irs_agi_per_resident_2023',consumerFieldId:'07.01:derived:per-resident',candidateRequired:true,
  candidateAvailable:false,availability:'not_admitted',hasObservations:false,unit:'USD per resident'};
const unavailableRefreshStore=createDataStore(geo,()=>{},async()=>{staleFormulaRequested=true;return response({});});
assert.equal((await unavailableRefreshStore.load(unavailableRefresh)).status,'unavailable');
assert.equal(staleFormulaRequested,false,'an old ACS-derived response is never used as a fallback for the PEP refresh');

const electionMetric = { id: 'elections-senate', catalogId: '12.02', consumerDataset: 'election_senate_2024',
  candidateAvailable: true, candidateSourceRelease: 'dataverse-PEJ5QU-v8', availability: 'local_candidate',
  periodType: 'cycle', periodYear: 2024, geographyType: 'state', switchGroup: 'elections', hasObservations: true };
const electionData = { datasetId: electionMetric.consumerDataset, candidateStatus: 'local_candidate', localCandidatePreview: true, admissionStatus: 'candidate_nonreleased',
  fieldId: '12.02', periodType: 'cycle', year: 2024, geographyType: 'state', sourceRelease: electionMetric.candidateSourceRelease,
  selectedParty: 'DEMOCRAT', unit: '%', fixedDomain: [0, 100], observations: [
    { id: '06', geoType: 'state', value: 60, votes: 60, totalVotes: 100, qualityState: 'observed', sourceRelease: electionMetric.candidateSourceRelease },
    { id: '20', geoType: 'state', value: null, qualityState: 'no_election', sourceRelease: electionMetric.candidateSourceRelease },
  ] };
const electionStore = createDataStore(geo, () => {}, async () => response(electionData));
const electionLayer = await electionStore.load(electionMetric, { party: 'DEMOCRAT' });
assert.equal(electionLayer.status, 'ready');
assert.equal(electionLayer.observations.get('06').value, 60);
assert.equal(electionLayer.observations.get('20').qualityState, 'no_election');
const fractionStore = createDataStore(geo, () => {}, async () => response({ ...electionData,
  observations: [{ ...electionData.observations[0], value: .6 }] }));
assert.equal((await fractionStore.load(electionMetric, { party: 'DEMOCRAT' })).status, 'error',
  'election shares are percentage points, not fractions');

const refreshedMetric = { id: 'adjusted-gross-income-agi--per-resident', catalogId: '07.01',
  consumerDataset: 'irs_agi_per_resident_2023', consumerFieldId: '07.01:derived:per-resident',
  candidateAvailable: true, candidateSourceRelease: 'irs-soi-2023-pep-vintage-2025',
  candidateSourceUnit: 'USD/person', candidateSourceReleases: ['irs-soi-2023-pep-vintage-2025'],
  periodType: 'annual', periodYear: 2023, geographyType: 'state_and_county', unit: 'USD per resident', hasObservations: true };
const refreshedPayload = { datasetId: refreshedMetric.consumerDataset, candidateStatus: 'local_candidate', localCandidatePreview: true, admissionStatus: 'candidate_nonreleased',
  fieldId: refreshedMetric.consumerFieldId, periodType: 'annual', year: 2023, geographyType: 'state_and_county',
  sourceRelease: 'irs-soi-2023-pep-vintage-2025', sourceReleases: ['irs-soi-2023-pep-vintage-2025'],
  sourceUnit: 'USD/person', unit: 'USD per resident', observations: [
    { id: '06', value: 52341.82, qualityState: 'observed', sourceRelease: 'irs-soi-2023-pep-vintage-2025' },
  ] };
const refreshedStore = createDataStore(geo, () => {}, async () => response(refreshedPayload));
const refreshedLayer = await refreshedStore.load(refreshedMetric);
assert.equal(refreshedLayer.status, 'ready', 'finite USD per resident values can exceed 100');
assert.equal(refreshedLayer.observations.get('06').value, 52341.82);
const negativeIncome = createDataStore(geo, () => {}, async () => response({ ...refreshedPayload,
  observations: [{ ...refreshedPayload.observations[0], value: -1 }] }));
assert.equal((await negativeIncome.load(refreshedMetric)).status, 'error', 'negative income is rejected');

const cancerMetric = { id: 'all-cancer-new-cases', catalogId: '11.01', consumerDataset: 'cancer_2023',
  consumerFieldId: '11.01:derived', candidateAvailable: true, candidateSourceReleases: ['cdc-uscs-2023-state', 'cdc-uscs-2023-national'],
  periodType: 'annual', periodYear: 2023, geographyType: 'state_and_county', unit: 'per 100,000', hasObservations: true };
const cancerPayload = { datasetId: 'cancer_2023', candidateStatus: 'local_candidate', localCandidatePreview: true, admissionStatus: 'candidate_nonreleased',
  fieldId: '11.01:derived', periodType: 'annual', year: 2023, geographyType: 'state_and_county', sourceRelease: null,
  sourceReleases: cancerMetric.candidateSourceReleases, unit: 'per 100,000', observations: [
    { id: 'US', value: 576.543689, qualityState: 'observed', sourceRelease: 'cdc-uscs-2023-national' },
    { id: '06', value: 501.645, qualityState: 'observed', sourceRelease: 'cdc-uscs-2023-state' },
  ] };
const cancerStore = createDataStore({ byId: new Map([['US', {}], ['06', {}]]) }, () => {}, async () => response(cancerPayload));
const cancerLayer = await cancerStore.load(cancerMetric);
assert.equal(cancerLayer.status, 'ready', 'verified state and national source releases may coexist');
assert.equal(cancerLayer.observations.get('US').value, 576.543689);
assert.equal(cancerLayer.observations.get('06').value, 501.645);
const unexpectedCancerRelease = createDataStore({ byId: new Map([['US', {}], ['06', {}]]) }, () => {}, async () => response({
  ...cancerPayload, observations: [...cancerPayload.observations, { id: '20', value: 500, qualityState: 'observed', sourceRelease: 'unreviewed-third-release' }],
}));
assert.equal((await unexpectedCancerRelease.load(cancerMetric)).status, 'error', 'mixed sources must match the reviewed release set exactly');

const admittedMetric = { ...refreshedMetric, consumerDataset: 'irs_agi_per_resident_2023' };
const admittedPayload = { ...refreshedPayload, candidateStatus: 'admitted', localCandidatePreview: false, admissionStatus: 'admitted' };
const admittedStore = createDataStore(geo, () => {}, async () => response(admittedPayload));
assert.equal((await admittedStore.load(admittedMetric)).status, 'ready', 'formal admitted-mode responses are accepted');

const healthMapLayer = prepareLayer(cancerPayload, { byId: new Map([['US', {}], ['06', {}]]) });
assert.equal(healthMapLayer.observations.get('06').value, 501.645, 'the actual cancer rate survives map preparation');

console.log('period, candidate identity, race geography, election share, missing/zero, scale and stale-request checks passed');
