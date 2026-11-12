import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';

export class IncidentReportScope1793318402000 implements MigrationInterface {
  name = 'IncidentReportScope1793318402000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE workplace_incidents
      ADD COLUMN IF NOT EXISTS report_scope varchar(10) NOT NULL DEFAULT 'BRANCH';
      ALTER TABLE workplace_incidents DROP CONSTRAINT IF EXISTS workplace_incidents_report_scope_check;
      ALTER TABLE workplace_incidents ADD CONSTRAINT workplace_incidents_report_scope_check
        CHECK (report_scope IN ('BRANCH','GENERAL'));`);
    await installRealtimeTriggers(r);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve private report classification with a forward migration.',
    );
  }
}
