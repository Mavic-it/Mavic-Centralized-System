import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { NotificationDestinations1792540803000 } from '../src/database/migrations/1792540803000-NotificationDestinations.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')('Notification destinations on PostgreSQL', () => {
  it('backfills historical destinations without replacing existing links and is idempotent', async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME ?? 'mspaces_app', password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE ?? 'mspaces_db', synchronize: false, migrationsRun: false, connectTimeoutMS: 5000 });
    await db.initialize();
    const runner = db.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query('CREATE TEMP TABLE notifications (id text, title text, message text, created_at timestamptz) ON COMMIT DROP');
      await runner.query('CREATE TEMP TABLE password_reset_requests (id uuid, requested_at timestamptz) ON COMMIT DROP');
      await runner.query('SET LOCAL search_path TO pg_temp');
      await runner.query(`INSERT INTO password_reset_requests VALUES ('00000000-0000-4000-8000-000000000001', '2026-10-21T00:00:00Z')`);
      await runner.query(`INSERT INTO notifications VALUES
        ('reset', 'Password reset requested', 'Review', '2026-10-21T00:00:00Z'),
        ('legacy', 'Password reset requested', 'Review', '2026-10-20T00:00:00Z'),
        ('leave', 'Leave request updated', 'Leave request leave-1 is now APPROVED.', now()),
        ('info', 'Notice', 'Information', now())`);
      const migration = new NotificationDestinations1792540803000();
      await migration.up(runner);
      await runner.query("UPDATE notifications SET href='/my-profile' WHERE id='info'");
      await migration.up(runner);
      const rows = await runner.query<Array<{ id: string; href: string }>>('SELECT id, href FROM notifications');
      const targets = Object.fromEntries(rows.map(row => [row.id, row.href]));
      expect(targets).toEqual({ reset: '/system/password-reset-requests?requestId=00000000-0000-4000-8000-000000000001', legacy: '/system/password-reset-requests', leave: '/my-leave?requestId=leave-1', info: '/my-profile' });
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (!runner.isReleased) await runner.release();
      await db.destroy();
    }
  });
});
