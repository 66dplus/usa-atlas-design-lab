import { useState } from 'react';
import type { Atlas } from './use-atlas';
import type { Metric, UnemploymentPeriod } from './types';
import { formatValue } from '../model.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function UnemploymentPeriods({ atlas, metric }: { atlas: Atlas; metric: Metric }) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (metric.periodControl !== 'unemployment-2025') return null;
  const period = atlas.state.unemploymentPeriod,
    series = atlas.periodSeries,
    selectedMonth = period.type === 'month' ? period.month : null,
    rows = new Map(series.observations.map((row) => [row.month, row.value]));
  const activeMonth = hovered ?? selectedMonth,
    activeValue = activeMonth == null ? null : rows.get(activeMonth) ?? null,
    domainMax = series.domain?.[1] || 0;
  const choose = (value: UnemploymentPeriod) => atlas.selectUnemploymentPeriod(value);
  const monthPeriod = (month: number): UnemploymentPeriod => ({ type: 'month', year: 2025, month: month as 1|2|3|4|5|6|7|8|9|10|11|12 });
  return (
    <section className="period-control" aria-label="Unemployment period">
      <div className="period-control__heading">
        <span>Monthly chart{period.type === 'month' ? ` · ${MONTH_NAMES[period.month - 1]} 2025` : ''}</span>
        <button type="button" className="period-control__annual" aria-pressed={period.type === 'annual'} onClick={() => choose({ type: 'annual', year: 2025 })}>
          Annual average 2025
        </button>
      </div>
      <div className="period-chart-frame">
        <div className="period-chart__axis" aria-hidden="true">
          <span>{domainMax ? `${domainMax}%` : '—'}</span>
          <span>0%</span>
        </div>
        <div className="period-chart" role="group" aria-label="Monthly unemployment rate in 2025">
          {MONTHS.map((name, index) => {
            const month = index + 1, value = rows.get(month), selected = selectedMonth === month;
            return <button
              type="button"
              key={name}
              className={'period-chart__month' + (selected ? ' is-selected' : '') + (value == null ? ' is-missing' : '')}
              aria-label={`${MONTH_NAMES[index]} 2025${value == null ? ', no data' : `, ${formatValue(value, '%')}`}`}
              aria-pressed={selected}
              onFocus={() => setHovered(month)}
              onBlur={() => setHovered(null)}
              onMouseEnter={() => setHovered(month)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => choose(monthPeriod(month))}
            >
              <span className="period-chart__plot" aria-hidden="true">
                <i style={{ height: `${value == null || !domainMax ? 0 : value / domainMax * 100}%` }} />
                {(selected || hovered === month) && <b />}
              </span>
              <span className="period-chart__label">{name}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="period-chart__readout" aria-live="polite">
        {activeMonth == null ? '' : activeValue == null ? `${MONTH_NAMES[activeMonth - 1]} 2025 · No data` : `${MONTH_NAMES[activeMonth - 1]} 2025 · ${formatValue(activeValue, '%')}`}
        {series.status === 'loading' && <span className="sr-only"> Loading monthly observations.</span>}
        {series.status === 'error' && <><span className="sr-only"> Monthly data unavailable.</span> <button type="button" onClick={atlas.retryPeriodSeries}>Retry</button></>}
      </div>
      <span className="sr-only">Shared 2025 scale; missing observations have no bar.</span>
    </section>
  );
}
