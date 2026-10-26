// Human-readable atlas routes. This module is DOM-free so route behavior can
// be checked directly in Node.
//
// Maps:
//   /united-states/{indicator}
//   /united-states/{state}/{indicator}
//   /united-states/{state}/{county}/{indicator}
// Comparisons:
//   /compare/places/{indicator}/{state}-vs-{state}
//   /compare/places/{indicator}/{state}/{county}/vs/{state}/{county}
//   /compare/indicators/{indicator}-vs-{indicator}[/in/{state}/{county}]
// Reading pages: /stats /support /about /blog /blog/{article-slug}

const SEGMENT = /^[a-z0-9-]{1,64}$/;
const ROOT_SEGMENT = 'united-states';
const COUNTRY_SEGMENT = 'united-states';
export const SCREEN_PATHS = {stats: '/stats', support: '/support', about: '/about', blog: '/blog'};
export const SCREEN_PAGES = {stats: 'stats', support: 'support', about: 'info', blog: 'blog'};
export const DEFAULT_INDICATOR = 'unemployment';
export const COMPARE_SEPARATOR = '-vs-';
const INDICATOR_ALIASES = {
  'adjusted-gross-income-agi--per-resident': 'adjusted-gross-income-agi-per-resident',
  'crime-trends--04-09-aggravated-assault-yoy': 'crime-trends-aggravated-assault-year-over-year',
  'crime-trends--04-09-burglary-yoy': 'crime-trends-burglary-year-over-year',
  'crime-trends--04-09-homicide-yoy': 'crime-trends-homicide-year-over-year',
  'crime-trends--04-09-motor-vehicle-theft-yoy': 'crime-trends-motor-vehicle-theft-year-over-year',
  'crime-trends--04-09-rape-yoy': 'crime-trends-rape-year-over-year',
  'crime-trends--04-09-robbery-yoy': 'crime-trends-robbery-year-over-year',
  'electricity-price--08-05-sector-com': 'electricity-price-commercial',
  'electricity-price--08-05-sector-ind': 'electricity-price-industrial',
  'electricity-price--08-05-sector-res': 'electricity-price-residential',
  'electricity-price--08-05-sector-tra': 'electricity-price-transportation',
  'unemployment--03-06-employment': 'unemployment-employment',
  'unemployment--03-06-labor-force': 'unemployment-labor-force',
  'unemployment--03-06-unemployment': 'unemployment-count',
  'access-to-a-grocery-store--09-02-count': 'access-to-a-grocery-store-count',
};
const INDICATOR_IDS_BY_SLUG = Object.fromEntries(Object.entries(INDICATOR_ALIASES).map(([id, slug]) => [slug, id]));

// Six county equivalents share a base name with an independent city. FIPS
// keeps those names distinct in their state without exposing a bare ID.
const CITY_COUNTY_SLUGS = {
  '24510': 'baltimore-city-county',
  '29510': 'st-louis-city-county',
  '51600': 'fairfax-city-county',
  '51620': 'franklin-city-county',
  '51680': 'roanoke-city-county',
  '51760': 'richmond-city-county',
};

export function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function countySlug(name, fipsId = null) {
  if (fipsId && CITY_COUNTY_SLUGS[fipsId]) return CITY_COUNTY_SLUGS[fipsId];
  return slugify(name) + '-county';
}

export function validSegment(text) {
  return typeof text === 'string' && SEGMENT.test(text);
}

function splitPair(token) {
  const parts = String(token || '').split(COMPARE_SEPARATOR);
  return parts.length === 2 && parts.every(Boolean) ? parts : null;
}

function putUniqueCounty(index, slug, county) {
  const current = index.uniqueCounties.get(slug);
  if (!index.uniqueCounties.has(slug)) index.uniqueCounties.set(slug, county);
  else if (current && current.id !== county.id) index.uniqueCounties.set(slug, null);
}

