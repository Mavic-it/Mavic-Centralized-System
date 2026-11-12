import type { MigrationInterface, QueryRunner } from 'typeorm';

const RETIRED_ATTENDANCE_TABLES = [
  'payroll_dtr_exports',
  'payroll_attendance_cutoff_history',
  'payroll_attendance_cutoff_rows',
  'payroll_attendance_cutoffs',
  'payroll_dtr_export_templates',
  'attendance_holiday_reviews',
  'attendance_holidays',
  'attendance_payroll_policies',
  'attendance_biometric_raw_events',
  'employee_biometric_identifiers',
  'attendance_import_format_versions',
  'attendance_import_rows',
  'attendance_import_batches',
  'attendance_import_formats',
] as const;

export class RetireAttendanceDtrBiometrics1792368000000
  implements MigrationInterface
{
  name = 'RetireAttendanceDtrBiometrics1792368000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of RETIRED_ATTENDANCE_TABLES) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  async down(): Promise<void> {
    throw new Error(
      'Attendance DTR and biometric data was permanently removed. Restore a pre-migration database backup to recover it; this migration is forward-only.',
    );
  }
}
