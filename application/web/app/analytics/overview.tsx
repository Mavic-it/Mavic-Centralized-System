"use client";

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, X } from 'lucide-react';
import { Modal } from '../components/ui/modal';
import { AnalyticsTable } from './panel';
import { chartNames, chartOptions, OverviewChart, statusTotals } from './overview-charts';
import { humanize, number, type AnalyticsContext, type Filters, type Panel } from './contracts';
import css from './analytics.module.css';

const groups = [
  { id: 'operations', label: 'Operations', modules: ['reservations', 'spaces', 'branches'] },
  { id: 'people', label: 'People & HR', modules: ['workforce', 'attendance', 'leave', 'official-business'] },
  { id: 'inventory', label: 'Inventory', modules: ['inventory', 'movements', 'assets'] },
  { id: 'work', label: 'Work & admin', modules: ['tasks', 'incidents', 'accounts'] },
] as const;
const headlineOrder = ['reservations', 'spaces', 'workforce', 'inventory', 'tasks', 'attendance'];

export function OverviewReport({ panels, context, filters, onChange, retry }: { panels: Panel[]; context: AnalyticsContext; filters: Filters; onChange: (next: Filters) => void; retry: () => void }) {
  const [selectedId, setSelectedId] = useState('reservations');
  const activeId = filters.category !== 'all' ? filters.category : selectedId;
  const selected = panels.find(panel => panel.id === activeId) ?? panels[0];
  const available = groups.map(group => ({ ...group, categories: context.categories.filter(category => (group.modules as readonly string[]).includes(category.id)) })).filter(group => group.categories.length);
  const headline = filters.category === 'all'
    ? [...panels].sort((a, b) => (headlineOrder.indexOf(a.id) < 0 ? 100 : headlineOrder.indexOf(a.id)) - (headlineOrder.indexOf(b.id) < 0 ? 100 : headlineOrder.indexOf(b.id))).slice(0, 3)
    : [];
  const showHeadline = headline.length > 1;
  const attention = panels.filter(panel => panel.state === 'ready' && panel.attentionLabel && panel.href && panel.id !== 'workforce')
    .map(panel => ({ panel, count: panel.rows.reduce((sum, row) => sum + row.attention, 0) }))
    .filter(item => item.count > 0);
  const select = (id: string) => {
    if (filters.category !== 'all') onChange({ ...filters, category: id, status: '', reservationPage: 1 });
    else setSelectedId(id);
  };
  if (!selected) return <p className={css.empty}>No reporting modules are available with your current permissions.</p>;
  return <>
    {showHeadline && <section className={css.overviewHighlights} aria-label="Key module figures">{headline.map(panel => <button type="button" key={panel.id} className={css.overviewHighlight} onClick={() => select(panel.id)}>
      <span>{panel.title}<ArrowUpRight size={15} aria-hidden="true" /></span><strong>{panel.state === 'ready' ? number(panel.metrics[0]?.value ?? 0) : 'Unavailable'}</strong><small>{panel.state === 'ready' ? panel.metrics[0]?.label : 'Refresh to retry'} · {panel.snapshot ? 'Current snapshot' : 'Selected period'}</small>
    </button>)}</section>}
    {attention.length > 0 && <section className={css.overviewAttention} aria-label="Needs attention"><div className={css.overviewSectionHeading}><h2>Needs attention</h2></div>
      <div className={css.priorityGrid}>{attention.slice(0, 3).map(({ panel, count }) => <Link key={panel.id} href={panel.href!}><span>{panel.attentionLabel}<small>{panel.title}</small></span><strong>{number(count)}</strong></Link>)}</div>{attention.length > 3 && <details className={css.moreAttention}><summary>Show {attention.length - 3} more</summary><div className={css.priorityGrid}>{attention.slice(3).map(({ panel, count }) => <Link key={panel.id} href={panel.href!}><span>{panel.attentionLabel}<small>{panel.title}</small></span><strong>{number(count)}</strong></Link>)}</div></details>}
    </section>}
    <section className={css.explorer} aria-label="Explore module reports">
      <div className={css.overviewSectionHeading}><h2>Explore a module</h2>{filters.category !== 'all' && <button type="button" onClick={() => onChange({ ...filters, category: 'all', status: '', reservationPage: 1 })}>Show all modules</button>}</div>
      <label className={css.modulePicker}>Choose module <select value={selected.id} onChange={event => select(event.target.value)}>{available.map(group => <optgroup key={group.id} label={group.label}>{group.categories.map(category => <option key={category.id} value={category.id}>{category.title}</option>)}</optgroup>)}</select></label>
      <OverviewModule key={`${selected.id}-${filters.branchId}-${filters.from}-${filters.to}-${filters.grouping}-${filters.category}-${filters.status}`} panel={selected} filters={filters} retry={retry} highlighted={showHeadline && headline.some(panel => panel.id === selected.id)} />
    </section>
  </>;
}