// Build the resolution index once geography is loaded. Every county route
// carries its state; rare duplicate names within a state gain a short FIPS
// suffix so no valid selection has to fall back to a query-string URL.
export function buildPlaceIndex(states, counties, districts = []) {
  const index = {byStateSlug: new Map(), countiesByState: new Map(), uniqueCounties: new Map(), slugByPlaceId: new Map(), byId: new Map()};
  for (const state of states) {
    const slug = slugify(state.name);
    if (!validSegment(slug) || index.byStateSlug.has(slug)) continue;
    index.byStateSlug.set(slug, state);
    index.countiesByState.set(state.id, new Map());
    index.slugByPlaceId.set(state.id, slug);
    index.byId.set(state.id, state);
  }
  for (const county of counties) {
    const scope = index.countiesByState.get(county.stateId);
    index.byId.set(county.id, county);
    if (!scope) continue;
    const base = countySlug(county.name, county.id);
    if (!validSegment(base)) continue;
    let slug = base;
    const previous = scope.get(base);
    if (previous) {
      scope.delete(base);
      // A bare slug is ambiguous once a second county in this state collides.
      index.uniqueCounties.delete(base);
      const previousSlug = `${base}-${previous.id}`;
      const currentSlug = `${base}-${county.id}`;
      scope.set(previousSlug, previous);
      scope.set(currentSlug, county);
      index.slugByPlaceId.set(previous.id, previousSlug);
      index.slugByPlaceId.set(county.id, currentSlug);
      putUniqueCounty(index, previousSlug, previous);
      putUniqueCounty(index, currentSlug, county);
      continue;
    }
    slug = base;
    scope.set(slug, county);
    index.slugByPlaceId.set(county.id, slug);
    putUniqueCounty(index, slug, county);
  }
  index.uniqueCounties.clear();
  for (const scope of index.countiesByState.values()) {
    for (const [slug, county] of scope) putUniqueCounty(index, slug, county);
  }
  for (const [slug, value] of [...index.uniqueCounties]) if (!value) index.uniqueCounties.delete(slug);
  for (const district of districts) index.byId.set(district.id, district);
  return index;
}

// Structural parse. Route vocabulary is resolved later against geography and
// the currently admitted indicator catalogue.
export function parsePath(pathname) {
  let path = String(pathname || '');
  if (path.length > 512) return null;
  try {path = decodeURI(path);} catch {return null;}
  if (path !== '/') path = path.replace(/\/+$/, '') || '/';
  const segments = path.split('/').filter(Boolean).map(segment => {
    try {return decodeURIComponent(segment).toLowerCase();} catch {return '\u0000invalid';}
  });
  if (!segments.length) return {kind: 'root'};
  if (segments[0] === 'blog') {
    if (segments.length === 1) return {kind: 'screen', screen: 'blog'};
    if (segments.length === 2 && validSegment(segments[1])) return {kind: 'article', article: segments[1]};
    return null;
  }
  if (segments.length === 1 && SCREEN_PATHS[segments[0]]) return {kind: 'screen', screen: segments[0]};
  if (segments[0] === 'compare') {
    if (segments[1] === 'places' && segments.length >= 6) {
      const vs = segments.indexOf('vs', 3);
      if (vs < 0) return null;
      const left = segments.slice(3, vs), right = segments.slice(vs + 1);
      if (![1, 2].includes(left.length) || ![1, 2].includes(right.length)) return null;
      if (![segments[2], ...left, ...right].every(validSegment)) return null;
      return {kind: 'comparison', comparison: 'places', metric: segments[2], left, right};
    }
    if (segments[1] === 'indicators') {
      const pair = splitPair(segments[2]);
      if (!pair || !pair.every(validSegment)) return null;
      if (segments.length === 3) return {kind: 'comparison', comparison: 'metrics', metrics: pair, place: []};
      if (segments[3] !== 'in') return null;
      const place = segments.slice(4);
      if (![1, 2].includes(place.length) || !place.every(validSegment)) return null;
      return {kind: 'comparison', comparison: 'metrics', metrics: pair, place};
    }
    return null;
  }
  if (segments[0] !== ROOT_SEGMENT) return null;
  return segments.slice(1).every(validSegment) ? {kind: 'map', segments: segments.slice(1)} : null;
}

function resolveLocation(parts, index) {
  if (!Array.isArray(parts)) return null;
  if (parts.length === 0) return {valid: true, id: null};
  if (parts.length === 1) {
    if (parts[0] === COUNTRY_SEGMENT) return {valid: true, id: null};
    const state = index.byStateSlug.get(parts[0]);
    if (state) return {valid: true, id: state.id};
    const county = index.uniqueCounties.get(parts[0]);
    return county ? {valid: true, id: county.id} : null;
  }
  if (parts.length === 2) {
    const state = index.byStateSlug.get(parts[0]);
    const county = state && index.countiesByState.get(state.id)?.get(parts[1]);
    return county ? {valid: true, id: county.id} : null;
  }
  return null;
}

