import { SourceLink, MetricRow } from './metrics';
import { Fragment } from 'react';
import type { Atlas } from './use-atlas';
import { mobileLayout } from './use-atlas';
import { displayMetricName, type Metric, type Place } from './types';
import { formatValue, formatPeriod, missingReason, comparable } from '../model.js';
import { MetricSwitch, icon, indicatorIcon } from './components';
function viewValues(atlas: Atlas) {
  const { resources } = atlas;
  const sourceLink = (metric: Metric, place: Place | undefined) => (
    <SourceLink atlas={atlas} metric={metric} place={place} />
  );
  return {
    ...atlas,
    geo: resources!.geo,
    catalog: resources!.catalog,
    metricById: resources!.metricById,
    pinned: atlas.state.pinned,
    comparisonDraft: atlas.state.comparisonDraft,
    rankFocus: atlas.state.rankFocus,
    sourceLink,
    metricSwitchMarkup: (m: Metric) => <MetricSwitch metric={m} />,
  };
}
export function MetricItems({ atlas }: { atlas: Atlas }) {
  const { state, catalog, pinned, layer } = viewValues(atlas);
  const query = state.metricQuery.trim().toLowerCase();
  const preferred = [state.cardMode ? '' : state.metric, ...pinned];
  const priority = (id: string) => {
    const index = preferred.indexOf(id);
    return index < 0 ? preferred.length : index;
  };
  const list = catalog
    .filter(
      (m) =>
        (state.category === 'All' || m.shortCategory === state.category) &&
        `${displayMetricName(m)} ${m.name} ${m.shortCategory} ${m.source}`.toLowerCase().includes(query),
    )
    .sort(
      (a, b) =>
        priority(a.id) - priority(b.id) ||
        Number(Boolean(b.fieldId)) - Number(Boolean(a.fieldId)) ||
        a.name.localeCompare(b.name),
    );
  return list.length ? (
    list.map((m) => (
      <button
        key={m.id}
        className="metric-item"
        data-metric={m.id}
        aria-pressed={
          state.cardMode
            ? pinned.includes(m.id)
            : m.id === (state.metricTarget === 'b' ? state.secondMetric : state.metric)
        }
      >
        {indicatorIcon(m)}
        <span className="metric-copy">
          <strong>{displayMetricName(m).replace(' · people', '')}</strong>
          <small>
            {layer(m).unit === '%' ? 'Percent' : layer(m).unit || m.shortCategory}
            {' · '}
            {layer(m).source || m.source}
          </small>
        </span>
        <span className="metric-availability">
          {m.plannedState === 'proposed'
            ? 'Planned'
            : state.cardMode
              ? 'Add to card'
              : !m.fieldId
                ? m.hasObservations
                  ? 'Other geography'
                  : 'Not loaded'
                : m.countySupported
                  ? m.stateSupported
                    ? 'State / county data'
                    : 'County data'
                  : 'State data'}
        </span>
        {!state.cardMode &&
        m.id === (state.metricTarget === 'b' ? state.secondMetric : state.metric) ? (
          <i className="selected-check" aria-hidden="true">
            {'✓'}
          </i>
        ) : (
          ''
        )}
      </button>
    ))
  ) : (
    <p className="library-note">
      {'No indicators match. Try a shorter word or choose another category.'}
    </p>
  );
}
export function InspectorContent({ atlas }: { atlas: Atlas }) {
  const {
    state,
    metricById,
    pinned,
    selected,
    selectedB,
    metric,
    metricB,
    place,
    layer,
    observation,
    metricSwitchMarkup,
  } = viewValues(atlas);
  const right = state.inspectorSide === 'b' && state.concept === 'compare',
    f = right ? selectedB() : selected(),
    m = right ? metricB() : metric(),
    data = layer(m),
    row = observation(m, f?.id),
    v = row?.value,
    isCounty = f?.id.length === 5;
  const loading = ['idle', 'loading'].includes(data.status),
    rows = pinned.map((id) => metricById.get(id)!);
  const compact = state.concept === 'explorer' && !mobileLayout();
  if (compact) {
    return (
      <section className="data-card">
        <button
          data-close="inspector"
          aria-label="Close statistics"
          className="data-card-close icon-button"
        >
          {icon('close')}
        </button>
        <div className="stats-title">
          <h3>{'Your data card'}</h3>
          <button id="edit-card">{'Choose fields'}</button>
        </div>
        {metricSwitchMarkup(m)}
        {rows.map((item) => (
          <MetricRow
            key={item.id}
            atlas={atlas}
            metric={item}
            placeId={f?.id}
            variant="statistics-compact"
          />
        ))}
        <p className="explanation">
          {'Each field keeps its own unit and period. A dash means no observation.'}
        </p>
        <button className="source-button" data-source="a">
          {'Source, coverage & method '}
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="m7 5 5 5-5 5" />
          </svg>
        </button>
      </section>
    );
  }
  const stat =
    v == null ? (
      <>
        <h3 className="empty-stat">
          {loading
            ? 'Loading data…'
            : data.status === 'error'
              ? 'Data unavailable'
              : m.plannedState === 'proposed'
                ? 'Planned indicator'
                : 'No data here'}
        </h3>
        <p className="no-data-detail">{missingReason(m, f, data)}</p>
        {data.status === 'error' ? (
          <button className="outline-button" data-retry={m.id}>
            {'Retry data'}
          </button>
        ) : (
          ''
        )}
      </>
    ) : (
      <>
        <div className="value-line">
          <strong title={String(v)}>{formatValue(v, data.unit)}</strong>
          <span>{data.unit === '%' ? '' : data.unit}</span>
        </div>
        <span className="demo-tag">
          {formatPeriod(data.period)}
          {' · '}
          {data.source}
        </span>
        <p className="explanation">{'Published observation from the loaded source snapshot.'}</p>
      </>
    );
  return (
    <>
      <div className="drawer-top">
        <div>
          <p className="panel-context">
            {state.concept === 'compare' ? (right ? 'Comparison map' : 'Primary map') + ' · ' : ''}
            {'Place statistics'}
          </p>
          <h2>{f?.name || 'United States'}</h2>
        </div>
        <button data-close="inspector" aria-label="Close statistics" className="icon-button">
          {'×'}
        </button>
      </div>
      <p className="place-type">
        {f
          ? isCounty
            ? place(f.stateId)!.name + ' · County equivalent'
            : 'State profile'
          : '50 states + Washington, DC'}
        {f ? ' · ' + f.id : ''}
      </p>
      {'\n    '}
      <p className="metric-caption">{displayMetricName(m)}</p>
      {metricSwitchMarkup(m)}
      {stat}
      {'\n    '}
      <div className="local-position">
        <span>{'Observation period'}</span>
        <strong>{formatPeriod(data.period) || '—'}</strong>
      </div>
      {'\n    '}
      <div className="inspector-actions">
        <button className="primary-button" id="inspect-next">
          {!f ? 'Choose a state' : isCounty ? 'Browse nearby counties' : 'Explore counties'}{' '}
          {icon('arrow')}
        </button>
        {state.concept !== 'compare' ? (
          <button className="outline-button" id="inspector-compare-place">
            {'Compare '}
            {f ? 'this place' : 'two places'} {icon('arrow')}
          </button>
        ) : (
          ''
        )}
      </div>
      {'\n    '}
      <div className="stats-title">
        <h3>{'Your data card'}</h3>
        <button id="edit-card">{'Choose fields'}</button>
      </div>
      {'\n    '}
      {rows.map((item) => (
        <MetricRow key={item.id} atlas={atlas} metric={item} placeId={f?.id} variant="statistics" />
      ))}
      {'\n    '}
      <p className="explanation">
        {'Each field keeps its own unit and period. A dash means no observation.'}
      </p>
      {'\n    '}
      <button className="source-button" data-source={right ? 'b' : 'a'}>
        {'Source, coverage & method '}
        {icon('info')}
      </button>
      {'\n    '}
      {!f ? (
        <div className="note-box">
          <b>{'Start with a place.'}</b>
          <p>
            {'Click a state on the map, or use search. Your selection stays with you in 2D and 3D.'}
          </p>
        </div>
      ) : (
        ''
      )}
    </>
  );
}
export function QuickStatsContent({ atlas }: { atlas: Atlas }) {
  const { metricById, pinned, selected, metric, layer, number, sourceLink, metricSwitchMarkup } =
    viewValues(atlas);
  const f = selected(),
    m = metric(),
    data = layer(m);
  // First open: no side fields. The column appears with the first selected place.
  if (!f) return null;
  const rows = pinned.map((id) => metricById.get(id)!);
  return (
    <section className="quick-card">
      <div className="quick-title">
        <h2>{'Quick stats'}</h2>
        <button data-source="a" aria-label="Open source, coverage and method">
          {icon('info')}
        </button>
      </div>
      <p className="quick-place">
        {f?.name || 'United States'}
        {f?.id.length === 5 ? ' · County' : ''}
      </p>
      {metricSwitchMarkup(m)}
      <div className="quick-main">
        <span>
          {indicatorIcon(m)}
          {displayMetricName(m)}
        </span>
        <b>{m.plannedState === 'proposed' ? 'Planned' : number(m, f?.id)}</b>
        <small>
          {m.plannedState === 'proposed'
            ? 'No published observation · '
            : (data.unit || '—') + ' · ' + (formatPeriod(data.period) || 'No data') + ' · '}
          {sourceLink(m, f)}
        </small>
      </div>
      {rows.map((item) => (
        <MetricRow key={item.id} atlas={atlas} metric={item} placeId={f?.id} variant="quick" />
      ))}
    </section>
  );
}
export function ComparisonDraftContent({ atlas }: { atlas: Atlas }) {
  const { geo, comparisonDraft, metric, place, layer, number, sourceLink } = viewValues(atlas);
  if (!comparisonDraft) return null;
  const { first, second, choosing } = comparisonDraft,
    a = place(first)!,
    b = place(second)!,
    m = metric(),
    data = layer(m);
  const query = comparisonDraft.query || '',
    county = first.length === 5;
  const options = (county ? geo.counties : geo.states)
    .filter(
      (f) =>
        f.id !== first &&
        `${f.name} ${f.id} ${place(f.stateId)?.name || ''}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <button className="comparison-back" data-comparison-cancel="">
        {' '}
        {icon('back')}
        {' Compare'}
      </button>
      <h2>
        {'Compare '}
        {county ? 'places' : 'states'}
      </h2>
      <p className="comparison-caption">
        {displayMetricName(m)}
        {' · '}
        {formatPeriod(data.period) || 'No observation'}
      </p>
      <div className="comparison-first">
        {a.name}
        {' · '}
        {number(m, first)} {icon('check')}
      </div>
      {choosing ? (
        <>
          <label className="search-field">
            {icon('search')}
            <input
              id="comparison-place-search"
              onChange={(event) => {
                if (comparisonDraft)
                  atlas.patch({
                    comparisonDraft: {
                      ...comparisonDraft,
                      query: event.currentTarget.value,
                    },
                  });
              }}
              type="search"
              aria-label="Search second place"
              placeholder={'Search ' + (county ? 'counties' : 'states')}
              value={query}
            />
          </label>
          <div className="comparison-place-list">
            {options.slice(0, 100).map((f) => (
              <button key={f.id} data-comparison-place={f.id}>
                <span>
                  {f.name}
                  <small>
                    {county ? place(f.stateId)!.name + ' · County' : 'State · United States'}
                  </small>
                </span>
                <b>{number(m, f.id)}</b>
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="comparison-label">
            {'SECOND '}
            {county ? 'PLACE' : 'STATE'}
            {' · SELECTED'}
          </p>
          <div className="comparison-selected">
            {icon('map')}
            <span>
              {b.name}
              <small>
                {b.id.length === 5 ? 'County' : 'State'}
                {' · United States'}
              </small>
            </span>
            <b>{number(m, second)}</b>
          </div>
          <button className="comparison-change" data-comparison-change="">
            {'Choose a different '}
            {county ? 'place' : 'state'} {icon('arrow')}
          </button>
          <p className="comparison-description">
            {'Compare '}
            {a.name}
            {' at '}
            {number(m, first)}
            {' with '}
            {b.name}
            {' at '}
            {number(m, second)}
            {'.'}
          </p>
        </>
      )}
      <p className="comparison-source">
        {sourceLink(m, a)}
        {' · '}
        {formatPeriod(data.period) || 'No observation'}{' '}
        <button data-source="a">
          {' · Source '}
          {icon('info')}
        </button>
      </p>
      <button className="comparison-confirm" data-comparison-confirm="">
        {'Compare '}
        {a.name}
        {' + '}
        {b.name} {icon('arrow')}
      </button>
    </>
  );
}
export function CompareContent({ atlas }: { atlas: Atlas }) {
  const { state, selected, selectedB, metric, metricB, resources, layer, value } = atlas,
    isMetrics = state.comparison === 'metrics',
    a = selected(),
    b = selectedB();
  const rows = isMetrics
    ? [metric(), metricB()]
    : [
        metric(),
        ...state.pinned
          .filter((id) => id !== state.metric)
          .slice(0, 2)
          .map((id) => resources!.metricById.get(id)!),
      ];
  return (
    <>
      <div className="drawer-top">
        <h2>
          {isMetrics
            ? 'Two lenses on ' + (a?.name || 'United States')
            : 'The same questions, side by side'}
        </h2>
        <button
          data-close="compare-results"
          aria-label="Close comparison data"
          className="icon-button"
        >
          ×
        </button>
      </div>
      <p className="library-note">
        {isMetrics
          ? 'Each indicator has its own unit, period and colour/height range.'
          : 'Both maps use the same indicator snapshot and colour/height range.'}
      </p>
      <div className="comparison-data">
        <table>
          <thead>
            <tr>
              <th>Indicator · period</th>
              <th>{a?.name || 'US'}</th>
              {!isMetrics ? (
                <>
                  <th>{b?.name || 'US'}</th>
                  <th>Difference</th>
                </>
              ) : (
                <th>Unit</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const data = layer(m),
                va = value(m, a?.id),
                vb = value(m, b?.id),
                canCompare = comparable(data, data, a, b) && va != null && vb != null;
              return (
                <Fragment key={m.id}>
                  <tr key={m.id}>
                    <th>
                      {displayMetricName(m)}
                      <small className="data-period">
                        {formatPeriod(data.period) || 'No observation'}
                      </small>
                    </th>
                    <td>{formatValue(va, data.unit)}</td>
                    {!isMetrics ? (
                      <>
                        <td>{formatValue(vb, data.unit)}</td>
                        <td>
                          {canCompare
                            ? formatValue(va! - vb!, data.unit === '%' ? '' : data.unit) +
                              ' ' +
                              (data.unit === '%' ? 'percentage points' : data.unit)
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <td>{data.unit || '—'}</td>
                    )}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="comparison-note">
        Original source values. Differences require the same series, period, release, unit and
        geographic level. A dash means no comparable observation.
      </p>
    </>
  );
}
export function RankList({ atlas }: { atlas: Atlas }) {
  const { state, metric, rankData } = viewValues(atlas);
  const r = rankData(),
    range = r.max - r.min;
  const mapNote =
    r.rows[0]?.id?.length === 2 && metric().stateSupported && metric().countySupported
      ? 'This list ranks state observations; the map colors county observations.'
      : '';
  return (
    <>
      <div className="rank-tabs">
        <span className="segment-pill" aria-hidden="true"></span>
        <button data-rank="highest" aria-pressed={state.rank === 'highest'}>
          {'Highest 5'}
        </button>
        <button data-rank="lowest" aria-pressed={state.rank === 'lowest'}>
          {'Lowest 5'}
        </button>
      </div>
      <p className="rank-context">
        {r.group}
        {' · '}
        {r.count}
        {'/'}
        {r.total}
        {' with data'}
      </p>
      {mapNote ? <p className="rank-map-note">{mapNote}</p> : ''}
      {r.rows.length ? (
        <ol className="rank-list">
          {r.rows.map((row) => (
            <li key={row.id}>
              <button data-rank-place={row.id}>
                <span className="rank-number">{row.rank}</span>
                <span className="rank-name">
                  {row.label}
                  <span
                    className="rank-bar"
                    style={{
                      width: (range ? 12 + (88 * (row.value - r.min)) / range : 100) + '%',
                    }}
                  ></span>
                </span>
                <b>{formatValue(row.value, r.data.unit)}</b>
              </button>
              <button
                className="rank-compare"
                data-rank-compare={row.id}
                aria-label={'Compare ' + row.label}
                title="Add to comparison"
              >
                {icon('plus')}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-note">
          {['loading', 'idle'].includes(r.data.status)
            ? 'Loading this indicator…'
            : 'No comparable observations in this group.'}
        </p>
      )}
      <p className="rank-foot">
        {formatPeriod(r.data.period) || 'No loaded period'}
        {' · '}
        {r.data.unit || '—'}
        {' · Shared range '}
        {formatValue(r.min, r.data.unit)}
        {'–'}
        {formatValue(r.max, r.data.unit)}
        {r.cutoffTie ? ' · More places share the cutoff value.' : ''}
        {r.rows.some((x) => x.tied) ? ' · Equal values share a rank.' : ''}
      </p>
    </>
  );
}
export function PlacePhoto({ atlas }: { atlas: Atlas }) {
  const { state, selected } = viewValues(atlas);
  const f = selected();
  if (!f?.id.startsWith('06')) return '';
  const sf = f.id === '06075';
  return (
    <figure className={'place-photo ' + (state.photoExpanded ? 'expanded' : '')}>
      <button
        {...(sf ? { 'data-photo': 'expand' } : { 'data-open-place': '06075' })}
        aria-label={sf ? 'Expand San Francisco photo' : 'Explore San Francisco'}
        aria-expanded={sf ? Boolean(state.photoExpanded) : undefined}
      >
        <img
          src="assets/san-francisco-photo.jpg"
          alt="Golden Gate Bridge with the San Francisco skyline at blue hour"
        />
        <span className="photo-action">
          {sf ? 'San Francisco' : 'Discover San Francisco'} {icon(sf ? 'expand' : 'arrow')}
        </span>
      </button>
      <figcaption>
        <a
          href="https://commons.wikimedia.org/wiki/File:Golden_Gate_Bridge_and_San_Francisco_skyline_from_Hawk_Hill_at_Blue_Hour_dllu_(cropped).jpg"
          target="_blank"
          rel="noreferrer"
          title="Daniel L. Lu · cropped by King of Hearts · CC BY-SA 4.0"
        >
          {'San Francisco, CA · © Daniel L. Lu'}
        </a>
      </figcaption>
    </figure>
  );
}
