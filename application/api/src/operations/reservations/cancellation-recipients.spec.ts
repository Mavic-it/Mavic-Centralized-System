import { describe, expect, it, vi } from 'vitest';
import type { EntityManager, DataSource } from 'typeorm';
import { canViewReservations } from './cancellation-recipients.js';
import { ReservationManagementService } from './reservation-management.service.js';

describe('cancellation notification access', () => {
  it('includes inherited access and explicit view/edit grants', () => {
    expect(canViewReservations('HR_ADMIN', {})).toBe(true);
    expect(canViewReservations('STAFF', { 'operations.reservations.list': 'VIEW' })).toBe(true);
    expect(canViewReservations('EMPLOYEE', { 'operations.reservations.list': 'EDIT' })).toBe(true);
    expect(canViewReservations('IT_ADMIN', { 'operations.reservations.list': 'ALLOW' })).toBe(true);
  });
  it('excludes denied users and users without reservation list access', () => {
    expect(canViewReservations('STAFF', {})).toBe(false);
    expect(canViewReservations('BRANCH_MANAGER', { 'operations.reservations.list': 'DENY' })).toBe(false);
    expect(canViewReservations('HR_ADMIN', { 'operations.reservations': 'DENY' })).toBe(false);
    expect(canViewReservations('EMPLOYEE', { 'operations.reservations.list': 'EDIT', 'operations.reservations': 'DENY' })).toBe(false);
    expect(canViewReservations('SUPER_ADMIN', { 'operations.reservations': 'DENY' })).toBe(true);
  });
  it('notifies every eligible account once, including view-only users', async () => {
    const query = vi.fn().mockResolvedValueOnce([
      { id:'admin',role:'SUPER_ADMIN',overrides:{} },
      { id:'viewer',role:'STAFF',overrides:{ 'operations.reservations.list':'VIEW' } },
      { id:'denied',role:'HR_ADMIN',overrides:{ 'operations.reservations':'DENY' } },
      { id:'no-access',role:'EMPLOYEE',overrides:{} },
    ]).mockResolvedValueOnce([]);
    await new ReservationManagementService({} as DataSource).notifyCancellation({ query } as unknown as EntityManager,'booking','branch','Cancellation requested');
    expect(query.mock.calls[0][1]).toEqual(['branch']);
    expect(query.mock.calls[0][0]).toContain("u.status='ACTIVE'");
    expect(query.mock.calls[0][0]).toContain('$1=ANY(a.branch_ids)');
    expect(query.mock.calls[1][1][0]).toEqual(['admin','viewer']);
  });
});
