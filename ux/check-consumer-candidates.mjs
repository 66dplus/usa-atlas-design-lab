import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { indicatorVisibility } from './indicator-visibility.js';

const definitions = JSON.parse(await readFile(new URL('./metric-definitions.json', import.meta.url), 'utf8'));
const packagedRegistry = JSON.parse(await readFile(new URL('./selection-registry.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('./react/consumer-candidates.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm' });
const consumer = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
const {candidateCoverageNote,sourceAreaLabel,sourceCoverageLabel}=consumer;
const apiMetrics = definitions.metrics
  .filter((metric) => indicatorVisibility[metric.catalogId] === true)
  .map((metric) => ({
    id: metric.id,
    name: metric.label,
    fieldId: metric.fieldId,
    catalogId: metric.catalogId,
    shortCategory: 'Fixture metric',
    source: metric.source,
    sourceUrl: metric.sourceUrl,
    unit: metric.unit,
    stateSupported: metric.geography.includes('state'),
    countySupported: metric.geography.includes('county'),
    hasObservations: true,
    ...(metric.id === 'race-ethnicity' ? { switchGroup: 'race-ethnicity' } : {}),
  }));
const registry = consumer.buildSelectionCatalog(apiMetrics, {
  contractStatus: 'candidate_nonreleased', localCandidatePreview: true, admissionStatus:'candidate_nonreleased', metrics: [],
});
const selectionIds = registry.catalog.map((metric) => metric.id).sort();
assert.equal(packagedRegistry.sourceFields, apiMetrics.length);
assert.deepEqual(packagedRegistry.selectionCounts, {...registry.counts, total:registry.catalog.length});
assert.deepEqual(packagedRegistry.selectableIds, selectionIds);
assert.deepEqual(registry.counts, { primary: 41, variants: 4 });
assert.equal(registry.catalog.length, 45);
const perResidentDefinition=definitions.variants['adjusted-gross-income-agi'][0];
const refreshedApiMetrics=[...apiMetrics,{id:perResidentDefinition.id,name:perResidentDefinition.label,fieldId:perResidentDefinition.fieldId,catalogId:'07.01',shortCategory:'Income',source:'IRS SOI',unit:perResidentDefinition.unit,stateSupported:true,countySupported:true,hasObservations:true,selectionKind:'mode',definition:perResidentDefinition}];
const refreshed = consumer.buildSelectionCatalog(refreshedApiMetrics, {
  contractStatus:'candidate_nonreleased',localCandidatePreview:true,admissionStatus:'candidate_nonreleased',metrics:[
    {id:'adjusted-gross-income-agi',catalogFieldId:'07.01',datasetId:'irs_agi_total_2023',candidateStatus:'local_candidate',candidateAvailable:true,sourceRelease:'irs-soi-2023-pep-vintage-2025',sourceReleases:['irs-soi-2023-pep-vintage-2025'],sourceUnit:'USD',unit:'USD',fieldId:'07.01:derived:total',geographyType:'state_and_county',periodType:'annual',year:2023,source:'irs_soi'},
    {id:'adjusted-gross-income-agi--per-resident',catalogFieldId:'07.01',datasetId:'irs_agi_per_resident_2023',candidateStatus:'local_candidate',candidateAvailable:true,sourceRelease:'irs-soi-2023-pep-vintage-2025',sourceReleases:['irs-soi-2023-pep-vintage-2025'],sourceUnit:'USD/person',unit:'USD per resident',fieldId:'07.01:derived:per-resident',geographyType:'state_and_county',periodType:'annual',year:2023,source:'irs_soi'},
    {id:'all-cancer-new-cases',catalogFieldId:'11.01',datasetId:'cancer_2023',candidateStatus:'local_candidate',candidateAvailable:true,sourceReleases:['2025 NPCR/SEER','USCS 2026'],unit:'per 100,000',fieldId:'11.01:derived',geographyType:'state_and_county',periodType:'annual',year:2023,source:'cdc_uscs'},
    ...['murders','violent-crime','robbery','aggravated-assault','burglary','motor-vehicle-theft','rape'].map((id,index)=>({
      id,catalogFieldId:`04.0${index+1}`,datasetId:['fbi_homicide_2025','fbi_violent_crime_2025','fbi_robbery_2025','fbi_aggravated_assault_2025','fbi_burglary_2025','fbi_motor_vehicle_theft_2025','fbi_rape_revised_2025'][index],
      candidateStatus:'local_candidate',candidateAvailable:true,sourceRelease:'FBI SRS Estimated Crimes 1979-2025 (August 2026)',sourceReleases:['FBI SRS Estimated Crimes 1979-2025 (August 2026)'],
      unit:'per 100,000',sourceUnit:'per 100,000',fieldId:`04.0${index+1}:derived`,geographyType:'state',periodType:'annual',year:2025,source:'fbi_cde',
    })),
  ],
});
assert.equal(refreshed.metricById.get('adjusted-gross-income-agi--per-resident').consumerDataset,'irs_agi_per_resident_2023');
assert.equal(refreshed.metricById.get('adjusted-gross-income-agi--per-resident').candidateSourceUnit,'USD/person');
assert.equal(refreshed.metricById.get('adjusted-gross-income-agi--per-resident').periodYear,2023);
for(const id of ['adjusted-gross-income-agi','adjusted-gross-income-agi--per-resident'])
  assert.deepEqual(refreshed.metricById.get(id).candidateSourceReleases,['irs-soi-2023-pep-vintage-2025'],`${id}: formal reader source identity`);
const oldIrsRelease=consumer.buildSelectionCatalog(refreshedApiMetrics,{
  contractStatus:'candidate_nonreleased',localCandidatePreview:true,admissionStatus:'candidate_nonreleased',metrics:[
    {id:'adjusted-gross-income-agi',catalogFieldId:'07.01',datasetId:'irs_agi_total_2023',candidateStatus:'local_candidate',candidateAvailable:true,sourceRelease:'IRS SOI County 2023',sourceReleases:['IRS SOI County 2023'],sourceUnit:'USD',unit:'USD',fieldId:'07.01:derived:total',geographyType:'state_and_county',periodType:'annual',year:2023},
  ],
});
assert.equal(oldIrsRelease.metricById.get('adjusted-gross-income-agi').candidateAvailable,false,
  'human display labels cannot substitute for the frozen IRS reader release identity');
assert.deepEqual(refreshed.metricById.get('all-cancer-new-cases').candidateSourceReleases,['2025 NPCR/SEER','USCS 2026']);
for (const id of ['murders','violent-crime','robbery','aggravated-assault','burglary','motor-vehicle-theft','rape']) {
  const metric=refreshed.metricById.get(id);
  assert.equal(metric.periodYear,2025,`${id}: FBI annual candidate period`);
  assert.equal(metric.geographyType,'state');
  assert.match(metric.definition.formula,/same-record FBI population/);
  assert.equal(metric.definition.rateMetadata.type,'custom_calculated');
  assert.equal(metric.definition.rateMetadata.denominatorPeriod,'2025');
  assert.doesNotMatch(metric.definition.rateMetadata.denominatorSource,/ACS/);
}
assert.equal(refreshed.counts.primary,41,'refresh overlays do not add selectable entries');
const raceOptions = [
  'race-ethnicity', 'race-ethnicity--white-non-hispanic', 'race-ethnicity--black',
  'race-ethnicity--asian', 'race-ethnicity--aian',
];
for (const id of raceOptions) {
  assert.deepEqual(registry.metricById.get(id).switchOptions.map((option) => option.id), raceOptions);
}
const officeOptions = ['elections-president', 'elections-senate', 'elections-house'];
for (const id of officeOptions) {
  const item = registry.metricById.get(id);
  assert.deepEqual(item.switchOptions.map((option) => option.id), officeOptions);
  assert.equal(item.availability, 'not_admitted', 'unavailable local candidates remain honestly labeled');
  assert.equal(item.candidateRequired,true,'candidate layers do not fall back to unrelated released data');
}
const sourceRows = [
  {id:'race-ethnicity--aian',catalogFieldId:'01.04',datasetId:'aian_broad_share',candidateStatus:'local_candidate',candidateAvailable:true,
    sourceRelease:'ACS2024',sourceReleases:['ACS2024'],fieldId:'01.04:aian_broad_share',geographyType:'state_and_county',periodType:'multi_year',year:2024,unit:'%',source:'Census ACS'},
  {id:'elections-house',catalogFieldId:'12.03',datasetId:'election_house_2024',candidateStatus:'local_candidate',candidateAvailable:true,
    sourceRelease:'House2024',sourceReleases:['House2024'],geographyType:'congressional_district',periodType:'cycle',year:2024,unit:'% of all contest votes',source:'MIT Election Lab',
    boundaryVintage:2024,congressSession:'119',geometryAvailable:true},
];
const localSources=consumer.buildSelectionCatalog(apiMetrics,{contractStatus:'candidate_nonreleased',localCandidatePreview:true,admissionStatus:'candidate_nonreleased',metrics:sourceRows});
assert.match(localSources.metricById.get('elections-house').coverageNote,/local candidate preview only.*not released or admitted/);
assert.match(localSources.metricById.get('race-ethnicity--aian').coverageNote,/local candidate preview only.*not released or admitted/);
const admittedSources=consumer.buildSelectionCatalog(apiMetrics,{contractStatus:'admitted',localCandidatePreview:false,admissionStatus:'admitted',metrics:sourceRows.map((row)=>({...row,candidateStatus:'admitted'}))});
assert.match(admittedSources.metricById.get('elections-house').coverageNote,/admitted 2024 results for voting congressional districts in the 119th Congress/);
assert.match(admittedSources.metricById.get('race-ethnicity--aian').coverageNote,/admitted 2024 observations for states and counties/);
assert.equal(sourceAreaLabel('congressional_district','0606'),'Congressional district');
assert.equal(sourceAreaLabel('state_and_county','06'),'State');
assert.equal(sourceAreaLabel('state_and_county','06037'),'County');
assert.equal(sourceAreaLabel(undefined,'06037'),'County','legacy released county metrics retain county geography');
assert.equal(sourceAreaLabel('state','48'),'State','Senate observations remain state-level');
assert.equal(sourceAreaLabel('nation','US'),'US');
assert.equal(sourceAreaLabel(undefined,'CA'),'Geographic area','unknown untyped geography is not mislabeled as a state');
const releasedUnemployment=registry.metricById.get('unemployment');
assert.equal(releasedUnemployment.geographyType,undefined,'legacy unemployment metric remains untyped');
assert.equal(sourceAreaLabel(releasedUnemployment.geographyType,'06037'),'County');
assert.match(sourceCoverageLabel(localSources.metricById.get('elections-house')),/local candidate preview only.*not released or admitted/);
assert.match(sourceCoverageLabel(localSources.metricById.get('race-ethnicity--aian')),/local candidate preview only.*not released or admitted/);
assert.match(sourceCoverageLabel(admittedSources.metricById.get('elections-house')),/admitted 2024 results for voting congressional districts/);
assert.equal(sourceCoverageLabel(admittedSources.metricById.get('race-ethnicity--aian')),'State and county');
assert.equal(indicatorVisibility['09.04'], false, 'fitness stays out of primary selections');

const byId = new Map(definitions.metrics.map((metric) => [metric.id, metric]));
for (const id of ['all-cancer-new-cases', 'new-hiv-diagnoses', 'deaths-under-18']) {
  const metric = byId.get(id);
  assert.equal(metric.rateMetadata.type, 'custom_calculated');
  assert.match(metric.rateMetadata.denominatorSource, /Census PEP Vintage 2025/);
  assert.equal(metric.rateMetadata.denominatorPeriod, metric.period, `${id}: matching event/denominator year`);
}
assert.equal(byId.get('new-hiv-diagnoses').period, '2024');
assert.equal(byId.get('deaths-under-18').period, '2024');
assert.equal(byId.get('adjusted-gross-income-agi').sourceRelease, 'IRS SOI County 2023; Census PEP Vintage 2025');
const agi = definitions.variants['adjusted-gross-income-agi'][0];
assert.equal(agi.denominator[0].field, '01.01:pep_population_total');
assert.equal(agi.denominator[0].period, '2023');
for (const metric of definitions.metrics.filter((item) => /^04\.0[1-7]$/.test(item.catalogId))) {
  assert.equal(metric.rateMetadata.type, 'custom_calculated');
  assert.equal(metric.rateMetadata.denominatorSource, 'Census ACS 2024 5-year');
}
console.log('consumer registry, group selectors, availability, PEP denominators and rate metadata checks passed');
