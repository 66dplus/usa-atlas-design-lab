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
}
/** Short presentation label for the four race/ethnicity series. Metric names,
 * IDs and source definitions remain unchanged in the adapter and contracts. */
export function displayMetricName(metric: Metric): string {
  const labels: Record<string, string> = {
    'race-ethnicity--black': 'Black',
    'race-ethnicity--asian': 'Asian',
    'race-ethnicity--white-non-hispanic': 'White',
    'race-ethnicity': 'Hispanic',
  };
  return labels[metric.id] || metric.name;
}
export interface Place {
  id: string;
  stateId: string;
  name: string;
}
export interface Observation {
  id: string;
  value: number;
  sourceUrl?: string;
  methodologyNote?: string;
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
  definition?: Definition;
  methodologyNote?: string;
  scale?: 'linear' | 'log' | 'diverging';
  domain?: [number, number];
  min?: number | null;
  max?: number | null;
  suppressed?: Set<string>;
  excludedGeographies?: string[];
  selection?: string;
}
export interface Geography {
  states: Place[];
  counties: Place[];
  byId: Map<string, Place>;
  collection: GeoJSON.FeatureCollection;
  prepareFocus(id: string | null): void;
  loadDetail(id: string | null): Promise<unknown>;
}
export interface DataStore {
  get(metric: Metric): Layer;
  load(metric: Metric): Promise<Layer>;
  retry(metric: Metric): Promise<Layer>;
  refresh(metric: Metric): Promise<Layer>;
  seed(metric: Metric, data: unknown): boolean;
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
