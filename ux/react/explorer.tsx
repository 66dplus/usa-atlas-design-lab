import { useLayoutEffect } from 'react';
import { MetricRow } from './metrics';
import type { Atlas } from './use-atlas';
import { displayMetricName, type Layer, type Side } from './types';
import { formatValue, formatPeriod, missingReason } from '../model.js';
import { rampColor, EMBER, DIVERGING } from '../map.js';
import { Icon, IndicatorIcon, MetricSwitch, PartySwitch } from './components';
import { ElectionDetails, PlacePhoto, QuickStatsContent } from './data-views';
import { Sheet } from './sheet';
import { UnemploymentPeriods } from './unemployment-periods';
export const paletteFor = (layer: Layer) => (layer.scale === 'diverging' ? DIVERGING : EMBER);
export function ramp(layer: Layer) {
  const sample = rampColor(paletteFor(layer));
  return `linear-gradient(90deg,${Array.from({ length: 25 }, (_, i) => `${sample(i / 24)} ${((i * 100) / 24).toFixed(2)}%`).join(',')})`;
}
export { SourceLink } from './metrics';
import { SourceLink } from './metrics';
const provenance = (d: Layer) =>
  d.status === 'ready'
    ? d.source + ' · ' + formatPeriod(d.period)
    : d.status === 'error'
      ? 'Database unavailable'
      : 'No loaded observations';
const range = (d: Layer) =>
  d.status !== 'ready'
    ? 'No data'
    : d.scale === 'diverging'
      ? '85 – 100 – 115'
      : `${formatValue(d.domain![0], d.unit)} – ${formatValue(d.domain![1], d.unit)}${d.unit === '%' ? '' : ' ' + d.unit}`;
const scaleNote = (d: Layer) =>
  d.status !== 'ready'
    ? 'No data'
    : d.scale === 'diverging'
      ? 'Diverging scale · 85 – 100 – 115'
      : `${d.scale === 'log' ? 'Logarithmic' : 'Linear'} scale · ${formatValue(d.domain![0], d.unit)} – ${formatValue(d.domain![1], d.unit)}`;
