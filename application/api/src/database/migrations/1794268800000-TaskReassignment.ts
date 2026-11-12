import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskReassignment1794268800000 implements MigrationInterface {
  name = 'TaskReassignment1794268800000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE OR REPLACE FUNCTION guard_work_task_assignee_reassignment()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF current_setting('app.work_task_reassignment', true) IS DISTINCT FROM 'on' THEN
          RAISE EXCEPTION 'Task assignees may only be changed through the authorized reassignment flow';
        END IF;
        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END $$;

      DROP TRIGGER IF EXISTS work_task_assignees_immutable ON work_task_assignees;
      CREATE TRIGGER work_task_assignees_reassignment_guard
        BEFORE UPDATE OR DELETE ON work_task_assignees
        FOR EACH ROW EXECUTE FUNCTION guard_work_task_assignee_reassignment();
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve task assignment history and reassignments with a forward migration.',
    );
  }
}
