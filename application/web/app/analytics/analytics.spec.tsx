import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AnalyticsPanel, TodayReservations } from './panel';
import { AnalyticsLoading } from './loading';
import { AnalyticsFilters } from './filters';
import { datePreset, dataSchema, getAnalytics, queryString, type Panel, type Filters } from './contracts';

const panel: Panel = { id: 'workforce', title: 'Workforce', description: 'Current primary branch records', snapshot: true, state: 'ready', metrics: [{ label: 'Employees', value: 73, definition: 'Distinct employee records' }], rows: [{ period: 'Current', branchId: 'a', branch: 'Branch A', status: 'ACTIVE', count: 73, amount: 0, attention: 0 }], people: [{ id: 'e', name: 'Test Person', position: 'Engineer', department: 'IT', branch: 'Branch A' }] };
const filters: Filters = { branchId: 'a', from: '2026-11-01', to: '2026-11-20', category: 'workforce', grouping: 'week', status: '', reservationPage: 1 };
describe('analytics presentation and contracts', () => {
  it('renders server metrics and keeps unauthorized person links absent', () => {
    const html = renderToStaticMarkup(<AnalyticsPanel panel={panel} multipleBranches={false} retry={() => {}} />);
    expect(html).toContain('73'); expect(html).toContain('Test Person'); expect(html).not.toContain('/employees/e'); expect(html).not.toContain('Sample data');
  });
  it('distinguishes empty, unavailable and loading states', () => {
    expect(renderToStaticMarkup(<AnalyticsPanel panel={{ ...panel, rows: [] }} multipleBranches={false} retry={() => {}} />)).toContain('No records match');
    const html = renderToStaticMarkup(<AnalyticsPanel panel={{ ...panel, state: 'unavailable', message: 'Could not load', metrics: [] }} multipleBranches={false} retry={() => {}} />);
    expect(html).toContain('role="alert"'); expect(html).toContain('Retry workforce');
    expect(renderToStaticMarkup(<AnalyticsLoading />)).toContain('aria-busy="true"');
  });
  it('uses only authorized branches and static single-branch labels', () => {
    const context = { branches: [{ id: 'a', name: 'Branch A' }], categories: [{ id: 'workforce', title: 'Workforce' }], today: '2026-11-20', timeZone: 'Asia/Manila', notes: [] };
    const html = renderToStaticMarkup(<AnalyticsFilters context={context} filters={filters} onChange={() => {}} statuses={['ACTIVE']} />);
    expect(html).toContain('Branch A'); expect(html).not.toContain('All authorized branches'); expect(html).toContain('Apply dates');
  });
  it('serializes every active dashboard filter', () => {
    const query = new URLSearchParams(queryString('overview', filters));
    expect(query.get('branchId')).toBe('a'); expect(query.get('grouping')).toBe('week'); expect(query.get('from')).toBe('2026-11-01'); expect(query.get('category')).toBe('workforce');
    expect(datePreset('lastMonth', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(datePreset('yesterday', '2024-03-01')).toEqual({ from: '2024-02-29', to: '2024-02-29' });
  });
  it('shows Manila reservation times and pagination', () => {
    const html = renderToStaticMarkup(<TodayReservations panel={{ ...panel, reservationTotal: 21, reservations: [{ id: 'r', startAt: '2026-11-19T16:30:00Z', customer: 'Example', room: 'Room', branch: 'A', status: 'CONFIRMED' }] }} page={1} onPage={() => {}} />);
    expect(html).toContain('12:30'); expect(html).toContain('Page 1 of 3'); expect(html).toContain('Next');
  });
  it('surfaces denied requests and rejects malformed API data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'Denied' }), { status: 403 })));
    await expect(getAnalytics('data', dataSchema)).rejects.toThrow('no longer have access');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ panels: 'fake' }))));
    await expect(getAnalytics('data', dataSchema)).rejects.toThrow('invalid response');
    vi.unstubAllGlobals();
  });
});
