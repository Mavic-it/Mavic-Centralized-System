import type { MigrationInterface, QueryRunner } from 'typeorm';
export class SimpleLeaveV11792627202000 implements MigrationInterface {
  name = 'SimpleLeaveV11792627202000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE leave_types(id uuid PRIMARY KEY,code varchar(20) NOT NULL UNIQUE,name varchar(120) NOT NULL,description varchar(1000) NOT NULL DEFAULT '',active boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
  CREATE TABLE leave_type_versions(type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,version integer NOT NULL,policy jsonb NOT NULL,effective_from date NOT NULL,actor_id varchar(100) REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(type_id,version));
  CREATE INDEX leave_type_versions_date_idx ON leave_type_versions(type_id,effective_from DESC,version DESC);
  CREATE TABLE leave_type_assignments(employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,eligible boolean NOT NULL,sil_verified boolean NOT NULL DEFAULT false,reason varchar(500) NOT NULL,actor_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(employee_id,type_id));
  CREATE TABLE leave_requests(id uuid PRIMARY KEY,employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,credit_year integer NOT NULL CHECK(credit_year BETWEEN 2000 AND 2200),start_date date NOT NULL,end_date date NOT NULL,days numeric(8,2) NOT NULL CHECK(days>0 AND days*2=trunc(days*2)),half_day boolean NOT NULL DEFAULT false,reason varchar(1000) NOT NULL,status varchar(15) NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),policy jsonb NOT NULL,assigned_approver_id varchar(100) REFERENCES users(id) ON DELETE RESTRICT,submitted_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz,decided_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT,decision_comment varchar(1000),cancelled_at timestamptz,cancellation_reason varchar(1000),submission_key uuid NOT NULL UNIQUE,CHECK(end_date>=start_date AND extract(year from start_date)=credit_year AND extract(year from end_date)=credit_year),CHECK(NOT half_day OR (start_date=end_date AND days=0.5)));
  CREATE INDEX leave_requests_employee_year_idx ON leave_requests(employee_id,credit_year,type_id);
  CREATE INDEX leave_requests_queue_idx ON leave_requests(branch_id,status,start_date);
  CREATE TABLE leave_request_days(request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE RESTRICT,employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,work_date date NOT NULL,units numeric(3,2) NOT NULL CHECK(units IN (0.5,1)),PRIMARY KEY(request_id,work_date));
  CREATE INDEX leave_request_days_employee_idx ON leave_request_days(employee_id,work_date);
  CREATE TABLE leave_request_documents(request_id uuid PRIMARY KEY REFERENCES leave_requests(id) ON DELETE RESTRICT,file_name varchar(180) NOT NULL,mime_type varchar(80) NOT NULL,data bytea NOT NULL CHECK(octet_length(data)<=5242880));
  CREATE TABLE leave_credit_transactions(id uuid PRIMARY KEY,employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE RESTRICT,credit_year integer NOT NULL CHECK(credit_year BETWEEN 2000 AND 2200),kind varchar(15) NOT NULL CHECK(kind IN ('ALLOCATION','ADJUSTMENT','USAGE','RESTORATION')),signed_days numeric(9,2) NOT NULL CHECK(signed_days<>0 AND signed_days*2=trunc(signed_days*2)),source_key varchar(200) NOT NULL UNIQUE,request_id uuid REFERENCES leave_requests(id) ON DELETE RESTRICT,policy_version integer,reason varchar(1000) NOT NULL,actor_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
  CREATE INDEX leave_credit_employee_year_idx ON leave_credit_transactions(employee_id,credit_year,type_id);
  CREATE TABLE leave_request_events(id uuid PRIMARY KEY,request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE RESTRICT,actor_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,action varchar(20) NOT NULL,comment varchar(1000),created_at timestamptz NOT NULL DEFAULT now());
  CREATE INDEX leave_request_events_history_idx ON leave_request_events(request_id,created_at);
  CREATE FUNCTION protect_leave_credit_history() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Leave credit history is immutable; post a correction.'; END $$;
  CREATE TRIGGER leave_credit_immutable BEFORE UPDATE OR DELETE ON leave_credit_transactions FOR EACH ROW EXECUTE FUNCTION protect_leave_credit_history();`);
    const examples = [
      ['VL', 'Vacation Leave', 10, true, 'ACTIVE'],
      ['SL', 'Sick Leave', 5, true, 'ACTIVE'],
      ['SIL', 'Service Incentive Leave', 5, true, 'ASSIGNED'],
      ['EL', 'Emergency Leave', 3, true, 'ACTIVE'],
      ['LWOP', 'Leave Without Pay', 0, false, 'ACTIVE'],
    ];
    for (const [code, name, annualDays, paid, eligibility] of examples) {
      const [{ id }] = await r.manager.query<Array<{ id: string }>>(
        'INSERT INTO leave_types(id,code,name) VALUES(gen_random_uuid(),$1,$2) RETURNING id',
        [code, name],
      );
      await r.query(
        `INSERT INTO leave_type_versions(type_id,version,effective_from,policy) VALUES($1,1,CURRENT_DATE,$2::jsonb)`,
        [
          id,
          JSON.stringify({
            annualDays,
            paid,
            eligibility,
            frequency: paid ? 'ANNUAL' : 'MANUAL',
            halfDay: false,
            attachmentRule: 'OPTIONAL',
            automaticAllocation: false,
            blockInsufficient: true,
            minimumServiceMonths: 0,
            employmentTypes: [],
            branchId: null,
            allowApprovedCancellation: false,
            carryover: 'NONE',
          }),
        ],
      );
    }
  }
  down(): Promise<void> {
    throw new Error(
      'Restore a reviewed backup to reverse the leave schema; do not discard leave history.',
    );
  }
}
