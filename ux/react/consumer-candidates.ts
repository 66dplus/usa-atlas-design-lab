import type { Metric } from './types';

const raceOptions = [
  { id: 'race-ethnicity', label: 'Hispanic / Latino' },
  { id: 'race-ethnicity--white-non-hispanic', label: 'White' },
  { id: 'race-ethnicity--black', label: 'Black' },
  { id: 'race-ethnicity--asian', label: 'Asian' },
  { id: 'race-ethnicity--aian', label: 'American Indian and Alaska Native' },
];

const racePlaceholders: Metric[] = [
  {
    id: 'race-ethnicity',
    name: 'Hispanic or Latino share',
    fieldId: null,
    catalogId: '01.04',
    shortCategory: 'Race / ethnicity',
    source: 'Census ACS',
    unit: '%',
    stateSupported: true,
    countySupported: true,
    hasObservations: false,
    availability: 'unavailable',
    selectionKind: 'primary',
    switchGroup: 'race-ethnicity',
    switchLabel: 'Race / ethnicity',
    switchOptions: raceOptions,
    coverageNote: 'ACS race and ethnicity observations are not loaded in the current data release.',
  },
  {
    id: 'race-ethnicity--white-non-hispanic',
    name: 'White non-Hispanic share',
    fieldId: null,
    catalogId: '01.04',
    shortCategory: 'Race / ethnicity',
    source: 'Census ACS',
    unit: '%',
    stateSupported: true,
    countySupported: true,
    hasObservations: false,
    availability: 'unavailable',
    selectionKind: 'variant',
    switchGroup: 'race-ethnicity',
    switchLabel: 'Race / ethnicity',
    switchOptions: raceOptions,
    coverageNote: 'ACS race and ethnicity observations are not loaded in the current data release.',
  },
  {
    id: 'race-ethnicity--black',
    name: 'Black non-Hispanic share',
    fieldId: null,
    catalogId: '01.04',
    shortCategory: 'Race / ethnicity',
    source: 'Census ACS',
    unit: '%',
    stateSupported: true,
    countySupported: true,
    hasObservations: false,
    availability: 'unavailable',
    selectionKind: 'variant',
    switchGroup: 'race-ethnicity',
    switchLabel: 'Race / ethnicity',
    switchOptions: raceOptions,
    coverageNote: 'ACS race and ethnicity observations are not loaded in the current data release.',
  },
  {
    id: 'race-ethnicity--asian',
    name: 'Asian non-Hispanic share',
    fieldId: null,
    catalogId: '01.04',
    shortCategory: 'Race / ethnicity',
    source: 'Census ACS',
    unit: '%',
    stateSupported: true,
    countySupported: true,
    hasObservations: false,
    availability: 'unavailable',
    selectionKind: 'variant',
    switchGroup: 'race-ethnicity',
    switchLabel: 'Race / ethnicity',
    switchOptions: raceOptions,
    coverageNote: 'ACS race and ethnicity observations are not loaded in the current data release.',
  },
];

const fbiRateDefinition=(label:string)=>({
  formula:`Official FBI SRS ${label} count ÷ same-record FBI population × 100,000`,
  period:'2025',displayPeriod:'2025',unit:'per 100,000',source:'FBI Crime Data Explorer',
  method:`Custom calculated 2025 annual rate using the official FBI SRS ${label} estimate and population from the same source record. Source coverage caveats are retained with each geography. Rape uses the revised definition.`,
  rateMetadata:{type:'custom_calculated' as const,numeratorSource:'FBI SRS annual estimates',numeratorPeriod:'2025',
    denominatorSource:'FBI SRS annual estimates',denominatorPeriod:'2025',denominatorPopulationKind:'same source record',
    denominatorUnit:'persons',formula:`${label} count ÷ same-record FBI population × 100,000`},
});

