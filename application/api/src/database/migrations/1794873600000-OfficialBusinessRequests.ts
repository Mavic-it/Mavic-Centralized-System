import type { MigrationInterface, QueryRunner } from 'typeorm';
export class OfficialBusinessRequests1794873600000 implements MigrationInterface {
  name = 'OfficialBusinessRequests1794873600000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE attendance_ob_requests (
      id uuid PRIMARY KEY, employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
      branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      filed_by varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      work_date date NOT NULL, starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
      time_zone varchar(100) NOT NULL, destination varchar(200) NOT NULL,
      destination_branch_id varchar(100) REFERENCES branches(id) ON DELETE RESTRICT,
      reason varchar(2000) NOT NULL, retrospective_reason varchar(1000) NOT NULL DEFAULT '',
      status varchar(15) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
      version integer NOT NULL DEFAULT 1, schedule jsonb NOT NULL,
      office_continuity boolean NOT NULL DEFAULT false,
      decided_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT, decided_at timestamptz,
      cancellation_pending boolean NOT NULL DEFAULT false, submission_key uuid NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '36 hours')
    );
    CREATE INDEX attendance_ob_queue ON attendance_ob_requests(branch_id,status,work_date);
    CREATE INDEX attendance_ob_employee ON attendance_ob_requests(employee_id,work_date,status);
    CREATE TABLE attendance_ob_events (
      id uuid PRIMARY KEY, request_id uuid NOT NULL REFERENCES attendance_ob_requests(id) ON DELETE RESTRICT,
      actor_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action varchar(40) NOT NULL, comment varchar(2000) NOT NULL DEFAULT '',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE FUNCTION protect_ob_event_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'OB event history is immutable'; END $$;
    CREATE TRIGGER attendance_ob_event_immutable BEFORE UPDATE OR DELETE ON attendance_ob_events FOR EACH ROW EXECUTE FUNCTION protect_ob_event_history();`);
  }
  down(): Promise<void> {
    throw new Error(
      'Preserve OB history; reverse through a reviewed forward migration.',
    );
  }
}
