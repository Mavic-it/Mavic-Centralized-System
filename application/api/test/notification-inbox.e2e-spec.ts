import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { NotificationService } from '../src/notifications/notification.service.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')(
  'Notification inbox PostgreSQL isolation',
  () => {
    it('retains read history for 60 days, pages correctly and isolates deletion/read-all', async () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
      const db = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME ?? 'mspaces_app',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_DATABASE ?? 'mspaces_db',
        synchronize: false,
        migrationsRun: false,
        connectTimeoutMS: 5000,
      });
      await db.initialize();
      const runner = db.createQueryRunner();
      try {
        await runner.connect();
        await runner.startTransaction();
        await runner.query(
          'CREATE TEMP TABLE notifications (id text PRIMARY KEY, user_id text, branch_id text, title text, message text, href text, type text, read boolean, created_at timestamptz) ON COMMIT DROP',
        );
        await runner.query('SET LOCAL search_path TO pg_temp');
        await runner.query(
          `INSERT INTO notifications SELECT 'a-' || i, 'a', NULL, 'Shared event', 'Update', '/my-profile', 'INFO', false, now() - i * interval '1 minute' FROM generate_series(1, 35) i`,
        );
        await runner.query(`INSERT INTO notifications VALUES
        ('read', 'a', NULL, 'Read', '', NULL, 'INFO', true, now() - interval '59 days'),
        ('boundary', 'a', NULL, 'Boundary', '', NULL, 'INFO', true, now() - interval '60 days'),
        ('expired', 'a', NULL, 'Expired', '', NULL, 'INFO', false, now() - interval '60 days' - interval '1 millisecond'),
        ('b-copy', 'b', NULL, 'Shared event', 'Update', '/my-profile', 'INFO', false, now())`);
        const service = new NotificationService(
          runner as unknown as DataSource,
        );
        const first = await service.inbox('a'),
          second = await service.inbox('a', 2);
        expect(first.total).toBe(37);
        expect(first.unreadCount).toBe(35);
        expect(first.items.length).toBe(30);
        expect(second.items.length).toBe(7);
        expect(second.items.map((n) => n.id)).toContain('boundary');
        expect(
          [...first.items, ...second.items].map((n) => n.id),
        ).not.toContain('expired');
        await service.dismiss('a-1', 'a');
        expect((await service.inbox('a')).total).toBe(37);
        expect((await service.inbox('a', 1, 'unread')).total).toBe(34);
        await service.remove('b-copy', 'a');
        expect((await service.inbox('b')).total).toBe(1);
        await service.remove('a-1', 'a');
        await service.remove('a-1', 'a');
        expect((await service.inbox('a')).total).toBe(36);
        await service.readAll('a');
        expect((await service.inbox('a')).total).toBe(36);
        expect((await service.unread('a')).length).toBe(0);
        expect((await service.inbox('b')).unreadCount).toBe(1);
        expect(
          await runner.query(
            `SELECT id FROM notifications WHERE id = 'expired'`,
          ),
        ).toHaveLength(1);
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        if (!runner.isReleased) await runner.release();
        await db.destroy();
      }
    });
  },
);
