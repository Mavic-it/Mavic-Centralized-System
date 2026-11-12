import { ManualReservationRefunds1795046401000 } from '../dist/database/migrations/1795046401000-ManualReservationRefunds.js';
import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { ManualReservationPayments1795046400000 } from '../dist/database/migrations/1795046400000-ManualReservationPayments.js';

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
  migrationsRun: false,
  migrations: [
    ManualReservationPayments1795046400000,
    ManualReservationRefunds1795046401000,
  ],
});
try {
  await db.initialize();
  if (process.argv.includes('--apply')) {
    const required = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='reservations' AND column_name IN ('public_key_hash','source')",
    );
    if (required.length !== 2)
      throw new Error(
        'Apply the existing PublicClientBooking migration first.',
      );
    const applied = await db.runMigrations({ transaction: 'all' });
    console.log(JSON.stringify({ applied: applied.map((m) => m.name) }));
  }
  console.log(JSON.stringify({ pending: await db.showMigrations() }));
} finally {
  if (db.isInitialized) await db.destroy();
}
