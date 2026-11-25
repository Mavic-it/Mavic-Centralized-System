import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OverviewReport } from './overview';
import { AnalyticsFilters } from './filters';
import { chartOptions, OverviewChart, statusTotals } from './overview-charts';
import { Trend, trendValues } from './charts';
import type { AnalyticsContext, Filters, Panel } from './contracts';

const rows: Panel['rows'] = [
  { period: '2026-11-01', branchId: 'a', branch: 'A', status: 'PENDING', count: 3, amount: 0, attention: 3 },
  { period: '2026-11-01', branchId: 'a', branch: 'A', status: 'CONFIRMED', count: 2, amount: 0, attention: 0 },
  { period: '2026-11-02', branchId: 'b', branch: 'B', status: 'CONFIRMED', count: 4, amount: 0, attention: 0 },
];
const reservations: Panel = { id: 'reservations', title: 'Reservations', description: 'Booked spaces', snapshot: false, href: '/reservations/list', state: 'ready', metrics: [{ label: 'Reservations', value: 9, definition: 'Selected period' }], attentionLabel: 'Pending reservations', rows };
const spaces: Panel = { id: 'spaces', title: 'Space availability', description: 'Current spaces', snapshot: true, href: '/reservations/spaces', state: 'ready', metrics: [{ label: 'Active spaces', value: 9, definition: 'Current' }], rows: rows.map(row => ({ ...row, period: 'Current' })) };
const filters: Filters = { branchId: '', from: '2026-11-01', to: '2026-11-30', category: 'all', grouping: 'day', status: '', reservationPage: 1 };
const context: AnalyticsContext = { branches: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], categories: [{ id: 'reservations', title: 'Reservations' }, { id: 'spaces', title: 'Space availability' }], timeZone: 'Asia/Manila', today: '2026-11-23', notes: [] };

