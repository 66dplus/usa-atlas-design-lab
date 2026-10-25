import type { Atlas } from './use-atlas';
import type { Metric, Place } from './types';
import { formatPeriod } from '../model.js';
import { IndicatorIcon } from './components';
export function SourceLink({
  atlas,
  metric,
  place,
}: {
  atlas: Atlas;
  metric: Metric;
  place?: Place;
}) {
  const data = atlas.layer(metric),
    url =
      atlas.observation(metric, place?.id)?.sourceUrl ||
      data.observations.values().next().value?.sourceUrl ||
      metric.sourceUrl;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer">
      {data.source || metric.source} ↗
    </a>
  ) : (
    <>{data.source || metric.source}</>
  );
}
export function MetricRow({
  atlas,
  metric,
  placeId,
  variant,
}: {
  atlas: Atlas;
  metric: Metric;
  placeId?: string;
  variant: 'quick' | 'expanded' | 'statistics' | 'statistics-compact';
}) {
  const data = atlas.layer(metric),
    formatted = atlas.number(metric, placeId),
    period = formatPeriod(data.period);
  if (variant === 'quick' || variant === 'expanded')
    return (
      <button className="quick-row" data-inspect-metric={metric.id}>
        <span>
          <span className="quick-label">
            <IndicatorIcon metric={metric} />
            {metric.name.replace(' · people', '')}
          </span>
          <small>
            {variant === 'expanded'
              ? `${data.unit || '—'} · ${period || 'No data'}`
              : `${period || 'No data'} · ${data.unit || '—'}`}
          </small>
        </span>
        <b title={formatted}>{atlas.compactNumber(metric, placeId)}</b>
      </button>
    );
  const label =
    variant === 'statistics-compact' ? (
      <span className="stat-label">
        <IndicatorIcon metric={metric} />
        <span className="stat-name" title={metric.name}>
          {metric.name}
        </span>
      </span>
    ) : (
      metric.name
    );
  return (
    <div className="stat-row">
      <button data-inspect-metric={metric.id}>
        {label}
        <small className="data-period">
          {period ||
            (data.status === 'error'
              ? 'Connection error · select to retry'
              : !metric.fieldId
                ? metric.hasObservations
                  ? 'Other geography'
                  : 'Not loaded'
                : 'Loading…')}
          {data.unit ? ' · ' + data.unit : ''}
        </small>
      </button>
      <strong>{formatted}</strong>
    </div>
  );
}
