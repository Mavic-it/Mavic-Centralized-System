import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RestoreAttendanceDtrWorkflow1792454400000 implements MigrationInterface {
  name = 'RestoreAttendanceDtrWorkflow1792454400000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE biometric_format_templates (
        id varchar(100) PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
        name varchar(100) NOT NULL, version integer NOT NULL DEFAULT 1 CHECK(version > 0),
        configuration jsonb NOT NULL, active boolean NOT NULL DEFAULT true,
        created_by varchar(100) NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(branch_id, name, version)
      );
      CREATE TABLE attendance_import_batches (
        id varchar(100) PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
        template_id varchar(100) REFERENCES biometric_format_templates(id), template_snapshot jsonb NOT NULL,
        filename varchar(255) NOT NULL, file_hash char(64) NOT NULL, file_data bytea NOT NULL,
        status varchar(20) NOT NULL DEFAULT 'PREVIEW' CHECK(status IN ('PREVIEW','COMMITTED')),
        dates jsonb NOT NULL, source_count integer NOT NULL CHECK(source_count > 0),
        uploaded_by varchar(100) NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
        committed_at timestamptz, UNIQUE(branch_id, file_hash)
      );
      CREATE TABLE attendance_source_rows (
        id varchar(100) PRIMARY KEY, batch_id varchar(100) NOT NULL REFERENCES attendance_import_batches(id),
        source_sheet varchar(255) NOT NULL, source_row integer NOT NULL CHECK(source_row > 0),
        normalized jsonb NOT NULL, UNIQUE(batch_id, source_sheet, source_row)
      );
      CREATE TABLE employee_biometric_mappings (
        branch_id varchar(100) NOT NULL REFERENCES branches(id), source_key varchar(1000) NOT NULL,
        employee_id varchar(100) NOT NULL REFERENCES employees(id), approved_by varchar(100) NOT NULL REFERENCES users(id),
        approved_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(branch_id, source_key)
      );
      CREATE TABLE attendance_dtr_settings (
        branch_id varchar(100) PRIMARY KEY REFERENCES branches(id), policy jsonb NOT NULL,
        holidays jsonb NOT NULL DEFAULT '{}', updated_by varchar(100) NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
      );
      ALTER TABLE attendance_records ADD COLUMN dtr_data jsonb;

      CREATE INDEX attendance_records_dtr_branch_date_idx ON attendance_records(branch_id, work_date) WHERE dtr_data IS NOT NULL;
      CREATE TABLE attendance_dtr_periods (
        id varchar(100) PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
        date_from date NOT NULL, date_to date NOT NULL CHECK(date_to >= date_from),
        state varchar(20) NOT NULL CHECK(state IN ('APPROVED','LOCKED','REOPENED')),
        revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
        actor_id varchar(100) NOT NULL REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(branch_id, date_from, date_to)
      );
      CREATE TABLE attendance_dtr_audit (
        id varchar(100) PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
        record_id varchar(100) REFERENCES attendance_records(id) ON DELETE RESTRICT,
        action varchar(40) NOT NULL, actor_id varchar(100) NOT NULL REFERENCES users(id), reason varchar(1000) NOT NULL,
        before_value jsonb, after_value jsonb, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX attendance_dtr_audit_record_idx ON attendance_dtr_audit(record_id, created_at);
      CREATE TABLE attendance_exports (
        id varchar(100) PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
        period_id varchar(100) NOT NULL REFERENCES attendance_dtr_periods(id), revision integer NOT NULL,
        format varchar(10) NOT NULL CHECK(format IN ('csv','xlsx')), file_hash char(64) NOT NULL,
        snapshot jsonb NOT NULL, generated_by varchar(100) NOT NULL REFERENCES users(id), generated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE FUNCTION attendance_source_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Original attendance sources are immutable'; END $$;
      CREATE TRIGGER attendance_source_immutable BEFORE UPDATE OR DELETE ON attendance_source_rows FOR EACH ROW EXECUTE FUNCTION attendance_source_immutable();
      CREATE FUNCTION attendance_batch_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.file_data IS DISTINCT FROM OLD.file_data OR NEW.file_hash IS DISTINCT FROM OLD.file_hash OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.filename IS DISTINCT FROM OLD.filename OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot THEN
          RAISE EXCEPTION 'Original attendance batch metadata is immutable';
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER attendance_batch_original_immutable BEFORE UPDATE ON attendance_import_batches FOR EACH ROW EXECUTE FUNCTION attendance_batch_original_immutable();
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      'Use a forward migration: retained attendance sources and audit records must not be deleted.',
    );
  }
}
