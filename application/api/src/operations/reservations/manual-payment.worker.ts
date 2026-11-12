import {
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { ManualPaymentService } from './manual-payment.service.js';
import { ReservationManagementService } from './reservation-management.service.js';
import { bookingPaymentToken } from './manual-payment.security.js';
import type { EmailService } from '../../email/email.service.js';

export class ManualPaymentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(ManualPaymentWorker.name);
  constructor(
    private readonly db: DataSource,
    private readonly payments: ManualPaymentService,
    private readonly reservations: ReservationManagementService,
    private readonly email: Pick<EmailService, 'sendReservationPaymentNotice'>,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.flush(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      const due = await this.db.query<
        Array<{ id: string; room_id: string }>
      >(`SELECT id,room_id FROM reservations WHERE manual_payment_required AND status='PENDING'
        AND payment_hold_expired_at IS NULL AND payment_hold_until<=now() ORDER BY payment_hold_until LIMIT 100`);
      for (const candidate of due)
        await this.db.transaction(async (m) => {
          await m.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [
            candidate.room_id,
          ]);
          const [r] = await m.query<
            Array<{ id: string; branch_id: string; reference: string }>
          >(
            `WITH expired AS (UPDATE reservations SET status='CANCELLED',payment_hold_expired_at=now(),cancelled_at=now(),
          cancellation_reason='Temporary payment hold expired',updated_at=now() WHERE id=$1 AND status='PENDING' AND payment_hold_expired_at IS NULL
          AND payment_hold_until<=now() RETURNING id,branch_id,reference) SELECT * FROM expired`,
            [candidate.id],
          );
          if (!r) return;
          await m.query(
            `INSERT INTO reservation_events(reservation_id,action,actor_id,previous_status,new_status,reason)
          VALUES($1,'PAYMENT_HOLD_EXPIRED',NULL,'PENDING','CANCELLED','Payment/review deadline expired. Reconcile any transferred funds with staff.')`,
            [r.id],
          );
          await this.payments.mail(
            m,
            r.id,
            'HOLD_EXPIRED',
            `${r.id}:expired`,
            'Your temporary booking hold has expired and the slot has been released. If you transferred money, contact the branch for reconciliation or a separately confirmed refund. Do not send further payment.',
          );
          await this.reservations.notifyCancellation(
            m,
            r.id,
            r.branch_id,
            `Payment hold expired — reconcile any funds: ${r.reference}`,
          );
        });
      await this.db
        .query(`INSERT INTO reservation_payment_mail(reservation_id,event,event_key,message)
        SELECT r.id,'PAYMENT_REMINDER',r.id||':reminder','Your booking payment deadline is approaching. Submit proof before the deadline shown on your private payment page. Do not pay if the hold has expired.'
        FROM reservations r LEFT JOIN reservation_payment_policy p ON p.branch_id=r.branch_id
        WHERE r.manual_payment_required AND r.status='PENDING' AND r.payment_status='NOT_SUBMITTED' AND r.payment_deadline>now()
        AND COALESCE(p.reminder_minutes,10)>0 AND r.payment_deadline<=now()+make_interval(mins=>COALESCE(p.reminder_minutes,10)) ON CONFLICT(event_key) DO NOTHING`);
      for (let i = 0; i < 20; i++) {
        const sent = await this.db.transaction(async (m) => {
          const [job] = await m.query<
            Array<{
              id: string;
              customer_email: string;
              reference: string;
              public_key_hash: string;
              message: string;
              event: string;
              payment_status: string;
              status: string;
              submission_status: string | null;
            }>
          >(`SELECT o.id,o.message,o.event,r.payment_status,r.status,r.reference,r.customer_email,r.public_key_hash,s.verification_status AS submission_status
            FROM reservation_payment_mail o JOIN reservations r ON r.id=o.reservation_id
            LEFT JOIN reservation_payment_submissions s ON s.id::text=split_part(o.event_key,':',1)
            WHERE o.sent_at IS NULL AND o.attempts<8 AND o.available_at<=now()
            ORDER BY o.available_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`);
          if (!job) return false;
          const staleInstructions =
            ['PAYMENT_INSTRUCTIONS', 'PAYMENT_REMINDER'].includes(job.event) &&
            (job.status !== 'PENDING' ||
              !['NOT_SUBMITTED', 'PARTIALLY_PAID'].includes(
                job.payment_status,
              ));
          const staleSubmission =
            job.event === 'PAYMENT_SUBMITTED' &&
            job.submission_status !== 'AWAITING_VERIFICATION';
          const staleRejection =
            ['PAYMENT_REJECTED', 'PAYMENT_RESUBMISSION_REQUESTED'].includes(
              job.event,
            ) &&
            !['REJECTED', 'RESUBMISSION_REQUESTED'].includes(
              job.submission_status ?? '',
            );
          if (staleInstructions || staleSubmission || staleRejection) {
            await m.query(
              "UPDATE reservation_payment_mail SET attempts=8,failure='STATUS_SUPERSEDED' WHERE id=$1",
              [job.id],
            );
            return true;
          }
          const token = bookingPaymentToken(job.reference, job.public_key_hash);
          const url = new URL(
            '/payment',
            process.env.CLIENT_BOOKING_URL ?? 'http://localhost:3005',
          );
          url.hash = new URLSearchParams({
            reference: job.reference,
            token,
          }).toString();
          const result = await this.email.sendReservationPaymentNotice(
            job.customer_email,
            job.reference,
            job.message,
            url.href,
          );
          await m.query(
            `UPDATE reservation_payment_mail SET attempts=attempts+1,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,
            failure=$3,available_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::int)) WHERE id=$1`,
            [job.id, result.status === 'ACCEPTED_BY_PROVIDER', result.failure],
          );
          return true;
        });
        if (!sent) break;
      }
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : 'UNKNOWN';
      this.logger.warn(
        `Manual payment maintenance deferred (${code}); inspect payment outbox and database health.`,
      );
    } finally {
      this.busy = false;
    }
  }
}
