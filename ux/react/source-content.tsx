import type { Atlas } from './use-atlas';
import type { Side } from './types';
import { formatValue, formatPeriod, missingReason } from '../model.js';
export function SourceContent({ atlas, side }: { atlas: Atlas; side: Side }) {
  const { metric, metricB, selected, selectedB, layer, observation, number } = atlas;
  const m = side === 'b' ? metricB() : metric(),
    f = side === 'b' ? selectedB() : selected(),
    current = layer(m),
    pending = ['idle', 'loading'].includes(current.status),
    data = pending
      ? {
          ...current,
          period: 'Loading…',
          unit: 'Loading…',
          sourceRelease: 'Loading…',
        }
      : current,
    row = observation(m, f?.id),
    url = row?.sourceUrl || m.sourceUrl;
  const sourceName =
    data.source === 'BLS LAUS'
      ? 'BLS · Local Area Unemployment Statistics'
      : data.source || m.source;
  const month = (data.period || '').match(/^(\d{4})-M?(\d{2})$/);
  const period = month
    ? new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(Date.UTC(+month[1], +month[2] - 1, 1)))
    : formatPeriod(data.period);
  const unit = data.unit === '%' ? 'Percent (%)' : data.unit || m.unit || '—';
  const unemploymentMethod =
    (row && m.fieldId === '03.06:unemployment_rate' && m.definition?.method) || '';
  const explanation =
    unemploymentMethod ||
    row?.methodologyNote ||
    (row
      ? m.fieldId === '03.06:unemployment_rate'
        ? 'Share of the labor force that is unemployed. Original units and reporting period are retained.'
        : 'Original units and reference period are retained.'
      : missingReason(m, f, data));
  const coverage = m.fieldId
    ? m.countySupported
      ? m.stateSupported
        ? 'State and county'
        : 'County'
      : 'State'
    : m.coverageNote;
  const desktop = (
    <>
      <div className={'source-observation'}>
        <p>
          {f?.name || 'United States'}
          {' · '}
          {m.name}
        </p>
        <strong>{number(m, f?.id)}</strong>
      </div>
      <dl>
        <dt>{'Source'}</dt>
        <dd>
          {url ? (
            <>
              <a href={url} target={'_blank'} rel={'noreferrer'}>
                {data.source || m.source}
                {' ↗'}
              </a>
            </>
          ) : (
            data.source || m.source
          )}
        </dd>
        <dt>{'Period'}</dt>
        <dd>{formatPeriod(data.period) || 'No published observation'}</dd>
        <dt>{'Unit'}</dt>
        <dd>{data.unit || '—'}</dd>
        <dt>{'Release'}</dt>
        <dd>{data.sourceRelease || '—'}</dd>
        <dt>{'Coverage'}</dt>
        <dd>{coverage}</dd>
      </dl>
      <div className={'source-method'}>
        <h3>{'Method & data gaps'}</h3>
        <p>
          {unemploymentMethod ||
            row?.methodologyNote ||
            'No county/state aggregation or missing-value substitution is performed. A dash means no published observation.'}
        </p>
        {current.definition?.formula ? (
          <>
            <p>
              {'Formula: '}
              {current.definition.formula}
              {current.definition.minDenominator
                ? ` · minimum denominator ${String(current.definition.minDenominator)}`
                : ''}
              {'.'}
            </p>
          </>
        ) : (
          ''
        )}
        <p>
          {'Census 2017 boundaries. '}
          {data.excludedGeographies?.length || 0}
          {' source geographies are outside this map.'}
          {current.suppressed?.size
            ? ` ${current.suppressed.size} places are suppressed below the minimum denominator.`
            : ''}{' '}
          {data.selection ||
            'The latest single period and release are used, with no older-place fallback.'}
        </p>
        {data.status === 'ready' ? (
          <>
            <p>
              {data.scale === 'diverging'
                ? 'Colour uses a diverging 85 – 100 – 115 scale'
                : `Colour uses a ${data.scale === 'log' ? 'logarithmic' : 'linear'} scale`}
              {' across mapped places, from '}
              {formatValue(data.min, data.unit)}
              {' to '}
              {formatValue(data.max, data.unit)}
              {
                '. 3D height is linear between the same minimum and maximum. Both maps share the same scale for this indicator.'
              }
            </p>
          </>
        ) : (
          ''
        )}
      </div>
    </>
  );
  return (
    <>
      <div className={'source-desktop'}>{desktop}</div>
      <div className={'source-mobile'}>
        <h3>{m.name}</h3>
        <dl>
          <dt>{'Source'}</dt>
          <dd>{sourceName}</dd>
          <dt>{'Period'}</dt>
          <dd>{period || 'No published observation'}</dd>
          <dt>{'Unit / area'}</dt>
          <dd>
            {unit}
            {' · '}
            {f?.id.length === 5 ? 'County equivalent' : f ? 'State level' : 'US'}
          </dd>
          <dt>{'Release'}</dt>
          <dd>{data.sourceRelease || '—'}</dd>
        </dl>
        <p>{explanation}</p>
        {url ? (
          <>
            <a className={'primary-button'} href={url} target={'_blank'} rel={'noreferrer'}>
              {'Open original source'}
            </a>
          </>
        ) : (
          ''
        )}
      </div>
    </>
  );
}
