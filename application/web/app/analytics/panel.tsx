"use client";
import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { Bars, Trend, totals } from './charts';
import { StatusPieChart, statusTotals } from './overview-charts';
import { humanize, number, type Panel } from './contracts';
import css from './analytics.module.css';

export function AnalyticsTable({ panel }: { panel: Panel }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(panel.rows.length / 10));
  const current = Math.min(page, pages);
  const rows = panel.rows.slice((current - 1) * 10, current * 10);
  if (!rows.length) return <p className={css.empty}>No records match the selected filters.</p>;
  return <><div className={css.tableWrap} tabIndex={0} role="region" aria-label={`${panel.title} report table`}><table><caption className={css.srOnly}>{panel.title} aggregate results</caption><thead><tr><th scope="col">Period</th><th scope="col">Branch</th><th scope="col">Status</th><th scope="col">Records</th>{panel.amountLabel && <th scope="col">{panel.amountLabel}</th>}{panel.attentionLabel && <th scope="col">{panel.attentionLabel}</th>}</tr></thead><tbody>{rows.map((r, i) => <tr key={`${r.period}-${r.branchId}-${r.status}-${i}`}><td>{r.period}</td><td>{r.branch}</td><td>{humanize(r.status)}</td><td>{number(r.count)}</td>{panel.amountLabel && <td>{number(r.amount)}</td>}{panel.attentionLabel && <td>{number(r.attention)}</td>}</tr>)}</tbody></table></div><nav className={css.pagination} aria-label={`${panel.title} report pagination`}><span>Page {current} of {pages} · {number(panel.rows.length)} aggregate rows</span><div><button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></div></nav></>;
}
export function AnalyticsPanel({ panel, multipleBranches, retry }: { panel: Panel; multipleBranches: boolean; retry: () => void }) {
  const branchValues = totals(panel.rows, 'branch');
  return <section className={css.panel} aria-labelledby={`panel-${panel.id}`}>
    <div className={css.panelHeading}><div><p className={css.eyebrow}>{panel.snapshot ? 'Current snapshot' : 'Selected period'}</p><h2 id={`panel-${panel.id}`}>{panel.title}</h2></div>{panel.href && <Link href={panel.href}>Open module <ArrowUpRight size={15} aria-hidden="true" /></Link>}</div>
    <p className={css.description}>{panel.description}</p>
    {panel.state === 'unavailable' ? <div className={css.error} role="alert"><p>{panel.message}</p><button onClick={retry} type="button">Retry {panel.title.toLowerCase()}</button></div> : <>
      <div className={css.metrics}>{panel.metrics.map(metric => <article key={metric.label} title={metric.definition}><p>{metric.label}</p><strong>{number(metric.value)}</strong></article>)}</div>
      <div className={css.charts}>
        <section className={css.chart} aria-label="Status mix"><h3>Status mix</h3><StatusPieChart values={statusTotals(panel.rows)} /></section>
        {!panel.snapshot && <Trend rows={panel.rows} />}
        {panel.breakdown ? <Bars title={panel.breakdown.title} values={panel.breakdown.values} /> : multipleBranches && branchValues.length > 1 ? <Bars title="Records by branch" values={branchValues} /> : null}
      </div>
      <details><summary>View report data</summary><AnalyticsTable panel={panel} /></details>
      {panel.people && <details className={css.people}><summary>People at a glance ({number(panel.people.length)})</summary>{panel.people.length === 0 ? <p className={css.empty}>No employees in this scope.</p> : <div>{panel.people.map(p => <article key={p.id}><span className={css.avatar} aria-hidden="true">{p.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div>{p.href ? <Link href={p.href}>{p.name}</Link> : <strong>{p.name}</strong>}<p>{p.position} · {p.department}</p><p>{p.branch}</p></div></article>)}</div>}</details>}
    </>}
  </section>;
}
export function TodayReservations({ panel, page, onPage }: { panel: Panel; page: number; onPage: (page: number) => void }) {
  const total = panel.reservationTotal ?? 0;
  const pages = Math.max(1, Math.ceil(total / 10));
  const current = panel.reservationPage ?? Math.min(page, pages);
  return <section className={css.panel}><div className={css.panelHeading}><h2>Today’s reservations</h2><span>{number(total)} reservations · Manila time</span></div>
    {!panel.reservations?.length ? <p className={css.empty}>No reservations on this page.</p> : <div className={css.tableWrap} tabIndex={0} role="region" aria-label="Today's reservations"><table><thead><tr>{['Time', 'Customer', 'Space', 'Branch', 'Status', 'Action'].map(x => <th scope="col" key={x}>{x}</th>)}</tr></thead><tbody>{panel.reservations.map(r => <tr key={r.id}><td>{new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' }).format(new Date(r.startAt))}</td><td>{r.customer || 'Not recorded'}</td><td>{r.room}</td><td>{r.branch}</td><td>{humanize(r.status)}</td><td><Link href="/reservations/list">Open reservations</Link></td></tr>)}</tbody></table></div>}
    <nav className={css.pagination} aria-label="Today's reservation pages"><span>Page {current} of {pages}</span><div><button disabled={current <= 1} onClick={() => onPage(current - 1)}>Previous</button><button disabled={current >= pages} onClick={() => onPage(current + 1)}>Next</button></div></nav>
  </section>;
}
