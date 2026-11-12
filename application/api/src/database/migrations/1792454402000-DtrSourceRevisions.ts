import type { MigrationInterface, QueryRunner } from 'typeorm';
export class DtrSourceRevisions1792454402000 implements MigrationInterface {
  name = 'DtrSourceRevisions1792454402000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      ALTER TABLE attendance_import_batches ADD COLUMN template_hash char(32);
      UPDATE attendance_import_batches SET template_hash=md5(template_snapshot::text);
      ALTER TABLE attendance_import_batches ALTER COLUMN template_hash SET NOT NULL;
      ALTER TABLE attendance_import_batches DROP CONSTRAINT attendance_import_batches_branch_id_file_hash_key;
      ALTER TABLE attendance_import_batches ADD CONSTRAINT attendance_import_source_revision_unique UNIQUE(branch_id,file_hash,template_hash);
      CREATE OR REPLACE FUNCTION attendance_batch_original_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (to_jsonb(NEW)-'status'-'committed_at') IS DISTINCT FROM (to_jsonb(OLD)-'status'-'committed_at') THEN
          RAISE EXCEPTION 'Original attendance batch metadata is immutable';
        END IF; RETURN NEW;
      END $$;
      CREATE OR REPLACE FUNCTION attendance_dtr_input_guard() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE doc jsonb; olddoc jsonb; bid text; eid text; lower_date date; upper_date date; stale_lower date;
      BEGIN
        doc := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
        IF TG_OP='UPDATE' THEN olddoc := to_jsonb(OLD); ELSE olddoc := doc; END IF;
        eid := CASE WHEN TG_TABLE_NAME='employees' THEN doc->>'id' ELSE doc->>'employee_id' END;
        lower_date := COALESCE(NULLIF(doc->>'work_date','')::date,NULLIF(doc->>'effective_date','')::date,NULLIF(doc->>'start_date','')::date,CURRENT_DATE);
        upper_date := COALESCE(NULLIF(doc->>'work_date','')::date,NULLIF(doc->>'end_date','')::date,'9999-12-31'::date);
        stale_lower := CASE WHEN TG_TABLE_NAME IN ('attendance_schedules','employees') THEN '0001-01-01'::date ELSE lower_date END;
        FOR bid IN SELECT DISTINCT value FROM jsonb_array_elements_text(jsonb_build_array(doc->>'branch_id',olddoc->>'branch_id')) WHERE value IS NOT NULL ORDER BY value LOOP
          PERFORM pg_advisory_xact_lock(hashtextextended('DTR:' || bid,0));
          IF EXISTS(SELECT 1 FROM attendance_dtr_periods p WHERE p.branch_id=bid AND p.state IN ('APPROVED','LOCKED') AND p.date_to >= lower_date AND p.date_from <= upper_date
            AND (eid IS NULL OR EXISTS(SELECT 1 FROM attendance_records a WHERE a.branch_id=bid AND a.employee_id=eid AND a.work_date BETWEEN p.date_from AND p.date_to))) THEN
            RAISE EXCEPTION 'Reopen affected protected DTR periods before changing attendance inputs' USING ERRCODE='23514';
          END IF;
          UPDATE attendance_records a SET dtr_stale=true WHERE a.branch_id=bid AND a.dtr_data IS NOT NULL AND (eid IS NULL OR a.employee_id=eid)
            AND a.work_date BETWEEN stale_lower AND upper_date
            AND NOT EXISTS(SELECT 1 FROM attendance_dtr_periods p WHERE p.branch_id=bid AND p.state IN ('APPROVED','LOCKED') AND a.work_date BETWEEN p.date_from AND p.date_to);
        END LOOP;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
      END $$;
    `);
  }
  async down(): Promise<void> {
    throw new Error('Use a forward migration to preserve source revisions.');
  }
}
