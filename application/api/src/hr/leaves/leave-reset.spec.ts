import { describe, it, expect, vi } from 'vitest';
import { LeaveService } from './leave.service.js';
import type { DataSource } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
const actor = {
  userId: 'admin',
  role: 'SUPER_ADMIN',
  scope: 'ALL',
} as AuthUserContext;
function fixture(reserved = 2) {
  const query = vi.fn(async (sql: string) =>
    sql.startsWith('SELECT * FROM leave_types') ? [{ id: 'type' }] : [],
  );
  const db = {
    transaction: async (fn: (m: unknown) => unknown) => fn({ query }),
  } as unknown as DataSource;
  const service = new LeaveService(db);
  vi.spyOn(service, 'employee').mockResolvedValue({
    id: 'employee',
    branchId: 'branch',
  } as never);
  vi.spyOn(service, 'scope').mockResolvedValue(null);
  vi.spyOn(service, 'policy').mockResolvedValue({
    policy: { paid: true, annualDays: 10 },
    version: 1,
  } as never);
  vi.spyOn(service, 'eligible').mockResolvedValue(undefined);
  vi.spyOn(service, 'balance').mockResolvedValue({
    available: 3,
    reserved,
  } as never);
  vi.spyOn(service, 'post').mockResolvedValue(undefined);
  vi.spyOn(service, 'audit').mockResolvedValue(undefined);
  return { service, query };
}
describe('Leave resets', () => {
  it('restores the allowance while preserving pending reservations and history', async () => {
    const { service, query } = fixture();
    await service.resetBalance(actor, 'employee', {
      typeId: 'type',
      key: 'key',
      reason: 'Annual reset',
    });
    expect(service.post).toHaveBeenCalledWith(
      expect.anything(),
      actor,
      expect.anything(),
      'type',
      expect.any(Number),
      'ADJUSTMENT',
      5,
      'reset:manual:key',
      'Annual reset',
    );
    expect(
      query.mock.calls.some(([sql]) => /UPDATE leave_credit|DELETE/.test(sql)),
    ).toBe(false);
  });
  it('rejects a reset that cannot cover pending reservations', async () => {
    const { service } = fixture(11);
    await expect(
      service.resetBalance(actor, 'employee', {
        typeId: 'type',
        key: 'key',
        reason: 'Reset',
      }),
    ).rejects.toThrow('Pending reservations');
    expect(service.post).not.toHaveBeenCalled();
  });
  it('denies employee access', async () => {
    const { service } = fixture();
    await expect(
      service.resetBalance({ ...actor, role: 'EMPLOYEE' }, 'employee', {
        typeId: 'type',
        key: 'key',
        reason: 'Reset',
      }),
    ).rejects.toThrow('Only authorized HR');
  });
  it('makes retries a no-op', async () => {
    const { service, query } = fixture();
    query.mockImplementation(async (sql) =>
      sql.includes('FROM leave_balance_reset_runs')
        ? ([{ employee_id: 'employee', type_id: 'type' }] as never)
        : [{ id: 'type' }],
    );
    await service.resetBalance(actor, 'employee', {
      typeId: 'type',
      key: 'key',
      reason: 'Reset',
    });
    expect(service.post).not.toHaveBeenCalled();
  });
});
