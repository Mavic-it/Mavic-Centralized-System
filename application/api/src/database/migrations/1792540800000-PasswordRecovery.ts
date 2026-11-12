import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordRecovery1792540800000 implements MigrationInterface {
  name = 'PasswordRecovery1792540800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS password_changed_at timestamptz,
        ADD COLUMN IF NOT EXISTS temporary_password_expires_at timestamptz
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS password_reset_requests (
        id uuid PRIMARY KEY,
        user_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL,
        reason varchar(500), status varchar(20) NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING','VERIFIED','APPROVED','COMPLETED','REJECTED')),
        requested_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz, reviewed_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        identity_verified_at timestamptz, verified_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamptz, approved_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        fulfilled_at timestamptz, fulfilled_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        rejected_at timestamptz, rejection_reason varchar(500),
        email_dispatch_status varchar(30) NOT NULL DEFAULT 'NOT_SENT'
          CHECK (email_dispatch_status IN ('NOT_SENT','PROCESSING','ACCEPTED_BY_PROVIDER','FAILED')),
        last_email_attempt_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_queue ON password_reset_requests(status, requested_at DESC)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user ON password_reset_requests(user_id, requested_at DESC)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_password_reset_pending_user ON password_reset_requests(user_id) WHERE status IN ('PENDING','VERIFIED','APPROVED')`);
  }

  async down(): Promise<void> {
    // Keep account security metadata and reset history on rollback.
  }
}
