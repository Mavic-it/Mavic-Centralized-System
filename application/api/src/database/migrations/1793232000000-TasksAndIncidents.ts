import type { MigrationInterface, QueryRunner } from 'typeorm';
import { installRealtimeTriggers } from '../../realtime/install-triggers.js';

export class TasksAndIncidents1793232000000 implements MigrationInterface {
  name = 'TasksAndIncidents1793232000000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE work_tasks (
      id uuid PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
      employee_id varchar(100) NOT NULL REFERENCES employees(id),
      created_by varchar(100) NOT NULL REFERENCES users(id),
      title varchar(160) NOT NULL, description text NOT NULL,
      priority varchar(10) NOT NULL CHECK(priority IN ('LOW','NORMAL','HIGH','URGENT')),
      due_date date NOT NULL, status varchar(30) NOT NULL DEFAULT 'TODO'
        CHECK(status IN ('TODO','IN_PROGRESS','FOR_REVIEW','COMPLETED','CANCELLED')),
      progress integer NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX work_tasks_scope ON work_tasks(branch_id, employee_id, created_at DESC);
    CREATE TABLE workplace_incidents (
      id uuid PRIMARY KEY, branch_id varchar(100) NOT NULL REFERENCES branches(id),
      employee_id varchar(100) REFERENCES employees(id), reporter_id varchar(100) NOT NULL REFERENCES users(id),
      reviewer_id varchar(100) REFERENCES users(id), title varchar(160) NOT NULL,
      description text NOT NULL, category varchar(40) NOT NULL,
      incident_date date NOT NULL, status varchar(30) NOT NULL DEFAULT 'SUBMITTED'
        CHECK(status IN ('SUBMITTED','UNDER_REVIEW','DETAILS_REQUESTED','DISCIPLINARY_REVIEW','NOTICE_ISSUED','AWAITING_RESPONSE','DECISION_PENDING','CLOSED')),
      version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX workplace_incidents_scope ON workplace_incidents(branch_id, reporter_id, employee_id, created_at DESC);
    CREATE TABLE work_events (
      id uuid PRIMARY KEY, sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE, task_id uuid REFERENCES work_tasks(id), incident_id uuid REFERENCES workplace_incidents(id),
      actor_id varchar(100) NOT NULL REFERENCES users(id), action varchar(40) NOT NULL,
      audience varchar(20) NOT NULL CHECK(audience IN ('PARTICIPANTS','INTERNAL','REPORTER','SUBJECT')),
      message text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((task_id IS NOT NULL)::int + (incident_id IS NOT NULL)::int = 1)
    );
    CREATE INDEX work_events_task ON work_events(task_id, created_at);
    CREATE INDEX work_events_incident ON work_events(incident_id, created_at);
    CREATE TABLE work_attachments (
      id uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES work_events(id),
      filename varchar(200) NOT NULL, mime varchar(50) NOT NULL CHECK(mime IN ('application/pdf','image/png','image/jpeg')),
      content bytea NOT NULL CHECK(octet_length(content) BETWEEN 1 AND 5242880)
    );
    CREATE FUNCTION work_history_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'Work history and evidence are append-only'; END $$;
    CREATE TRIGGER work_events_immutable BEFORE UPDATE OR DELETE ON work_events FOR EACH ROW EXECUTE FUNCTION work_history_immutable();
    CREATE TRIGGER work_attachments_immutable BEFORE UPDATE OR DELETE ON work_attachments FOR EACH ROW EXECUTE FUNCTION work_history_immutable();`);
    await installRealtimeTriggers(r);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve task, incident and evidence history with a forward migration.',
    );
  }
}
