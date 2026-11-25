"use client";
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { QueryClient, useQuery } from '@tanstack/react-query';
import { RefreshCw, ArrowUpRight } from 'lucide-react';
import { RealtimeQueryProvider } from '../components/realtime-query-provider';
import { PageHeader, PageHeading } from '../components/page-heading';
import { AnalyticsFilters } from './filters';
import { AnalyticsPanel } from './panel';
import { OverviewReport } from './overview';
import { AnalyticsLoading } from './loading';
import { AnalyticsError, contextSchema, dataSchema, datePreset, getAnalytics, number, queryString, type AnalyticsContext, type AnalyticsMode, type Filters } from './contracts';
import css from './analytics.module.css';

const titles = { overview: 'Operations overview', hr: 'HR dashboard' };
const hrSummaryDefinitions = [
  { category: 'workforce', metric: 'Active employees', label: 'Active employees', scope: 'Current snapshot' },
  { category: 'workforce', metric: 'Hired in period', label: 'New hires', scope: 'Selected dates' },
  { category: 'attendance', metric: 'Approved overtime hours', label: 'Approved overtime', scope: 'Selected dates' },
  { category: 'leave', metric: 'On approved leave today', label: 'Employees on leave today', scope: 'Manila today · independent of date/status filters' },
] as const;
export default function AnalyticsWorkspace({ mode }: { mode: AnalyticsMode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } } }));
  return <RealtimeQueryProvider client={client}><Suspense fallback={<AnalyticsLoading />}><WorkspaceContext mode={mode} /></Suspense></RealtimeQueryProvider>;
}
function WorkspaceContext({ mode }: { mode: AnalyticsMode }) {
  const context = useQuery({ queryKey: ['analytics-context', mode], queryFn: ({ signal }) => getAnalytics(`context?mode=${mode}`, contextSchema, signal) });
  if (context.isPending) return <AnalyticsLoading />;
  if (context.isError) return <div className={css.workspace}><PageHeading>{titles[mode]}</PageHeading><div className={css.error} role="alert"><p>{context.error.message}</p><button onClick={() => void context.refetch()}>Retry access</button></div></div>;
  return <WorkspaceData key={JSON.stringify([mode, context.data.branches, context.data.categories])} mode={mode} context={context.data} refreshContext={() => void context.refetch()} />;
}
function WorkspaceData({ mode, context, refreshContext }: { mode: AnalyticsMode; context: AnalyticsContext; refreshContext: () => void }) {
  const params = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({ branchId: params.get('branchId') ?? '', ...datePreset('month30', context.today), ...(params.get('from') ? { from: params.get('from')! } : {}), ...(params.get('to') ? { to: params.get('to')! } : {}), category: params.get('category') ?? 'all', grouping: params.get('grouping') ?? 'day', status: params.get('status') ?? '', reservationPage: 1 }));
  const query = queryString(mode, filters);
  const result = useQuery({ queryKey: ['analytics', mode, query], queryFn: ({ signal }) => getAnalytics(`data?${query}`, dataSchema, signal), enabled: context.branches.length > 0 && context.categories.length > 0 });
  const change = (next: Filters) => { setFilters(next); const url = new URL(window.location.href); url.search = queryString(mode, next); window.history.replaceState(null, '', url); };
  const refresh = () => { refreshContext(); void result.refetch(); };
  const data = result.isError ? undefined : result.data;
  const statuses = data?.panels.flatMap(p => p.rows.map(r => r.status)) ?? [];
  const attentionSources = data?.panels.filter(p => p.state === 'ready' && p.attentionLabel && p.id !== 'workforce') ?? [];
  const attentionItems = attentionSources.map(panel => ({ panel, count: panel.rows.reduce((total, row) => total + row.attention, 0) })).filter(item => item.count > 0);
  const hrHighlights = mode === 'hr' && filters.category === 'all' && data ? hrSummaryDefinitions.flatMap(definition => {
    const panel = data.panels.find(item => item.id === definition.category);
    const metric = panel?.state === 'ready' ? panel.metrics.find(item => item.label === definition.metric) : undefined;
    return panel && metric ? [{ panel, metric, label: definition.label, scope: definition.scope }] : [];
  }) : [];
  return <div className={`${css.workspace} ${mode === 'overview' ? css.compactOverview : ''}`}>
    <PageHeader className={css.header}><div><p className={css.eyebrow}>MAVIC · Live reporting</p><PageHeading>{titles[mode]}</PageHeading><p className={css.description}>Authorized records across your branches. Dates use Asia/Manila.</p></div><div className={css.actions}><button type="button" onClick={refresh} disabled={result.isFetching}><RefreshCw size={16} aria-hidden="true" />Refresh</button></div></PageHeader>
    {!context.branches.length ? <p className={css.empty}>No active branches are assigned to your account.</p> : !context.categories.length ? <p className={css.empty}>No reporting modules are available with your current permissions.</p> : <>
      <AnalyticsFilters key={`${filters.from}-${filters.to}`} context={context} filters={filters} onChange={change} statuses={statuses} compact={mode === 'overview'} />
      {mode === 'overview' && <p className={css.compactSummary}>{context.branches.find(b => b.id === filters.branchId)?.name ?? (filters.branchId ? 'Selected branch' : context.branches.length === 1 ? context.branches[0].name : 'All authorized branches')} · {filters.from} to {filters.to}{filters.status ? ` · ${filters.status}` : ''}</p>}
      <p className={css.filterSummary}>{filters.from} through {filters.to} · {context.branches.find(b => b.id === filters.branchId)?.name ?? (filters.branchId ? 'Selected branch' : 'All authorized branches')} · {context.categories.find(c => c.id === filters.category)?.title ?? 'All permitted modules'}{filters.status ? ` · ${filters.status}` : ''}. Snapshot metrics show current records.</p>
      <div role="status" aria-live="polite" className={css.updateStatus}>{result.isFetching ? 'Updating report data…' : data ? `Updated ${new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(data.generatedAt))} PHT` : ''}</div>
      {result.isError ? <div className={css.error} role="alert"><p>{result.error.message}</p><button onClick={refresh}>Retry report</button>{result.error instanceof AnalyticsError && result.error.status === 403 && <button onClick={() => change({ ...filters, branchId: '', category: 'all', status: '', reservationPage: 1 })}>Reset access filters</button>}</div> : result.isPending ? <AnalyticsLoading contentOnly /> : data && (mode === 'overview' ? <OverviewReport panels={data.panels} context={context} filters={filters} onChange={change} retry={refresh} /> : <>
        {hrHighlights.length > 0 && <section className={css.metrics} aria-label="HR key figures">{hrHighlights.map(({ panel, metric, label, scope }) => <button key={`${panel.id}-${metric.label}`} className={css.summaryCard} title={metric.definition} onClick={() => change({ ...filters, category: panel.id, status: '', reservationPage: 1 })}><span>{label}<ArrowUpRight size={14} aria-hidden="true" /></span><strong>{number(metric.value)}</strong><small>{scope}</small></button>)}</section>}
        {filters.category === 'all' && attentionSources.length > 0 && <section className={css.attention} aria-label="Needs attention"><h2>Needs attention</h2>{attentionItems.length > 0 ? <div>{attentionItems.map(({ panel, count }) => <Link key={panel.id} href={panel.href!}><span>{panel.attentionLabel}</span><strong>{number(count)}</strong></Link>)}</div> : <p className={css.description}>No outstanding items in the available reports for these filters.</p>}{attentionItems.length > 0 && <p className={css.description}>Counts follow the selected filters. Open a module to review permitted actions.</p>}</section>}
        {data.panels.map(panel => filters.category === 'all' ? <details className={css.moduleDetails} key={`${query}-${panel.id}`}><summary>{panel.title} <span>{panel.state === 'ready' ? `${number(panel.metrics[0]?.value ?? 0)} ${panel.metrics[0]?.label.toLowerCase()}` : 'Unavailable'}</span></summary><AnalyticsPanel panel={panel} multipleBranches={data.branches.length > 1} retry={refresh} /></details> : <AnalyticsPanel key={`${query}-${panel.id}`} panel={panel} multipleBranches={data.branches.length > 1} retry={refresh} />)}
      </>)}
    </>}
    <details className={css.notes}><summary>Data coverage and definitions</summary><p>Current headcount, spaces, stock, assets, accounts and branches are snapshots. Activity metrics use their documented record dates and current status. Historical headcount and capacity utilization are not inferred. Open a module panel for its definition.</p>{context.notes.map(note => <p key={note}>{note}</p>)}</details>
  </div>;
}
