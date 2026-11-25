"use client";
import { useId, useState, type KeyboardEvent } from 'react';
import { Bars, Trend, countAxis, periodLabel, totals } from './charts';
import { humanize, number, type Panel } from './contracts';
import css from './analytics.module.css';

export type OverviewChartType = 'trend' | 'stacked' | 'status' | 'breakdown' | 'branch';
const palette = ['var(--primary)', 'var(--status-success)', 'var(--status-warning)', 'var(--status-danger)', 'var(--text-secondary)', 'var(--border-strong)'];

export function statusTotals(rows: Panel['rows']) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + row.count);
  return [...counts].map(([key, value]) => ({ key, label: humanize(key), value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export function chartOptions(panel: Panel): OverviewChartType[] {
  const options: OverviewChartType[] = [];
  const statuses = statusTotals(panel.rows);
  const periods = new Set(panel.rows.map(row => row.period));
  if (!panel.snapshot && periods.size) {
    options.push('trend');
    if (statuses.length > 1 && periods.size <= 40) options.push('stacked');
  }
  if (statuses.length) options.push('status');
  if (panel.breakdown?.values.length) options.push('breakdown');
  if (new Set(panel.rows.map(row => row.branchId)).size > 1 && panel.id !== 'branches') options.push('branch');
  return options;
}

export const chartNames: Record<OverviewChartType, string> = {
  trend: 'Record trend', stacked: 'Status over time', status: 'Status mix', breakdown: 'Category breakdown', branch: 'Compare branches',
};

export function OverviewChart({ panel, view, selectedStatus, onStatus, range }: { panel: Panel; view: OverviewChartType; selectedStatus: string; onStatus: (status: string) => void; range?: { from: string; to: string; grouping: string } }) {
  const statuses = statusTotals(panel.rows);
  const visibleRows = selectedStatus ? panel.rows.filter(row => row.status === selectedStatus) : panel.rows;
  if (view === 'status') return <StatusPieChart values={statuses} selectedStatus={selectedStatus} onStatus={onStatus} />;
  if (view === 'stacked') return <StackedChart rows={panel.rows} statuses={statuses} selectedStatus={selectedStatus} onStatus={onStatus} grouping={range?.grouping} />;
  if (view === 'trend') return <Trend rows={visibleRows} {...range} />;
  if (view === 'breakdown' && panel.breakdown) return <CategoryChart title={panel.breakdown.title} values={panel.breakdown.values} />;
  if (view === 'branch') return <CategoryChart title="Records by branch" values={totals(visibleRows, 'branch')} />;
  return <p className={css.empty}>No chart data for these filters.</p>;
}

export function StatusPieChart({ values, selectedStatus, onStatus }: { values: ReturnType<typeof statusTotals>; selectedStatus?: string; onStatus?: (status: string) => void }) {
  const positive = values.filter(item => item.value > 0);
  const total = positive.reduce((sum, item) => sum + item.value, 0);
  if (!total) return <p className={css.empty}>No records match the selected filters.</p>;
  if (positive.length === 1) return <div className={css.singleStatus}><strong>{number(total)}</strong><span>{positive[0].label}</span><p>All records have this status.</p></div>;
  const segments = positive.map((item, index) => {
    const start = positive.slice(0, index).reduce((sum, previous) => sum + previous.value, 0) / total * 100;
    const end = start + item.value / total * 100;
    return `${palette[index % palette.length]} ${start}% ${end}%`;
  });
  const percent = (value: number) => new Intl.NumberFormat('en-PH', { style: 'percent', maximumFractionDigits: 1 }).format(value / total);
  return <div className={css.donutLayout}>
    <div className={css.donut} style={{ background: `conic-gradient(${segments.join(', ')})` }} role="img" aria-label={`Status distribution across ${number(total)} records. ${positive.map(item => `${item.label}: ${number(item.value)}, ${percent(item.value)}`).join('; ')}.`}><span><strong>{number(total)}</strong><small>records</small></span></div>
    <ul className={css.chartLegend}>{positive.map((item, index) => <li key={item.key}>{onStatus ? <button type="button" aria-label={`${item.label}: ${number(item.value)} records, ${percent(item.value)}. Select to filter.`} aria-pressed={selectedStatus === item.key} onClick={() => onStatus(selectedStatus === item.key ? '' : item.key)}><span className={css.legendSwatch} style={{ background: palette[index % palette.length] }} aria-hidden="true" /><span>{item.label}</span><strong>{number(item.value)}</strong><small>{percent(item.value)}</small></button> : <div className={css.chartLegendItem}><span className={css.legendSwatch} style={{ background: palette[index % palette.length] }} aria-hidden="true" /><span>{item.label}</span><strong>{number(item.value)}</strong><small>{percent(item.value)}</small></div>}</li>)}</ul>
  </div>;
}

function StackedChart({ rows, statuses, selectedStatus, onStatus, grouping }: { rows: Panel['rows']; statuses: ReturnType<typeof statusTotals>; selectedStatus: string; onStatus: (status: string) => void; grouping?: string }) {
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);
  const tableId = useId();
  const periods = [...new Set(rows.map(row => row.period))].sort();
  if (!periods.length) return <p className={css.empty}>No activity in this period.</p>;
  const map = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const status = map.get(row.period) ?? new Map<string, number>();
    status.set(row.status, (status.get(row.status) ?? 0) + row.count);
    map.set(row.period, status);
  }
  const periodTotals = periods.map(period => [...(map.get(period)?.values() ?? [])].reduce((sum, count) => sum + count, 0));
  const total = periodTotals.reduce((sum, count) => sum + count, 0);
  const max = Math.max(1, ...periodTotals);
  const axis = countAxis(max);
  const peakIndex = periodTotals.findIndex(value => value === max);
  const selectedIndex = periods.findIndex(period => period === selectedPeriod);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const activePeriod = periods[currentIndex];
  const activeTotal = periodTotals[currentIndex];
  const width = Math.max(640, Math.min(1800, periods.length * 44 + 72));
  const left = 54;
  const right = width - 18;
  const top = 18;
  const bottom = 208;
  const plotHeight = bottom - top;
  const unit = (right - left) / periods.length;
  const y = (value: number) => bottom - value / axis.maximum * plotHeight;
  const totalPercent = (value: number) => new Intl.NumberFormat('en-PH', { style: 'percent', maximumFractionDigits: 1 }).format(total ? value / total : 0);
  const dateTickIndexes = periods.length <= 6 ? periods.map((_, index) => index) : Array.from({ length: 6 }, (_, index) => Math.round(index * (periods.length - 1) / 5));
  const selectOnKey = (event: KeyboardEvent<SVGGElement>, index: number) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    setSelectedPeriod(periods[index]);
  };
  return <div className={css.stackedWrap}>
    <p className={css.chartSummary}>{number(total)} total across {number(periods.length)} periods · Peak: <strong>{periodLabel(periods[peakIndex], grouping)}</strong> ({number(max)})</p>
    <div className={css.stackedScroll} tabIndex={0} role="region" aria-label="Status counts by period chart; scroll horizontally if needed">
      <svg width={width} height={244} viewBox={`0 0 ${width} 244`} style={{ width: `${width}px`, minWidth: `${width}px` }} role="group" aria-label={`${periods.length} reporting periods, ${number(total)} records total. Peak ${number(max)} records on ${periodLabel(periods[peakIndex], grouping)}. Select a column or use the period inspector for exact values.`}>
        {axis.ticks.map(tick => <g key={tick}><line x1={left} y1={y(tick)} x2={right} y2={y(tick)} stroke="var(--border)" /><text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="10">{number(tick)}</text></g>)}
        {periods.map((period, index) => {
          const columnTotal = periodTotals[index];
          let below = 0;
          const segments = statuses.map((status, statusIndex) => {
            const count = map.get(period)?.get(status.key) ?? 0;
            const height = count / axis.maximum * plotHeight;
            const segmentTop = y(below + count);
            below += count;
            return count ? <rect key={status.key} x={left + index * unit + 4} y={segmentTop} width={Math.max(3, unit - 8)} height={height} fill={palette[statusIndex % palette.length]} opacity={selectedStatus && selectedStatus !== status.key ? 0.24 : 1}><title>{`${periodLabel(period, grouping)}: ${number(count)} ${status.label.toLowerCase()} (${totalPercent(count)} of all records)`}</title></rect> : null;
          });
          const label = `${periodLabel(period, grouping)}: ${number(columnTotal)} total. ${statuses.map(status => `${status.label} ${number(map.get(period)?.get(status.key) ?? 0)}`).join(', ')}`;
          return <g key={period} className={css.stackedColumn} role="button" tabIndex={0} aria-label={label} aria-pressed={period === activePeriod} onFocus={() => setSelectedPeriod(period)} onClick={() => setSelectedPeriod(period)} onKeyDown={event => selectOnKey(event, index)}>
            <rect x={left + index * unit} y={top} width={unit} height={plotHeight} fill="transparent" pointerEvents="all" />
            {segments}
            {period === activePeriod && <rect x={left + index * unit + 1} y={top} width={Math.max(6, unit - 2)} height={plotHeight} fill="none" stroke="var(--primary)" strokeWidth="2" pointerEvents="none" />}
            {(dateTickIndexes.includes(index)) && <text x={left + index * unit + unit / 2} y="230" textAnchor={index === 0 ? 'start' : index === periods.length - 1 ? 'end' : 'middle'} fill="var(--text-secondary)" fontSize="10" pointerEvents="none">{periodLabel(period, grouping, true)}</text>}
          </g>;
        })}
      </svg>
    </div>
    <div className={css.stackedInspector}>
      <div><span>Selected period</span><strong>{periodLabel(activePeriod, grouping)}</strong><span>{number(activeTotal)} records · {totalPercent(activeTotal)} of total</span></div>
      <ul aria-label={`Status detail for ${periodLabel(activePeriod, grouping)}`}>{statuses.map((status, index) => <li key={status.key}><span className={css.legendSwatch} style={{ background: palette[index % palette.length] }} aria-hidden="true" /><span>{status.label}</span><strong>{number(map.get(activePeriod)?.get(status.key) ?? 0)}</strong></li>)}</ul>
      {periods.length > 1 && <label>Inspect periods<input type="range" min={0} max={periods.length - 1} value={currentIndex} onChange={event => setSelectedPeriod(periods[Number(event.target.value)])} aria-valuetext={`${periodLabel(activePeriod, grouping)}: ${number(activeTotal)} records`} /></label>}
    </div>
    <ul className={css.stackedLegend}>{statuses.map((status, index) => <li key={status.key}><button type="button" aria-label={`${status.label}: ${number(status.value)} records, ${totalPercent(status.value)}. Select to filter.`} aria-pressed={selectedStatus === status.key} onClick={() => onStatus(selectedStatus === status.key ? '' : status.key)}><span className={css.legendSwatch} style={{ background: palette[index % palette.length] }} aria-hidden="true" />{status.label} <strong>{number(status.value)}</strong><small>{totalPercent(status.value)}</small></button></li>)}</ul>
    <div className={css.stackedExact}>
      <button type="button" aria-expanded={showValues} aria-controls={tableId} onClick={() => setShowValues(open => !open)}>{showValues ? 'Hide' : 'View'} exact status counts by period</button>
      <div id={tableId} className={css.trendTableWrap} hidden={!showValues} tabIndex={showValues ? 0 : -1} role="region" aria-label="Exact status counts by period">{showValues && <table><caption>Status counts by period</caption><thead><tr><th scope="col">Period</th>{statuses.map(status => <th scope="col" key={status.key}>{status.label}</th>)}<th scope="col">Total</th></tr></thead><tbody>{periods.map((period, index) => <tr key={period}><td>{periodLabel(period, grouping)}</td>{statuses.map(status => <td key={status.key}>{number(map.get(period)?.get(status.key) ?? 0)}</td>)}<td>{number(periodTotals[index])}</td></tr>)}</tbody></table>}</div>
    </div>
  </div>;
}

function CategoryChart({ title, values }: { title: string; values: { label: string; value: number }[] }) {
  if (!values.length) return <p className={css.empty}>No data for these filters.</p>;
  return <div className={css.categoryChart}><Bars title={title} values={values} /></div>;
}
