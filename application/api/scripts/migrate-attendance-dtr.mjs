import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { RestoreAttendanceDtrWorkflow1792454400000 } from '../dist/database/migrations/1792454400000-RestoreAttendanceDtrWorkflow.js';
import { AttendanceDtrIntegrity1792454401000 } from '../dist/database/migrations/1792454401000-AttendanceDtrIntegrity.js';
import { DtrSourceRevisions1792454402000 } from '../dist/database/migrations/1792454402000-DtrSourceRevisions.js';
import { DtrDraftCutoffs1792454403000 } from '../dist/database/migrations/1792454403000-DtrDraftCutoffs.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const db = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'mspaces_app',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'mspaces_db',
  synchronize: false,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  migrations: [
    RestoreAttendanceDtrWorkflow1792454400000,
    AttendanceDtrIntegrity1792454401000,
    DtrSourceRevisions1792454402000,
    DtrDraftCutoffs1792454403000,
  ],
});
try {
  await db.initialize();
  if (process.argv.includes('--apply')) {
    const applied = await db.runMigrations({ transaction: 'all' });
    console.log(
      JSON.stringify({ applied: applied.map((migration) => migration.name) }),
    );
  }
  console.log(JSON.stringify({ pending: await db.showMigrations() }));
} finally {
  if (db.isInitialized) await db.destroy();
}
