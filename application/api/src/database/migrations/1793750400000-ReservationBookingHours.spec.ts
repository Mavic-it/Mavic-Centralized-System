import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ReservationBookingHours1793750400000 } from './1793750400000-ReservationBookingHours.js';

describe('reservation booking hours migration', () => {
  it('can resume when a prior partial run already added columns or constraints', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: string) => {
      statements.push(statement);
      return [];
    });

    await new ReservationBookingHours1793750400000().up(
      { query } as unknown as QueryRunner,
    );

    expect(statements[0]).toContain('ADD COLUMN IF NOT EXISTS open_time');
    expect(statements[0]).toContain('ADD COLUMN IF NOT EXISTS allowed_days');
    expect(statements[0]).toContain('pg_constraint');
    expect(statements[0]).toContain("conname = 'reservation_settings_booking_hours_check'");
    expect(statements[0]).toContain("conname = 'reservation_settings_allowed_days_check'");
  });
});