function OverviewModule({ panel, filters, retry, highlighted }: { panel: Panel; filters: Filters; retry: () => void; highlighted: boolean }) {
  const [statusChoice, setStatusChoice] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const options = chartOptions(panel);
  const selectedStatus = statusTotals(panel.rows).some(status => status.key === statusChoice) ? statusChoice : '';
  const tablePanel = selectedStatus ? { ...panel, rows: panel.rows.filter(row => row.status === selectedStatus) } : panel;
  const inlineMetrics = panel.metrics.filter(metric => panel.id === 'workforce' || metric.label !== panel.attentionLabel).slice(highlighted ? 1 : 0, highlighted ? 3 : 2);
  return <div className={css.insightPanel}>
    <div className={css.panelHeading}><div><p className={css.eyebrow}>{panel.snapshot ? 'Current snapshot' : `${filters.from} to ${filters.to}`}</p><h3>{panel.title}</h3></div>{panel.href && <Link href={panel.href}>Open module <ArrowUpRight size={15} aria-hidden="true" /></Link>}</div>
    {panel.state === 'unavailable' ? <div className={css.error} role="alert"><p>{panel.message}</p><button type="button" onClick={retry}>Retry {panel.title.toLowerCase()}</button></div> : <>
      {inlineMetrics.length > 0 && <div className={css.insightMetrics}>{inlineMetrics.map(metric => <div key={metric.label} title={metric.definition}><span>{metric.label}</span><strong>{number(metric.value)}</strong></div>)}</div>}
      {options.length > 0 ? <details open className={css.chartDisclosure}>
        <summary><span>{options.length > 1 ? 'Change chart' : 'View chart'}</span><small>{options.length} {options.length === 1 ? 'graph' : 'graphs'} available{selectedStatus ? ` · ${humanize(selectedStatus)} only` : ''}</small></summary>
        <div className={css.chartContent}>
          {selectedStatus && <button className={css.clearChartFilter} type="button" onClick={() => setStatusChoice('')}>Clear {humanize(selectedStatus)} filter</button>}
          <div className={css.chartGrid}>{options.map(option => <div key={option} className={`${css.chartCard} ${option === 'trend' || option === 'stacked' || option === 'status' ? css.chartCardWide : ''}`}>
            {(option === 'status' || option === 'stacked') && <h4>{chartNames[option]}</h4>}
            <OverviewChart panel={panel} view={option} selectedStatus={selectedStatus} onStatus={setStatusChoice} range={filters} />
          </div>)}</div>
          {selectedStatus && <p className={css.chartHint}>Status charts highlight {humanize(selectedStatus)}. Trend, branch chart and report rows use that status where available; headline figures and category breakdown show the full scope.</p>}
        </div>
      </details> : <div className={css.singleStatus}><strong>{number(panel.metrics[0]?.value ?? 0)}</strong><span>{panel.metrics[0]?.label ?? 'Records'}</span><p>There is no useful distribution to chart for this selection.</p></div>}
      <div className={css.insightActions}><button type="button" onClick={() => setDetailsOpen(true)}>View report data</button></div>
    </>}
    {detailsOpen && <Modal onClose={() => setDetailsOpen(false)} aria-label={`${panel.title} report details`} className={css.reportDrawer}>
      <div className={css.drawerHeading}><div><p className={css.eyebrow}>{panel.snapshot ? 'Current snapshot' : 'Selected period'}</p><h2>{panel.title} report data</h2></div><button type="button" className="app-modal-close" aria-label="Close report details" onClick={() => setDetailsOpen(false)}><X size={18} aria-hidden="true" /></button></div>
      <p className={css.description}>{panel.description}</p>
      {selectedStatus && <p className={css.description}>Filtered to {humanize(selectedStatus)}. Clear the chart filter to see every status.</p>}
      <div className={css.drawerMetrics}>{panel.metrics.map(metric => <div key={metric.label}><span>{metric.label}</span><strong>{number(metric.value)}</strong><small>{metric.definition}</small></div>)}</div>
      <AnalyticsTable panel={tablePanel} />
      {panel.id === 'reservations' && (panel.reservationTotal ?? 0) > 0 && <section className={css.drawerSection}><h3>Today’s reservations <span>({number(panel.reservationTotal ?? 0)})</span></h3><p className={css.description}>First {panel.reservations?.length ?? 0} starting today · Manila time</p><ul>{panel.reservations?.map(reservation => <li key={reservation.id}><strong>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(reservation.startAt))}</strong><span>{reservation.room} · {reservation.branch}</span><span>{humanize(reservation.status)}</span></li>)}</ul><Link href="/reservations/list">Open all reservations</Link></section>}
      {panel.people && panel.people.length > 0 && <section className={css.drawerSection}><h3>People at a glance</h3><ul>{panel.people.map(person => <li key={person.id}>{person.href ? <Link href={person.href}>{person.name}</Link> : <strong>{person.name}</strong>}<span>{person.position} · {person.department} · {person.branch}</span></li>)}</ul></section>}
      {panel.href && <Link href={panel.href}>Open {panel.title.toLowerCase()} module <ArrowUpRight size={15} aria-hidden="true" /></Link>}
    </Modal>}
  </div>;
}
