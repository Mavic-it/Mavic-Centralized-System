import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';

// Development watchers may apply the additive base migration before compilation
// of the full module finishes. Keep that registered version forward-compatible.
export class CompleteWorkHistory1793232001000 implements MigrationInterface {
  name = 'CompleteWorkHistory1793232001000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE work_events ADD COLUMN IF NOT EXISTS sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE;
      ALTER TABLE work_events ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}';`);
    await installRealtimeTriggers(r);
  }
  async down(): Promise<void> {
    throw new Error('Preserve ordered work history with a forward migration.');
  }
}
