import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ManualReservationPayments1795046400000 implements MigrationInterface {
  name = 'ManualReservationPayments1795046400000';
  async up(r: QueryRunner) {
    await r.query(`
      ALTER TABLE reservations
        ADD COLUMN manual_payment_required boolean NOT NULL DEFAULT false,
        ADD COLUMN payment_deadline timestamptz,
        ADD COLUMN payment_hold_until timestamptz,
        ADD COLUMN payment_hold_expired_at timestamptz,
        ADD COLUMN payment_deposit_percent integer NOT NULL DEFAULT 100,
        ADD COLUMN payment_review_minutes integer NOT NULL DEFAULT 1440;
      CREATE TABLE reservation_payment_policy (
        branch_id varchar(100) PRIMARY KEY REFERENCES branches(id),
        hold_minutes integer NOT NULL DEFAULT 30 CHECK(hold_minutes BETWEEN 5 AND 1440),
        review_minutes integer NOT NULL DEFAULT 1440 CHECK(review_minutes BETWEEN 5 AND 10080),
        reminder_minutes integer NOT NULL DEFAULT 10 CHECK(reminder_minutes BETWEEN 0 AND 1440),
        deposit_percent integer NOT NULL DEFAULT 100 CHECK(deposit_percent BETWEEN 1 AND 100),
        updated_by varchar(100) REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE reservation_payment_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),branch_id varchar(100) REFERENCES branches(id),
        payment_method varchar(20) NOT NULL CHECK(payment_method IN ('BANK_TRANSFER','GCASH')),
        bank_name varchar(150),account_name varchar(200) NOT NULL,account_number varchar(100) NOT NULL,
        qr_code_data text,instructions varchar(2000),is_active boolean NOT NULL DEFAULT true,is_default boolean NOT NULL DEFAULT false,
        created_by varchar(100) NOT NULL REFERENCES users(id),updated_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(payment_method<>'BANK_TRANSFER' OR length(trim(bank_name))>0)
      );
      CREATE UNIQUE INDEX reservation_payment_account_default ON reservation_payment_accounts
        (COALESCE(branch_id,''),payment_method) WHERE is_default AND is_active;
      CREATE TABLE reservation_payment_submissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
        payment_account_id uuid NOT NULL REFERENCES reservation_payment_accounts(id),account_snapshot jsonb NOT NULL,
        payment_method varchar(20) NOT NULL,transaction_reference varchar(120) NOT NULL,
        submitted_amount numeric(12,2) NOT NULL CHECK(submitted_amount>0),payment_datetime timestamptz NOT NULL,
        proof_data bytea NOT NULL,proof_mime varchar(30) NOT NULL CHECK(proof_mime IN ('image/jpeg','image/png','application/pdf')),
        proof_name varchar(150) NOT NULL,notes varchar(2000),
        verification_status varchar(30) NOT NULL DEFAULT 'AWAITING_VERIFICATION'
          CHECK(verification_status IN ('AWAITING_VERIFICATION','VERIFIED','REJECTED','RESUBMISSION_REQUESTED')),
        rejection_reason varchar(2000),verification_notes varchar(2000),verified_amount numeric(12,2),
        submitted_at timestamptz NOT NULL DEFAULT now(),verified_at timestamptz,verified_by varchar(100) REFERENCES users(id),
        ledger_payment_id uuid UNIQUE REFERENCES reservation_payments(id),
        CHECK(octet_length(proof_data)<=10485760)
      );
      CREATE UNIQUE INDEX reservation_external_transaction_allocation ON reservation_payment_submissions
        (payment_method,lower(regexp_replace(transaction_reference,'[^a-zA-Z0-9]','','g')))
        WHERE verification_status IN ('AWAITING_VERIFICATION','VERIFIED');
      CREATE UNIQUE INDEX reservation_one_pending_proof ON reservation_payment_submissions(reservation_id)
        WHERE verification_status='AWAITING_VERIFICATION';
      CREATE INDEX reservation_payment_submission_queue ON reservation_payment_submissions(verification_status,submitted_at);
      CREATE INDEX reservation_payment_submission_booking ON reservation_payment_submissions(reservation_id);
      CREATE INDEX reservation_payment_hold_due ON reservations(payment_hold_until) WHERE manual_payment_required AND status='PENDING';
      CREATE TABLE reservation_payment_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_submission_id uuid REFERENCES reservation_payment_submissions(id),
        payment_account_id uuid REFERENCES reservation_payment_accounts(id),reservation_id varchar(100) REFERENCES reservations(id),
        action varchar(50) NOT NULL,previous_status varchar(30),new_status varchar(30),
        performed_by varchar(100) REFERENCES users(id),notes text,created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE reservation_payment_mail (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
        event varchar(40) NOT NULL,event_key varchar(150) NOT NULL UNIQUE,message text NOT NULL,
        attempts integer NOT NULL DEFAULT 0,available_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,failure varchar(40)
      );
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve payment evidence and audit history with a forward migration.',
    );
  }
}
