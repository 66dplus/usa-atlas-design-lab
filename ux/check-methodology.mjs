import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile(new URL('./selection-registry.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./react/methodology.tsx', import.meta.url), 'utf8');
const start = source.indexOf('export const methodologyRecords: Method[] = ') + 'export const methodologyRecords: Method[] = '.length;
const end = source.indexOf(';\n\nconst groups:', start);
assert.ok(start > 0 && end > start, 'methodology record block is present');
const records = JSON.parse(source.slice(start, end));
const byId = new Map(records.map((record) => [record.id, record]));
assert.equal(records.length, 47, '45 selectable records plus income mode and retained hidden data');
assert.equal(byId.size, records.length, 'methodology record IDs are unique');

const groupStart = source.indexOf('const groups:');
const groupEnd = source.indexOf('\n];', groupStart);
assert.ok(groupStart >= 0 && groupEnd > groupStart, 'visible group list is present');
const visibleIds = [...source.slice(groupStart, groupEnd).matchAll(/'([^']+)'/g)].map((match) => match[1]).filter((id) => registry.selectableIds.includes(id));
assert.deepEqual([...visibleIds].sort(), [...registry.selectableIds].sort(), 'visible records exactly cover current selector registry');
assert.equal(registry.selectionCounts.primary, 41);
assert.equal(registry.selectionCounts.variants, 4);
assert.equal(registry.selectionCounts.total, 45);
assert.ok(!visibleIds.includes('fitness-recreation-centers-per-capita'), 'hidden fitness data is not shown as selectable');
assert.ok(byId.has('adjusted-gross-income-agi--per-resident'), 'second income mode is documented');
assert.ok(byId.has('fitness-recreation-centers-per-capita'), 'retained hidden fitness data is disclosed');

for (const id of visibleIds) {
  const record = byId.get(id);
  assert.ok(record, `${id}: record exists`);
  for (const key of ['name', 'source', 'url', 'formula', 'unit', 'period', 'geography', 'universe', 'method', 'limitations'])
    assert.ok(record[key]?.length, `${id}: ${key} is present`);
  assert.match(record.url, /^https:\/\//, `${id}: direct HTTPS source link`);
  for (const sourceLink of record.additionalSources || []) assert.match(sourceLink.url, /^https:\/\//, `${id}: secondary source link`);
  if (record.source === 'Census ACS') assert.match(record.url, /\/groups\/B\d{5}\.html$/, `${id}: direct ACS table group link`);
  assert.ok(record.geography.length, `${id}: geography is present`);
  if (record.classification === 'custom') assert.match(record.method, /^Calculated by USA Maps\./, `${id}: custom result attribution`);
  if (record.classification === 'native') assert.match(record.method, /^Methodology provided by .+\./, `${id}: native source methodology attribution`);
}
for (const record of records.filter((entry) => !visibleIds.includes(entry.id))) {
  assert.ok(record.url && record.formula && record.unit && record.period && record.geography.length && record.universe && record.method && record.limitations.length,
    `${record.id}: extra record is fully documented`);
}

const mustContain = [
  'A00100 (AGI stubs 1–8)', 'not a native IRS US total', 'B02010_001E / B01003_001E',
  '2024 annual PEP age 13+ population', 'July 1, 2024 annual PEP population',
  'October 2025', 'M13', '2025 annual SRS estimate', 'revised rape definition',
  'validated TOTAL contest votes', 'source history 2000–2024', 'source history 1976–2024',
  '119th Congress', 'margins of error are not invented', 'source history 2000–2024', 'source history 1976–2024',
];
for (const phrase of mustContain) assert.ok(source.includes(phrase), `correction/method detail retained: ${phrase}`);
for (const record of records.filter((entry) => entry.classification === 'custom')) {
  assert.match(record.method, /Calculated by USA Maps\./);
  assert.doesNotMatch(record.method, /Methodology provided by/);
}
console.log(`Methodology coverage: ${visibleIds.length} selectable records (41 primary + 4 race variants), 1 additional income mode, 1 hidden retained indicator.`);