// Resolve a route against the loaded place index and admitted metric IDs.
export function resolveRoute(route, index, admitted) {
  if (!route || !index) return null;
  if (route.kind === 'screen') return {page: SCREEN_PAGES[route.screen]};
  if (route.kind === 'article') return route.article ? {page: 'article', article: route.article} : null;
  const metricIds = admitted && admitted.size ? admitted : null;
  const metricForSlug = slug => {
    const id = INDICATOR_IDS_BY_SLUG[slug] || slug;
    return metricIds?.has(id) ? id : null;
  };
  if (route.kind === 'comparison') {
    if (route.comparison === 'metrics') {
      const [metricSlug, secondSlug] = route.metrics || [];
      const metric = metricForSlug(metricSlug), secondMetric = metricForSlug(secondSlug);
      const place = resolveLocation(route.place, index);
      if (!metric || !secondMetric || metric === secondMetric || !place) return null;
      return {page: 'compare', concept: 'compare', comparison: 'metrics', place: place.id, metric, secondMetric};
    }
    if (route.comparison === 'places') {
      const left = resolveLocation(route.left, index), right = resolveLocation(route.right, index);
      const metric = metricForSlug(route.metric);
      if (!metric || !left || !right || left.id === right.id) return null;
      return {page: 'compare', concept: 'compare', comparison: 'places', place: left.id, second: right.id, metric};
    }
    return null;
  }
  if (route.kind !== 'map') return null;

  const segments = [...route.segments];
  const requestedMetric = segments.length ? metricForSlug(segments.at(-1)) : null;
  const metric = requestedMetric || DEFAULT_INDICATOR;
  if (requestedMetric) segments.pop();

  // Read old clean comparison paths and rewrite them to the explicit /compare/ form.
  const metricPair = segments.length ? splitPair(segments.at(-1)) : null;
  const metricPairIds = metricPair?.map(metricForSlug);
  if (metricPairIds?.every(Boolean)) {
    const scope = segments.slice(0, -1);
    const place = scope.length ? resolveLocation(scope, index) : {valid: true, id: null};
    if (scope.length <= 2 && place && metricPairIds[0] !== metricPairIds[1]) return {page: 'compare', concept: 'compare', comparison: 'metrics', place: place.id, metric: metricPairIds[0], secondMetric: metricPairIds[1]};
  }

  if (segments.length === 0) return {page: 'map', concept: 'explorer', place: null, metric};
  if (segments.length === 1) {
    const [token] = segments;
    const pair = splitPair(token);
    if (pair) {
      const left = resolveLocation([pair[0]], index), right = resolveLocation([pair[1]], index);
      if (left && right && left.id !== right.id) return {page: 'compare', concept: 'compare', comparison: 'places', place: left.id, second: right.id, metric};
      return null;
    }
    const place = resolveLocation([token], index);
    return place ? {page: 'map', concept: 'explorer', place: place.id, metric} : null;
  }
  if (segments.length === 2) {
    const place = resolveLocation(segments, index);
    return place ? {page: 'map', concept: 'explorer', place: place.id, metric} : null;
  }
  return null;
}

function indicatorSegment(metricId) {
  const slug = INDICATOR_ALIASES[metricId] || metricId;
  return validSegment(slug ?? '') ? slug : null;
}

function describePlace(place, index) {
  if (!place || place === 'US') return [COUNTRY_SEGMENT];
  if (place.length === 2) {
    const slug = index.slugByPlaceId.get(place);
    return slug ? [slug] : null;
  }
  const stateSlug = index.slugByPlaceId.get(place.slice(0, 2));
  const countySlug = index.slugByPlaceId.get(place);
  const county = index.countiesByState.get(place.slice(0, 2))?.get(countySlug);
  return stateSlug && countySlug && county?.id === place ? [stateSlug, countySlug] : null;
}