describe('compact overview', () => {
  it('uses only the live authorized panels and keeps detail rows out of the initial page', () => {
    const html = renderToStaticMarkup(<OverviewReport panels={[reservations, spaces]} context={context} filters={filters} onChange={() => {}} retry={() => {}} />);
    expect(html).toContain('Explore a module');
    expect(html).toContain('Choose module');
    expect(html).toContain('<optgroup');
    expect(html).toContain('Pending reservations');
    expect(html).toContain('View report data');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('Today’s reservations');
    expect(html).not.toContain('Sample data');
    expect(html).not.toContain('Workforce');
  });

  it('keeps common overview filters visible and advanced controls behind one disclosure', () => {
    const html = renderToStaticMarkup(<AnalyticsFilters compact context={context} filters={filters} statuses={[]} onChange={() => {}} />);
    expect(html).toContain('Branch');
    expect(html).toContain('Dates');
    expect(html).toContain('<summary>More filters</summary>');
    expect(html).toContain('Custom dates');
    expect(html).not.toContain('All permitted modules');
  });

  it('shows every compatible graph without requiring an initial click', () => {
    const html = renderToStaticMarkup(<OverviewReport panels={[reservations, spaces]} context={context} filters={filters} onChange={() => {}} retry={() => {}} />);
    const chartDisclosure = html.match(/<details[^>]*><summary><span>Change chart<\/span>[\s\S]*?<\/details>/)?.[0];
    expect(chartDisclosure).toBeDefined();
    expect(chartDisclosure).toMatch(/^<details[^>]*\sopen(?:=""|(?=\s|>))/);
    expect(chartDisclosure).toContain('4 graphs available');
    expect(chartDisclosure).toContain('Record volume over time');
    expect(chartDisclosure).toContain('Status counts by period chart');
    expect(chartDisclosure).toContain('conic-gradient');
    expect(chartDisclosure).toContain('Records by branch');
    expect(chartDisclosure).toContain('<svg');
  });

  it('shows a single compatible graph in View chart when only one fits', () => {
    const oneStatus = { ...spaces, rows: [spaces.rows[0]] };
    const html = renderToStaticMarkup(<OverviewReport panels={[oneStatus]} context={context} filters={{ ...filters, category: 'spaces' }} onChange={() => {}} retry={() => {}} />);
    const chartDisclosure = html.match(/<details[^>]*><summary><span>View chart<\/span>[\s\S]*?<\/details>/)?.[0];
    expect(chartDisclosure).toBeDefined();
    expect(chartDisclosure).toMatch(/^<details[^>]*\sopen(?:=""|(?=\s|>))/);
    expect(chartDisclosure).toContain('1 graph available');
    expect(chartDisclosure).toContain('All records have this status');
    expect(chartDisclosure).not.toContain('Record volume over time');
  });

  it('includes a category graph when the module supplies category data', () => {
    const withBreakdown: Panel = { ...reservations, breakdown: { title: 'Requests by source', values: [{ label: 'Web', value: 9 }] } };
    const html = renderToStaticMarkup(<OverviewReport panels={[withBreakdown]} context={context} filters={{ ...filters, category: 'reservations' }} onChange={() => {}} retry={() => {}} />);
    const chartDisclosure = html.match(/<details[^>]*><summary><span>Change chart<\/span>[\s\S]*?<\/details>/)?.[0];
    expect(chartDisclosure).toBeDefined();
    expect(chartDisclosure).toContain('5 graphs available');
    expect(chartDisclosure).toContain('Requests by source');
    expect(chartDisclosure).toContain('Web');
  });

  it('chooses charts that match the available module data', () => {
    expect(chartOptions(reservations)).toEqual(['trend', 'stacked', 'status', 'branch']);
    expect(statusTotals(rows)).toEqual([{ key: 'CONFIRMED', label: 'Confirmed', value: 6 }, { key: 'PENDING', label: 'Pending', value: 3 }]);
    const html = renderToStaticMarkup(<OverviewChart panel={spaces} view="status" selectedStatus="" onStatus={() => {}} />);
    expect(html).toContain('conic-gradient');
    expect(html).toContain('Confirmed');
    expect(html).toContain('Pending');
  });

  it('does not draw a misleading pie chart for one status or a trend for a snapshot', () => {
    const single = { ...spaces, rows: [spaces.rows[0]] };
    expect(chartOptions(single)).toEqual(['status']);
    const html = renderToStaticMarkup(<OverviewChart panel={single} view="status" selectedStatus="" onStatus={() => {}} />);
    expect(html).toContain('All records have this status');
    expect(html).not.toContain('conic-gradient');
  });

  it('keeps zero-activity dates in a live trend instead of connecting unrelated records', () => {
    expect(trendValues([rows[0], { ...rows[2], period: '2026-11-03' }], '2026-11-01', '2026-11-03', 'day'))
      .toEqual([{ label: '2026-11-01', value: 3 }, { label: '2026-11-02', value: 0 }, { label: '2026-11-03', value: 4 }]);
  });

  it('shows a scaled trend, live totals, and an exact-value inspector including zero-activity dates', () => {
    const html = renderToStaticMarkup(<Trend rows={[rows[0], { ...rows[2], period: '2026-11-03' }]} from="2026-11-01" to="2026-11-03" grouping="day" />);
    expect(html).toContain('7</strong> records across 3 periods');
    expect(html).toContain('2</strong> with activity');
    expect(html).toContain('Peak <strong>4</strong> on Nov 3, 2026');
    expect(html).toContain('aria-valuetext="Nov 1, 2026: 3 records"');
    expect(html).toContain('Nov 2, 2026: 0 records');
    expect(html).toContain('View exact counts by period');
    expect(html).not.toContain('<table');
    expect(html).toMatch(/>0<\/text>/);
    expect(html).toMatch(/>4<\/text>/);
  });

  it('identifies partial boundary periods in grouped trends', () => {
    const html = renderToStaticMarkup(<Trend rows={[{ ...rows[0], period: '2026-10-26' }]} from="2026-11-01" to="2026-11-03" grouping="week" />);
    expect(html).toContain('Week of Oct 26, 2026');
    expect(html).toContain('Boundary periods may contain only part of the selected date range.');
  });

  it('gives dense daily trends a bounded-height scrollable plot', () => {
    const html = renderToStaticMarkup(<Trend rows={[{ ...rows[0], period: '2026-01-01' }, { ...rows[2], period: '2026-12-31' }]} from="2026-01-01" to="2026-12-31" grouping="day" />);
    expect(html).toContain('365 periods');
    expect(html).toContain('width="3600" height="218" viewBox="0 0 3600 218"');
    expect(html).toContain('Record volume chart; scroll horizontally if needed');
  });

  it('shows actual status-by-period counts in stacked columns', () => {
    const html = renderToStaticMarkup(<OverviewChart panel={reservations} view="stacked" selectedStatus="" onStatus={() => {}} />);
    expect(html).toContain('Status counts by period chart');
    expect(html).toContain('2026-11-01: 3 pending');
    expect(html).toContain('2026-11-02: 4 confirmed');
  });
});
