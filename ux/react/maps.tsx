import { Fragment, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { animateMapLayout } from '../motion.js';
import { ExplorerMap } from '../map.js';
import type { Atlas } from './use-atlas';
import { displayMetricName } from './types';
import type { MapAdapter, Geography, Side } from './types';
import { formatPeriod } from '../model.js';
import { Legend, SourceButton, paletteFor, ramp } from './explorer';
import { Icon, Segmented } from './components';
import { formatValue } from '../model.js';

const Renderer = ExplorerMap as unknown as new (
  host: HTMLElement,
  geo: Geography,
  callbacks: {
    onSelect: (id: string | null) => void;
    onRankSelect?: (id: string) => void;
    onError: (message: string) => void;
    onHover: (info: { id: string; name: string } | null) => void;
    onRenderError: (message: string | null) => void;
  },
) => MapAdapter;
export function Maps({ atlas }: { atlas: Atlas }) {
  const { state, resources, revision, maps } = atlas,
    compare = state.concept === 'compare';
  const [errors, setErrors] = useState<{ a: string | null; b: string | null }>({
    a: null,
    b: null,
  });
  const [hover, setHover] = useState<{
    side: Side;
    id: string;
    name: string;
  } | null>(null);
  useLayoutEffect(() => {
    if (!resources) return;
    const { geo, settings } = resources;
    const error = (message: string) => {
      atlas.toast(message);
      if (atlas.current.current.mode === '3d') atlas.patch({ mode: '2d' });
    };
    if (!maps.current.a)
      maps.current.a = new Renderer(document.querySelector<HTMLElement>('#map-a')!, geo, {
        onSelect: atlas.handleMapSelection,
        onRankSelect: atlas.selectRankPlace,
        onError: error,
        onRenderError: (message: string | null) =>
          setErrors((previous) => ({ ...previous, a: message })),
        onHover: (info: { id: string; name: string } | null) =>
          setHover(info ? { side: 'a', ...info } : null),
      }) as unknown as MapAdapter;
    if (compare && !maps.current.b)
      maps.current.b = new Renderer(document.querySelector<HTMLElement>('#map-b')!, geo, {
        onSelect: (id: string | null) => void atlas.choosePlace(id, 'b'),
        onError: error,
        onRenderError: (message: string | null) =>
          setErrors((previous) => ({ ...previous, b: message })),
        onHover: (info: { id: string; name: string } | null) =>
          setHover(info ? { side: 'b', ...info } : null),
      }) as unknown as MapAdapter;
    const rankRows =
      state.rank && !compare
        ? atlas.rankData().rows.map(({ id, rank, label }) => ({ id, rank, label }))
        : [];
    const update = (side: Side) => {
      const m = side === 'b' ? atlas.metricB() : atlas.metric(),
        data = atlas.layer(m),
        selectedId =
          side === 'b'
            ? state.comparison === 'metrics'
              ? state.selected
              : state.second
            : state.rank && !state.rankFocus && state.overlay?.id === 'ranking-panel'
              ? state.selected?.length === 5
                ? state.selected.slice(0, 2)
                : null
              : state.selected;
      maps.current[side]?.update({
        animateEntry: atlas.layoutTransition.current?.entering || false,
        layoutKey: state.concept,
        mode: state.mode,
        selectedId,
        metricKey: m.id,
        geographyType: m.geographyType === 'congressional_district' ? 'congressional_district' : 'state',
        values: data.values,
        heightValues: data.heightValues || new Map(),
        countySupported: m.geographyType === 'congressional_district' ? true : m.countySupported,
        palette: paletteFor(data),
        dark: state.theme === 'dark',
        cleanBackdrop: new URLSearchParams(location.search).get('embed') === '1',
        background:
          new URLSearchParams(location.search).get('embed') === '1'
            ? state.theme === 'dark'
              ? '#25292D'
              : '#FFFFFF'
            : state.theme === 'dark'
              ? '#171A1D'
              : '#EEF0F3',
        settings: settings.record.settings,
        ranks: side === 'a' && !state.rankFocus ? rankRows : [],
        rankMarkers: side === 'a' ? rankRows.filter((row) => row.id !== state.rankFocus?.id) : [],
      });
    };
    if (compare && atlas.layoutTransition.current?.entering) {
      update('b');
      update('a');
    } else {
      update('a');
      if (compare) update('b');
    }
    const transition = atlas.layoutTransition.current;
    atlas.layoutTransition.current = null;
    if (transition)
      void animateMapLayout(document.querySelector('#maps'), transition.overlay, {
        entering: transition.entering,
        pane: document.querySelector('#pane-b'),
      });
    let alive = true;
    void Promise.all([
      maps.current.a?.whenReady(),
      compare ? maps.current.b?.whenReady() : null,
    ]).then(() => {
      if (alive && atlas.current.current.startup === 'loading') {
        atlas.patch({ startup: 'ready' });
        window.dispatchEvent(new Event('atlas:startup-ready'));
      }
    });
    return () => {
      alive = false;
    };
  }, [
    resources,
    revision,
    state.selected,
    state.second,
    state.metric,
    state.secondMetric,
    state.comparison,
    state.concept,
    state.mode,
    state.theme,
    state.rank,
    state.rankFocus,
  ]);
  useEffect(
    () => () => {
      maps.current.a?.dispose();
      maps.current.b?.dispose();
      maps.current = { a: null, b: null };
    },
    [],
  );
  return createPortal(
    <main id="workspace" inert={!['map', 'compare'].includes(state.page)}>
      <section className="map-workspace" aria-label="Explore the map">
        <div id="compare-toolbar" className="compare-toolbar" hidden={!compare}>
          <Segmented>
            <button data-compare="places" aria-pressed={state.comparison === 'places'}>
              Two places
            </button>
            <button data-compare="metrics" aria-pressed={state.comparison === 'metrics'}>
              Two indicators
            </button>
          </Segmented>
        </div>
        <div id="maps" className="maps" aria-busy="false">
          {(['a', 'b'] as Side[]).map((side) => (
            <section
              key={side}
              className="map-pane"
              id={'pane-' + side}
              aria-label={side === 'a' ? 'Primary map' : 'Comparison map'}
              hidden={side === 'b' && !compare}
            >
              <div id={'map-' + side} className="map-host" />
              {side === 'a' && (
                <>
                  <nav id="breadcrumbs" aria-label="Geographic location" hidden={compare}>
                    {resources && <Breadcrumbs atlas={atlas} />}
                  </nav>
                  <div
                    className="map-intro"
                    id="map-intro"
                    hidden={Boolean(state.selected) || compare || state.concept === 'stories'}
                  >
                    <h1>
                      Every place
                      <br />
                      has a story.
                    </h1>
                    <p>Choose a state. See what changes.</p>
                  </div>
                </>
              )}
              <div className="compare-map-card">
                <div className="pane-heading" id={'heading-' + side}>
                  {resources && <PaneHeading atlas={atlas} side={side} />}
                </div>
                <button
                  className="map-summary"
                  id={'summary-' + side}
                  data-statistics={side}
                  aria-expanded={state.overlay?.id === 'inspector' && state.inspectorSide === side}
                >
                  {resources && <MapSummary atlas={atlas} side={side} />}
                </button>
                <div
                  className="pane-footer"
                  id={'footer-' + side}
                  hidden={side === 'b' && !compare}
                >
                  {resources && (
                    <>
                      <Legend atlas={atlas} side={side} pane />
                      <SourceButton atlas={atlas} side={side} />
                    </>
                  )}
                </div>
              </div>
              {errors[side] && (
                <section id={'map-' + side + '-error'} className="map-render-error" role="alert">
                  <h2>The 2D map is unavailable</h2>
                  <p>{errors[side]}</p>
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => maps.current[side]?.retryFlat()}
                  >
                    Try again
                  </button>
                </section>
              )}
              {hover?.side === side && resources && (
                <div className="map-hover">
                  <b>{hover.name}</b>
                  {atlas.number(side === 'b' ? atlas.metricB() : atlas.metric(), hover.id)}{' '}
                  {atlas.value(side === 'b' ? atlas.metricB() : atlas.metric(), hover.id) == null
                    ? 'No data'
                    : atlas.layer(side === 'b' ? atlas.metricB() : atlas.metric()).unit === '%'
                      ? ''
                      : atlas.layer(side === 'b' ? atlas.metricB() : atlas.metric()).unit}{' '}
                  <span>
                    ·{' '}
                    {formatPeriod(
                      atlas.layer(side === 'b' ? atlas.metricB() : atlas.metric()).period,
                    ) || 'No observation'}{' '}
                    · Click to explore
                  </span>
                </div>
              )}
            </section>
          ))}
          <DesktopCompareCard atlas={atlas} />
        </div>
        <div className="map-actions">
          <button
            id="stories-open"
            hidden={state.concept !== 'stories'}
            aria-expanded={state.overlay?.id === 'story-rail'}
          >
            Browse stories <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div id="region-jumps" className="region-jumps" hidden={compare}>
          <button data-jump="02">Alaska</button>
          <button data-jump="15">Hawaii</button>
        </div>
        <span id="map-hint" className="map-hint">
          {state.mode === '2d'
            ? 'Click a place · Drag to pan'
            : !state.selected
              ? 'Drag to pan · Scroll to zoom'
              : resources && !atlas.metric().countySupported
                ? 'State layer · county values unavailable'
                : 'Click another state · Click the background to return'}
        </span>
      </section>
    </main>,
    document.body,
  );
}
function Breadcrumbs({ atlas }: { atlas: Atlas }) {
  const f = atlas.selected();
  return (
    <>
      <button data-breadcrumb="US">United States</button>
      {f && (
        <>
          <span className="breadcrumb-divider" aria-hidden="true">
            /
          </span>
          <button data-breadcrumb={f.stateId}>{atlas.place(f.stateId)!.name}</button>
          {f.id.length === 5 && (
            <>
              <span className="breadcrumb-divider" aria-hidden="true">
                /
              </span>
              <button data-breadcrumb={f.id}>{f.name}</button>
            </>
          )}
        </>
      )}
    </>
  );
}
function PaneHeading({ atlas, side }: { atlas: Atlas; side: Side }) {
  const compare = atlas.state.concept === 'compare',
    f = side === 'b' ? atlas.selectedB() : atlas.selected(),
    m = side === 'b' ? atlas.metricB() : atlas.metric();
  return (
    <>
      <button
        id={side === 'a' ? 'find-place' : undefined}
        className="map-field place-field"
        data-pane-place={side}
        aria-expanded={
          atlas.state.overlay?.id === 'place-library' && atlas.state.placeTarget === side
        }
      >
        <span className="field-label">
          {compare ? (side === 'a' ? 'Primary map' : 'Comparison map') + ' · ' : ''}
          Place
        </span>
        <span className="field-value">
          {f?.name || 'United States'}
          <Icon name="down" />
        </span>
      </button>
      <button
        id={side === 'a' ? 'metric-button' : undefined}
        className="map-field metric-field"
        data-pane-metric={side}
        aria-expanded={
          atlas.state.overlay?.id === 'metric-library' && atlas.state.metricTarget === side
        }
      >
        <span className="field-label">
          Indicator
          {compare && atlas.state.comparison === 'places' ? ' · shared' : ''}
        </span>
        <span className="field-value">
          {displayMetricName(m)}
          <Icon name="down" />
        </span>
      </button>
    </>
  );
}
function MapSummary({ atlas, side }: { atlas: Atlas; side: Side }) {
  const f = side === 'b' ? atlas.selectedB() : atlas.selected(),
    m = side === 'b' ? atlas.metricB() : atlas.metric(),
    data = atlas.layer(m),
    caption = ['idle', 'loading'].includes(data.status)
      ? 'Loading…'
      : data.status === 'error'
        ? 'Connection error'
        : atlas.value(m, f?.id) == null
          ? 'No data here'
          : `${formatPeriod(data.period) || 'Latest available'}${data.unit && data.unit !== '%' ? ' · ' + data.unit : ''}`,
    formatted = atlas.number(m, f?.id);
  return (
    <>
      <span>
        <strong className={formatted.length > 7 ? 'long-value' : ''}>{formatted}</strong>
        <small>{caption}</small>
      </span>
      <span>
        Statistics <Icon name="arrow" />
      </span>
    </>
  );
}
function DesktopCompareCard({ atlas }: { atlas: Atlas }) {
  const { state, resources } = atlas;
  return (
    <section
      id="desktop-compare-card"
      className="desktop-compare-card"
      hidden={
        state.concept !== 'compare' ||
        matchMedia('(max-width:760px)').matches ||
        new URLSearchParams(location.search).get('embed') === '1'
      }
      aria-label="Compare places"
    >
      {resources && (
        <>
          <div className="desktop-compare-places">
            {(['a', 'b'] as Side[]).map((side, i) => {
              const f = side === 'b' ? atlas.selectedB() : atlas.selected(),
                m = side === 'b' ? atlas.metricB() : atlas.metric();
              return (
                <Fragment key={side}>
                  {i === 1 && <span className="desktop-compare-vs">VS</span>}
                  <div className="desktop-compare-place">
                    <button
                      className="desktop-compare-name"
                      data-pane-place={side}
                      aria-label={'Choose ' + (side === 'a' ? 'first' : 'second') + ' place'}
                    >
                      <span id={'desktop-compare-name-' + side}>{f?.name || 'United States'}</span>
                      <span aria-hidden="true">⌄</span>
                    </button>
                    <div className="desktop-compare-value">
                      <button
                        data-pane-metric={side}
                        aria-label={
                          'Choose indicator for ' + (side === 'a' ? 'first' : 'second') + ' place'
                        }
                      >
                        <span id={'desktop-compare-metric-' + side}>{displayMetricName(m)}</span>
                      </button>
                      <strong id={'desktop-compare-value-' + side}>{atlas.number(m, f?.id)}</strong>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
          <div className="desktop-compare-scale" id="desktop-compare-scale">
            {(state.comparison === 'metrics' ? ['a', 'b'] : ['a']).map((side) => {
              const m = side === 'b' ? atlas.metricB() : atlas.metric(),
                d = atlas.layer(m),
                domain = d.domain || [0, 0];
              return (
                <div key={side} className="desktop-compare-scale-item">
                  <div className="desktop-compare-scale-title">
                    {state.comparison === 'metrics'
                      ? displayMetricName(m)
                      : `${displayMetricName(m)} · ${d.unit || 'No data'} · Shared range`}
                  </div>
                  <div
                    className="desktop-compare-ramp"
                    title={(d.scale || 'linear') + ' scale'}
                    style={{ background: ramp(d) }}
                  />
                  <div className="desktop-compare-range">
                    <span>{formatValue(domain[0], d.unit)}</span>
                    <span>{formatValue(domain[1], d.unit)}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="desktop-compare-source-row">
            <button className="indicator-legend-source" data-source="a">
              Source, coverage &amp; method
            </button>
            <div id="compare-desktop-osm-slot" />
          </div>
        </>
      )}
    </section>
  );
}
