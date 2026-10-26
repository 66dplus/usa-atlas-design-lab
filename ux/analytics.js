/** Atlas event vocabulary and attention clock. The UI remains its state owner. */
export const IDLE_MS = 60_000;
export const FLUSH_MS = 15_000;

export function placeContext(id) {
  if (!id) return {place_type: 'us', place_id: 'US', state_id: ''};
  if (/^\d{2}$/.test(id)) return {place_type: 'state', place_id: id, state_id: id};
  if (/^\d{5}$/.test(id)) return {place_type: 'county', place_id: id, state_id: id.slice(0, 2)};
  // Analytics only accepts US/state/county contexts. A 2024 district selection
  // is represented at its parent state here; map/data identity stays the CD119 ID.
  if (/^\d{4}$/.test(id)) return {place_type: 'state', place_id: id.slice(0, 2), state_id: id.slice(0, 2)};
  throw new Error('Analytics requires an exact state or county FIPS');
}

export function atlasContext(state) {
  const context = {schema_version: 1, surface: state.concept === 'stories' ? 'trends' : state.concept,
    indicator_id: state.metric, ...placeContext(state.selected), comparison: ''};
  if (state.concept === 'compare') {
    context.comparison = state.comparison;
    context.other_indicator_id = state.comparison === 'metrics' ? state.secondMetric : state.metric;
    const other = placeContext(state.comparison === 'metrics' ? state.selected : state.second);
    context.other_place_type = other.place_type;
    context.other_place_id = other.place_id;
    context.other_state_id = other.state_id;
    context.pair_key = [context.place_type + ':' + context.place_id, other.place_type + ':' + other.place_id].sort().join('|');
  }
  return context;
}

/** Integrate elapsed foreground time exactly up to the inactivity cutoff. */
export class AttentionClock {
  constructor(now) { this.cursor = now; this.activity = now; this.total = 0; }
  settle(now, engaged) {
    if (engaged) this.total += Math.max(0, Math.min(now, this.activity + IDLE_MS) - this.cursor);
    this.cursor = now;
  }
  touch(now, engaged) { this.settle(now, engaged); this.activity = now; }
  take() { const value = this.total; this.total = 0; return Math.round(value); }
}

export function createAtlasAnalytics() {
  const lifetime = new AbortController();
  let context, signature, comparisonSignature, ready = false, foreground = false, clock;
  let tracker, failed = false, pending = [], initialViewSent = false;
  const now = () => performance.now();
  const engaged = () => ready && foreground;
  const diagnostic = error => { if(lifetime.signal.aborted)return; if (!failed) console.warn('Atlas analytics unavailable:', error.message); failed = true; pending = []; };
  function send(name, data = context) {
    if (failed || !data) return;
    const payload = {name: 'atlas_' + name, data: {...data}};
    if (!tracker) {
      // shortcut: bounded in-memory startup buffer; offline events are not replayed.
      if (pending.length < 50) pending.push(payload);
      return;
    }
    try {
      Promise.resolve(tracker.track(props => ({...props, url: '/ux/' + data.surface, title: 'USA X-Ray',
        referrer: '', name: payload.name, data: payload.data}))).catch(diagnostic);
    } catch (error) { diagnostic(error); }
  }
  function flush() {
    if (!clock) return;
    clock.settle(now(), engaged());
    const active_ms = clock.take();
    if (active_ms) send('active_time', {...context, active_ms});
  }
  function observe(next, nextReady) {
    const nextSignature = JSON.stringify(next);
    if (!clock) {
      clock = new AttentionClock(now()); context = {...next, exploration_id: crypto.randomUUID()}; signature = nextSignature;
      comparisonSignature = next.comparison ? nextSignature : null;
    } else if (nextSignature !== signature) {
      flush(); context = {...next, exploration_id: crypto.randomUUID()}; signature = nextSignature;
      if (!next.comparison) comparisonSignature = null;
    } else clock.settle(now(), engaged());
    ready = nextReady;
    if (ready && !initialViewSent) { send('initial_view'); initialViewSent = true; }
  }
  function action(name, extra = {}) {
    if (!context) return;
    send(name, {...context, ...extra});
    if (context.comparison && signature !== comparisonSignature) {
      send('compare_view'); comparisonSignature = signature;
    }
  }
  function activity() { if (clock) clock.touch(now(), engaged()); }
  function setForeground(next) {
    flush(); foreground = next;
    if (clock && foreground) clock.activity = now();
  }
  function visibility() { setForeground(document.visibilityState === 'visible' && document.hasFocus()); }
  async function start() {
    try {
      const response = await fetch('/api/analytics/config', {signal:lifetime.signal});
      if (!response.ok) throw new Error('Tracker configuration could not be loaded');
      const config = await response.json();
      if (!config.enabled) { failed = true; pending = []; return; }
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = config.scriptUrl; script.async = true;
        script.dataset.websiteId = config.websiteId; script.dataset.autoPageview = 'false';
        script.dataset.excludeSearch = 'true'; script.dataset.excludeHash = 'true';
        script.onload = resolve; script.onerror = () => reject(new Error('Umami script is unreachable'));
        document.head.append(script);
      });
      tracker = window.umami;
      if (!tracker) throw new Error('Umami tracker did not initialize');
      await tracker.track(props => ({...props, url: '/ux/', title: 'USA X-Ray', referrer: ''}));
      const buffered = pending; pending = [];
      for (const event of buffered) send(event.name.slice(6), event.data);
    } catch (error) { diagnostic(error); }
  }
  foreground = document.visibilityState === 'visible' && document.hasFocus();
  for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) document.addEventListener(event, activity, {passive: true, capture: true, signal:lifetime.signal});
  document.addEventListener('visibilitychange', visibility, {signal:lifetime.signal});
  // Window events are authoritative; hasFocus() can lag while blur/focus is dispatched.
  window.addEventListener('blur', () => setForeground(false), {signal:lifetime.signal});
  window.addEventListener('focus', () => setForeground(document.visibilityState === 'visible'), {signal:lifetime.signal});
  window.addEventListener('pagehide', flush, {signal:lifetime.signal});
  const interval = setInterval(flush, FLUSH_MS);
  start();
  return {observe, action, dispose() {flush(); clearInterval(interval); lifetime.abort(); pending = [];}};
}
