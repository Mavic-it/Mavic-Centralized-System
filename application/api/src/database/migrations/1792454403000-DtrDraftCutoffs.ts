import type { MigrationInterface, QueryRunner } from 'typeorm';
export class DtrDraftCutoffs1792454403000 implements MigrationInterface {
  name = 'DtrDraftCutoffs1792454403000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(
      `ALTER TABLE attendance_dtr_periods DROP CONSTRAINT attendance_dtr_periods_state_check; ALTER TABLE attendance_dtr_periods ADD CONSTRAINT attendance_dtr_periods_state_check CHECK(state IN ('DRAFT','APPROVED','LOCKED','REOPENED'));`,
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Use a forward migration to preserve saved cutoff definitions.',
    );
  }
}
