"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useRef, useState } from 'react';
import type { AnalyticsContext, Filters } from './contracts';
import { datePreset, humanize } from './contracts';
import css from './analytics.module.css';

const presets = [
  { value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'Last 7 days' }, { value: 'month30', label: 'Last 30 days' },
  { value: 'month', label: 'This month' }, { value: 'lastMonth', label: 'Last month' },
] as const;

export function AnalyticsFilters({ context, filters, onChange, statuses, compact = false }: { context: AnalyticsContext; filters: Filters; onChange: (filters: Filters) => void; statuses: string[]; compact?: boolean }) {
  const [dates, setDates] = useState({ from: filters.from, to: filters.to });
  const [error, setError] = useState('');
  const moreFilters = useRef<HTMLDetailsElement>(null);
  const update = (patch: Partial<Filters>) => onChange({ ...filters, ...patch, reservationPage: 1 });
  const selectedPreset = presets.find(preset => {
    const range = datePreset(preset.value, context.today);
    return range.from === dates.from && range.to === dates.to;
  })?.value ?? 'custom';
  const reset = () => { const next = datePreset('month30', context.today); setDates(next); setError(''); onChange({ ...filters, ...next, branchId: '', category: 'all', status: '', grouping: 'day', reservationPage: 1 }); };
  const branch = <label>Branch{context.branches.length === 1 ? <span className={css.staticBranch}>{context.branches[0].name}</span> : <select value={filters.branchId} onChange={e => update({ branchId: e.target.value })}><option value="">All authorized branches</option>{context.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}</label>;
  const preset = <label>{compact ? 'Dates' : 'Date preset'}<select value={selectedPreset} onChange={e => { if (e.target.value === 'custom') { if (moreFilters.current) moreFilters.current.open = true; return; } const next = datePreset(e.target.value, context.today); setDates(next); setError(''); update(next); }}><option value="custom">Custom dates…</option>{presets.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
  const datesAndGrouping = <><label>From<input type="date" value={dates.from} required onChange={e => setDates({ ...dates, from: e.target.value })} /></label><label>Through<input type="date" value={dates.to} required onChange={e => setDates({ ...dates, to: e.target.value })} /></label><label>Group by<select value={filters.grouping} onChange={e => update({ grouping: e.target.value })}>{['day', 'week', 'month', 'year'].map(g => <option key={g} value={g}>{humanize(g)}</option>)}</select></label>{filters.category !== 'all' && <label>Status<select value={filters.status} onChange={e => update({ status: e.target.value })}><option value="">All statuses</option>{[...new Set([...statuses, ...(filters.status ? [filters.status] : [])])].map(s => <option key={s} value={s}>{humanize(s)}</option>)}</select></label>}</>;
  return <FormLayout density="compact" className={`${css.filters} ${compact ? css.compactFilters : ''}`} onSubmit={event => {
    event.preventDefault();
    if (!dates.from || !dates.to || dates.from > dates.to || Date.parse(dates.to) - Date.parse(dates.from) >= 366 * 86400000) { setError('Choose an ordered range of up to 366 days.'); return; }
    setError(''); update(dates);
  }}>
    {compact ? <>{context.branches.length > 1 && branch}{preset}<details ref={moreFilters} className={css.moreFilters}><summary>More filters</summary><div className={css.filterExtras}>{datesAndGrouping}<button type="submit" className={css.primary}>Apply dates</button><button type="button" onClick={reset}>Reset filters</button>{error && <p role="alert" className={css.error}>{error}</p>}</div></details></> : <>{branch}<label>Module<select value={filters.category} onChange={e => update({ category: e.target.value, status: '' })}><option value="all">All permitted modules</option>{context.categories.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>{preset}{datesAndGrouping}<button type="submit" className={css.primary}>Apply dates</button><button type="button" onClick={reset}>Reset</button>{error && <p role="alert" className={css.error}>{error}</p>}</>}
  </FormLayout>;
}
