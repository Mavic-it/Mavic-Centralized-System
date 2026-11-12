import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';

export class TaskAutomation1794355200000 implements MigrationInterface {
  name = 'TaskAutomation1794355200000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE work_task_templates (
        id uuid PRIMARY KEY,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE RESTRICT,
        created_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT,
        name varchar(80) NOT NULL,
        title varchar(160) NOT NULL,
        description text NOT NULL,
        priority varchar(10) NOT NULL CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
        is_system boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT work_task_template_system_owner CHECK(NOT is_system OR (branch_id IS NULL AND created_by IS NULL))
      );
      CREATE UNIQUE INDEX work_task_template_branch_name
        ON work_task_templates(branch_id,lower(name)) WHERE branch_id IS NOT NULL;
      CREATE UNIQUE INDEX work_task_template_system_name
        ON work_task_templates(lower(name)) WHERE branch_id IS NULL;
      CREATE INDEX work_task_templates_branch ON work_task_templates(branch_id,name);

      INSERT INTO work_task_templates(id,branch_id,created_by,name,title,description,priority,is_system)
      VALUES
        ('17943552-0000-4000-8000-000000000001',NULL,NULL,'Daily office inspection','Daily office inspection','Inspect shared areas, check that doors and windows are secure, confirm supplies are stocked, and report any maintenance or safety issues.','NORMAL',true),
        ('17943552-0000-4000-8000-000000000002',NULL,NULL,'Room preparation','Room preparation','Prepare the room for its scheduled use. Check cleanliness, arrange furniture, test equipment, and confirm the room is ready.','NORMAL',true);

      CREATE TABLE work_task_series (
        id uuid PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        created_by varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        template_id uuid REFERENCES work_task_templates(id) ON DELETE SET NULL,
        title varchar(160) NOT NULL,
        description text NOT NULL,
        priority varchar(10) NOT NULL CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
        recurrence varchar(10) NOT NULL CHECK(recurrence IN ('DAILY','WEEKLY','MONTHLY')),
        anchor_day smallint NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
        due_offset integer NOT NULL CHECK(due_offset BETWEEN 0 AND 366),
        next_occurrence date NOT NULL,
        ends_on date NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        pause_reason varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CHECK(next_occurrence <= ends_on OR NOT is_active)
      );
      CREATE INDEX work_task_series_due ON work_task_series(next_occurrence,id) WHERE is_active;
      CREATE INDEX work_task_series_branch ON work_task_series(branch_id,is_active);

      CREATE TABLE work_task_series_assignees (
        series_id uuid NOT NULL REFERENCES work_task_series(id) ON DELETE RESTRICT,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(series_id,employee_id)
      );
      CREATE INDEX work_task_series_assignee_employee ON work_task_series_assignees(employee_id,series_id);

      ALTER TABLE work_tasks
        ADD COLUMN template_id uuid REFERENCES work_task_templates(id) ON DELETE SET NULL,
        ADD COLUMN series_id uuid REFERENCES work_task_series(id) ON DELETE RESTRICT,
        ADD COLUMN occurrence_date date,
        ADD CONSTRAINT work_tasks_occurrence_pair CHECK((series_id IS NULL)=(occurrence_date IS NULL));
      CREATE UNIQUE INDEX work_tasks_series_occurrence_once
        ON work_tasks(series_id,occurrence_date) WHERE series_id IS NOT NULL;
      CREATE INDEX work_tasks_series_scope ON work_tasks(series_id,occurrence_date DESC) WHERE series_id IS NOT NULL;
    `);
    await installRealtimeTriggers(r);
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve generated task, template and recurrence history with a forward migration.',
    );
  }
}
