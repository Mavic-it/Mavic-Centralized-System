import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { ReservationManagementService } from './reservation-management.service.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

const manager: AuthUserContext = {
  userId: 'manager-1',
  email: 'manager@example.test',
  role: 'BRANCH_MANAGER',
  branchId: 'branch-1',
};
const booking = {
  branchId: 'branch-1',
  roomId: 'room-1',
  startAt: '2099-10-31T09:00:00+08:00',
  endAt: '2099-10-31T10:00:00+08:00',
  guestCount: 2,
  purpose: 'Meeting',
  customerName: 'Alex Santos',
  customerEmail: 'alex@example.test',
  customerPhone: '09170000000',
};

describe('reservation management trust boundary', () => {
  it('rejects unassigned branches and technical-only roles before querying data', async () => {
    const query = vi.fn();
    const service = new ReservationManagementService({
      query,
    } as unknown as DataSource);
    await expect(
      service.create(manager, { ...booking, branchId: 'branch-2' }),
    ).rejects.toThrow('Reservation access denied');
    await expect(
      service.branches({ ...manager, role: 'IT_ADMIN' }),
    ).rejects.toThrow('Reservation access denied');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a concurrent overlapping booking while holding the space lock', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('SELECT is_active FROM branches'))
        return [{ is_active: true }];
      if (sql.includes('SELECT type,capacity,buffer_minutes FROM rooms'))
        return [{ type: 'MEETING_ROOM', capacity: 4, buffer_minutes: 0 }];
      if (sql.includes('FROM rooms WHERE id=$1 FOR UPDATE'))
        return [
          {
            id: 'room-1',
            branch_id: 'branch-1',
            is_active: true,
            status: 'AVAILABLE',
            capacity: 4,
            min_minutes: 30,
            max_minutes: 1440,
            buffer_minutes: 0,
            hourly_rate: 100,
          },
        ];
      if (sql.includes('FROM reservation_settings')) return [];
      if (sql.includes('FROM reservations WHERE room_id'))
        return [{ id: 'existing' }];
      return [];
    });
    const db = {
      transaction: (run: (m: EntityManager) => Promise<unknown>) =>
        run({ query } as unknown as EntityManager),
    } as unknown as DataSource;
    await expect(
      new ReservationManagementService(db).create(manager, booking),
    ).rejects.toThrow('Space is booked or blocked');
    expect(query.mock.calls.some(([sql]) => sql.includes('FOR UPDATE'))).toBe(
      true,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO reservations'),
      ),
    ).toBe(false);
  });

  it('requires a reason for cancellation and blocks invalid transitions', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT * FROM reservations WHERE id')
        ? [
            {
              id: 'booking-1',
              branch_id: 'branch-1',
              room_id: 'room-1',
              status: 'CONFIRMED',
            },
          ]
        : [],
    );
    const db = {
      transaction: (run: (m: EntityManager) => Promise<unknown>) =>
        run({ query } as unknown as EntityManager),
    } as unknown as DataSource;
    const service = new ReservationManagementService(db);
    await expect(
      service.transition(manager, 'booking-1', 'cancel'),
    ).rejects.toThrow('A reason is required');
    await expect(
      service.transition(manager, 'booking-1', 'approve'),
    ).rejects.toThrow('Action unavailable');
    expect(
      query.mock.calls.some(([sql]) => sql.includes('UPDATE reservations')),
    ).toBe(false);
  });

  it('scopes customer history to the caller branch and normalizes the email', async () => {
    const query = vi.fn(async () => []);
    const service = new ReservationManagementService({ query } as unknown as DataSource);

    await service.customerHistory(manager, '  Alex@Example.Test  ');

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('lower(r.customer_email)=lower($2)'),
      [['branch-1'], 'Alex@Example.Test'],
    );
  });
});
