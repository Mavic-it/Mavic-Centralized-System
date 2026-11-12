import { existsSync } from 'node:fs';
import { DataSource, type QueryRunner } from 'typeorm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserLastLoginTimestamp1791936001000 } from '../src/database/migrations/1791936001000-UserLastLoginTimestamp.js';

// Opt in to PostgreSQL checks. All fixtures live in a connection-local temporary
// table and every test rolls its transaction back; application rows are untouched.
describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')(
  'UserLastLoginTimestamp migration on PostgreSQL',
  () => {
    let dataSource: DataSource;
    let runner: QueryRunner;
    const migration = new UserLastLoginTimestamp1791936001000();

    beforeAll(async () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
      dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME ?? 'mspaces_app',
        password: process.env.DB_PASSWORD ?? '',
        database: process.env.DB_DATABASE ?? 'mspaces_db',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
        synchronize: false,
        migrationsRun: false,
        connectTimeoutMS: 5000,
      });
      await dataSource.initialize();
    }, 15000);

    beforeEach(async () => {
      runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      await runner.query(
        'CREATE TEMPORARY TABLE users (id text PRIMARY KEY) ON COMMIT DROP',
      );
      await runner.query('SET LOCAL search_path TO pg_temp');
      await runner.query("INSERT INTO users (id) VALUES ('legacy-user')");
    });

    afterEach(async () => {
      if (runner?.isTransactionActive) await runner.rollbackTransaction();
      if (runner && !runner.isReleased) await runner.release();
    });

    afterAll(async () => {
      if (dataSource?.isInitialized) await dataSource.destroy();
    });

    it('repairs an earlier profile schema without inventing historical login dates', async () => {
      await migration.up(runner);
      await runner.query("INSERT INTO users (id) VALUES ('new-user')");

      const rows = await runner.query<Array<{ id: string; lastLoginAt: null }>>(
        'SELECT id, last_login_at AS "lastLoginAt" FROM users ORDER BY id',
      );
      expect(rows).toEqual([
        { id: 'legacy-user', lastLoginAt: null },
        { id: 'new-user', lastLoginAt: null },
      ]);
    });

    it('preserves recorded timestamps when reapplied or rolled back', async () => {
      await runner.query('ALTER TABLE users ADD COLUMN last_login_at timestamptz');
      const recordedAt = new Date('2026-10-13T06:30:00.000Z');
      await runner.query('UPDATE users SET last_login_at = $1', [recordedAt]);

      await migration.up(runner);
      await migration.up(runner);
      await migration.down();

      const rows = await runner.query<Array<{ id: string; lastLoginAt: Date }>>(
        'SELECT id, last_login_at AS "lastLoginAt" FROM users',
      );
      expect(rows).toEqual([{ id: 'legacy-user', lastLoginAt: recordedAt }]);
    });
  },
);
