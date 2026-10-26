export type Page = 'map' | 'compare' | 'stats' | 'info' | 'support' | 'blog' | 'article';
export type Theme = 'light' | 'dark';
export type Side = 'a' | 'b';
export type Snap = 'min' | 'half' | 'expanded';
export type Rank = 'highest' | 'lowest';
export type DrawerId =
  | 'metric-library'
  | 'place-library'
  | 'ranking-panel'
  | 'inspector'
  | 'comparison-setup-panel'
  | 'compare-results'
  | 'saved-panel'
  | 'search-sheet'
  | 'story-rail';
export interface Definition {
  method?: string;
  formula?: string;
  minDenominator?: number;
  period?: string;
  displayPeriod?: string;
  unit?: string;
  source?: string;
  sourceRelease?: string;
  geography?: string[];
  rateMetadata?: {
    type: 'official_source_rate' | 'custom_calculated';
    numeratorSource: string;
    numeratorPeriod: string;
    denominatorSource?: string;
    denominatorField?: string;
    denominatorPeriod?: string;
    denominatorPopulationKind?: string;
    denominatorUnit?: string;
    formula: string;
  };
}
export interface Metric {
  id: string;
  name: string;
  fieldId: string | null;
  catalogId: string;
  shortCategory: string;
  source: string;
  sourceUrl?: string;
  unit?: string;
  stateSupported: boolean;
  countySupported: boolean;
  hasObservations?: boolean;
  plannedState?: string;
  coverageNote?: string;
  definition?: Definition;
  method?: string;
  switchGroup?: string;
  switchLabel?: string;
  switchOptions?: { id: string; label: string }[];
  selectionKind?: 'primary' | 'variant' | 'mode';
  periodControl?: 'unemployment-2025';
  geographyType?: 'state' | 'county' | 'state_and_county' | 'congressional_district';
  consumerDataset?: string;
  consumerFieldId?: string;
  candidateSourceUnit?: string;
  candidateSourceReleases?: string[];
  candidateAvailable?: boolean;
  candidateRequired?: boolean;
  availability?: 'loaded' | 'unavailable' | 'not_admitted' | 'local_candidate';
  periodType?: 'annual' | 'multi_year' | 'cycle';
  periodYear?: number;
  candidateSourceRelease?: string;
}
/** Short presentation label for the four race/ethnicity series. Metric names,
 * IDs and source definitions remain unchanged in the adapter and contracts. */
export function displayMetricName(metric: Metric): string {
  const labels: Record<string, string> = {
    'race-ethnicity--black': 'Black',
    'race-ethnicity--asian': 'Asian',
    'race-ethnicity--white-non-hispanic': 'White',
    'race-ethnicity--aian': 'American Indian and Alaska Native',
    'race-ethnicity': 'Hispanic / Latino',
  };
  return labels[metric.id] || metric.name;
}
export interface Place {
  id: string;
  stateId: string;
  name: string;
  districtCode?: string;
  boundaryVintage?: number;
  congressSession?: string;
}
export interface Observation {
  id: string;
  value: number | null;
  qualityState?: 'observed' | 'no_election' | 'missing' | 'suppressed' | 'invalid' | 'nonmapping_geography';
  sourceUrl?: string;
  methodologyNote?: string;
  count?: number;
  countMoe?: number;
  population?: number;
  populationMoe?: number;
  selectedParty?: string;
  party?: string;
  selectedPartyVotes?: number;
  votes?: number;
  totalVotes?: number;
  contestId?: string;
  electionYear?: number;
  stage?: string;
  sourceStage?: string | string[];
  isSpecial?: boolean;
  isRunoff?: boolean;
  resultMode?: string;
  boundaryVintage?: number | null;
  congressSession?: string | null;
  geographyMappingStatus?: string;
  sourceRelease?: string;
  sourceVersion?: string;
  candidates?: { candidate?: string; candidateId?: string; originalParty?: string | null; normalizedParty?: string | null; partyOriginal?: string | null; party?: string | null; votes: number; share?: number | null; sourceVotes?: string; sourceTotalVotes?: string; writeIn?: boolean; fusionTicket?: boolean; sourceVersion?: string }[];
  contest?: { id: string; office: string; year: number; raceType: string; stage: string; special: boolean; runoff: boolean; boundaryVintage?: string };
}
export interface Layer {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unavailable';
  values: Map<string, number | null>;
  heightValues?: Map<string, number | null>;
  observations: Map<string, Observation>;
  fieldId?: string;
  error?: string;
  refreshing?: boolean;
  refreshError?: string;
  unit?: string;
  period?: string;
  sourcePeriod?: string;
  source?: string;
  sourceRelease?: string;
  sourceReleaseLabel?: string;
  definition?: Definition;
  methodologyNote?: string;
  scale?: 'linear' | 'log' | 'diverging';
  domain?: [number, number];
  min?: number | null;
  max?: number | null;
  suppressed?: Set<string>;
  excludedGeographies?: string[];
  selection?: string;
  periodStatus?: 'observed' | 'missing';
  sourceReleases?: string[];
}

