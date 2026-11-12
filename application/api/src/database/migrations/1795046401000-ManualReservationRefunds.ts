import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Forward extension: the initial payment migration may already be recorded. */
export class ManualReservationRefunds1795046401000 implements MigrationInterface {
  name = 'ManualReservationRefunds1795046401000';
  async up(r: QueryRunner) {
    await r.query(`ALTER TABLE reservation_payment_submissions DROP CONSTRAINT IF EXISTS reservation_payment_submissions_verification_status_check;
      ALTER TABLE reservation_payment_submissions ADD CONSTRAINT reservation_payment_submissions_verification_status_check
        CHECK(verification_status IN ('AWAITING_VERIFICATION','VERIFIED','REJECTED','RESUBMISSION_REQUESTED','REFUNDED'));
      DROP INDEX IF EXISTS reservation_external_transaction_allocation;
      CREATE UNIQUE INDEX reservation_external_transaction_allocation ON reservation_payment_submissions
        (payment_method,lower(regexp_replace(transaction_reference,'[^a-zA-Z0-9]','','g')))
        WHERE verification_status IN ('AWAITING_VERIFICATION','VERIFIED','REFUNDED');
      CREATE TABLE IF NOT EXISTS reservation_payment_refunds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_submission_id uuid NOT NULL UNIQUE REFERENCES reservation_payment_submissions(id),
        reservation_id varchar(100) NOT NULL REFERENCES reservations(id),amount numeric(12,2) NOT NULL CHECK(amount>0),
        reference varchar(120) NOT NULL,recorded_by varchar(100) NOT NULL REFERENCES users(id),notes varchar(2000) NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS reservation_refund_transaction_unique ON reservation_payment_refunds(lower(regexp_replace(reference,'[^a-zA-Z0-9]','','g')));`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve independently confirmed refunds with a forward migration.',
    );
  }
}
