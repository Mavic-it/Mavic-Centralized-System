import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AttendanceDtrImports1774000000000 implements MigrationInterface {
  name = 'AttendanceDtrImports1774000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_import_batches (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        source_file_name varchar(255) NOT NULL,
        worksheet_name varchar(255) NOT NULL,
        header_row integer NOT NULL CHECK (header_row > 0),
        column_headers jsonb NOT NULL DEFAULT '[]'::jsonb,
        column_mapping jsonb NOT NULL,
        date_format varchar(10) NOT NULL DEFAULT 'AUTO',
        status varchar(30) NOT NULL DEFAULT 'PENDING_REVIEW',
        row_count integer NOT NULL CHECK (row_count > 0),
        uploaded_by varchar(100) NOT NULL REFERENCES users(id),
        reviewed_by varchar(100) REFERENCES users(id),
        review_reason varchar(500),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_import_batches_status_check
          CHECK (status IN ('PENDING_REVIEW', 'NEEDS_CORRECTION', 'APPROVED', 'REJECTED')),
        CONSTRAINT attendance_import_batches_date_format_check
          CHECK (date_format IN ('AUTO', 'YMD', 'MDY', 'DMY'))
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_import_rows (
        id varchar(100) PRIMARY KEY,
        batch_id varchar(100) NOT NULL REFERENCES attendance_import_batches(id),
        source_row_number integer NOT NULL CHECK (source_row_number > 0),
        raw_values jsonb NOT NULL,
        employee_identifier varchar(255),
        employee_id varchar(100) REFERENCES employees(id),
        work_date date,
        time_in time,
        time_out time,
        schedule_snapshot jsonb,
        calculated_minutes jsonb NOT NULL DEFAULT '{}'::jsonb,
        exceptions jsonb NOT NULL DEFAULT '[]'::jsonb,
        validation_error varchar(1000),
        attendance_record_id varchar(100) REFERENCES attendance_records(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_import_rows_batch_row_unique UNIQUE (batch_id, source_row_number),
        CONSTRAINT attendance_import_rows_time_check
          CHECK (time_in IS NULL OR time_out IS NULL OR time_in <> time_out)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_import_batches_branch_created_idx
      ON attendance_import_batches(branch_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_import_rows_batch_idx
      ON attendance_import_rows(batch_id, source_row_number)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_corrections (
        id varchar(100) PRIMARY KEY,
        attendance_record_id varchar(100) NOT NULL REFERENCES attendance_records(id),
        employee_id varchar(100) NOT NULL REFERENCES employees(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        time_in_before timestamptz,
        time_out_before timestamptz,
        time_in_after timestamptz,
        time_out_after timestamptz,
        change_type varchar(30) NOT NULL DEFAULT 'CORRECTION',
        reason varchar(500) NOT NULL,
        created_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_corrections_change_type_check
          CHECK (change_type IN ('CORRECTION', 'MANUAL_ADJUSTMENT')),
        CONSTRAINT attendance_corrections_time_check
          CHECK (time_out_after IS NULL OR time_in_after IS NULL OR time_out_after >= time_in_after)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_corrections_record_created_idx
      ON attendance_corrections(attendance_record_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_overtime_approvals (
        id varchar(100) PRIMARY KEY,
        attendance_record_id varchar(100) NOT NULL REFERENCES attendance_records(id),
        employee_id varchar(100) NOT NULL REFERENCES employees(id),
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        requested_minutes integer NOT NULL CHECK (requested_minutes > 0),
        status varchar(20) NOT NULL DEFAULT 'PENDING',
        requested_by varchar(100) NOT NULL REFERENCES users(id),
        reviewed_by varchar(100) REFERENCES users(id),
        review_reason varchar(500),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_overtime_approvals_status_check
          CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_overtime_approvals_record_created_idx
      ON attendance_overtime_approvals(attendance_record_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_overtime_approvals_branch_status_idx
      ON attendance_overtime_approvals(branch_id, status, created_at DESC)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS attendance_overtime_approvals');
    await queryRunner.query('DROP TABLE IF EXISTS attendance_corrections');
    await queryRunner.query('DROP TABLE IF EXISTS attendance_import_rows');
    await queryRunner.query('DROP TABLE IF EXISTS attendance_import_batches');
  }
}
