import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveManagementWorkflow1782000000000 implements MigrationInterface {
  name = 'LeaveManagementWorkflow1782000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_policies (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) REFERENCES branches(id) ON DELETE CASCADE,
        leave_type varchar(30) NOT NULL,
        name varchar(150) NOT NULL,
        paid boolean NOT NULL DEFAULT true,
        annual_entitlement numeric(8, 2) NOT NULL DEFAULT 0,
        minimum_service_months integer NOT NULL DEFAULT 0,
        requires_hr_approval boolean NOT NULL DEFAULT true,
        count_non_working_days boolean NOT NULL DEFAULT false,
        effective_from date NOT NULL,
        effective_to date,
        active boolean NOT NULL DEFAULT true,
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        updated_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT leave_policies_type_check
          CHECK (leave_type IN ('VACATION', 'SICK', 'SIL', 'EMERGENCY', 'UNPAID')),
        CONSTRAINT leave_policies_entitlement_check CHECK (annual_entitlement >= 0),
        CONSTRAINT leave_policies_service_months_check CHECK (minimum_service_months >= 0),
        CONSTRAINT leave_policies_effective_range_check
          CHECK (effective_to IS NULL OR effective_to >= effective_from),
        CONSTRAINT leave_policies_sil_minimum_check
          CHECK (leave_type <> 'SIL' OR (paid = true AND annual_entitlement >= 5 AND minimum_service_months >= 12))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS leave_policies_scope_idx
      ON leave_policies (branch_id, leave_type, effective_from DESC)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_policies_global_effective_uidx
      ON leave_policies (leave_type, effective_from)
      WHERE branch_id IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS leave_policies_branch_effective_uidx
      ON leave_policies (branch_id, leave_type, effective_from)
      WHERE branch_id IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE leave_requests
        ADD COLUMN IF NOT EXISTS policy_id varchar(100),
        ADD COLUMN IF NOT EXISTS requested_days numeric(8, 2),
        ADD COLUMN IF NOT EXISTS paid_snapshot boolean,
        ADD COLUMN IF NOT EXISTS requires_hr_approval_snapshot boolean
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'leave_requests_policy_id_fkey'
        ) THEN
          ALTER TABLE leave_requests
            ADD CONSTRAINT leave_requests_policy_id_fkey
            FOREIGN KEY (policy_id) REFERENCES leave_policies(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE leave_requests
      SET type = 'VACATION'
      WHERE type = 'ANNUAL'
    `);
    await queryRunner.query(`
      UPDATE leave_requests
      SET requested_days = (end_date - start_date + 1)::numeric,
          paid_snapshot = (type <> 'UNPAID'),
          requires_hr_approval_snapshot = true
      WHERE requested_days IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE leave_requests
        ALTER COLUMN requested_days SET NOT NULL,
        ALTER COLUMN paid_snapshot SET NOT NULL,
        ALTER COLUMN paid_snapshot SET DEFAULT true,
        ALTER COLUMN requires_hr_approval_snapshot SET NOT NULL,
        ALTER COLUMN requires_hr_approval_snapshot SET DEFAULT true
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'leave_requests_requested_days_check'
        ) THEN
          ALTER TABLE leave_requests
            ADD CONSTRAINT leave_requests_requested_days_check
            CHECK (requested_days > 0);
        END IF;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_credit_ledger (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        leave_type varchar(30) NOT NULL,
        entry_type varchar(20) NOT NULL,
        days numeric(8, 2) NOT NULL,
        effective_date date NOT NULL,
        reason varchar(500) NOT NULL,
        source_key varchar(200) UNIQUE,
        source_request_id varchar(100) REFERENCES leave_requests(id) ON DELETE SET NULL,
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT leave_credit_ledger_type_check
          CHECK (leave_type IN ('VACATION', 'SICK', 'SIL', 'EMERGENCY')),
        CONSTRAINT leave_credit_ledger_entry_type_check
          CHECK (entry_type IN ('EARNED', 'USED', 'ADJUSTED', 'EXPIRED', 'COMMUTED')),
        CONSTRAINT leave_credit_ledger_days_check
          CHECK ((entry_type = 'ADJUSTED' AND days <> 0) OR (entry_type <> 'ADJUSTED' AND days > 0))
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS leave_credit_ledger_employee_type_date_idx
      ON leave_credit_ledger (employee_id, leave_type, effective_date DESC, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS leave_credit_ledger_branch_date_idx
      ON leave_credit_ledger (branch_id, effective_date DESC)
    `);

    await queryRunner.query(`
      INSERT INTO leave_credit_ledger
        (id, employee_id, branch_id, leave_type, entry_type, days,
         effective_date, reason, source_key)
      SELECT md5(e.id || ':legacy-opening:' || balances.leave_type),
             e.id, e.branch_id, balances.leave_type, 'ADJUSTED', balances.days,
             CURRENT_DATE, 'Opening balance migrated from the legacy employee leave balance.',
             'legacy-opening:' || e.id || ':' || balances.leave_type
      FROM employees e
      CROSS JOIN LATERAL (
        VALUES
          ('VACATION'::varchar, CASE WHEN e.employment #>> '{leaveBalance,annual}' ~ '^\\d+(\\.\\d+)?$'
            THEN (e.employment #>> '{leaveBalance,annual}')::numeric ELSE 0 END),
          ('SICK'::varchar, CASE WHEN e.employment #>> '{leaveBalance,sick}' ~ '^\\d+(\\.\\d+)?$'
            THEN (e.employment #>> '{leaveBalance,sick}')::numeric ELSE 0 END),
          ('EMERGENCY'::varchar, CASE WHEN e.employment #>> '{leaveBalance,emergency}' ~ '^\\d+(\\.\\d+)?$'
            THEN (e.employment #>> '{leaveBalance,emergency}')::numeric ELSE 0 END)
      ) AS balances(leave_type, days)
      WHERE balances.days > 0
      ON CONFLICT (source_key) DO NOTHING
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_sil_eligibility (
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        status varchar(20) NOT NULL,
        reason_code varchar(50),
        notes varchar(1000),
        service_tenure_verified boolean NOT NULL DEFAULT false,
        effective_date date NOT NULL,
        verified_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        verified_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (employee_id, effective_date),
        CONSTRAINT leave_sil_eligibility_status_check
          CHECK (status IN ('ELIGIBLE', 'EXEMPT')),
        CONSTRAINT leave_sil_eligibility_reason_check
          CHECK (reason_code IS NULL OR reason_code IN (
            'GOVERNMENT_EMPLOYEE', 'PERSONAL_SERVICE', 'MANAGERIAL_EMPLOYEE',
            'MANAGERIAL_STAFF', 'FIELD_PERSONNEL_UNSUPERVISED', 'ALREADY_HAS_SIL',
            'PAID_VACATION_AT_LEAST_5', 'ESTABLISHMENT_UNDER_10',
            'DOLE_EXEMPTION', 'OTHER'
          )),
        CONSTRAINT leave_sil_eligibility_exempt_reason_check
          CHECK (status <> 'EXEMPT' OR reason_code IS NOT NULL),
        CONSTRAINT leave_sil_eligibility_service_check
          CHECK (status <> 'ELIGIBLE' OR service_tenure_verified = true)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS leave_request_days (
        id varchar(100) PRIMARY KEY,
        request_id varchar(100) NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        leave_type varchar(30) NOT NULL,
        work_date date NOT NULL,
        is_workday boolean NOT NULL,
        units numeric(4, 2) NOT NULL,
        paid boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT leave_request_days_type_check
          CHECK (leave_type IN ('VACATION', 'SICK', 'SIL', 'EMERGENCY', 'UNPAID')),
        CONSTRAINT leave_request_days_units_check CHECK (units >= 0),
        CONSTRAINT leave_request_days_request_date_unique UNIQUE (request_id, work_date)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS leave_request_days_employee_date_idx
      ON leave_request_days (employee_id, work_date DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS leave_request_days_branch_date_idx
      ON leave_request_days (branch_id, work_date DESC)
    `);
    await queryRunner.query(`
      WITH dates AS (
        SELECT l.id AS request_id, l.employee_id, l.branch_id, l.type,
               l.paid_snapshot, COALESCE(p.count_non_working_days, false) AS count_non_working_days,
               d.work_date::date AS work_date
        FROM leave_requests l
        LEFT JOIN leave_policies p ON p.id = l.policy_id
        CROSS JOIN LATERAL generate_series(l.start_date, l.end_date, interval '1 day') AS d(work_date)
      ), scheduled AS (
        SELECT d.*,
               CASE WHEN daily.day_type IS NOT NULL THEN daily.day_type = 'WORK'
                    ELSE EXTRACT(DOW FROM d.work_date)::smallint = ANY(
                      COALESCE(employee_schedule.work_days, branch_schedule.work_days,
                               ARRAY[1, 2, 3, 4, 5]::smallint[])
                    ) END AS is_workday
        FROM dates d
        LEFT JOIN attendance_schedules branch_schedule ON branch_schedule.branch_id = d.branch_id
        LEFT JOIN LATERAL (
          SELECT h.work_days
          FROM employee_work_schedule_history h
          WHERE h.employee_id = d.employee_id AND h.branch_id = d.branch_id
            AND h.effective_date <= d.work_date
          ORDER BY h.effective_date DESC, h.recorded_at DESC
          LIMIT 1
        ) employee_schedule ON true
        LEFT JOIN employee_work_schedule_days daily
          ON daily.employee_id = d.employee_id AND daily.branch_id = d.branch_id
         AND daily.work_date = d.work_date
      )
      INSERT INTO leave_request_days
        (id, request_id, employee_id, branch_id, leave_type, work_date,
         is_workday, units, paid)
      SELECT md5(s.request_id || ':' || s.work_date::text), s.request_id,
             s.employee_id, s.branch_id, s.type, s.work_date, s.is_workday,
             CASE WHEN s.count_non_working_days OR s.is_workday THEN 1 ELSE 0 END,
             s.paid_snapshot
      FROM scheduled s
      ON CONFLICT (request_id, work_date) DO NOTHING
    `);
    await queryRunner.query(`
      UPDATE leave_requests l
      SET requested_days = totals.days
      FROM (
        SELECT request_id, SUM(units) AS days
        FROM leave_request_days
        GROUP BY request_id
      ) totals
      WHERE l.id = totals.request_id
        AND l.status IN ('PENDING_MANAGER', 'PENDING_HR')
        AND totals.days > 0
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS leave_request_days');
    await queryRunner.query('DROP TABLE IF EXISTS leave_sil_eligibility');
    await queryRunner.query('DROP TABLE IF EXISTS leave_credit_ledger');
    await queryRunner.query(`
      ALTER TABLE leave_requests
        DROP CONSTRAINT IF EXISTS leave_requests_requested_days_check,
        DROP CONSTRAINT IF EXISTS leave_requests_policy_id_fkey,
        DROP COLUMN IF EXISTS requires_hr_approval_snapshot,
        DROP COLUMN IF EXISTS paid_snapshot,
        DROP COLUMN IF EXISTS requested_days,
        DROP COLUMN IF EXISTS policy_id
    `);
    await queryRunner.query('DROP TABLE IF EXISTS leave_policies');
  }
}
