"use client";
import { useId, useRef, useState, type PointerEvent } from 'react';
import { humanize, number, type Panel } from './contracts';
import css from './analytics.module.css';

export function totals(rows: Panel['rows'], field: 'status' | 'branch' | 'period') {
  const map = new Map<string, { label: string; value: number }>();
  for (const row of rows) {
    const key = field === 'branch' ? row.branchId : row[field];
    map.set(key, { label: field === 'status' ? humanize(row[field]) : row[field], value: (map.get(key)?.value ?? 0) + row.count });
  }
  const values = [...map];
  return values.map(([key, value]) => ({ ...value, label: field === 'branch' && values.some(([other, v]) => other !== key && v.label === value.label) ? `${value.label} (${key})` : value.label }));
}
export function Bars({ title, values }: { title: string; values: { label: string; value: number }[] }) {
  const max = Math.max(1, ...values.map(v => v.value));
  const total = values.reduce((sum, value) => sum + value.value, 0);
  const leading = [...values].sort((a, b) => b.value - a.value)[0];
  const percent = (value: number) => new Intl.NumberFormat('en-PH', { style: 'percent', maximumFractionDigits: 1 }).format(total ? value / total : 0);
  return <section className={css.chart} aria-label={title}><h3>{title}</h3>{values.length === 0 ? <p className={css.empty}>No data for these filters.</p> : <>
    <p className={css.chartSummary}>{number(total)} total{leading ? <> · Highest: <strong>{leading.label}</strong> ({number(leading.value)}, {percent(leading.value)})</> : null}</p>
    <ul className={css.bars}>{values.map(v => <li key={v.label}><div><span>{v.label}</span><span className={css.barValue}><strong>{number(v.value)}</strong><small>{percent(v.value)}</small></span></div><span className={css.track} role="img" aria-label={`${v.label}: ${number(v.value)} of ${number(total)}, ${percent(v.value)}`}><span style={{ width: `${v.value / max * 100}%` }} /></span></li>)}</ul>
  </>}</section>;
}
export function trendValues(rows: Panel['rows'], from?: string, to?: string, grouping?: string) {
  const values = totals(rows, 'period').sort((a, b) => a.label.localeCompare(b.label));
  if (!values.length || !from || !to || !['day', 'week', 'month', 'year'].includes(grouping ?? '')) return values;
  const counts = new Map(values.map(value => [value.label, value.value]));
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() < start.getTime()) return values;
  if (grouping === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  if (grouping === 'month') start.setUTCDate(1);
  if (grouping === 'year') { start.setUTCMonth(0); start.setUTCDate(1); }
  const filled: typeof values = [];
  for (let date = start; date.getTime() <= end.getTime() && filled.length <= 366; date = new Date(date)) {
    const label = date.toISOString().slice(0, 10);
    filled.push({ label, value: counts.get(label) ?? 0 });
    if (grouping === 'week') date.setUTCDate(date.getUTCDate() + 7);
    else if (grouping === 'month') date.setUTCMonth(date.getUTCMonth() + 1);
    else if (grouping === 'year') date.setUTCFullYear(date.getUTCFullYear() + 1);
    else date.setUTCDate(date.getUTCDate() + 1);
  }
  return filled;
}
export function periodLabel(label: string, grouping?: string, short = false) {
  if (grouping === 'year') return label.slice(0, 4);
  const date = new Date(`${label}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return label;
  const options: Intl.DateTimeFormatOptions = grouping === 'month'
    ? { timeZone: 'UTC', month: 'short', year: short ? '2-digit' : 'numeric' }
    : { timeZone: 'UTC', month: 'short', day: 'numeric', year: short ? '2-digit' : 'numeric' };
  const formatted = new Intl.DateTimeFormat('en-PH', options).format(date);
  return grouping === 'week' && !short ? `Week of ${formatted}` : formatted;
}

export function countAxis(peak: number) {
  const rawStep = Math.max(1, Math.ceil(peak / 4));
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const maximum = Math.max(step, Math.ceil(peak / step) * step);
  return { maximum, ticks: Array.from({ length: maximum / step + 1 }, (_, index) => index * step) };
}

export function Trend({ rows, from, to, grouping }: { rows: Panel['rows']; from?: string; to?: string; grouping?: string }) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(false);
  const chartViewport = useRef<HTMLDivElement>(null);
  const tableId = useId();
  const values = trendValues(rows, from, to, grouping);
  const total = values.reduce((sum, value) => sum + value.value, 0);
  const activePeriods = values.filter(value => value.value > 0).length;
  const peak = values.reduce<(typeof values)[number] | null>((best, value) => !best || value.value > best.value ? value : best, null);
  const axis = countAxis(peak?.value ?? 0);
  const selectedIndex = values.findIndex(value => value.label === selectedLabel);
  const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const selected = values[currentIndex];
  const chartWidth = Math.max(640, Math.min(3600, 76 + values.length * 10));
  const left = 46;
  const right = chartWidth - 26;
  const top = 18;
  const bottom = 172;
  const x = (index: number) => values.length === 1 ? (left + right) / 2 : left + index / (values.length - 1) * (right - left);
  const y = (value: number) => bottom - value / axis.maximum * (bottom - top);
  const points = values.map((value, index) => `${x(index)},${y(value.value)}`).join(' ');
  const labelCount = Math.min(5, values.length);
  const dateTicks = labelCount === 1 ? [0] : Array.from({ length: labelCount }, (_, index) => Math.round(index * (values.length - 1) / (labelCount - 1)));
  const inspectPoint = (event: PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !values.length) return;
    const location = (event.clientX - bounds.left) * chartWidth / bounds.width;
    const index = values.length === 1 ? 0 : Math.round((location - left) / (right - left) * (values.length - 1));
    setSelectedLabel(values[Math.max(0, Math.min(values.length - 1, index))].label);
  };
  const inspectPeriod = (index: number) => {
    setSelectedLabel(values[index].label);
    const viewport = chartViewport.current;
    if (viewport) viewport.scrollLeft = Math.max(0, x(index) - viewport.clientWidth / 2);
  };
  return <section className={css.chart} aria-label="Record volume over time"><h3>Record volume over time</h3>{!values.length ? <p className={css.empty}>No activity in this period.</p> : <>
    <div className={css.trendSummary}>
      <span><strong>{number(total)}</strong> records across {number(values.length)} periods</span>
      <span><strong>{number(activePeriods)}</strong> with activity</span>
      <span>Peak <strong>{number(peak?.value ?? 0)}</strong> on {periodLabel(peak?.label ?? '', grouping)}</span>
    </div>
    <div className={css.trendScroll} ref={chartViewport} tabIndex={0} role="region" aria-label="Record volume chart; scroll horizontally if needed">
      <svg className={css.trend} width={chartWidth} height={218} viewBox={`0 0 ${chartWidth} 218`} role="img" aria-label={`${number(total)} records across ${number(values.length)} periods. Peak ${number(peak?.value ?? 0)} records on ${periodLabel(peak?.label ?? '', grouping)}. Use the period inspector or exact counts below for individual values.`} onPointerMove={inspectPoint}>
        {axis.ticks.map(tick => <g key={tick}><line x1={left} x2={right} y1={y(tick)} y2={y(tick)} stroke="var(--border)" /><text x={left - 9} y={y(tick) + 4} textAnchor="end" fill="var(--text-secondary)" fontSize="11">{number(tick)}</text></g>)}
        {dateTicks.map((index, tickIndex) => <g key={index}><line x1={x(index)} x2={x(index)} y1={bottom} y2={bottom + 5} stroke="var(--text-secondary)" /><text x={x(index)} y={202} textAnchor={dateTicks.length === 1 ? 'middle' : tickIndex === 0 ? 'start' : tickIndex === dateTicks.length - 1 ? 'end' : 'middle'} fill="var(--text-secondary)" fontSize="11">{periodLabel(values[index].label, grouping, true)}</text></g>)}
        <polyline points={points} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {values.length <= 40 && values.map((value, index) => <circle key={value.label} cx={x(index)} cy={y(value.value)} r="2.5" fill="var(--primary)"><title>{`${periodLabel(value.label, grouping)}: ${number(value.value)} records`}</title></circle>)}
        <line x1={x(currentIndex)} x2={x(currentIndex)} y1={top} y2={bottom} stroke="var(--primary)" strokeDasharray="4 4" opacity="0.6" />
        <circle cx={x(currentIndex)} cy={y(selected.value)} r="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="2"><title>{`${periodLabel(selected.label, grouping)}: ${number(selected.value)} records`}</title></circle>
      </svg>
    </div>
    <div className={css.trendInspector}>
      <div><span>Selected period</span><strong>{periodLabel(selected.label, grouping)}</strong><span>{number(selected.value)} records</span></div>
      {values.length > 1 && <label>Inspect periods<input type="range" min={0} max={values.length - 1} value={currentIndex} onChange={event => inspectPeriod(Number(event.target.value))} aria-valuetext={`${periodLabel(selected.label, grouping)}: ${number(selected.value)} records`} /></label>}
    </div>
    {from && to && ['week', 'month', 'year'].includes(grouping ?? '') && <p className={css.chartHint}>Periods are labeled by start date. Boundary periods may contain only part of the selected date range.</p>}
    <div className={css.trendExact}>
      <button type="button" aria-expanded={showValues} aria-controls={tableId} onClick={() => setShowValues(open => !open)}>{showValues ? 'Hide' : 'View'} exact counts by period</button>
      <div id={tableId} className={css.trendTableWrap} hidden={!showValues} tabIndex={showValues ? 0 : -1} role="region" aria-label="Exact record totals by period">{showValues && <table><caption>Record totals by period</caption><thead><tr><th scope="col">Period start</th><th scope="col">Records</th></tr></thead><tbody>{values.map(value => <tr key={value.label}><td>{periodLabel(value.label, grouping)}</td><td>{number(value.value)}</td></tr>)}</tbody></table>}</div>
    </div>
  </>}</section>;
}
