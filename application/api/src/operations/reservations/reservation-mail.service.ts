import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type {
  EmailService,
  ReservationEmailEvent,
} from '../../email/email.service.js';

export class ReservationMailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private lastQueueFailureCode?: string;
  private readonly logger = new Logger(ReservationMailService.name);
  constructor(
    private readonly db: DataSource,
    private readonly email: Pick<EmailService, 'sendReservationNotice'>,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.retrySafely(), 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async retrySafely() {
    try {
      await this.flush();
      this.lastQueueFailureCode = undefined;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : error instanceof Error
            ? error.name
            : 'UNKNOWN';
      if (code !== this.lastQueueFailureCode) {
        this.logger.warn(`Reservation email retry paused (${code}).`);
        this.lastQueueFailureCode = code;
      }
    }
  }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let i = 0; i < 20; i++) {
        const found = await this.db.transaction(async (m) => {
          const rows = await m.query<
            Array<{
              id: string;
              reservationId: string;
              event: ReservationEmailEvent;
              email: string;
              name: string;
              active: boolean;
            }>
          >(
            `SELECT o.id,o.reservation_id AS "reservationId",o.event,u.email,u.name,
              (u.status='ACTIVE' AND
                ((o.audience='MANAGER' AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER') AND
                  (u.role='SUPER_ADMIN'
                    OR u.role='HR_ADMIN' AND (a.mode='ALL' OR a.mode='SELECTED' AND r.branch_id=ANY(a.branch_ids)
                      OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.branch_id IS NULL OR u.branch_id=r.branch_id OR b.manager_user_id=u.id))
                    OR u.role='BRANCH_MANAGER' AND (a.mode='ALL' OR a.mode='SELECTED' AND r.branch_id=ANY(a.branch_ids)
                      OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.branch_id=r.branch_id OR b.manager_user_id=u.id))))
                OR (o.audience='CREATOR' AND r.created_by=u.id AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF')
                  AND (u.role='SUPER_ADMIN' OR a.mode='ALL' OR a.mode='SELECTED' AND r.branch_id=ANY(a.branch_ids)
                  OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.branch_id=r.branch_id OR u.role='HR_ADMIN' AND u.branch_id IS NULL))))) AS active
             FROM reservation_mail_outbox o JOIN reservations r ON r.id=o.reservation_id
             JOIN branches b ON b.id=r.branch_id JOIN users u ON u.id=o.user_id
             LEFT JOIN employee_branch_access a ON a.user_id=u.id
             WHERE o.sent_at IS NULL AND o.attempts<8 AND o.available_at<=now()
             ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
          );
          const job = rows[0];
          if (!job) return false;
          if (!job.active) {
            await m.query(
              `UPDATE reservation_mail_outbox SET attempts=8,failure='RECIPIENT_NO_LONGER_AUTHORIZED' WHERE id=$1`,
              [job.id],
            );
            return true;
          }
          let result: Awaited<
            ReturnType<EmailService['sendReservationNotice']>
          >;
          try {
            result = await this.email.sendReservationNotice(
              job.email,
              job.name,
              job.reservationId,
              job.event,
            );
          } catch {
            result = { status: 'FAILED', failure: 'SMTP_UNAVAILABLE' };
          }
          await m.query(
            `UPDATE reservation_mail_outbox SET attempts=attempts+1,
            sent_at=CASE WHEN $2 THEN now() ELSE NULL END,failure=$3,
            available_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::int)) WHERE id=$1`,
            [job.id, result.status === 'ACCEPTED_BY_PROVIDER', result.failure],
          );
          return true;
        });
        if (!found) break;
      }
    } finally {
      this.busy = false;
    }
  }
}
