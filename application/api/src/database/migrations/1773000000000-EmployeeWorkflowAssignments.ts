import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeWorkflowAssignments1773000000000 implements MigrationInterface {
  name = 'EmployeeWorkflowAssignments1773000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS manager_employee_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employees_manager_employee_id_fkey'
        ) THEN
          ALTER TABLE employees
            ADD CONSTRAINT employees_manager_employee_id_fkey
            FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employees_manager_employee_id_idx
      ON employees (manager_employee_id)
    `);
    await queryRunner.query(`
      WITH supervisor_matches AS (
        SELECT e.id AS employee_id, min(s.id) AS supervisor_id
        FROM employees e
        JOIN employees s
          ON s.branch_id = e.branch_id
         AND lower(trim(s.name)) = lower(trim(e.manager_name))
         AND s.id <> e.id
         AND s.status = 'ACTIVE'
        WHERE e.manager_employee_id IS NULL
          AND NULLIF(trim(e.manager_name), '') IS NOT NULL
        GROUP BY e.id
        HAVING count(*) = 1
      )
      UPDATE employees e
      SET manager_employee_id = match.supervisor_id
      FROM supervisor_matches match
      WHERE e.id = match.employee_id
    `);
    await queryRunner.query(`
      ALTER TABLE employee_assignment_history
        ADD COLUMN IF NOT EXISTS manager_employee_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employee_assignment_history_manager_employee_id_fkey'
        ) THEN
          ALTER TABLE employee_assignment_history
            ADD CONSTRAINT employee_assignment_history_manager_employee_id_fkey
            FOREIGN KEY (manager_employee_id) REFERENCES employees(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      WITH supervisor_matches AS (
        SELECT h.id AS history_id, min(s.id) AS supervisor_id
        FROM employee_assignment_history h
        JOIN employees s
          ON s.branch_id = h.branch_id
         AND lower(trim(s.name)) = lower(trim(h.manager_name))
         AND s.id <> h.employee_id
        WHERE h.manager_employee_id IS NULL
          AND NULLIF(trim(h.manager_name), '') IS NOT NULL
        GROUP BY h.id
        HAVING count(*) = 1
      )
      UPDATE employee_assignment_history h
      SET manager_employee_id = match.supervisor_id
      FROM supervisor_matches match
      WHERE h.id = match.history_id
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_work_schedule_history (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        effective_date date NOT NULL,
        time_zone varchar(100) NOT NULL,
        work_days smallint[] NOT NULL,
        shift_start time NOT NULL,
        shift_end time NOT NULL,
        break_minutes integer NOT NULL DEFAULT 0,
        grace_minutes integer NOT NULL DEFAULT 0,
        assigned_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_work_schedule_history_days_check
          CHECK (cardinality(work_days) BETWEEN 1 AND 7),
        CONSTRAINT employee_work_schedule_history_shift_check
          CHECK (shift_end <> shift_start),
        CONSTRAINT employee_work_schedule_history_break_check
          CHECK (break_minutes BETWEEN 0 AND 720),
        CONSTRAINT employee_work_schedule_history_grace_check
          CHECK (grace_minutes BETWEEN 0 AND 240)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_work_schedule_history_effective_idx
      ON employee_work_schedule_history
        (employee_id, branch_id, effective_date DESC, recorded_at DESC)
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_document_requirements (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name varchar(150) NOT NULL,
        category varchar(30) NOT NULL,
        is_required boolean NOT NULL DEFAULT true,
        is_active boolean NOT NULL DEFAULT true,
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_document_requirements_category_check
          CHECK (category IN ('GOVERNMENT_ID', 'CONTRACT_RECORD'))
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS employee_document_requirements_active_name_uidx
      ON employee_document_requirements (branch_id, lower(trim(name)))
      WHERE is_active = true
    `);
    await queryRunner.query(`
      ALTER TABLE employee_documents
        ADD COLUMN IF NOT EXISTS requirement_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employee_documents_requirement_id_fkey'
        ) THEN
          ALTER TABLE employee_documents
            ADD CONSTRAINT employee_documents_requirement_id_fkey
            FOREIGN KEY (requirement_id)
            REFERENCES employee_document_requirements(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_documents_requirement_version_idx
      ON employee_documents (employee_id, requirement_id, version DESC, created_at DESC)
    `);
  }

  async down(): Promise<void> {
    // Preserve assignments, document requirements, and uploaded files on rollback.
  }
}