export type UnemploymentPeriod =
  | { type: 'annual'; year: 2025 }
  | { type: 'month'; year: 2025; month: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 };

export interface LayerSelection {
  period?: UnemploymentPeriod;
  party?: string;
  contestId?: string;
}
export interface Geography {
  states: Place[];
  counties: Place[];
  districts?: Place[];
  loadDistricts?: () => Promise<Place[]>;
  byId: Map<string, Place>;
  collection: GeoJSON.FeatureCollection;
  prepareFocus(id: string | null): void;
  loadDetail(id: string | null): Promise<unknown>;
}
export interface DataStore {
  get(metric: Metric, selection?: LayerSelection): Layer;
  load(metric: Metric, selection?: LayerSelection): Promise<Layer>;
  retry(metric: Metric, selection?: LayerSelection): Promise<Layer>;
  refresh(metric: Metric, selection?: LayerSelection): Promise<Layer>;
  seed(metric: Metric, data: unknown, selection?: LayerSelection): boolean;
}
export interface ViewSettings {
  tilt: number;
  sensitivity: number;
  minZoom: number;
  maxZoom: number;
  duration: number;
  relief: number;
  rotation: boolean;
  cameraSide: 'north' | 'south';
  hover: number;
}
export interface SettingsRecord {
  version: number;
  settings: ViewSettings;
  savedAt: string | null;
}
export interface SettingsData {
  defaults: SettingsRecord;
  record: SettingsRecord;
  error: string | null;
}
export interface LibraryItem {
  label: string;
  unit: string;
  period: string;
  formula?: string;
  reason: string;
}
export interface Selection {
  concept: 'explorer' | 'compare' | 'stories';
  mode: '2d' | '3d';
  selected: string | null;
  second: string | null;
  metric: string;
  secondMetric: string;
  comparison: 'places' | 'metrics';
  rank: Rank | null;
}
export interface AtlasState extends Selection {
  page: Page;
  article: string;
  theme: Theme;
  category: string;
  featureIndex: number;
  metricTarget: Side;
  placeTarget: Side;
  inspectorSide: Side;
  cardMode: boolean;
  countiesOnly: boolean;
  placeBrowseAll: boolean;
  photoExpanded: boolean;
  metricQuery: string;
  placeQuery: string;
  pinned: string[];
  unemploymentPeriod: UnemploymentPeriod;
  selectedParty: string;
  recentStates: string[];
  overlay: { id: DrawerId; side: Side; edge: Side } | null;
  comparisonDraft: {
    first: string;
    second: string;
    choosing: boolean;
    query: string;
    explicit: boolean;
  } | null;
  rankFocus: { origin: string | null; direction: Rank; id: string } | null;
  infoSurface: 'about' | 'legacy';
  infoTab: 'sources' | 'methodology' | 'data';
  source: 'geometry' | Side | null;
  toast: string;
  placeExpanded: boolean;
  placeCollapsed: boolean;
  startup: 'loading' | 'ready' | 'error';
}
export type AtlasAction = { type: 'patch'; patch: Partial<AtlasState> };
export function atlasReducer(state: AtlasState, action: AtlasAction): AtlasState {
  return { ...state, ...action.patch };
}
export interface MapAdapter {
  feedbackSnapshot(point: unknown): unknown;
  host: HTMLElement;
  initialized?: boolean;
  coverTransition(): HTMLElement | null;
  retryFlat(): void;
  update(state: {
    animateEntry: boolean;
    layoutKey: string;
    mode: '2d' | '3d';
    selectedId: string | null;
    metricKey: string;
    geographyType: 'state' | 'congressional_district';
    values: Layer['values'];
    heightValues: Layer['values'];
    countySupported: boolean;
    palette: string[];
    dark: boolean;
    cleanBackdrop: boolean;
    background: string;
    settings: ViewSettings;
    ranks: { id: string; rank: number; label: string }[];
    rankMarkers: { id: string; rank: number; label: string }[];
  }): void;
  whenReady(): Promise<void>;
  dispose(): void;
  captureView(): unknown;
  restoreView(camera: unknown): void;
  cancelMotion(): void;
  zoom(scale: number): void;
  rotate(direction: number): void;
  reset(): void;
  settle(): void;
}
