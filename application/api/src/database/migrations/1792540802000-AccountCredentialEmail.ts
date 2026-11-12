import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountCredentialEmail1792540802000 implements MigrationInterface {
  name = 'AccountCredentialEmail1792540802000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique ON users (lower(email))',
    );
    await runner.query(`ALTER TABLE users
      ADD COLUMN IF NOT EXISTS credential_email_status varchar(30) NOT NULL DEFAULT 'NOT_REQUIRED',
      ADD COLUMN IF NOT EXISTS credential_email_attempt_id uuid,
      ADD COLUMN IF NOT EXISTS credential_email_started_at timestamptz,
      ADD COLUMN IF NOT EXISTS credential_email_sent_at timestamptz,
      ADD COLUMN IF NOT EXISTS credential_email_failure varchar(40)`);
    await runner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_credential_email_status_check' AND conrelid='users'::regclass) THEN
        ALTER TABLE users ADD CONSTRAINT users_credential_email_status_check CHECK (credential_email_status IN ('NOT_REQUIRED','PENDING','PROCESSING','ACCEPTED_BY_PROVIDER','FAILED'));
      END IF;
    END $$`);
  }
  async down(): Promise<void> {
    /* Preserve delivery history and account security state. */
  }
}
