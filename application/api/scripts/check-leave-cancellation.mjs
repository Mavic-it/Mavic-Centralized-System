import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
if (existsSync('.env')) process.loadEnvFile('.env');
const db = new DataSource({
  type: 'postgres', host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE,
  synchronize: false, migrationsRun: false,
});
try {
  await db.initialize();
  const [schema] = await db.query("SELECT to_regclass('public.leave_cancellation_reviews') IS NOT NULL AS present");
  console.log(JSON.stringify({ cancellationReviewTable: schema.present }));
} finally {
  if (db.isInitialized) await db.destroy();
}
