import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';
export class TaskCollaboration1793318401000 implements MigrationInterface {
  name = 'TaskCollaboration1793318401000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE work_tasks ADD COLUMN start_date date;
   ALTER TABLE work_tasks DROP CONSTRAINT work_tasks_status_check;
   ALTER TABLE work_tasks ADD CONSTRAINT work_tasks_status_check CHECK(status IN ('TODO','STARTED','IN_PROGRESS','STUCK','FOR_REVIEW','COMPLETED','CANCELLED')),
     ADD CONSTRAINT work_tasks_dates_check CHECK(start_date IS NULL OR start_date<=due_date);
   CREATE TABLE work_task_assignees (
     task_id uuid NOT NULL REFERENCES work_tasks(id), employee_id varchar(100) NOT NULL REFERENCES employees(id),
     branch_id varchar(100) NOT NULL REFERENCES branches(id), created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY(task_id,employee_id)
   );
   INSERT INTO work_task_assignees(task_id,employee_id,branch_id,created_at) SELECT id,employee_id,branch_id,created_at FROM work_tasks;
   CREATE INDEX work_task_assignees_employee ON work_task_assignees(employee_id,task_id);
   CREATE TRIGGER work_task_assignees_immutable BEFORE UPDATE OR DELETE ON work_task_assignees FOR EACH ROW EXECUTE FUNCTION work_history_immutable();`);
    await installRealtimeTriggers(r);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve task collaboration history with a forward migration.',
    );
  }
}
