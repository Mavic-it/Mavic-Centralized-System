import { describe, expect, it, vi } from 'vitest';
import type { DataSource, EntityManager } from 'typeorm';
import { ClientBookingMailService } from './client-booking-mail.service.js';

describe('Client booking email recovery', () => {
  it('keeps failed delivery retryable without exposing recipient details', async () => {
    let pending = true;
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT') && pending) {
        pending = false;
        return [{ id:'mail-job',customer_email:'client@example.invalid',reference:'RSV-TEST',event:'PENDING',status:'PENDING' }];
      }
      return [];
    });
    const db = { transaction: <T>(run: (m: EntityManager) => Promise<T>) => run({query} as unknown as EntityManager) } as DataSource;
    const email = { sendClientReservationNotice: vi.fn().mockRejectedValue(new Error('SMTP failed')) };
    await new ClientBookingMailService(db,email).flush();
    expect(email.sendClientReservationNotice).toHaveBeenCalledWith('client@example.invalid','RSV-TEST','PENDING');
    expect(query).toHaveBeenCalledWith(expect.stringContaining('attempts=attempts+1'),['mail-job',false,'SMTP_UNAVAILABLE']);
  });
  it('does not email an obsolete pending or confirmed status', async () => {
    let pending = true;
    const query = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT') && pending) { pending = false; return [{id:'mail-job',event:'CONFIRMED',status:'CANCELLED'}]; }
      return [];
    });
    const db = { transaction: <T>(run: (m: EntityManager) => Promise<T>) => run({query} as unknown as EntityManager) } as DataSource;
    const email = { sendClientReservationNotice: vi.fn() };
    await new ClientBookingMailService(db,email).flush();
    expect(email.sendClientReservationNotice).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('STATUS_SUPERSEDED'),['mail-job']);
  });
});
