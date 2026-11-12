import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairAttendanceImportMetadata1792195202000 implements MigrationInterface {
  name = 'RepairAttendanceImportMetadata1792195202000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Older installations recorded the initial migrations before these columns were introduced.
    await queryRunner.query(`
      ALTER TABLE attendance_import_batches
        ADD COLUMN IF NOT EXISTS column_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS summary_date date,
        ADD COLUMN IF NOT EXISTS punch_in_values jsonb NOT NULL DEFAULT '["check-in", "check in", "in", "clock-in", "clock in", "sign-in", "sign in"]'::jsonb,
        ADD COLUMN IF NOT EXISTS punch_out_values jsonb NOT NULL DEFAULT '["check-out", "check out", "out", "clock-out", "clock out", "sign-out", "sign out"]'::jsonb
    `);
  }

  async down(): Promise<void> {
    // These columns also belong to the original import schema. Preserve metadata on rollback.
  }
}
