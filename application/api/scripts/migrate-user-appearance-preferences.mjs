import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { UserAppearancePreferences1795651200000 } from '../dist/database/migrations/1795651200000-UserAppearancePreferences.js';
import { UserAppearancePalettes1795737600000 } from '../dist/database/migrations/1795737600000-UserAppearancePalettes.js';

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
  migrations: [UserAppearancePreferences1795651200000, UserAppearancePalettes1795737600000],
});

try {
  await db.initialize();
  if (process.argv.includes('--apply')) {
    const usersTable = await db.query(
      "SELECT to_regclass(format('%I.users', current_schema())) IS NOT NULL AS present",
    );
    if (!usersTable[0]?.present) throw new Error('The users table is required before applying appearance preferences.');
    const applied = await db.runMigrations({ transaction: 'all' });
    console.log(JSON.stringify({ applied: applied.map((migration) => migration.name) }));
  }
  const migrationsTable = await db.query(
    "SELECT to_regclass(format('%I.migrations', current_schema())) IS NOT NULL AS present",
  );
  const applied = migrationsTable[0]?.present
    ? await db.query('SELECT name FROM migrations WHERE name IN ($1, $2)', ['UserAppearancePreferences1795651200000', 'UserAppearancePalettes1795737600000'])
    : [];
  const preferencesTable = await db.query(
    "SELECT to_regclass(format('%I.user_appearance_preferences', current_schema())) IS NOT NULL AS present",
  );
  if (applied.length > 0 && !preferencesTable[0]?.present) {
    throw new Error('The migration is recorded but its preferences table is missing. Review schema history before repair.');
  }
  const paletteSchema = preferencesTable[0]?.present
    ? await db.query(`
        SELECT column_default AS "accentDefault"
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'user_appearance_preferences'
          AND column_name = 'accent_color'
      `)
    : [];
  const paletteConstraint = preferencesTable[0]?.present
    ? await db.query(`
        SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = to_regclass(format('%I.user_appearance_preferences', current_schema()))
          AND conname = 'user_appearance_preferences_accent_color_check'
      `)
    : [];
  if (applied.length > 0 && (!paletteSchema[0]?.accentDefault?.includes('red') || !paletteConstraint[0]?.definition?.includes('green'))) {
    throw new Error('The saved palette migration does not match the expected default and allowed colors.');
  }
  console.log(JSON.stringify({
    applied: applied.map((migration) => migration.name),
    tablePresent: Boolean(preferencesTable[0]?.present),
    accentDefault: paletteSchema[0]?.accentDefault,
    paletteConstraint: paletteConstraint[0]?.definition,
    pending: await db.showMigrations(),
  }));
} finally {
  if (db.isInitialized) await db.destroy();
}