const refreshedTargets: Record<string, Pick<Metric, 'consumerDataset' | 'consumerFieldId' | 'periodType' | 'periodYear' | 'geographyType' | 'definition' | 'candidateSourceReleases'>> = {
  'adjusted-gross-income-agi': {consumerDataset:'irs_agi_total_2023',consumerFieldId:'07.01:derived:total',periodType:'annual',periodYear:2023,geographyType:'state_and_county',candidateSourceReleases:['irs-soi-2023-pep-vintage-2025']},
  'adjusted-gross-income-agi--per-resident': {consumerDataset:'irs_agi_per_resident_2023',consumerFieldId:'07.01:derived:per-resident',periodType:'annual',periodYear:2023,geographyType:'state_and_county',candidateSourceReleases:['irs-soi-2023-pep-vintage-2025']},
  'electricity-price': {consumerDataset:'electricity_price_2025_all',consumerFieldId:'08.05:sector_ALL',periodType:'annual',periodYear:2025,geographyType:'state'},
  'all-cancer-new-cases': {consumerDataset:'cancer_2023',consumerFieldId:'11.01:derived',periodType:'annual',periodYear:2023,geographyType:'state_and_county'},
  'new-hiv-diagnoses': {consumerDataset:'hiv_2024',consumerFieldId:'11.02:derived',periodType:'annual',periodYear:2024,geographyType:'state_and_county'},
  'deaths-under-18': {consumerDataset:'child_deaths_under18_2024',consumerFieldId:'11.03:derived',periodType:'annual',periodYear:2024,geographyType:'state_and_county'},
  'murders': {consumerDataset:'fbi_homicide_2025',consumerFieldId:'04.01:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('homicide')},
  'violent-crime': {consumerDataset:'fbi_violent_crime_2025',consumerFieldId:'04.02:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('violent crime')},
  'robbery': {consumerDataset:'fbi_robbery_2025',consumerFieldId:'04.03:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('robbery')},
  'aggravated-assault': {consumerDataset:'fbi_aggravated_assault_2025',consumerFieldId:'04.04:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('aggravated assault')},
  'burglary': {consumerDataset:'fbi_burglary_2025',consumerFieldId:'04.05:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('burglary')},
  'motor-vehicle-theft': {consumerDataset:'fbi_motor_vehicle_theft_2025',consumerFieldId:'04.06:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('motor vehicle theft')},
  'rape': {consumerDataset:'fbi_rape_revised_2025',consumerFieldId:'04.07:derived',periodType:'annual',periodYear:2025,geographyType:'state',definition:fbiRateDefinition('revised rape')},
};

export function candidateCoverageNote(candidate: Pick<Metric, 'name' | 'geographyType' | 'periodYear'>, productionAdmitted: boolean) {
  if (!productionAdmitted)
    return `${candidate.name}: local candidate preview only; this result is not released or admitted as public data.`;
  if (candidate.geographyType === 'congressional_district')
    return `${candidate.name}: admitted 2024 results for voting congressional districts in the 119th Congress.`;
  const geography = candidate.geographyType === 'state_and_county' ? 'states and counties' :
    candidate.geographyType === 'county' ? 'counties' : 'states';
  const year = candidate.periodYear ? `${candidate.periodYear} ` : '';
  return `${candidate.name}: admitted ${year}observations for ${geography}.`;
}

export function sourceAreaLabel(geographyType: Metric['geographyType'] | 'nation', placeId?: string | null) {
  if (geographyType === 'congressional_district') return 'Congressional district';
  if (geographyType === 'nation' || !placeId) return 'US';
  if (geographyType === 'county') return 'County';
  if (geographyType === 'state') return 'State';
  if (geographyType === 'state_and_county')
    return /^\d{5}$/.test(placeId) ? 'County' : /^\d{2}$/.test(placeId) ? 'State' : 'Geographic area';
  if (!geographyType && /^\d{5}$/.test(placeId)) return 'County';
  return 'Geographic area';
}

export function sourceCoverageLabel(metric: Pick<Metric, 'availability' | 'geographyType' | 'fieldId' | 'countySupported' | 'stateSupported' | 'coverageNote'>) {
  if (metric.availability === 'local_candidate')
    return metric.coverageNote || 'Local candidate preview only; this result is not released or admitted as public data.';
  if (metric.geographyType === 'congressional_district')
    return metric.coverageNote || 'Congressional districts';
  if (!metric.fieldId) return metric.coverageNote || '—';
  return metric.countySupported
    ? metric.stateSupported ? 'State and county' : 'County'
    : 'State';
}
const refreshedPlaceholders: Metric[] = [
  {id:'all-cancer-new-cases',name:'New cancer cases per 100,000 residents',fieldId:null,catalogId:'11.01',shortCategory:'Health',source:'No admitted cancer rate refresh',unit:'per 100,000',stateSupported:true,countySupported:false,hasObservations:false,availability:'not_admitted',selectionKind:'primary',consumerDataset:'cancer_2023',consumerFieldId:'11.01:derived',periodType:'annual',periodYear:2023,geographyType:'state_and_county',coverageNote:'The 2023 cancer rate refresh is unavailable in this local candidate reader.'},
  {id:'new-hiv-diagnoses',name:'New HIV diagnoses per 100,000 residents',fieldId:null,catalogId:'11.02',shortCategory:'Health',source:'No admitted HIV rate refresh',unit:'per 100,000',stateSupported:true,countySupported:false,hasObservations:false,availability:'not_admitted',selectionKind:'primary',consumerDataset:'hiv_2024',consumerFieldId:'11.02:derived',periodType:'annual',periodYear:2024,geographyType:'state_and_county',coverageNote:'The provisional 2024 HIV rate refresh is unavailable in this local candidate reader.'},
  {id:'deaths-under-18',name:'Deaths among children under 18 per 100,000 children',fieldId:null,catalogId:'11.03',shortCategory:'Health',source:'No admitted child mortality rate refresh',unit:'per 100,000',stateSupported:true,countySupported:false,hasObservations:false,availability:'not_admitted',selectionKind:'primary',consumerDataset:'child_deaths_under18_2024',consumerFieldId:'11.03:derived',periodType:'annual',periodYear:2024,geographyType:'state_and_county',coverageNote:'The 2024 under-18 mortality rate refresh is unavailable in this local candidate reader.'},
];

const candidates: Metric[] = [
  {
    id: 'race-ethnicity--aian',
    name: 'American Indian and Alaska Native alone or in combination share',
    fieldId: null,
    catalogId: '01.04',
    shortCategory: 'Race / ethnicity',
    source: 'Census ACS 2024 5-year',
    sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year.html',
    unit: '%',
    stateSupported: true,
    countySupported: true,
    hasObservations: false,
    availability: 'not_admitted',
    selectionKind: 'variant',
    switchGroup: 'race-ethnicity',
    switchLabel: 'Race / ethnicity',
    switchOptions: raceOptions,
    consumerDataset: 'aian_broad_share',
    candidateAvailable: false,
    geographyType: 'state_and_county',
    periodType: 'multi_year',
    periodYear: 2024,
    definition: {
      formula: 'B02010_001E / B01003_001E × 100',
      period: '2024',
      displayPeriod: '2020–2024',
      unit: '%',
      source: 'Census ACS 2024 5-year',
      method:
        'American Indian and Alaska Native alone or in combination, including all Hispanic origins, divided by total population. The categories overlap other race and ethnicity measures. Retain the B02010_001E estimate and B02010_001M margin of error; no derived percentage margin of error is claimed.',
    },
    coverageNote:
      'Not admitted. The planned ACS 2024 5-year measure uses B02010_001E / B01003_001E and retains the count and source margin of error.',
  },
  {
    id: 'elections-president',
    name: 'Presidential elections',
    fieldId: null,
    catalogId: '12.01',
    shortCategory: 'Elections',
    source: 'No admitted election source',
    unit: '% of all contest votes',
    stateSupported: false,
    countySupported: true,
    geographyType: 'county',
    hasObservations: false,
    availability: 'not_admitted',
    selectionKind: 'primary',
    switchGroup: 'elections',
    switchLabel: 'Office',
    switchOptions: [
      { id: 'elections-president', label: 'President' },
      { id: 'elections-senate', label: 'Senate' },
      { id: 'elections-house', label: 'House' },
    ],
    consumerDataset: 'election_president_2024',
    candidateAvailable: false,
    periodType: 'cycle',
    periodYear: 2024,
    coverageNote:
      '2024 presidential results are not admitted. The intended geography is county; candidate votes, contest totals and source provenance remain unavailable.',
  },
  {
    id: 'elections-senate',
    name: 'Senate elections',
    fieldId: null,
    catalogId: '12.02',
    shortCategory: 'Elections',
    source: 'No admitted election source',
    unit: '% of all contest votes',
    stateSupported: true,
    countySupported: false,
    geographyType: 'state',
    hasObservations: false,
    availability: 'not_admitted',
    selectionKind: 'primary',
    switchGroup: 'elections',
    switchLabel: 'Office',
    switchOptions: [
      { id: 'elections-president', label: 'President' },
      { id: 'elections-senate', label: 'Senate' },
      { id: 'elections-house', label: 'House' },
    ],
    consumerDataset: 'election_senate_2024',
    candidateAvailable: false,
    periodType: 'cycle',
    periodYear: 2024,
    coverageNote:
      '2024 Senate results are not admitted. No-election states will remain distinct from missing observations and numeric zero.',
  },
  {
    id: 'elections-house',
    name: 'U.S. House elections',
    fieldId: null,
    catalogId: '12.03',
    shortCategory: 'Elections',
    source: 'No admitted election source',
    unit: '% of all contest votes',
    stateSupported: false,
    countySupported: false,
    geographyType: 'congressional_district',
    hasObservations: false,
    availability: 'not_admitted',
    selectionKind: 'primary',
    switchGroup: 'elections',
    switchLabel: 'Office',
    switchOptions: [
      { id: 'elections-president', label: 'President' },
      { id: 'elections-senate', label: 'Senate' },
      { id: 'elections-house', label: 'House' },
    ],
    consumerDataset: 'election_house_2024',
    candidateAvailable: false,
    periodType: 'cycle',
    periodYear: 2024,
    coverageNote:
      '2024 U.S. House results and matching congressional-district boundaries are not admitted. County and state values are never substituted.',
  },
];

const known = (metric: Metric): Metric => {
  if (metric.id === 'unemployment')
    return { ...metric, selectionKind: 'primary', periodControl: 'unemployment-2025' };
  if (metric.switchGroup === 'race-ethnicity')
    return {
      ...metric,
      selectionKind: metric.id === 'race-ethnicity' ? 'primary' : 'variant',
      switchLabel: 'Race / ethnicity',
      switchOptions: raceOptions,
    };
  if (metric.id === 'adjusted-gross-income-agi--per-resident')
    return { ...metric, selectionKind: 'mode' };
  return { ...metric, selectionKind: metric.selectionKind || 'primary' };
};

function admittedCandidate(candidate: Metric, entry: Record<string, unknown> | undefined, contract: any): Metric {
  const releaseList=Array.isArray(entry?.sourceReleases)?entry.sourceReleases.filter(x=>typeof x==='string'&&x.length):[];
  const localReview=contract?.localCandidatePreview===true&&contract?.contractStatus==='candidate_nonreleased'&&
    contract?.admissionStatus==='candidate_nonreleased'&&entry?.candidateStatus==='local_candidate';
  const productionAdmitted=contract?.localCandidatePreview===false&&contract?.contractStatus==='admitted'&&
    contract?.admissionStatus==='admitted'&&entry?.candidateStatus==='admitted';
  const releaseIdentityMatches=!candidate.candidateSourceReleases?.length||
    JSON.stringify([...candidate.candidateSourceReleases].sort())===JSON.stringify([...releaseList].sort());
  const failClosed={...candidate,candidateRequired:true,candidateAvailable:false,availability:'not_admitted' as const,
    hasObservations:false,coverageNote:candidate.coverageNote||`${candidate.name}: the matching local refresh candidate is unavailable; no older denominator or period is substituted.`};
  const admitted =
    (localReview||productionAdmitted) &&
    entry?.candidateAvailable === true &&
    entry?.datasetId === candidate.consumerDataset &&
    entry?.geographyType === candidate.geographyType &&
    releaseIdentityMatches &&
    (typeof entry?.sourceRelease === 'string' && entry.sourceRelease.length > 0 || releaseList.length > 0) &&
    (candidate.id !== 'elections-house' || (entry?.boundaryVintage === 2024 &&
      entry?.congressSession === '119' && entry?.geometryAvailable === true));
  return admitted
    ? {
        ...candidate,
        candidateRequired: true,
        candidateAvailable: true,
        availability: productionAdmitted?'loaded':'local_candidate',
        hasObservations: true,
        ...(typeof entry?.sourceRelease==='string'?{candidateSourceRelease:entry.sourceRelease}:{}),
        candidateSourceReleases: candidate.candidateSourceReleases?.length?candidate.candidateSourceReleases:releaseList,
        candidateSourceUnit: typeof entry?.sourceUnit==='string'?entry.sourceUnit:undefined,
        ...(entry?.periodType?{periodType:entry.periodType as Metric['periodType']}:{}),
        ...(Number.isInteger(entry?.year)?{periodYear:Number(entry.year)}:{}),
        ...(entry?.unit?{unit:String(entry.unit)}:{}),
        ...(entry?.sourceUrl?{sourceUrl:String(entry.sourceUrl)}:{}),
        ...(entry?.source?{source:String(entry.source)}:{}),
        ...(entry?.fieldId?{fieldId:String(entry.fieldId)}:{}),
        ...(candidate.definition?{definition:{...candidate.definition,period:String(entry?.year||candidate.definition.period||''),displayPeriod:String(entry?.year||candidate.definition.displayPeriod||''),unit:String(entry?.unit||candidate.definition.unit||''),source:String(entry?.source||candidate.definition.source||'')}}:{}),
        source: String(entry?.source || candidate.source),
        sourceUrl: typeof entry?.sourceUrl === 'string' ? entry.sourceUrl : candidate.sourceUrl,
        coverageNote: candidateCoverageNote(candidate, productionAdmitted),
      }
    : failClosed;
}

export function selectionCounts(metrics: Metric[]) {
  return metrics.reduce(
    (counts, metric) => {
      if (metric.selectionKind === 'primary') counts.primary++;
      if (metric.selectionKind === 'variant') counts.variants++;
      return counts;
    },
    { primary: 0, variants: 0 },
  );
}

export function buildSelectionCatalog(
  apiMetrics: Metric[],
  candidateCatalog?: any,
  selectableApiMetrics: Metric[] = apiMetrics,
) {
  const api = new Map(apiMetrics.map((metric) => [metric.id, known(metric)]));
  const selectable = [...selectableApiMetrics.map(known)];
  const selectableIds = new Set(selectable.map((metric) => metric.id));
  const byId = new Map(api);

  for (const placeholder of racePlaceholders) {
    const metric = known(api.get(placeholder.id) || placeholder);
    byId.set(metric.id, metric);
    if (!selectableIds.has(metric.id)) {
      selectable.push(metric);
      selectableIds.add(metric.id);
    }
  }

  const entries = new Map<string, Record<string, unknown>>(
    (Array.isArray(candidateCatalog?.metrics) ? candidateCatalog.metrics : []).map(
      (entry: Record<string, unknown>) => [String(entry.id), entry],
    ),
  );
  for (const candidate of candidates) {
    const metric = admittedCandidate(candidate, entries.get(candidate.id), candidateCatalog);
    byId.set(metric.id, metric);
    if (!selectableIds.has(metric.id)) {
      selectable.push(metric);
      selectableIds.add(metric.id);
    }
  }
  for (const [id, target] of Object.entries(refreshedTargets)) {
    const original=byId.get(id);
    if(!original)continue;
    const candidate={...original,...target};
    const refreshed=admittedCandidate(candidate,entries.get(id),candidateCatalog);
    byId.set(id,refreshed);
    const index=selectable.findIndex(metric=>metric.id===id);
    if(index>=0)selectable[index]=refreshed;
  }
  for(const placeholder of refreshedPlaceholders){
    if(byId.has(placeholder.id))continue;
    const metric=admittedCandidate(placeholder,entries.get(placeholder.id),candidateCatalog);
    byId.set(metric.id,metric);
    if(!selectableIds.has(metric.id)){selectable.push(metric);selectableIds.add(metric.id);}
  }
  const catalog = selectable.map((metric) => known(metric));
  const metricById = new Map([...byId, ...catalog.map((metric) => [metric.id, metric] as const)]);
  return { catalog, metricById, counts: selectionCounts(catalog) };
}
