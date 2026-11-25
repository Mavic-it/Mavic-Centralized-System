import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import { validate } from 'class-validator';
import type { DataSource } from 'typeorm';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import { AnalyticsQuery, manilaDate, reportingRange } from './analytics.dto.js';
import { analyticsPermission, permittedCategories } from './analytics-access.js';
import { AnalyticsService } from './analytics.service.js';

const user: AuthUserContext = { userId: 'manager', email: 'fixture@example.test', role: 'BRANCH_MANAGER', branchId: 'a', branchIds: ['a'] };
function fixture(overrides: { permission_key: string; effect: string }[] = []) {
  const query = vi.fn(async (sql: string, values: unknown[]) => {
    if (sql.includes('user_module_permissions')) return overrides;
    if (sql.startsWith('SELECT id,name FROM branches')) return values[0] === null ? [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] : (values[0] as string[]).map(id => ({ id, name: id.toUpperCase() }));
    if (sql.startsWith('WITH source')) return [{ period: 'Current', branchId: 'a', branch: 'A', status: 'AVAILABLE', count: 2, amount: 0, attention: 0 }];
    return [];
  });
  return { query, service: new AnalyticsService({ query } as unknown as DataSource) };
}
describe('analytics filters and access', () => {
  it('uses Manila midnight and inclusive calendar range', () => {
    expect(manilaDate(new Date('2026-11-19T16:00:00Z'))).toBe('2026-11-20');
    expect(reportingRange(new AnalyticsQuery(), new Date('2026-11-19T16:00:00Z'))).toEqual({ from: '2026-10-22', to: '2026-11-20' });
    expect(() => reportingRange(Object.assign(new AnalyticsQuery(), { to: '2026-02-30' }))).toThrow('valid');
    expect(() => reportingRange(Object.assign(new AnalyticsQuery(), { from: '2025-01-01', to: '2026-01-02' }))).toThrow('366');
    expect(() => reportingRange(Object.assign(new AnalyticsQuery(), { from: '2026-03-02', to: '2026-03-01' }))).toThrow('ordered');
  });
  it('rejects unsafe filter values', async () => {
    const errors = await validate(Object.assign(new AnalyticsQuery(), { mode: 'reports', category: 'secrets', grouping: 'sql', reservationPage: -1 }));
    expect(errors.map(e => e.property)).toEqual(expect.arrayContaining(['mode', 'category', 'grouping', 'reservationPage']));
  });
  it('respects child and explicit parent denies', () => {
    expect(analyticsPermission(user, [{ permission_key: 'hr.leave', effect: 'DENY' }], 'hr.leave.reports')).toBe(false);
    expect(permittedCategories(user, [{ permission_key: 'hr.employees', effect: 'DENY' }], 'hr')).not.toContain('workforce');
    expect(permittedCategories({ ...user, role: 'IT_ADMIN' }, [], 'overview')).not.toContain('incidents');
    expect(permittedCategories({ ...user, role: 'EMPLOYEE' }, [{ permission_key: 'hr.employees', effect: 'VIEW' }], 'overview')).not.toContain('workforce');
  });
  it('rejects unauthorized branches before aggregation', async () => {
    const { service, query } = fixture();
    await expect(service.data(user, Object.assign(new AnalyticsQuery(), { branchId: 'b' }))).rejects.toThrow('Branch access denied');
    expect(query.mock.calls.some(([sql]) => sql.startsWith('WITH source'))).toBe(false);
  });
  it('does not infer global branch access from a role', async () => {
    const { service } = fixture();
    const q = new AnalyticsQuery();
    expect((await service.context({ ...user, role: 'SUPER_ADMIN', branchIds: undefined, branchId: null }, q)).branches).toEqual([]);
    expect((await service.context({ ...user, role: 'SUPER_ADMIN', branchIds: ['a'], allBranches: true }, q)).branches.map(b => b.id)).toEqual(['a']);
    expect((await service.context({ ...user, role: 'SUPER_ADMIN', branchIds: undefined, allBranches: true, scope: 'ALL' }, q)).branches).toHaveLength(2);
    expect((await service.context({ ...user, branchIds: undefined, allBranches: true, scope: 'BRANCH' }, q)).branches.map(b => b.id)).toEqual(['a']);
  });
  it('requires page and category permission independently', async () => {
    await expect(fixture([{ permission_key: 'workspace.overview', effect: 'DENY' }]).service.context(user, new AnalyticsQuery())).rejects.toThrow('Dashboard access');
    await expect(fixture([{ permission_key: 'inventory', effect: 'DENY' }]).service.data(user, Object.assign(new AnalyticsQuery(), { category: 'inventory' }))).rejects.toThrow('category');
  });
  it('scopes dashboard aggregates to the selected branch', async () => {
    const { service, query } = fixture();
    const q = Object.assign(new AnalyticsQuery(), { category: 'spaces' as const, branchId: 'a', from: '2026-11-01', to: '2026-11-20' });
    const data = await service.data(user, q);
    expect(data.panels[0].metrics[0].value).toBe(2);
    expect(query.mock.calls.filter(([sql]) => sql.startsWith('WITH source')).every(([, args]) => JSON.stringify(args[0]) === '["a"]')).toBe(true);
  });
  it('marks a failed source unavailable instead of showing zero', async () => {
    const { service, query } = fixture();
    query.mockImplementation(async (sql: string) => { if (sql.startsWith('WITH source')) throw new Error('database down'); if (sql.includes('FROM branches')) return [{ id: 'a', name: 'A' }]; return []; });
    const q = Object.assign(new AnalyticsQuery(), { category: 'spaces' as const });
    expect((await service.data(user, q)).panels[0]).toMatchObject({ state: 'unavailable', metrics: [], rows: [] });
  });
});
