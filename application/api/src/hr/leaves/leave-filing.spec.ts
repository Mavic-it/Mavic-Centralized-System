import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  earliestFilingDate,
  validateFilingDate,
  today,
} from './leave.policy.js';
import { LeaveService } from './leave.service.js';
import { LeaveFilingNotice1792972800000 } from '../../database/migrations/1792972800000-LeaveFilingNotice.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import type { QueryRunner } from 'typeorm';

const now = new Date('2026-10-26T03:07:00Z');
afterEach(() => vi.useRealTimers());
describe('Leave notice periods use authoritative Philippine calendar dates', () => {
  it('allows same-day sick/emergency filing but never past dates', () => {
    expect(validateFilingDate('2026-10-26', 0, now)).toBe('2026-10-26');
    expect(() => validateFilingDate('2026-10-25', 0, now)).toThrow(
      'Past dates',
    );
  });
  it.each([1, 2])(
    'requires %s calendar days, rather than elapsed 24-hour periods',
    (days) => {
      const lateToday = new Date('2026-10-26T15:59:00Z');
      expect(() => validateFilingDate('2026-10-26', days, lateToday)).toThrow(
        'advance notice',
      );
      expect(validateFilingDate(`2026-10-${26 + days}`, days, lateToday)).toBe(
        `2026-10-${26 + days}`,
      );
    },
  );
  it('changes the boundary at midnight in Manila rather than UTC', () => {
    const before = new Date('2026-10-26T15:59:59Z');
    const after = new Date('2026-10-26T16:00:00Z');
    expect(today(before)).toBe('2026-10-26');
    expect(today(after)).toBe('2026-10-27');
    expect(earliestFilingDate(1, before)).toBe('2026-10-27');
    expect(earliestFilingDate(1, after)).toBe('2026-10-28');
  });
  it('handles month/year/leap-day boundaries', () => {
    expect(earliestFilingDate(1, new Date('2026-12-31T00:00:00Z'))).toBe(
      '2027-01-01',
    );
    expect(earliestFilingDate(2, new Date('2028-02-28T00:00:00Z'))).toBe(
      '2028-03-01',
    );
  });
  it.each([-1, 0.5, 366, NaN])('rejects invalid notice %s', (days) => {
    expect(() => earliestFilingDate(days, now)).toThrow('0 to 365');
  });
  it('rejects a direct backend preview before any reservation or credit write', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const query = vi.fn().mockResolvedValue([{ id: 'type', active: true }]);
    const service = new LeaveService({} as never);
    vi.spyOn(service, 'policy').mockResolvedValue({
      policy: { minimumNoticeDays: 1 } as never,
      version: 1,
      effectiveFrom: '2026-01-01',
    });
    const eligibility = vi.spyOn(service, 'eligible');
    await expect(
      service.quote({ query } as never, {} as never, {
        typeId: 'type',
        startDate: '2026-10-26',
        endDate: '2026-10-26',
      }),
    ).rejects.toThrow('advance notice');
    expect(query).toHaveBeenCalledTimes(1);
    expect(eligibility).not.toHaveBeenCalled();
  });
  it.each(['VL', 'LWOP'])(
    'enforces three calendar days for %s even when a saved policy says one',
    async (code) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(now);
      const query = vi
        .fn()
        .mockResolvedValue([{ id: 'type', code, active: true }]);
      const service = new LeaveService({} as never);
      vi.spyOn(service, 'policy').mockResolvedValue({
        policy: { minimumNoticeDays: 1 } as never,
        version: 1,
        effectiveFrom: '2026-01-01',
      });
      await expect(
        service.quote({ query } as never, {} as never, {
          typeId: 'type',
          startDate: '2026-10-28',
          endDate: '2026-10-28',
        }),
      ).rejects.toThrow('3 calendar days');
      expect(query).toHaveBeenCalledTimes(1);
    },
  );
  it('returns the server date/time for Employee and IT personal leave', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(now);
    const service = new LeaveService({} as never);
    expect(service.filingTime({ role: 'EMPLOYEE' } as AuthUserContext)).toEqual(
      {
        serverNow: now.toISOString(),
        today: '2026-10-26',
        timeZone: 'Asia/Manila',
      },
    );
    expect(
      service.filingTime({ role: 'IT_ADMIN' } as AuthUserContext),
    ).toMatchObject({
      today: '2026-10-26',
      timeZone: 'Asia/Manila',
    });
  });
  it('shows an empty personal leave state for an unlinked IT account', async () => {
    const query = vi.fn(async () => []);
    const service = new LeaveService({ manager: { query }, query } as never);
    await expect(
      service.context({
        userId: 'it',
        role: 'IT_ADMIN',
        branchId: null,
      } as AuthUserContext),
    ).resolves.toMatchObject({
      ownEmployee: null,
      canReview: false,
      employees: [],
    });
    await expect(
      service.scope({
        userId: 'it',
        role: 'IT_ADMIN',
        branchId: null,
      } as AuthUserContext),
    ).rejects.toThrow('Leave management access required');
  });
});

describe('Initial filing policy rollout', () => {
  it('appends approved per-type rules and preserves previous policy objects', async () => {
    const rows = ['VL', 'SL', 'EL', 'SIL', 'LWOP'].map((code) => ({
      id: code,
      code,
      version: 2,
      effectiveFrom: '2026-10-22',
      policy: { annualDays: 3, paid: true },
    }));
    const query = vi.fn().mockResolvedValueOnce(rows).mockResolvedValue([]);
    await new LeaveFilingNotice1792972800000().up({
      query,
    } as unknown as QueryRunner);
    for (let i = 0; i < rows.length; i++) {
      const [sql, params] = query.mock.calls[1 + i * 2];
      expect(sql).toContain('INSERT INTO leave_type_versions');
      expect(params[1]).toBe(3);
      expect(JSON.parse(params[2])).toEqual({
        annualDays: 3,
        paid: true,
        minimumNoticeDays: ['SL', 'EL'].includes(rows[i].code) ? 0 : 1,
      });
      expect(rows[i].policy).not.toHaveProperty('minimumNoticeDays');
    }
  });
  it('does not overwrite an already configured notice period', async () => {
    const query = vi
      .fn()
      .mockResolvedValue([
        { id: 'VL', code: 'VL', version: 5, policy: { minimumNoticeDays: 7 } },
      ]);
    await new LeaveFilingNotice1792972800000().up({
      query,
    } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
