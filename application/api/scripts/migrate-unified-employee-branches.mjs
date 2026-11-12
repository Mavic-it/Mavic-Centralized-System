import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { UnifiedEmployeeBranches1795132800000 } from '../dist/database/migrations/1795132800000-UnifiedEmployeeBranches.js';

if (existsSync('.env')) process.loadEnvFile('.env');
const db = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'mspaces_app',
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_DATABASE ?? 'mspaces_db',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  migrations: [UnifiedEmployeeBranches1795132800000],
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
