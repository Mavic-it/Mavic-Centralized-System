import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairPayrollDtrSnapshotReady1792195201000 implements MigrationInterface {
  name = 'RepairPayrollDtrSnapshotReady1792195201000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payroll_attendance_cutoffs
        ADD COLUMN IF NOT EXISTS snapshot_ready boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM payroll_attendance_cutoffs WHERE snapshot_ready = true
      ) AS has_ready_snapshots
    `) as Array<{ has_ready_snapshots: boolean }>;
    if (rows[0]?.has_ready_snapshots) {
      throw new Error('Payroll cutoff snapshots use snapshot_ready; restore the column with a forward migration.');
    }
    await queryRunner.query(`
      ALTER TABLE payroll_attendance_cutoffs DROP COLUMN IF EXISTS snapshot_ready
    `);
  }
}
