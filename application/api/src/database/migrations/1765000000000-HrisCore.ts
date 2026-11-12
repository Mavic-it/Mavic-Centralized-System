import type { MigrationInterface, QueryRunner } from 'typeorm';

export class HrisCore1765000000000 implements MigrationInterface {
  name = 'HrisCore1765000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_profiles (
        employee_id varchar(100) PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
        first_name varchar(100),
        middle_name varchar(100),
        last_name varchar(100),
        suffix varchar(30),
        preferred_name varchar(100),
        date_of_birth date,
        gender varchar(50),
        civil_status varchar(50),
        nationality varchar(100),
        personal_email varchar(320),
        current_address varchar(1000),
        permanent_address varchar(1000),
        job_level varchar(100),
        salary_grade varchar(100),
        basic_salary numeric(12, 2),
        work_schedule varchar(200),
        shift varchar(100),
        probationary boolean,
        regularization_date date,
        separation_date date,
        separation_reason varchar(1000),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_profiles_salary_check
          CHECK (basic_salary IS NULL OR basic_salary >= 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_schedules (
        branch_id varchar(100) PRIMARY KEY REFERENCES branches(id) ON DELETE CASCADE,
        time_zone varchar(100) NOT NULL,
        work_days smallint[] NOT NULL,
        shift_start time NOT NULL,
        shift_end time NOT NULL,
        break_minutes integer NOT NULL DEFAULT 0,
        grace_minutes integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_schedules_work_days_check
          CHECK (cardinality(work_days) BETWEEN 1 AND 7),
        CONSTRAINT attendance_schedules_shift_check
          CHECK (shift_end <> shift_start),
        CONSTRAINT attendance_schedules_break_check
          CHECK (break_minutes BETWEEN 0 AND 720),
        CONSTRAINT attendance_schedules_grace_check
          CHECK (grace_minutes BETWEEN 0 AND 240)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        work_date date NOT NULL,
        time_in timestamptz,
        time_out timestamptz,
        scheduled_start time,
        scheduled_end time,
        schedule_break_minutes integer,
        schedule_grace_minutes integer,
        schedule_time_zone varchar(100),
        source varchar(20) NOT NULL DEFAULT 'MANUAL',
        status varchar(20) NOT NULL DEFAULT 'RECORDED',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT attendance_records_source_check
          CHECK (source IN ('MANUAL', 'BIOMETRIC', 'IMPORT', 'API')),
        CONSTRAINT attendance_records_status_check
          CHECK (status IN ('RECORDED', 'CORRECTED', 'ABSENT', 'HOLIDAY', 'REST_DAY', 'WORK_FROM_HOME')),
        CONSTRAINT attendance_records_time_check
          CHECK (time_out IS NULL OR time_in IS NULL OR time_out >= time_in),
        CONSTRAINT attendance_records_employee_date_unique
          UNIQUE (employee_id, work_date)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_documents (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        document_type varchar(100) NOT NULL,
        file_name varchar(255) NOT NULL,
        file_size_bytes bigint,
        uploaded_by varchar(100) NOT NULL REFERENCES users(id),
        expiration_date date,
        status varchar(20) NOT NULL DEFAULT 'ACTIVE',
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_documents_size_check
          CHECK (file_size_bytes IS NULL OR file_size_bytes BETWEEN 0 AND 52428800),
        CONSTRAINT employee_documents_status_check
          CHECK (status IN ('ACTIVE', 'EXPIRED', 'ARCHIVED')),
        CONSTRAINT employee_documents_version_check CHECK (version > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_records_branch_date_idx
      ON attendance_records(branch_id, work_date DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS attendance_records_employee_date_idx
      ON attendance_records(employee_id, work_date DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_documents_employee_created_idx
      ON employee_documents(employee_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_documents_expiration_idx
      ON employee_documents(expiration_date)
      WHERE expiration_date IS NOT NULL AND status = 'ACTIVE'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS employee_documents');
    await queryRunner.query('DROP TABLE IF EXISTS attendance_records');
    await queryRunner.query('DROP TABLE IF EXISTS attendance_schedules');
    await queryRunner.query('DROP TABLE IF EXISTS employee_profiles');
  }
}
