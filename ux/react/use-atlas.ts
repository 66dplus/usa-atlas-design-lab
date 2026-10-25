import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { buildPlaceIndex, canonicalPath, parsePath, resolveRoute, routeParams } from '../routes.js';
import { applyPageMetadata, mapPageMetadata, screenPageMetadata } from '../seo.js';
import {
  createDataStore,
  readAtlasJSON,
  loadedMapMetrics,
  collectedMapIndicators,
  displayLayer,
  formatValue,
} from '../model.js';
import { captureMapLayout } from '../motion.js';
import { sheetScroll } from '../bottom-sheet.js';
import { articles } from '../journal.js';
import { loadGeography } from '../map.js';
import { loadViewSettings } from '../settings.js';
import { createAtlasAnalytics, atlasContext, placeContext } from '../analytics.js';
import { atlasReducer } from './types';
import type {
  AtlasState,
  DataStore,
  DrawerId,
  Geography,
  Layer,
  LibraryItem,
  MapAdapter,
  Metric,
  Page,
  Place,
  Rank,
  SettingsData,
  Side,
  Snap,
} from './types';

export const mobileLayout = () => matchMedia('(max-width:760px)').matches;
export const prompts = [
  {
    title: 'Where is unemployment lowest?',
    metric: 'unemployment',
    place: null,
    rank: 'lowest' as Rank,
  },
  {
    title: 'California or Texas?',
    metric: 'unemployment',
    place: '06',
    other: '48',
    compare: true,
  },
  {
    title: 'A closer look at San Francisco',
    metric: 'unemployment',
    place: '06075',
  },
  {
    title: 'Where does a dollar go further?',
    metric: 'cost-of-living-regional-price-parities',
    place: null,
    rank: 'lowest' as Rank,
  },
  {
    title: 'How much does electricity cost?',
    metric: 'electricity-price',
    place: null,
    rank: 'highest' as Rank,
  },
];
export const stories = [
  {
    title: 'The cost of calling it home',
    description: 'Where does your dollar go further?',
    metric: 'cost-of-living-regional-price-parities',
    place: '06',
    action: 'Compare the cost of living',
  },
  {
    title: 'Where work is changing',
    description: 'Explore employment, place by place.',
    metric: 'unemployment',
    place: '48',
    action: 'Explore Texas',
  },
  {
    title: 'A closer look at city life',
    description: 'San Francisco, from state to city & county.',
    metric: 'unemployment',
    place: '06075',
    action: 'Explore San Francisco',
  },
];
export function initialState(): AtlasState {
  const q = new URLSearchParams(location.search),
    route = parsePath(location.pathname);
  const page = (
    route?.kind === 'screen'
      ? (
          {
            stats: 'stats',
            support: 'support',
            about: 'info',
            blog: 'blog',
          } as Record<string, Page>
        )[route.screen || '']
      : route?.kind === 'article'
        ? 'article'
        : route?.kind === 'comparison'
          ? 'compare'
          : q.get('page')
  ) as Page;
  let theme: 'light' | 'dark' = 'light';
  try {
    theme = localStorage.getItem('usa-atlas-theme') === 'dark' ? 'dark' : 'light';
  } catch {}
  if (q.get('theme') === 'light' || q.get('theme') === 'dark')
    theme = q.get('theme') as typeof theme;
  return {
    page: ['map', 'compare', 'stats', 'info', 'support', 'blog', 'article'].includes(page)
      ? page
      : 'map',
    article:
      route?.kind === 'article'
        ? route.article || 'mississippi'
        : q.get('article') || 'mississippi',
    theme,
    concept:
      page === 'compare' || q.get('concept') === 'compare'
        ? 'compare'
        : q.get('concept') === 'stories'
          ? 'stories'
          : 'explorer',
    mode: q.get('view') === '3d' ? '3d' : '2d',
    selected: q.get('place') || null,
    second: q.get('other') === 'US' ? null : q.get('other') || '48',
    metric: q.get('metric') || 'unemployment',
    secondMetric: q.get('metric2') || 'population',
    comparison: q.get('comparison') === 'metrics' ? 'metrics' : 'places',
    rank: ['highest', 'lowest'].includes(q.get('rank') || '') ? (q.get('rank') as Rank) : null,
    category: 'All',
    featureIndex: 0,
    metricTarget: 'a',
    placeTarget: 'a',
    inspectorSide: 'a',
    cardMode: false,
    countiesOnly: false,
    placeBrowseAll: false,
    photoExpanded: false,
    metricQuery: '',
    placeQuery: '',
    pinned: [
      'unemployment--03-06-employment',
      'unemployment--03-06-labor-force',
      'unemployment--03-06-unemployment',
    ],
    recentStates: [],
    overlay: null,
    comparisonDraft: null,
    rankFocus: null,
    infoSurface: location.hash === '#info-methodology' ? 'legacy' : 'about',
    infoTab: 'methodology',
    source: null,
    toast: '',
    placeExpanded: false,
    placeCollapsed: false,
    startup: 'loading',
  };
}
export interface Resources {
  geo: Geography;
  catalog: Metric[];
  metricById: Map<string, Metric>;
  library: LibraryItem[];
  store: DataStore;
  settings: SettingsData;
  index: ReturnType<typeof buildPlaceIndex>;
}
const emptyLayer: Layer = {
  status: 'idle',
  observations: new Map(),
  values: new Map(),
};
const element = (selector: string) => document.querySelector<HTMLElement>(selector);
const scrollHost = (id: string) => {
  const root = element('#' + id);
  return root ? (sheetScroll(root) as HTMLElement) : null;
};
export function useAtlas() {
  const [state, dispatch] = useReducer(atlasReducer, undefined, initialState);
  const current = useRef(state);
  current.current = state;
  const [resources, setResources] = useState<Resources | null>(null),
    resource = useRef<Resources | null>(null);
  const [revision, bump] = useReducer((n: number) => n + 1, 0);
  const layoutTransition = useRef<{
    overlay: HTMLElement | null;
    entering: boolean;
  } | null>(null);
  const selectionAnimation = useRef(0);
  const maps = useRef<{ a: MapAdapter | null; b: MapAdapter | null }>({
    a: null,
    b: null,
  });
  const sheets = useRef(
    new Map<
      string,
      {
        setSnap(snap: Snap, animate?: boolean): void;
        refresh(): void;
        snap: Snap;
        syncSummary(): void;
      }
    >(),
  );
  const request = useRef({ a: 0, b: 0, boot: 0, navigation: 0 });
  const historyReturns = useRef<Page[]>([]);
  const restoration = useRef<{
    selection: AtlasState;
    camera: unknown;
    scroll: number;
    rankScroll: number;
    snap: Snap;
  } | null>(null);
  const secondExplicit = useRef(new URLSearchParams(location.search).has('other'));
  const comparisonDefault = useRef<string | null>(null);
  const focusReturn = useRef<HTMLElement | null>(null),
    sourceReturn = useRef<HTMLElement | null>(null);
  const routeValid = useRef(true),
    toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const analytics = useRef<ReturnType<typeof createAtlasAnalytics> | null>(null);
  const patch = useCallback((next: Partial<AtlasState>) => {
    current.current = { ...current.current, ...next };
    dispatch({ type: 'patch', patch: next });
  }, []);
  const getSettings = () => resource.current?.settings.record.settings;
  const place = (id: string | null | undefined): Place | undefined =>
    id ? resource.current?.geo.byId.get(id) : undefined;
  const selected = () => place(current.current.selected);
  const selectedB = () =>
    place(
      current.current.comparison === 'metrics' ? current.current.selected : current.current.second,
    );
  const metric = () => resource.current!.metricById.get(current.current.metric)!;
  const metricB = () =>
    resource.current!.metricById.get(
      current.current.comparison === 'metrics'
        ? current.current.secondMetric
        : current.current.metric,
    )!;
  const layer = (m: Metric): Layer =>
    m && resource.current ? (displayLayer(resource.current.store.get(m)) as Layer) : emptyLayer;
  const observation = (m: Metric, id?: string | null) => layer(m).observations.get(id || 'US');
  const value = (m: Metric, id?: string | null) => observation(m, id)?.value ?? null;
  const number = (m: Metric, id?: string | null) => formatValue(value(m, id), layer(m).unit);
  const compactNumber = (m: Metric, id?: string | null) => {
    const v = value(m, id),
      unit = layer(m).unit;
    return v != null && unit === 'people' && Math.abs(v) >= 1000
      ? new Intl.NumberFormat('en-US', {
          notation: 'compact',
          minimumFractionDigits: Math.abs(v) >= 1e6 ? 2 : 1,
          maximumFractionDigits: Math.abs(v) >= 1e6 ? 2 : 1,
        }).format(v)
      : number(m, id);
  };
  const toast = (text: string) => {
    clearTimeout(toastTimer.current);
    patch({ toast: text });
    toastTimer.current = setTimeout(() => patch({ toast: '' }), 3500);
  };
  const setTheme = (theme: AtlasState['theme'], persist = false) => {
    patch({ theme });
    if (persist)
      try {
        localStorage.setItem('usa-atlas-theme', theme);
      } catch {}
  };
  const action = (name: string, details: Record<string, unknown> = {}) =>
    analytics.current?.action(name, details);
  const setPlaceSheet = (snap: Snap | 'dismissed') =>
    sheets.current.get('explore-panel')?.setSnap(snap === 'dismissed' ? 'min' : snap);
  function beginHistory() {
    history.pushState(null, '', location.pathname + location.search);
  }
  function closeDrawers(restore = true, preserveRank = false) {
    const s = current.current;
    patch({
      overlay: null,
      comparisonDraft: null,
      ...(s.overlay?.id === 'ranking-panel' && !preserveRank
        ? { rank: null, rankFocus: null }
        : {}),
    });
    if (s.comparisonDraft && restoration.current) {
      setPlaceSheet(restoration.current.snap);
      restoration.current = null;
    }
    if (restore)
      requestAnimationFrame(() => {
        const target = focusReturn.current;
        if (target?.isConnected && !target.closest('[inert]'))
          target.focus({ preventScroll: true });
      });
  }
  function openDrawer(
    id: DrawerId,
    trigger: HTMLElement | null = document.activeElement as HTMLElement,
    side: Side = 'a',
    edge: Side = side,
  ) {
    if (current.current.overlay?.id === id && focusReturn.current === trigger) {
      closeDrawers();
      return;
    }
    focusReturn.current = trigger;
    patch({
      overlay: { id, side, edge },
      comparisonDraft: null,
      ...(current.current.overlay?.id === 'ranking-panel' ? { rank: null, rankFocus: null } : {}),
    });
    if (mobileLayout()) setPlaceSheet('min');
  }
  function availableId(id: string, fallback = 'unemployment', r = resource.current!) {
    return r.metricById.has(id)
      ? id
      : r.catalog.find((m) => m.id === fallback)?.id || r.catalog[0].id;
  }
  function prepareComparison(first = current.current.selected) {
    const s = current.current,
      r = resource.current!,
      left = place(first) || place('06')!;
    const valid = s.second === null || Boolean(place(s.second) && s.second !== left.id);
    if ((secondExplicit.current || comparisonDefault.current === left.id) && valid) return s.second;
    const options = (
      left.id.length === 5 ? r.geo.counties.filter((p) => p.stateId === left.stateId) : r.geo.states
    ).filter((p) => p.id !== left.id);
    const second = !first
      ? '48'
      : left.id.length === 5
        ? options.sort((a, b) => a.name.localeCompare(b.name))[0].id
        : options[Math.floor(Math.random() * options.length)].id;
    comparisonDefault.current = left.id;
    secondExplicit.current = false;
    patch({ second });
    return second;
  }
  function rememberExploration() {
    const s = current.current;
    if (restoration.current || s.concept !== 'explorer' || !maps.current.a) return;
    restoration.current = {
      selection: s,
      camera: maps.current.a.captureView(),
      scroll: scrollHost('explore-panel')?.scrollTop || 0,
      rankScroll: scrollHost('ranking-panel')?.scrollTop || 0,
      snap: document.body.classList.contains('place-expanded')
        ? 'expanded'
        : document.body.classList.contains('panel-collapsed')
          ? 'min'
          : 'half',
    };
  }
  async function choosePlace(id: string | null, side: Side = 'a') {
    const s = current.current,
      r = resource.current;
    if (!r) return;
    const target = side === 'b' && s.concept === 'compare' && s.comparison === 'places' ? 'b' : 'a',
      serial = ++request.current[target];
    const previous = target === 'b' ? s.second : s.selected;
    if (previous !== id) beginHistory();
    if (target === 'b') secondExplicit.current = true;
    const stateId = id?.slice(0, 2);
    closeDrawers(false);
    patch({
      [target === 'b' ? 'second' : 'selected']: id,
      rankFocus: null,
      recentStates: stateId
        ? [stateId, ...s.recentStates.filter((p) => p !== stateId)].slice(0, 2)
        : s.recentStates,
    });
    r.geo.prepareFocus(id);
    setPlaceSheet(mobileLayout() ? 'min' : id ? 'half' : 'min');
    if (previous !== id) {
      if (id && mobileLayout()) selectionAnimation.current++;
      const p = placeContext(id);
      action('place_select', {
        selected_place_id: p.place_id,
        selected_place_type: p.place_type,
        selected_state_id: p.state_id,
      });
    }
    try {
      await r.geo.loadDetail(id);
      if (serial === request.current[target]) bump();
    } catch (error) {
      if (serial === request.current[target])
        toast(error instanceof Error ? error.message : String(error));
    }
  }
  async function navigate(
    page: Page,
    article?: string,
    { fromPopState = false, force = false }: { fromPopState?: boolean; force?: boolean } = {},
  ) {
    const s = current.current;
    if (s.page === page && (!article || article === s.article) && !force) return;
    const r = resource.current;
    const serial = ++request.current.navigation;
    if (
      r &&
      (page === 'map' || page === 'compare') &&
      (page === 'compare') !== (s.concept === 'compare')
    ) {
      const container = element('#maps');
      if (container)
        layoutTransition.current = {
          overlay: captureMapLayout(container, [maps.current.a, maps.current.b]),
          entering: page === 'compare',
        };
    }
    if (!fromPopState) beginHistory();
    const returns = historyReturns.current;
    if (s.page === 'article' && page === 'blog') {
      const i = returns.lastIndexOf('blog');
      if (i >= 0) returns.splice(i);
    } else if (returns.at(-1) === page) returns.pop();
    else if (s.page !== page) returns.push(s.page);
    closeDrawers(false);
    const updates: Partial<AtlasState> = {
      page,
      ...(article ? { article } : {}),
      ...(page === 'info' ? { infoSurface: 'about' } : {}),
    };
    if (page === 'compare' && r) {
      rememberExploration();
      prepareComparison();
      updates.concept = 'compare';
      if (!s.selected) updates.selected = '06';
      setPlaceSheet(mobileLayout() ? 'min' : 'half');
    }
    if (page === 'map') {
      updates.concept = 'explorer';
      const back = s.concept === 'compare' && restoration.current;
      if (back) {
        Object.assign(updates, {
          selected: back.selection.selected,
          metric: back.selection.metric,
          mode: back.selection.mode,
          rank: back.selection.rank,
          rankFocus: back.selection.rankFocus,
        });
        setPlaceSheet(mobileLayout() ? 'min' : back.snap);
      }
    }
    patch(updates);
    if (r && (page === 'map' || page === 'compare')) {
      const selection = current.current;
      r.geo.prepareFocus(selection.selected);
      if (page === 'compare') r.geo.prepareFocus(selection.second);
      try {
        await Promise.all([
          r.geo.loadDetail(selection.selected),
          page === 'compare' ? r.geo.loadDetail(selection.second) : null,
        ]);
        if (serial !== request.current.navigation) return;
        bump();
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      }
      if (page === 'map' && s.concept === 'compare' && restoration.current) {
        const saved = restoration.current;
        requestAnimationFrame(() => {
          maps.current.a?.restoreView(saved.camera);
          maps.current.b?.cancelMotion();
          const scroll = scrollHost('explore-panel');
          if (scroll) scroll.scrollTop = saved.scroll;
        });
        restoration.current = null;
      }
      action('view_select');
    }
  }
  function back() {
    void navigate(
      current.current.page === 'article' ? 'blog' : historyReturns.current.at(-1) || 'map',
    );
  }
  function showMetricLibrary(side: Side = 'a', cardMode = false) {
    const s = current.current;
    patch({
      metricTarget: s.concept === 'compare' && s.comparison === 'metrics' ? side : 'a',
      cardMode,
      category: 'All',
      metricQuery: '',
    });
    openDrawer('metric-library', document.activeElement as HTMLElement, side);
  }
  function showPlaceLibrary(side: Side = 'a', countiesOnly = false) {
    patch({
      placeTarget: side,
      countiesOnly,
      placeBrowseAll: false,
      placeQuery: '',
    });
    openDrawer('place-library', document.activeElement as HTMLElement, side);
  }
  function openComparisonDraft() {
    rememberExploration();
    const first = current.current.selected || '06',
      second = prepareComparison() || '48';
    openDrawer('comparison-setup-panel');
    patch({
      comparisonDraft: {
        first,
        second,
        choosing: false,
        query: '',
        explicit: false,
      },
    });
  }
  function openRank(direction: Rank) {
    const s = current.current;
    if (s.rankFocus) patch({ selected: s.rankFocus.origin, rankFocus: null });
    openDrawer('ranking-panel');
    patch({ rank: direction });
  }
  function rankData() {
    const s = current.current,
      r = resource.current!,
      rankedPlace = s.rankFocus?.origin ?? s.selected,
      m = metric(),
      data = layer(m),
      selectedCounty = rankedPlace?.length === 5;
    const countyOnly = m.countySupported && !m.stateSupported,
      county = selectedCounty || countyOnly;
    const parent = selectedCounty
      ? rankedPlace!.slice(0, 2)
      : countyOnly && rankedPlace?.length === 2
        ? rankedPlace
        : null;
    const group = county
      ? r.geo.counties.filter((f) => (parent ? f.stateId === parent : f.stateId !== '11'))
      : r.geo.states.filter((f) => f.id !== '11');
    const available = group
      .map((f) => ({ id: f.id, name: f.name, value: value(m, f.id) }))
      .filter((f): f is { id: string; name: string; value: number } => f.value != null);
    const ascending = [...available].sort(
        (a, b) => a.value - b.value || a.name.localeCompare(b.name),
      ),
      descending = [...available].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    const direction = s.rank === 'lowest' ? ascending : descending;
    const rows = direction.slice(0, 5).map((row) => ({
      ...row,
      rank: direction.findIndex((x) => x.value === row.value) + 1,
      tied: available.filter((x) => x.value === row.value).length > 1,
      label: county && !parent ? `${row.name} · ${place(row.id.slice(0, 2))!.name}` : row.name,
    }));
    if (county) rows.forEach((row) => r.geo.prepareFocus(row.id));
    return {
      rows,
      total: group.length,
      count: available.length,
      group: county
        ? parent
          ? place(parent)!.name + ' counties'
          : 'U.S. counties · DC excluded'
        : '50 US states · DC excluded',
      min: ascending[0]?.value ?? 0,
      max: ascending.at(-1)?.value ?? 0,
      cutoffTie: direction.length > 5 && direction[4].value === direction[5].value,
      data,
    };
  }
  function selectRankPlace(id: string) {
    const s = current.current;
    if (!s.rank) return void choosePlace(id);
    const origin = s.rankFocus?.origin ?? s.selected;
    patch({ selected: id, rankFocus: { origin, direction: s.rank, id } });
    resource.current?.geo.prepareFocus(id);
    if (mobileLayout()) {
      patch({ overlay: null });
      setPlaceSheet('min');
    }
    const serial = ++request.current.a;
    resource.current?.geo
      .loadDetail(id)
      .then(() => {
        if (serial === request.current.a) bump();
      })
      .catch((error) => toast(error.message));
  }
  function handleMapSelection(id: string | null) {
    const s = current.current;
    if (s.rankFocus) {
      const { origin, id: focused } = s.rankFocus;
      if (!id || id === origin || (focused.length === 5 && id === focused.slice(0, 2))) {
        patch({ selected: origin, rankFocus: null });
        setPlaceSheet('min');
        void resource.current?.geo
          .loadDetail(origin)
          .then(() => bump())
          .catch((error) => toast(error.message));
        return;
      }
      patch({ rankFocus: null, rank: null });
    }
    void choosePlace(id);
  }
  function selectMetric(id: string, from: 'picker' | 'inspect' | 'switch' = 'picker') {
    const s = current.current,
      r = resource.current!;
    if (s.cardMode && from === 'picker') {
      void r.store.load(r.metricById.get(id)!);
      if (s.pinned.includes(id)) {
        if (s.pinned.length > 1) patch({ pinned: s.pinned.filter((p) => p !== id) });
        else toast('Keep at least one field in the card.');
      } else if (s.pinned.length < 5) patch({ pinned: [...s.pinned, id] });
      else toast('Your card can show up to 5 fields. Remove one first.');
      return;
    }
    const side =
        from === 'inspect'
          ? s.inspectorSide === 'b' && s.concept === 'compare' && s.comparison === 'metrics'
            ? 'b'
            : 'a'
          : s.metricTarget,
      previous = side === 'b' ? s.secondMetric : s.metric;
    if (previous !== id) beginHistory();
    patch({ [side === 'b' ? 'secondMetric' : 'metric']: id, rank: null });
    if (from === 'picker') closeDrawers();
    if (previous !== id) action('indicator_select', { selected_indicator_id: id });
  }
  async function openPrompt(index: number) {
    const p = prompts[index];
    if (!p) return;
    if (p.compare) rememberExploration();
    else restoration.current = null;
    const previous = current.current.metric;
    patch({
      comparison: 'places',
      metric: p.metric,
      rank: null,
      ...(p.other ? { second: p.other } : {}),
    });
    if (p.other) secondExplicit.current = true;
    await choosePlace(p.place);
    if (previous !== p.metric) action('indicator_select');
    if (p.compare) await navigate('compare');
    else await navigate('map');
    action('view_select', { entry: 'prompt' });
    if (p.rank) openRank(p.rank);
  }
  function showSource(side: Side | 'geometry') {
    sourceReturn.current = document.activeElement as HTMLElement;
    if (
      side !== 'geometry' &&
      !current.current.source &&
      !current.current.comparisonDraft &&
      current.current.overlay?.id !== 'inspector'
    )
      closeDrawers(false);
    patch({ source: side });
  }
  function closeSource() {
    patch({ source: null });
    requestAnimationFrame(() => {
      const trigger = sourceReturn.current;
      if (trigger?.isConnected && !trigger.closest('[inert]'))
        trigger.focus({ preventScroll: true });
    });
  }
  function reportContext() {
    const s = current.current,
      m = resource.current?.metricById.get(s.metric),
      p = selected();
    return {
      page: s.page === 'info' ? 'about' : s.page,
      placeId: p?.id || null,
      place: p?.name || null,
      indicatorId: m?.id || null,
      indicator: m?.name || null,
      period: m ? layer(m).sourcePeriod || layer(m).period || null : null,
    };
  }
  useEffect(() => {
    analytics.current = createAtlasAnalytics();
    return () => {
      analytics.current?.dispose();
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    const serial = ++request.current.boot;
    let alive = true;
    void (async () => {
      try {
        const snapshotRequest = fetch('./startup/unemployment-BLS-LAUS-2024-2024-M12.json')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const [geo, payload, settings, startup] = await Promise.all([
          loadGeography(),
          readAtlasJSON('/api/atlas/catalog'),
          loadViewSettings(),
          snapshotRequest,
        ]);
        if (!alive || serial !== request.current.boot) return;
        const catalog = collectedMapIndicators(payload.metrics) as Metric[];
        if (!catalog.length)
          throw new Error('No map indicators have been loaded yet. Please retry later.');
        const metricById = new Map(
          (loadedMapMetrics(payload.metrics) as Metric[]).map((m) => [m.id, m]),
        );
        const store = createDataStore(geo, () => bump()) as DataStore,
          index = buildPlaceIndex(geo.states, geo.counties);
        const r: Resources = {
          geo: geo as unknown as Geography,
          catalog,
          metricById,
          library: payload.library || [],
          store,
          settings: settings as SettingsData,
          index,
        };
        resource.current = r;
        const route = parsePath(location.pathname),
          resolved = route && resolveRoute(route, index, new Set(metricById.keys()));
        routeValid.current = !route || Boolean(resolved);
        const s = current.current,
          selection: Partial<AtlasState> = {
            metric: availableId(resolved?.metric || s.metric, 'unemployment', r),
            secondMetric: availableId(
              resolved?.secondMetric || s.secondMetric,
              catalog.find((m) => m.id !== s.metric)?.id,
              r,
            ),
            pinned: s.pinned.filter((id) => metricById.has(id)),
            selected: resolved?.concept
              ? resolved.place || null
              : r.geo.byId.has(s.selected || '')
                ? s.selected
                : null,
            second: resolved?.concept
              ? resolved.second || null
              : s.second && r.geo.byId.has(s.second)
                ? s.second
                : '48',
          };
        if (resolved?.page) selection.page = resolved.page as Page;
        if (resolved?.article) selection.article = resolved.article;
        if (resolved?.concept) {
          selection.concept = resolved.concept === 'compare' ? 'compare' : 'explorer';
          selection.comparison = resolved.comparison === 'metrics' ? 'metrics' : 'places';
          secondExplicit.current = resolved.page === 'compare' && resolved.comparison === 'places';
        }
        patch(selection);
        const startupMetric = metricById.get('unemployment');
        const seeded =
          startup?.snapshotVersion === 'BLS-LAUS-2024/2024-M12' &&
          startup.metricId === 'unemployment' &&
          startup.fieldId === '03.06:unemployment_rate' &&
          startup.data?.sourceRelease === 'BLS-LAUS-2024' &&
          startup.data?.period === '2024-M12' &&
          current.current.metric === 'unemployment' &&
          startupMetric &&
          store.seed(startupMetric, startup.data);
        if (current.current.concept === 'compare') {
          prepareComparison();
          if (!current.current.selected && !resolved && current.current.comparison === 'places')
            patch({ selected: '06' });
        }
        await Promise.all([
          r.geo.loadDetail(current.current.selected),
          current.current.concept === 'compare' ? r.geo.loadDetail(current.current.second) : null,
        ]);
        if (!alive) return;
        const stateId = current.current.selected?.slice(0, 2);
        if (stateId) patch({ recentStates: [stateId] });
        setResources(r);
        if (seeded && startupMetric) void store.refresh(startupMetric);
      } catch (error) {
        if (alive) {
          patch({ startup: 'error' });
          window.dispatchEvent(
            new CustomEvent('atlas:startup-error', {
              detail: {
                message:
                  'Map boundaries or indicator data could not be reached. Check your connection and try again. About and Support are available.',
              },
            }),
          );
        }
      }
    })();
    return () => {
      alive = false;
      request.current.boot++;
    };
  }, []);
  useEffect(() => {
    if (!resources) return;
    const s = current.current;
    const needed = [
      ...new Set([
        s.metric,
        ...(s.concept === 'compare'
          ? [s.comparison === 'metrics' ? s.secondMetric : s.metric]
          : []),
        ...(s.selected ? s.pinned : []),
      ]),
    ];
    needed.forEach((id) => {
      const m = resources.metricById.get(id);
      if (m) void resources.store.load(m);
    });
    analytics.current?.observe(
      atlasContext(s),
      !needed.some((id) =>
        ['idle', 'loading'].includes(layer(resources.metricById.get(id)!).status),
      ),
    );
  }, [
    resources,
    state.metric,
    state.secondMetric,
    state.selected,
    state.concept,
    state.comparison,
    state.pinned,
    revision,
  ]);
  useEffect(() => {
    document.body.dataset.page = state.page;
    document.body.dataset.theme = state.theme;
    document.body.dataset.concept = state.concept;
    document.body.dataset.view = state.mode;
    document.body.dataset.comparison = state.comparison;
    document.body.classList.toggle('reading', !['map', 'compare'].includes(state.page));
    document.body.classList.toggle('comparison-setup', Boolean(state.comparisonDraft));
    document.body.classList.toggle(
      'left-replaced',
      Boolean(state.overlay && !['inspector', 'compare-results'].includes(state.overlay.id)),
    );
  }, [
    state.page,
    state.theme,
    state.concept,
    state.mode,
    state.comparison,
    state.overlay,
    state.comparisonDraft,
  ]);
  useEffect(() => {
    if (!resources) return;
    const path = canonicalPath({ ...state }, resources.index) || '/united-states/unemployment',
      q = routeParams(new URLSearchParams(location.search));
    const next = path + (q ? '?' + q : '');
    if (next !== location.pathname + location.search) history.replaceState(history.state, '', next);
    const query = new URLSearchParams(location.search),
      noindex =
        !routeValid.current ||
        query.has('preview') ||
        query.has('review') ||
        query.get('embed') === '1';
    if (['map', 'compare'].includes(state.page))
      applyPageMetadata(
        mapPageMetadata({
          state: {
            ...state,
            secondMetricName: metricB()?.name,
            secondName: selectedB()?.name,
          },
          index: resources.index,
          metricName: metric()?.name,
          placeName: selected()?.name || 'the United States',
          path,
          noindex,
        }),
      );
    else {
      const article = (
        articles as Record<string, { title: string; description: string; meta: string }>
      )[state.article];
      const published = Object.values(articles).some(
        (item) => !/owner review pending/i.test(item.meta || ''),
      );
      applyPageMetadata(
        screenPageMetadata(state.page, path, {
          article: state.page === 'article' && article ? article : null,
          noindex:
            noindex ||
            state.page === 'stats' ||
            (state.page === 'blog' && !published) ||
            (state.page === 'article' &&
              (!article || /owner review pending/i.test(article.meta || ''))),
        }),
      );
    }
  }, [
    resources,
    state.page,
    state.article,
    state.selected,
    state.second,
    state.metric,
    state.secondMetric,
    state.comparison,
  ]);
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      if (event.state?.usaAtlasDialog) return;
      const r = resource.current;
      if (!r) return;
      const route = parsePath(location.pathname),
        resolved = route && resolveRoute(route, r.index, new Set(r.metricById.keys()));
      routeValid.current = Boolean(resolved);
      if (resolved?.concept) {
        patch({
          concept: resolved.concept === 'compare' ? 'compare' : 'explorer',
          selected: resolved.place || null,
          second: resolved.second || null,
          metric: availableId(resolved.metric || 'unemployment'),
          secondMetric: availableId(resolved.secondMetric || 'population'),
          comparison: resolved.comparison === 'metrics' ? 'metrics' : 'places',
          rank: null,
        });
        secondExplicit.current = resolved.page === 'compare' && resolved.comparison === 'places';
        comparisonDefault.current = null;
      }
      void navigate((resolved?.page || 'map') as Page, resolved?.article, {
        fromPopState: true,
        force: true,
      });
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  return {
    state,
    patch,
    current,
    resources,
    revision,
    bump,
    maps,
    selectionAnimation,
    layoutTransition,
    sheets,
    scrollHost,
    setTheme,
    getSettings,
    place,
    selected,
    selectedB,
    metric,
    metricB,
    layer,
    observation,
    value,
    number,
    compactNumber,
    toast,
    action,
    setPlaceSheet,
    openDrawer,
    closeDrawers,
    choosePlace,
    navigate,
    back,
    showMetricLibrary,
    showPlaceLibrary,
    openComparisonDraft,
    openRank,
    rankData,
    selectRankPlace,
    handleMapSelection,
    selectMetric,
    openPrompt,
    rememberExploration,
    showSource,
    closeSource,
    reportContext,
    focusReturn,
    secondExplicit,
  };
}
export type Atlas = ReturnType<typeof useAtlas>;
