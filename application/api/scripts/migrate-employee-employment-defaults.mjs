import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { EmployeeEmploymentDefaults1794528000000 } from '../dist/database/migrations/1794528000000-EmployeeEmploymentDefaults.js';

if (existsSync('.env')) process.loadEnvFile('.env');
if (
  (process.argv.includes('--verify') || process.argv.includes('--apply')) &&
  (!['localhost', '127.0.0.1', '::1'].includes(
    process.env.DB_HOST ?? 'localhost',
  ) ||
    process.env.NODE_ENV === 'production')
) {
  throw new Error('This helper changes only the local development database.');
}
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
  migrations: [EmployeeEmploymentDefaults1794528000000],
});
try {
  await db.initialize();
  if (process.argv.includes('--verify')) {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await new EmployeeEmploymentDefaults1794528000000().up(runner);
      await new EmployeeEmploymentDefaults1794528000000().up(runner);
      const [result] =
        await runner.query(`SELECT count(*)::int AS missing FROM branches b
        CROSS JOIN unnest(ARRAY['Executive Department','Admin','Marketing','Accounting','IT','Maintenance']::text[]) d(name)
        WHERE NOT EXISTS(SELECT 1 FROM departments x WHERE x.branch_id=b.id AND lower(x.name)=lower(d.name))`);
      if (result.missing !== 0)
        throw new Error('Default department coverage failed.');
      console.log(
        JSON.stringify({
          verification: 'passed',
          repeatedMigration: 'passed',
          missingDefaultDepartments: result.missing,
          changes: 'rolled back',
        }),
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
  }
  if (process.argv.includes('--apply')) {
    const applied = await db.runMigrations({ transaction: 'all' });
    console.log(
      JSON.stringify({ applied: applied.map((migration) => migration.name) }),
    );
  }
  const [coverage] =
    await db.query(`SELECT count(*)::int AS missing FROM branches b
    CROSS JOIN unnest(ARRAY['Executive Department','Admin','Marketing','Accounting','IT','Maintenance']::text[]) d(name)
    WHERE NOT EXISTS(SELECT 1 FROM departments x WHERE x.branch_id=b.id AND lower(x.name)=lower(d.name))`);
  console.log(
    JSON.stringify({
      pending: await db.showMigrations(),
      missingDefaultDepartments: coverage.missing,
    }),
  );
} finally {
  if (db.isInitialized) await db.destroy();
}
