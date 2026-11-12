import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  manilaCalendarDate,
  nextTaskOccurrence,
} from './task-recurrence.js';

describe('task recurrence calendar dates', () => {
  it('advances daily and weekly dates without local-time drift', () => {
    expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(nextTaskOccurrence('2026-11-05', 'DAILY', 5)).toBe('2026-11-06');
    expect(nextTaskOccurrence('2026-11-05', 'WEEKLY', 5)).toBe('2026-11-12');
  });

  it('keeps the monthly anchor day through short months and leap years', () => {
    expect(nextTaskOccurrence('2026-01-31', 'MONTHLY', 31)).toBe('2026-02-28');
    expect(nextTaskOccurrence('2026-02-28', 'MONTHLY', 31)).toBe('2026-03-31');
    expect(nextTaskOccurrence('2028-01-31', 'MONTHLY', 31)).toBe('2028-02-29');
  });

  it('uses the Asia/Manila calendar date at the UTC date boundary', () => {
    expect(manilaCalendarDate(new Date('2026-11-04T16:30:00.000Z'))).toBe(
      '2026-11-05',
    );
  });
});
