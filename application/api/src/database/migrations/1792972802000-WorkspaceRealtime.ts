import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';

export class WorkspaceRealtime1792972802000 implements MigrationInterface {
  name = 'WorkspaceRealtime1792972802000';
  async up(runner: QueryRunner): Promise<void> {
    await installRealtimeTriggers(runner);
  }
  async down(runner: QueryRunner): Promise<void> {
    // No business data is removed. Realtime HTTP fallback remains available.
    await runner.query(`DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT n.nspname AS schema,c.relname AS tablename FROM pg_trigger g
        JOIN pg_class c ON c.oid=g.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE g.tgname='mspaces_realtime_change' AND n.nspname=current_schema()
      LOOP EXECUTE format('DROP TRIGGER mspaces_realtime_change ON %I.%I',t.schema,t.tablename); END LOOP;
    END $$`);
    await runner.query(
      'DROP FUNCTION IF EXISTS mspaces_notify_workspace_change()',
    );
  }
}
