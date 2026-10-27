import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const registry = JSON.parse(await readFile(new URL('./selection-registry.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./react/methodology.tsx', import.meta.url), 'utf8');
const startMarker = 'export const methodologyRecords: Method[] = ';
const start = source.indexOf(startMarker) + startMarker.length;
const end = source.indexOf(';\n\nexport const methodologyGroups', start);
assert.ok(start > 0 && end > start, 'methodology record block is present');
const records = JSON.parse(source.slice(start, end));
const byId = new Map(records.map((record) => [record.id, record]));
assert.equal(byId.size, records.length, 'methodology record IDs are unique');

const groupMarker = 'export const methodologyGroups = ';
const groupStart = source.indexOf(groupMarker) + groupMarker.length;
const groupEnd = source.indexOf(' as const;', groupStart);
assert.ok(groupStart > 0 && groupEnd > groupStart, 'visible group catalog is present');
const groups = JSON.parse(source.slice(groupStart, groupEnd));
const visibleIds = groups.flatMap(([, ids]) => ids); // Do not filter: unknown or missing selector IDs must fail.
assert.equal(new Set(visibleIds).size, visibleIds.length, 'visible catalog has no duplicate IDs');
assert.deepEqual([...visibleIds].sort(), [...registry.selectableIds, 'adjusted-gross-income-agi--per-resident'].sort(),
  'visible indicator/mode IDs exactly cover all selectable IDs plus the per-resident income mode');
assert.equal(registry.selectionCounts.primary, 41);
assert.equal(registry.selectionCounts.variants, 4);
assert.equal(registry.selectionCounts.total, 45);
assert.equal(visibleIds.length, 46, '45 selector IDs plus the extra income mode');
assert.equal(records.length, 47, 'visible records plus one retained hidden record');
assert.ok(!visibleIds.includes('fitness-recreation-centers-per-capita'), 'fitness data remains hidden');
assert.ok(byId.has('fitness-recreation-centers-per-capita'), 'hidden fitness data is retained and documented');

for (const id of visibleIds) {
  const record = byId.get(id);
  assert.ok(record, `${id}: record exists`);
  for (const key of ['name', 'source', 'url', 'formula', 'unit', 'period', 'geography', 'universe', 'method'])
    assert.ok(record[key]?.length, `${id}: ${key} is present`);
  assert.ok(Array.isArray(record.limitations), `${id}: limitations list is present (may be empty when none is specific)`);
  assert.match(record.url, /^https:\/\//, `${id}: HTTPS source link`);
  for (const sourceLink of record.additionalSources || []) assert.match(sourceLink.url, /^https:\/\//, `${id}: secondary HTTPS source link`);
  assert.ok(record.geography.length, `${id}: geography is present`);
  if (record.source.startsWith('Census ACS')) assert.match(record.url, /\/groups\/B\d{5}\.html$/, `${id}: full ACS table group link`);
  if (record.classification === 'custom') assert.match(record.method, /^Calculated by USA Maps\./, `${id}: custom result attribution`);
  if (record.classification === 'native') assert.match(record.method, /^Methodology provided by .+\./, `${id}: native source methodology attribution`);
}
for (const record of records.filter((entry) => !visibleIds.includes(entry.id))) {
  assert.ok(record.url && record.formula && record.unit && record.period && record.geography.length && record.universe && record.method && record.limitations.length,
    `${record.id}: extra record is fully documented`);
}

for (const [id, doi] of [['elections-president','VOQCHQ'], ['elections-senate','PEJ5QU'], ['elections-house','IG0UN2']]) {
  const record = byId.get(id);
  assert.equal(record.url, `https://doi.org/10.7910/DVN/${doi}`, `${id}: exact producer DOI`);
  assert.ok(record.additionalSources.some(({ url }) => url === `https://dataverse.harvard.edu/dataset.xhtml?persistentId=doi:10.7910/DVN/${doi}`), `${id}: direct Dataverse dataset page`);
}
const house = byId.get('elections-house');
assert.ok(house.additionalSources.some(({ url }) => url === 'https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip'), 'House links the Census source ZIP');
assert.match(house.geography[0], /derived GeoJSON/, 'House describes derived application geometry');
for (const id of ['new-hiv-diagnoses','deaths-under-18']) {
  const urls = byId.get(id).additionalSources.map(({ url }) => url);
  assert.ok(urls.includes('https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/totals/co-est2025-alldata.csv'), `${id}: direct PEP total file`);
  assert.ok(urls.includes('https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/counties/asrh/cc-est2025-syasex.csv'), `${id}: direct PEP county age file`);
  assert.ok(urls.includes('https://www2.census.gov/programs-surveys/popest/datasets/2020-2025/national/asrh/nc-est2025-agesex-res.csv'), `${id}: direct PEP national age file`);
}
for (const record of records.filter(({ source }) => source.startsWith('FBI SRS'))) {
  assert.equal(record.url, 'https://cde-prd-data.s3.us-gov-east-1.amazonaws.com/additional-datasets/srs/estimated_crimes_1979_2025.csv');
  assert.ok(record.additionalSources.some(({ url }) => url === 'https://cde.ucr.cjis.gov/'), 'FBI includes human CDE access page');
}
assert.match(byId.get('unemployment').period, /2025-M01.*2025-M12.*M13/);
assert.match(byId.get('unemployment').limitations.join(' '), /2025 October is missing/);
assert.match(byId.get('adjusted-gross-income-agi').limitations.join(' '), /sum county stubs 1–8.*not a native IRS total/);
assert.match(byId.get('race-ethnicity--aian').universe, /all Hispanic origins/);
assert.match(source, /2025 October is missing/);
assert.doesNotMatch(source, /import ['"].*methodology\.css/);
for (const record of records.filter((entry) => entry.classification === 'custom')) {
  assert.match(record.method, /Calculated by USA Maps\./);
  assert.doesNotMatch(record.method, /Methodology provided by/);
}
console.log('Methodology coverage: 46 visible indicator/mode records (45 selector IDs + 1 income mode), 1 hidden retained record; all selector IDs compared without filtering.');
