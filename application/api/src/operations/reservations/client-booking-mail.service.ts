import { Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { EmailService } from '../../email/email.service.js';

export class ClientBookingMailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(ClientBookingMailService.name);
  constructor(private readonly db: DataSource, private readonly email: Pick<EmailService, 'sendClientReservationNotice'>) {}
  onModuleInit() { this.timer = setInterval(() => void this.flush(), 30000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 20; i++) {
        const found = await this.db.transaction(async m => {
          const rows = await m.query<Array<{ id: string; customer_email: string; reference: string; event: string; status: string }>>(
            `SELECT o.id,r.customer_email,r.reference,o.event,r.status FROM reservation_customer_mail o
             JOIN reservations r ON r.id=o.reservation_id WHERE o.sent_at IS NULL AND o.attempts<8 AND o.available_at<=now()
             ORDER BY o.available_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
          const job = rows[0];
          if (!job) return false;
          if (job.status !== job.event) {
            await m.query("UPDATE reservation_customer_mail SET attempts=8,failure='STATUS_SUPERSEDED' WHERE id=$1", [job.id]);
            return true;
          }
          let result;
          try { result = await this.email.sendClientReservationNotice(job.customer_email, job.reference, job.event); }
          catch { result = { status: 'FAILED', failure: 'SMTP_UNAVAILABLE' }; }
          await m.query(`UPDATE reservation_customer_mail SET attempts=attempts+1,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,
            failure=$3,available_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::int)) WHERE id=$1`,
            [job.id,result.status === 'ACCEPTED_BY_PROVIDER',result.failure]);
          if (result.status !== 'ACCEPTED_BY_PROVIDER') this.logger.warn('Client reservation email deferred; inspect reservation_customer_mail failure and attempts.');
          return true;
        });
        if (!found) break;
      }
    } catch { this.logger.warn('Client reservation mail queue unavailable; retrying later.'); }
    finally { this.busy = false; }
  }
}