export function Legend({
  atlas,
  side = 'a',
  pane = false,
}: {
  atlas: Atlas;
  side?: Side;
  pane?: boolean;
}) {
  const { state, metric, metricB, layer } = atlas,
    data = layer(side === 'b' ? metricB() : metric()),
    other = layer(metricB()),
    independent = state.concept === 'compare' && state.comparison === 'metrics';
  const title = pane
    ? independent
      ? `${side === 'a' ? 'Primary' : 'Comparison'} · ${displayMetricName(side === 'b' ? metricB() : metric())}`
      : `${state.mode === '3d' ? 'Colour + height' : 'Colour'} · ${data.unit || 'No data'}${state.concept === 'compare' ? ' · shared' : ''}`
    : independent
      ? 'Independent scales · primary / comparison'
      : `${state.mode === '3d' ? 'Colour + height' : 'Colour'} · ${data.unit || 'No data'}${metric().fieldId && !metric().countySupported ? ' · state values' : ''}`;
  return (
    <div className="legend">
      <strong className="legend-title">{title}</strong>
      <div
        className="color-ramp"
        style={{ background: ramp(data) }}
        title={
          data.scale === 'log'
            ? 'Logarithmic colour scale'
            : data.scale === 'diverging'
              ? 'Diverging colour scale'
              : 'Linear colour scale'
        }
      />
      <div className="legend-labels">
        <span>{!pane && independent ? 'Primary: ' + scaleNote(data) : range(data)}</span>
        {!pane && independent && <span>{'Comparison: ' + scaleNote(other)}</span>}
        <span className="no-data-key">No data</span>
      </div>
    </div>
  );
}
export function SourceButton({ atlas, side = 'a' }: { atlas: Atlas; side?: Side }) {
  const data = atlas.layer(side === 'b' ? atlas.metricB() : atlas.metric()),
    text = provenance(data);
  return (
    <button
      className="indicator-legend-source"
      data-source={side}
      aria-label="Open statistical source, coverage and method"
    >
      {text === 'No loaded observations'
        ? 'Source, coverage & method'
        : `${text} · Source & method`}
    </button>
  );
}
export function IndicatorFooter({ atlas }: { atlas: Atlas }) {
  return (
    <div className="indicator-legend">
      <Legend atlas={atlas} />
      <SourceButton atlas={atlas} />
    </div>
  );
}
function explorerValues(atlas: Atlas) {
  const f = atlas.selected(),
    m = atlas.metric(),
    data = atlas.layer(m),
    v = atlas.value(m, f?.id),
    row = atlas.observation(m, f?.id),
    nationalGap = !f && data.status === 'ready' && !atlas.observation(m, 'US'),
    nationalUnit = data.unit && data.unit !== '%' ? ' ' + data.unit : '',
    nationalRange =
      nationalGap && data.min != null && data.max != null
        ? `${formatValue(data.min, data.unit)} – ${formatValue(data.max, data.unit)}${nationalUnit}`
        : '';
  const rangeLevel = m.countySupported ? 'County' : 'State',
    averageLabel = f?.name
      ? `${f.name} · ${m.geographyType === 'congressional_district' ? 'Congressional district' : f.id.length === 5 ? 'County' : 'State'}`
      : nationalGap
        ? nationalRange
          ? `${rangeLevel} range · ${formatPeriod(data.period) || 'Latest available'}`
          : `No observations · ${formatPeriod(data.period) || 'Latest available'}`
        : `U.S. average · ${formatPeriod(data.period) || 'Latest available'}`;
  const mobileValue = nationalGap
    ? nationalRange || 'No data'
    : v == null
      ? ['idle', 'loading'].includes(data.status)
        ? 'Loading…'
        : m.plannedState === 'proposed'
          ? 'Planned'
          : 'No data'
      : formatValue(v, data.unit);
  return {
    f,
    m,
    data,
    v,
    row,
    nationalGap,
    nationalRange,
    averageLabel,
    mobileValue,
  };
}
export function MobileSummary({ atlas }: { atlas: Atlas }) {
  const { m, nationalRange, averageLabel, mobileValue } = explorerValues(atlas),
    searchOpen = atlas.state.overlay?.id === 'search-sheet',
    indicatorsOpen = atlas.state.overlay?.id === 'metric-library';
  return (
    <div className="mobile-indicator-summary">
      <span className="mobile-summary-grip" aria-hidden="true" />
      <button
        type="button"
        className="mobile-summary-search"
        data-mobile-search
        aria-label="Search places and indicators"
        aria-controls="search-sheet"
        aria-expanded={searchOpen}
      >
        <Icon name="search" />
      </button>
      <span className="mobile-summary-divider" aria-hidden="true" />
      <span className="mobile-summary-copy">
        <button
          type="button"
          className="mobile-summary-name"
          data-pane-metric="a"
          aria-label={'Choose indicator: ' + displayMetricName(m)}
          aria-controls="metric-library"
          aria-expanded={indicatorsOpen}
        >
          {displayMetricName(m)}
        </button>
        <small>{averageLabel}</small>
      </span>
      <strong className={'mobile-summary-value' + (nationalRange ? ' is-range' : '')}>
        {mobileValue}
      </strong>
    </div>
  );
}
export function ExplorerPanel({ atlas }: { atlas: Atlas }) {
  useLayoutEffect(() => {
    if (
      !atlas.selectionAnimation.current ||
      !matchMedia('(max-width:760px)').matches ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    document.querySelector('#explore-panel .profile-value strong')?.animate(
      [
        { opacity: 0, transform: 'translateY(-14px) scale(.97)' },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }, [atlas.selectionAnimation.current]);
  const ready = Boolean(atlas.resources);
  return (
    <Sheet
      atlas={atlas}
      id="explore-panel"
      className="explore-panel"
      label="Explore this place"
      summary={ready ? <MobileSummary atlas={atlas} /> : null}
      footer={ready ? <IndicatorFooter atlas={atlas} /> : null}
    >
      {ready && <ExplorerContent atlas={atlas} />}
    </Sheet>
  );
}
function ExplorerContent({ atlas }: { atlas: Atlas }) {
  const { state, resources, place } = atlas,
    { f, m, data, v, row, nationalGap, nationalRange } = explorerValues(atlas);
  const explanation =
    m.definition?.method || data.definition?.method || data.methodologyNote || m.method || '';
  return (
    <>
      <div className="desktop-indicator">
        <button
          id="desktop-search"
          className="selected-indicator indicator-heading"
          data-pane-metric="a"
          aria-label={'Choose indicator: ' + displayMetricName(m)}
          aria-expanded="false"
        >
          <IndicatorIcon metric={m} />
          <b>{displayMetricName(m)}</b>
          <Icon name="down" />
        </button>
      </div>
      <div className="mobile-metric-overview profile-content">
        <button className="indicator-chooser" data-pane-metric="a" aria-expanded={state.overlay?.id === 'metric-library'} aria-controls="metric-library">
          <span className="indicator-search-icon" aria-hidden="true">
            <Icon name="search" />
          </span>
          <span className="indicator-search-divider" aria-hidden="true" />
          <span className="indicator-chooser-copy">
            <small className="indicator-label">Indicator</small>
            <small className="mobile-indicator-hint">Search indicators</small>
            <b>{displayMetricName(m)}</b>
          </span>
          <Icon name="down" />
        </button>
        <div className="profile-value">
          <strong className={nationalRange ? 'is-range' : ''}>
            {nationalGap
              ? nationalRange || 'No data'
              : v == null
                ? ['idle', 'loading'].includes(data.status)
                  ? 'Loading…'
                  : m.plannedState === 'proposed'
                    ? 'Planned'
                    : 'No data'
                : formatValue(v, data.unit)}
          </strong>
          {v != null && data.unit !== '%' && <span>{data.unit}</span>}
        </div>
        {explanation && (
          <section className="metric-explanation" aria-label="What this number means">
            <h3>What this number means</h3>
            <p>{explanation}</p>
          </section>
        )}
      </div>
      <div className="profile-heading">
        <button
          className="place-sheet-back"
          data-dismiss-place="true"
          aria-label="Dismiss place card"
        >
          <Icon name="back" />
        </button>
        <button className="place-chooser" data-pane-place="a" aria-expanded="false">
          <Icon name="location" />
          <strong>{f?.name || 'Find a place'}</strong>
          <Icon name="down" />
        </button>
        <div className="place-path" role="navigation" aria-label="Selected place">
          <button data-breadcrumb="US" aria-current={!f ? 'location' : undefined}>
            United States
          </button>
          {f && (
            <>
              <span aria-hidden="true">/</span>
              <button
                data-breadcrumb={f.stateId}
                aria-current={f.id.length === 2 ? 'location' : undefined}
              >
                {place(f.stateId)!.name}
              </button>
              {f.id.length === 5 && (
                <>
                  <span aria-hidden="true">/</span>
                  <span aria-current="location">{f.name}</span>
                </>
              )}
              {f.districtCode && (
                <>
                  <span aria-hidden="true">/</span>
                  <span aria-current="location">District {f.districtCode}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      <PlacePhoto atlas={atlas} />
      <div className="profile-content">
        <MetricSwitch metric={m} />
        {m.switchGroup === 'elections' && <PartySwitch selectedParty={state.selectedParty} onSelect={atlas.selectParty} />}
        {m.availability === 'local_candidate' && <p className="local-candidate-note">Local candidate preview · not released. Results are isolated to this local review.</p>}
        {m.availability === 'not_admitted' && <p className="local-candidate-note">{m.coverageNote || 'Candidate data is not admitted for public display.'}</p>}
        <UnemploymentPeriods atlas={atlas} metric={m} />
        <p className="value-source">
          <SourceLink atlas={atlas} metric={m} place={f} /> ·{' '}
          {formatPeriod(data.period) ||
            (m.plannedState === 'proposed' ? 'No published period' : 'Not loaded')}
        </p>
        {m.switchGroup === 'elections' && row?.qualityState === 'observed' && <ElectionDetails row={row} />}
        <div className="expanded-stats">
          {state.pinned.map((id) => (
            <MetricRow
              key={id}
              atlas={atlas}
              metric={resources!.metricById.get(id)!}
              placeId={f?.id}
              variant="expanded"
            />
          ))}
        </div>
        {v == null && (
          <>
            <p className="missing-note">
              {nationalGap
                ? nationalRange
                  ? 'No national total is published for this series. The map shows individual places; select one to see its own observation. No national average is substituted.'
                  : 'This release has no state observations for this series. No national value is substituted.'
                : row?.qualityState === 'no_election'
                  ? 'No election was held for this office in this place during the 2024 cycle.'
                  : row?.qualityState === 'nonmapping_geography'
                    ? 'This source geography has no matching map boundary. Its value is not reassigned.'
                    : missingReason(m, f, data)}
            </p>
            {data.status === 'error' && (
              <button data-retry={m.id} className="outline-button">
                Retry data
              </button>
            )}
          </>
        )}
        <div className="ranking-shortcuts">
          <button data-open-rank="highest">
            <Icon name="uptrend" /> Highest 5
          </button>
          <button data-open-rank="lowest">
            <Icon name="downtrend" /> Lowest 5
          </button>
        </div>
        <div className="profile-actions">
          <button className="primary-button" id="compare-place">
            <Icon name="compare" /> Compare
          </button>
        </div>
        <div className="explore-next">
          <h3>Explore next</h3>
          {f?.id === '06' ? (
            <button data-open-place="06075">
              <span>
                <b>San Francisco</b>
                <small>Go from state to city &amp; county</small>
              </span>
              <Icon name="arrow" />
            </button>
          ) : (
            <button data-open-prompt="1">
              <span>
                <b>California &amp; Texas</b>
                <small>One indicator. Two perspectives.</small>
              </span>
              <Icon name="arrow" />
            </button>
          )}
          <button data-open-prompt="3">
            <span>
              <b>Where does a dollar go further?</b>
              <small>Compare the cost of living</small>
            </span>
            <Icon name="arrow" />
          </button>
        </div>
      </div>
    </>
  );
}
export function QuickStats({ atlas }: { atlas: Atlas }) {
  return (
    <aside
      id="quick-stats"
      className="quick-stats"
      aria-label="Quick stats"
      hidden={!atlas.state.selected}
      inert={
        atlas.state.overlay?.id === 'inspector' &&
        atlas.state.concept === 'explorer' &&
        !matchMedia('(max-width:760px)').matches
      }
    >
      {atlas.resources && <QuickStatsContent atlas={atlas} />}
    </aside>
  );
}
