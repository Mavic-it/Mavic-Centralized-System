import type { QueryRunner } from 'typeorm';
import { REALTIME_CHANNEL } from './realtime.service.js';

/** Re-run in a future module's migration after creating its persisted tables. */
export async function installRealtimeTriggers(
  runner: QueryRunner,
  channel = REALTIME_CHANNEL,
) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(channel))
    throw new Error('Invalid realtime channel.');
  await runner.query(`CREATE OR REPLACE FUNCTION mspaces_notify_workspace_change() RETURNS trigger
    LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_notify(TG_ARGV[0], 'refresh'); RETURN NULL; END $$`);
  const tables: Array<{ schema: string; table: string }> = await runner.query(
    `SELECT schemaname AS schema,tablename AS table FROM pg_tables
      WHERE schemaname=current_schema() AND tablename NOT IN ('migrations','typeorm_metadata')`,
  );
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  for (const table of tables) {
    const name = `${quote(table.schema)}.${quote(table.table)}`;
    await runner.query(
      `DROP TRIGGER IF EXISTS mspaces_realtime_change ON ${name}`,
    );
    await runner.query(`CREATE TRIGGER mspaces_realtime_change AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE
      ON ${name} FOR EACH STATEMENT EXECUTE FUNCTION ${quote(table.schema)}.mspaces_notify_workspace_change('${channel}')`);
  }
  return tables.length;
}
