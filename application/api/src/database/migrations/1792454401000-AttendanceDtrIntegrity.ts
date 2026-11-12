import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AttendanceDtrIntegrity1792454401000 implements MigrationInterface {
  name = 'AttendanceDtrIntegrity1792454401000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS dtr_stale boolean NOT NULL DEFAULT false;
      CREATE FUNCTION attendance_dtr_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE doc jsonb; olddoc jsonb; bid text;
      BEGIN
        doc := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        IF TG_OP='UPDATE' THEN olddoc := to_jsonb(OLD); ELSE olddoc := doc; END IF;
        FOR bid IN SELECT DISTINCT value FROM jsonb_array_elements_text(jsonb_build_array(doc->>'branch_id',olddoc->>'branch_id')) WHERE value IS NOT NULL ORDER BY value LOOP
          PERFORM pg_advisory_xact_lock(hashtextextended('DTR:' || bid,0));
          IF EXISTS(SELECT 1 FROM attendance_dtr_periods WHERE branch_id=bid AND state IN ('APPROVED','LOCKED')) THEN
            RAISE EXCEPTION 'Reopen protected DTR periods before changing attendance inputs' USING ERRCODE='23514';
          END IF;
          UPDATE attendance_records SET dtr_stale=true WHERE branch_id=bid AND dtr_data IS NOT NULL;
        END LOOP;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER attendance_dtr_schedule_guard BEFORE INSERT OR UPDATE OR DELETE ON attendance_schedules FOR EACH ROW EXECUTE FUNCTION attendance_dtr_input_guard();
      CREATE TRIGGER attendance_dtr_employee_schedule_guard BEFORE INSERT OR UPDATE OR DELETE ON employee_work_schedule_history FOR EACH ROW EXECUTE FUNCTION attendance_dtr_input_guard();
      CREATE TRIGGER attendance_dtr_roster_guard BEFORE INSERT OR UPDATE OR DELETE ON employee_work_schedule_days FOR EACH ROW EXECUTE FUNCTION attendance_dtr_input_guard();
      CREATE TRIGGER attendance_dtr_leave_guard BEFORE UPDATE OF status ON leave_requests FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION attendance_dtr_input_guard();
      CREATE TRIGGER attendance_dtr_employee_guard BEFORE UPDATE OF branch_id,status,employment ON employees FOR EACH ROW WHEN (OLD.branch_id IS DISTINCT FROM NEW.branch_id OR OLD.status IS DISTINCT FROM NEW.status OR OLD.employment IS DISTINCT FROM NEW.employment) EXECUTE FUNCTION attendance_dtr_input_guard();
      CREATE FUNCTION attendance_dtr_legacy_edit_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS(SELECT 1 FROM attendance_records WHERE id=NEW.attendance_record_id AND dtr_data IS NOT NULL) THEN
          RAISE EXCEPTION 'Use audited DTR review for imported attendance' USING ERRCODE='23514';
        END IF; RETURN NEW;
      END $$;
      CREATE TRIGGER attendance_dtr_correction_guard BEFORE INSERT OR UPDATE ON attendance_corrections FOR EACH ROW EXECUTE FUNCTION attendance_dtr_legacy_edit_guard();
      CREATE TRIGGER attendance_dtr_ot_guard BEFORE INSERT OR UPDATE ON attendance_overtime_approvals FOR EACH ROW EXECUTE FUNCTION attendance_dtr_legacy_edit_guard();
    `);
  }
  async down(): Promise<void> {
    throw new Error(
      'Use a forward migration to preserve DTR integrity guards.',
    );
  }
}