// Canonical URL for the current screen and selection. Normal routes never
// serialize application navigation state into query parameters.
export function canonicalPath(state, index) {
  if (!state) return `/${ROOT_SEGMENT}/${DEFAULT_INDICATOR}`;
  const page = state.page || 'map';
  if (page === 'stats') return SCREEN_PATHS.stats;
  if (page === 'support') return SCREEN_PATHS.support;
  if (page === 'info') return '/about';
  if (page === 'blog') return SCREEN_PATHS.blog;
  if (page === 'article') return state.article ? `${SCREEN_PATHS.blog}/${encodeURIComponent(state.article)}` : null;
  if (!index) return null;
  const metric = indicatorSegment(state.metric || DEFAULT_INDICATOR) || DEFAULT_INDICATOR;
  const placeId = state.place ?? state.selected ?? null;
  if (placeId && index.byId?.get(placeId)?.districtCode) return `/${ROOT_SEGMENT}/elections-house`;
  if (state.concept === 'compare') {
    if (state.comparison === 'metrics') {
      const a = indicatorSegment(state.metric), b = indicatorSegment(state.secondMetric);
      if (!a || !b || a === b) return null;
      const scope = placeId && placeId !== 'US' ? describePlace(placeId, index) : [];
      if (placeId && placeId !== 'US' && !scope) return null;
      return `/compare/indicators/${a}${COMPARE_SEPARATOR}${b}${scope?.length ? '/in/' + scope.join('/') : ''}`;
    }
    const left = describePlace(placeId, index), right = describePlace(state.second, index);
    if (!left || !right || placeId === state.second) return null;
    return `/compare/places/${metric}/${left.join('/')}/vs/${right.join('/')}`;
  }
  if (!placeId || placeId === 'US') return `/${ROOT_SEGMENT}/${metric}`;
  const place = describePlace(placeId, index);
  return place ? `/${ROOT_SEGMENT}/${place.join('/')}/${metric}` : null;
}

// Keep only non-content operational flags. Indicator, geography and page are
// always represented by the path; presentation preferences do not create URLs.
export function routeParams(params, selection = {}) {
  const keep = new URLSearchParams();
  for (const key of ['embed', 'review', 'preview']) {
    const value = params?.get(key);
    if (value) keep.set(key, value);
  }
  const period = params?.get('period');
  if (/^2025(?:-M(?:0[1-9]|1[0-2]))?$/.test(period || '')) keep.set('period', period);
  const party = params?.get('party');
  if (['DEMOCRAT', 'REPUBLICAN'].includes(party || '')) keep.set('party', party);
  const state = selection.state || {};
  const district = value => typeof value === 'string' && /^\d{4}$/.test(value) &&
    selection.index?.byId?.get(value)?.districtCode ? value : null;
  const selectedDistrict = district(state.selected);
  if (selectedDistrict) {
    keep.set('district', selectedDistrict);
    if (state.concept === 'compare' && state.comparison === 'places') {
      const secondDistrict = district(state.second);
      if (secondDistrict && secondDistrict !== selectedDistrict) {
        keep.set('compare', 'places');
        keep.set('secondDistrict', secondDistrict);
      }
    } else if (state.concept === 'compare' && state.comparison === 'metrics') {
      const metricIds = selection.metricIds || new Set();
      if (metricIds.has(state.metric) && metricIds.has(state.secondMetric) && state.metric !== state.secondMetric) {
        keep.set('compare', 'metrics');
        keep.set('metricA', state.metric);
        keep.set('metricB', state.secondMetric);
      }
    }
  }
  return keep.toString();
}

// House selections are operational state on the valid House map path. Never
// interpret four digits as a county or accept an ID absent from CD119 data.
export function resolveHouseQuery(params, index, metricIds = new Set(), pathname = '') {
  if (pathname.replace(/\/+$/, '') !== `/${ROOT_SEGMENT}/elections-house`) return null;
  const validDistrict = value => typeof value === 'string' && /^\d{4}$/.test(value) &&
    Boolean(index?.byId?.get(value)?.districtCode) ? value : null;
  const selected = validDistrict(params?.get('district'));
  if (!selected) return null;
  const result = { selected };
  if (params.get('compare') === 'places') {
    const second = validDistrict(params.get('secondDistrict'));
    if (second && second !== selected) Object.assign(result, {
      page: 'compare', concept: 'compare', comparison: 'places', second,
    });
  } else if (params.get('compare') === 'metrics') {
    const metric = params.get('metricA'), secondMetric = params.get('metricB');
    if (metricIds.has(metric) && metricIds.has(secondMetric) && metric !== secondMetric)
      Object.assign(result, { page: 'compare', concept: 'compare', comparison: 'metrics', metric, secondMetric });
  }
  return result;
}
