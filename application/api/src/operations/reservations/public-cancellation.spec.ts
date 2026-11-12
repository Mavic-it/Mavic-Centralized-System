import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PublicCancellationDto } from './public-booking.dto.js';
import { PublicBookingService } from './public-booking.service.js';
import type { ReservationManagementService } from './reservation-management.service.js';

const input = { reference: 'RSV-ABC-12345678', customerEmail: 'client@example.com', reason: 'Schedule changed' };
function setup(status?: string, duplicate = false) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM reservations')) return status ? [{ id: 'booking', branch_id: 'branch', status }] : [];
    if (sql.includes('SELECT 1 FROM reservation_events')) return duplicate ? [{ exists: 1 }] : [];
    return [];
  });
  const notify = vi.fn();
  const db = { transaction: (run: (m: EntityManager) => Promise<unknown>) => run({ query } as unknown as EntityManager) } as unknown as DataSource;
  return { query, notify, service: new PublicBookingService(db, { notifyCancellation: notify } as unknown as ReservationManagementService) };
}
describe('public cancellation requests', () => {
  it('normalizes pasted references and email, and rejects missing identity and reasons', async () => {
    const dto = plainToInstance(PublicCancellationDto, { ...input, reference: ' rsv-abc-12345678 ', customerEmail: ' CLIENT@example.com ' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.reference).toBe(input.reference);
    expect(dto.customerEmail).toBe(input.customerEmail);
    expect(await validate(plainToInstance(PublicCancellationDto, { ...input, customerEmail: '', reason: ' ' }))).toHaveLength(2);
  });
  it.each(['PENDING', 'CONFIRMED'])('records a request for %s without releasing the booking', async status => {
    const { service, query, notify } = setup(status);
    await service.requestCancellation(input);
    expect(query.mock.calls[0][0]).toContain('lower(customer_email)=$2');
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO reservation_events'))).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE reservations'))).toBe(false);
    expect(notify).toHaveBeenCalledWith(expect.anything(), 'booking', 'branch', expect.stringContaining(input.reference));
  });
  it('does not disclose mismatches, accept terminal bookings or duplicate notifications', async () => {
    const missing = setup(), terminal = setup('CANCELLED'), duplicate = setup('PENDING', true);
    const messages = await Promise.all([missing, terminal, duplicate].map(async test => {
      const result = await test.service.requestCancellation(input);
      expect(test.notify).not.toHaveBeenCalled();
      expect(test.query.mock.calls.some(([sql]) => sql.includes('INSERT'))).toBe(false);
      return result;
    }));
    expect(messages[0]).toEqual(messages[1]); expect(messages[1]).toEqual(messages[2]);
  });
});
