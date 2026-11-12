import type { MigrationInterface, QueryRunner } from 'typeorm';

export class FlexibleAttendanceDtrFormats1775000000000 implements MigrationInterface {
  name = 'FlexibleAttendanceDtrFormats1775000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_import_batches
      ADD COLUMN IF NOT EXISTS record_mode varchar(30) NOT NULL DEFAULT 'DAILY_SUMMARY'
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_batches
        ADD COLUMN IF NOT EXISTS summary_date date,
        ADD COLUMN IF NOT EXISTS punch_in_values jsonb NOT NULL DEFAULT '["check-in", "check in", "in", "clock-in", "clock in", "sign-in", "sign in"]'::jsonb,
        ADD COLUMN IF NOT EXISTS punch_out_values jsonb NOT NULL DEFAULT '["check-out", "check out", "out", "clock-out", "clock out", "sign-out", "sign out"]'::jsonb
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE attendance_import_batches
          ADD CONSTRAINT attendance_import_batches_record_mode_check
          CHECK (record_mode IN ('DAILY_SUMMARY', 'PUNCH_LOG'));
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_rows
      ADD COLUMN IF NOT EXISTS source_rows jsonb NOT NULL DEFAULT '[]'::jsonb
    `);
    await queryRunner.query(`
      UPDATE attendance_import_rows
      SET source_rows = jsonb_build_array(jsonb_build_object(
        'rowNumber', source_row_number,
        'rawValues', raw_values,
        'displayValues', raw_values
      ))
      WHERE source_rows = '[]'::jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_rows
      DROP CONSTRAINT IF EXISTS attendance_import_rows_time_check
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_import_formats (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        name varchar(100) NOT NULL,
        record_mode varchar(30) NOT NULL,
        column_mapping jsonb NOT NULL,
        date_format varchar(10) NOT NULL DEFAULT 'AUTO',
        punch_in_values jsonb NOT NULL DEFAULT '["check-in", "check in", "in", "clock-in", "clock in", "sign-in", "sign in"]'::jsonb,
        punch_out_values jsonb NOT NULL DEFAULT '["check-out", "check out", "out", "clock-out", "clock out", "sign-out", "sign out"]'::jsonb,
        created_by varchar(100) NOT NULL REFERENCES users(id),
        updated_by varchar(100) NOT NULL REFERENCES users(id),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_import_formats_branch_name_unique UNIQUE (branch_id, name),
        CONSTRAINT attendance_import_formats_record_mode_check
          CHECK (record_mode IN ('DAILY_SUMMARY', 'PUNCH_LOG')),
        CONSTRAINT attendance_import_formats_date_format_check
          CHECK (date_format IN ('AUTO', 'YMD', 'MDY', 'DMY'))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_import_formats_branch_idx
      ON attendance_import_formats(branch_id, name)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS attendance_import_formats');
    await queryRunner.query('ALTER TABLE attendance_import_rows DROP COLUMN IF EXISTS source_rows');
    await queryRunner.query(`
      DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM attendance_import_rows WHERE time_in IS NOT NULL AND time_in = time_out) THEN
          RAISE EXCEPTION 'Cannot restore the legacy DTR time constraint while equal in/out times are stored.';
        END IF;
        ALTER TABLE attendance_import_rows
          ADD CONSTRAINT attendance_import_rows_time_check
          CHECK (time_in IS NULL OR time_out IS NULL OR time_in <> time_out);
      END $$
    `);
    await queryRunner.query(`
      ALTER TABLE attendance_import_batches
        DROP COLUMN IF EXISTS summary_date,
        DROP COLUMN IF EXISTS punch_in_values,
        DROP COLUMN IF EXISTS punch_out_values
    `);
    await queryRunner.query('ALTER TABLE attendance_import_batches DROP CONSTRAINT IF EXISTS attendance_import_batches_record_mode_check');
    await queryRunner.query('ALTER TABLE attendance_import_batches DROP COLUMN IF EXISTS record_mode');
  }
}
