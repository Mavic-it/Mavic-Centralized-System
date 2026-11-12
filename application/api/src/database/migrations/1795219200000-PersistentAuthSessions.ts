import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PersistentAuthSessions1795219200000 implements MigrationInterface {
  name = 'PersistentAuthSessions1795219200000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        session_id uuid PRIMARY KEY,
        user_id text NOT NULL,
        token_hash char(64) NOT NULL UNIQUE,
        payload jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        CONSTRAINT app_sessions_expiry_after_create CHECK (expires_at > created_at)
      );
      CREATE INDEX IF NOT EXISTS app_sessions_user_active_idx
        ON app_sessions(user_id) WHERE revoked_at IS NULL;
      CREATE INDEX IF NOT EXISTS app_sessions_expiry_idx ON app_sessions(expires_at);
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query('DROP TABLE IF EXISTS app_sessions');
  }
}
