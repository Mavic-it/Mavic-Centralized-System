import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PayrollDtrExportFormats1792281600000 implements MigrationInterface {
  name = 'PayrollDtrExportFormats1792281600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE payroll_dtr_exports
      ADD COLUMN IF NOT EXISTS file_format varchar(8) NOT NULL DEFAULT 'XLSX',
      ADD COLUMN IF NOT EXISTS employee_id varchar(100) REFERENCES employees(id) ON DELETE RESTRICT`);
    await queryRunner.query(`ALTER TABLE payroll_dtr_exports
      ADD CONSTRAINT payroll_dtr_exports_format_check CHECK (file_format IN ('XLSX', 'CSV'))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS payroll_dtr_exports_cutoff_history_idx
      ON payroll_dtr_exports(cutoff_id, generated_at DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const csv = await queryRunner.query(`SELECT 1 FROM payroll_dtr_exports WHERE file_format <> 'XLSX' OR employee_id IS NOT NULL LIMIT 1`) as unknown[];
    if (csv.length) throw new Error('Export format history exists; preserve this migration.');
    await queryRunner.query('DROP INDEX IF EXISTS payroll_dtr_exports_cutoff_history_idx');
    await queryRunner.query('ALTER TABLE payroll_dtr_exports DROP CONSTRAINT IF EXISTS payroll_dtr_exports_format_check');
    await queryRunner.query('ALTER TABLE payroll_dtr_exports DROP COLUMN IF EXISTS employee_id, DROP COLUMN IF EXISTS file_format');
  }
}
