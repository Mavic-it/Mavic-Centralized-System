import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchBiometricPayrollDtr1792195200000 implements MigrationInterface {
  name = 'BranchBiometricPayrollDtr1792195200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_import_formats
        ADD COLUMN IF NOT EXISTS description varchar(500),
        ADD COLUMN IF NOT EXISTS device_name varchar(100),
        ADD COLUMN IF NOT EXISTS worksheet_pattern varchar(255),
        ADD COLUMN IF NOT EXISTS header_row integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS data_start_row integer NOT NULL DEFAULT 2,
        ADD COLUMN IF NOT EXISTS time_zone varchar(100) NOT NULL DEFAULT 'Asia/Manila',
        ADD COLUMN IF NOT EXISTS match_strategy varchar(30) NOT NULL DEFAULT 'EMPLOYEE_NUMBER',
        ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_import_format_versions (
        id varchar(100) PRIMARY KEY,
        format_id varchar(100) NOT NULL REFERENCES attendance_import_formats(id) ON DELETE RESTRICT,
        version integer NOT NULL CHECK (version > 0),
        configuration jsonb NOT NULL,
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_import_format_versions_unique UNIQUE (format_id, version)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_batches
        ADD COLUMN IF NOT EXISTS format_id varchar(100) REFERENCES attendance_import_formats(id) ON DELETE RESTRICT,
        ADD COLUMN IF NOT EXISTS format_version integer,
        ADD COLUMN IF NOT EXISTS format_snapshot jsonb,
        ADD COLUMN IF NOT EXISTS file_sha256 char(64),
        ADD COLUMN IF NOT EXISTS source_file_bytes bytea,
        ADD COLUMN IF NOT EXISTS source_file_type varchar(10),
        ADD COLUMN IF NOT EXISTS source_file_size integer
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS attendance_import_batches_branch_hash_uidx
      ON attendance_import_batches(branch_id, file_sha256)
      WHERE file_sha256 IS NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_rows
        ADD COLUMN IF NOT EXISTS source_sheet_name varchar(255),
        ADD COLUMN IF NOT EXISTS imported_status varchar(50),
        ADD COLUMN IF NOT EXISTS imported_shift_start time,
        ADD COLUMN IF NOT EXISTS imported_shift_end time
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_biometric_identifiers (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        device_name varchar(100) NOT NULL,
        personnel_id varchar(100) NOT NULL,
        card_number varchar(100),
        effective_from date NOT NULL,
        effective_to date,
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_biometric_identifiers_period_check
          CHECK (effective_to IS NULL OR effective_to >= effective_from),
        CONSTRAINT employee_biometric_identifiers_start_unique
          UNIQUE (branch_id, device_name, personnel_id, effective_from)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_biometric_identifiers_lookup_idx
      ON employee_biometric_identifiers(branch_id, device_name, personnel_id, effective_from DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_biometric_raw_events (
        id varchar(100) PRIMARY KEY,
        batch_id varchar(100) NOT NULL REFERENCES attendance_import_batches(id) ON DELETE RESTRICT,
        import_row_id varchar(100) REFERENCES attendance_import_rows(id) ON DELETE RESTRICT,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        employee_id varchar(100) REFERENCES employees(id) ON DELETE RESTRICT,
        source_sheet_name varchar(255) NOT NULL,
        source_row_number integer NOT NULL CHECK (source_row_number > 0),
        personnel_id varchar(100),
        device_name varchar(100),
        source_timestamp varchar(100),
        event_timestamp timestamptz,
        event_direction varchar(10) NOT NULL DEFAULT 'UNKNOWN'
          CHECK (event_direction IN ('IN', 'OUT', 'UNKNOWN')),
        raw_values jsonb NOT NULL,
        validation_error varchar(1000),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_biometric_raw_events_source_unique
          UNIQUE (batch_id, source_sheet_name, source_row_number)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_biometric_raw_events_employee_time_idx
      ON attendance_biometric_raw_events(employee_id, event_timestamp)
      WHERE employee_id IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_payroll_policies (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        version integer NOT NULL CHECK (version > 0),
        effective_from date NOT NULL,
        late_rounding_minutes integer NOT NULL CHECK (late_rounding_minutes BETWEEN 0 AND 60),
        undertime_rounding_minutes integer NOT NULL CHECK (undertime_rounding_minutes BETWEEN 0 AND 60),
        minimum_overtime_minutes integer NOT NULL CHECK (minimum_overtime_minutes BETWEEN 0 AND 480),
        max_punch_span_hours integer NOT NULL CHECK (max_punch_span_hours BETWEEN 1 AND 36),
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_payroll_policies_branch_version_unique UNIQUE (branch_id, version),
        CONSTRAINT attendance_payroll_policies_branch_date_unique UNIQUE (branch_id, effective_from)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_holidays (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        holiday_date date NOT NULL,
        name varchar(160) NOT NULL,
        holiday_type varchar(30) NOT NULL
          CHECK (holiday_type IN ('REGULAR_HOLIDAY', 'SPECIAL_NON_WORKING_DAY')),
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_holidays_branch_date_unique UNIQUE (branch_id, holiday_date)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_holiday_reviews (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        date_from date NOT NULL,
        date_to date NOT NULL,
        holiday_sha256 char(64) NOT NULL,
        reviewed_by varchar(100) NOT NULL REFERENCES users(id),
        reviewed_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_holiday_reviews_dates_check CHECK (date_to >= date_from),
        CONSTRAINT attendance_holiday_reviews_period_unique UNIQUE (branch_id, date_from, date_to)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_dtr_export_templates (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE RESTRICT,
        name varchar(100) NOT NULL,
        column_mapping jsonb NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_attendance_cutoffs (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        date_from date NOT NULL,
        date_to date NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'DRAFT'
          CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'LOCKED')),
        revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
        overtime_unit varchar(10) NOT NULL DEFAULT 'MINUTES'
          CHECK (overtime_unit = 'MINUTES'),
        policy_snapshot jsonb,
        holiday_sha256 char(64),
        snapshot_ready boolean NOT NULL DEFAULT false,
        blocking_count integer NOT NULL DEFAULT 0 CHECK (blocking_count >= 0),
        created_by varchar(100) NOT NULL REFERENCES users(id),
        reviewed_by varchar(100) REFERENCES users(id),
        approved_by varchar(100) REFERENCES users(id),
        locked_by varchar(100) REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        reviewed_at timestamptz,
        approved_at timestamptz,
        locked_at timestamptz,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payroll_attendance_cutoffs_dates_check CHECK (date_to >= date_from),
        CONSTRAINT payroll_attendance_cutoffs_branch_period_unique UNIQUE (branch_id, date_from, date_to)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_attendance_cutoff_rows (
        id varchar(100) PRIMARY KEY,
        cutoff_id varchar(100) NOT NULL REFERENCES payroll_attendance_cutoffs(id) ON DELETE RESTRICT,
        revision integer NOT NULL CHECK (revision > 0),
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        work_date date NOT NULL,
        snapshot jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT payroll_attendance_cutoff_rows_unique UNIQUE (cutoff_id, revision, employee_id, work_date)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS payroll_attendance_cutoff_rows_order_idx
      ON payroll_attendance_cutoff_rows(cutoff_id, revision, employee_id, work_date)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_attendance_cutoff_history (
        id varchar(100) PRIMARY KEY,
        cutoff_id varchar(100) NOT NULL REFERENCES payroll_attendance_cutoffs(id) ON DELETE RESTRICT,
        revision integer NOT NULL,
        action varchar(30) NOT NULL,
        reason varchar(500),
        actor_id varchar(100) NOT NULL REFERENCES users(id),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payroll_dtr_exports (
        id varchar(100) PRIMARY KEY,
        cutoff_id varchar(100) NOT NULL REFERENCES payroll_attendance_cutoffs(id) ON DELETE RESTRICT,
        revision integer NOT NULL,
        export_template_id varchar(100) REFERENCES payroll_dtr_export_templates(id) ON DELETE RESTRICT,
        file_sha256 char(64) NOT NULL,
        generated_by varchar(100) NOT NULL REFERENCES users(id),
        generated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const dependentRows = await queryRunner.query(`
      SELECT EXISTS (
        SELECT 1 FROM attendance_import_batches
          WHERE format_id IS NOT NULL OR file_sha256 IS NOT NULL OR source_file_bytes IS NOT NULL
        UNION ALL SELECT 1 FROM attendance_import_rows
          WHERE source_sheet_name IS NOT NULL OR imported_status IS NOT NULL
            OR imported_shift_start IS NOT NULL OR imported_shift_end IS NOT NULL
        UNION ALL SELECT 1 FROM attendance_import_format_versions
        UNION ALL SELECT 1 FROM employee_biometric_identifiers
        UNION ALL SELECT 1 FROM attendance_biometric_raw_events
        UNION ALL SELECT 1 FROM attendance_payroll_policies
        UNION ALL SELECT 1 FROM attendance_holidays
        UNION ALL SELECT 1 FROM attendance_holiday_reviews
        UNION ALL SELECT 1 FROM payroll_attendance_cutoffs
        UNION ALL SELECT 1 FROM payroll_attendance_cutoff_rows
        UNION ALL SELECT 1 FROM payroll_attendance_cutoff_history
        UNION ALL SELECT 1 FROM payroll_dtr_exports
        UNION ALL SELECT 1 FROM payroll_dtr_export_templates
      ) AS exists
    `) as Array<{ exists: boolean }>;
    if (dependentRows[0]?.exists) {
      throw new Error('Biometric and payroll DTR data exists; use a forward migration to preserve it.');
    }
    for (const table of [
      'payroll_dtr_exports', 'payroll_attendance_cutoff_history',
      'payroll_attendance_cutoff_rows', 'payroll_attendance_cutoffs',
      'payroll_dtr_export_templates', 'attendance_holiday_reviews',
      'attendance_holidays', 'attendance_payroll_policies',
      'attendance_biometric_raw_events', 'employee_biometric_identifiers',
      'attendance_import_format_versions',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
    await queryRunner.query('DROP INDEX IF EXISTS attendance_import_batches_branch_hash_uidx');
    await queryRunner.query(`ALTER TABLE attendance_import_rows
      DROP COLUMN IF EXISTS source_sheet_name,
      DROP COLUMN IF EXISTS imported_status,
      DROP COLUMN IF EXISTS imported_shift_start,
      DROP COLUMN IF EXISTS imported_shift_end`);
    await queryRunner.query(`ALTER TABLE attendance_import_batches
      DROP COLUMN IF EXISTS format_id,
      DROP COLUMN IF EXISTS format_version,
      DROP COLUMN IF EXISTS format_snapshot,
      DROP COLUMN IF EXISTS file_sha256,
      DROP COLUMN IF EXISTS source_file_bytes,
      DROP COLUMN IF EXISTS source_file_type,
      DROP COLUMN IF EXISTS source_file_size`);
    await queryRunner.query(`ALTER TABLE attendance_import_formats
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS device_name,
      DROP COLUMN IF EXISTS worksheet_pattern,
      DROP COLUMN IF EXISTS header_row,
      DROP COLUMN IF EXISTS data_start_row,
      DROP COLUMN IF EXISTS time_zone,
      DROP COLUMN IF EXISTS match_strategy,
      DROP COLUMN IF EXISTS is_active,
      DROP COLUMN IF EXISTS version`);
  }
}
