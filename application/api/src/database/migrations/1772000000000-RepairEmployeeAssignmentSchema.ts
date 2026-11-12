import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repairs databases where the original assignment-history migration was
 * recorded as complete before all of its schema changes were present.
 */
export class RepairEmployeeAssignmentSchema1772000000000
  implements MigrationInterface
{
  name = 'RepairEmployeeAssignmentSchema1772000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE employees ADD COLUMN IF NOT EXISTS manager_name varchar(200)',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_positions (
        id varchar(100) PRIMARY KEY,
        name varchar(150) NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS employee_positions_name_lower_uidx
      ON employee_positions (lower(name))
    `);
    await queryRunner.query(`
      INSERT INTO employee_positions (id, name)
      SELECT md5('position:' || lower(trim(position))), min(trim(position))
      FROM employees
      WHERE trim(position) <> ''
      GROUP BY lower(trim(position))
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      ALTER TABLE employees
        ADD COLUMN IF NOT EXISTS department_id varchar(100),
        ADD COLUMN IF NOT EXISTS position_id varchar(100)
    `);
    await queryRunner.query(`
      UPDATE employees e SET department_id = d.id
      FROM departments d
      WHERE d.branch_id = e.branch_id
        AND lower(trim(d.name)) = lower(trim(e.department))
        AND e.department_id IS NULL
    `);
    await queryRunner.query(`
      UPDATE employees e SET position_id = p.id
      FROM employee_positions p
      WHERE lower(trim(p.name)) = lower(trim(e.position))
        AND e.position_id IS NULL
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employees_department_id_fkey'
        ) THEN
          ALTER TABLE employees ADD CONSTRAINT employees_department_id_fkey
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employees_position_id_fkey'
        ) THEN
          ALTER TABLE employees ADD CONSTRAINT employees_position_id_fkey
            FOREIGN KEY (position_id) REFERENCES employee_positions(id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_assignment_history (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        branch_name varchar(200) NOT NULL,
        department_id varchar(100) REFERENCES departments(id) ON DELETE RESTRICT,
        department varchar(150) NOT NULL,
        position_id varchar(100) REFERENCES employee_positions(id) ON DELETE RESTRICT,
        position varchar(150) NOT NULL,
        manager_name varchar(200),
        employment_type varchar(30),
        employee_status varchar(20) NOT NULL,
        event_type varchar(30) NOT NULL,
        effective_date date,
        changed_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        recorded_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_assignment_history_type_check
          CHECK (employment_type IS NULL OR employment_type IN ('FULL_TIME', 'PART_TIME', 'CONTRACT')),
        CONSTRAINT employee_assignment_history_event_check
          CHECK (event_type IN ('INITIAL', 'TRANSFER', 'PROMOTION', 'STATUS_CHANGE', 'ASSIGNMENT_CHANGE'))
      )
    `);
    await queryRunner.query(`
      ALTER TABLE employee_assignment_history
        ADD COLUMN IF NOT EXISTS department_id varchar(100),
        ADD COLUMN IF NOT EXISTS position_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employee_assignment_history_department_id_fkey'
        ) THEN
          ALTER TABLE employee_assignment_history
            ADD CONSTRAINT employee_assignment_history_department_id_fkey
            FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'employee_assignment_history_position_id_fkey'
        ) THEN
          ALTER TABLE employee_assignment_history
            ADD CONSTRAINT employee_assignment_history_position_id_fkey
            FOREIGN KEY (position_id) REFERENCES employee_positions(id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_assignment_history_employee_effective_idx
      ON employee_assignment_history (employee_id, effective_date DESC, recorded_at DESC)
    `);
    await queryRunner.query(`
      INSERT INTO employee_assignment_history
        (id, employee_id, branch_id, branch_name, department_id, department,
         position_id, position, manager_name, employment_type, employee_status,
         event_type, effective_date, changed_by, recorded_at)
      SELECT md5('initial-assignment:' || e.id), e.id, b.id, b.name,
             e.department_id, e.department, e.position_id, e.position,
             e.manager_name,
             CASE WHEN e.employment->>'employeeType' IN ('FULL_TIME', 'PART_TIME', 'CONTRACT')
               THEN e.employment->>'employeeType' ELSE NULL END,
             e.status, 'INITIAL', NULL, NULL, now()
      FROM employees e
      JOIN branches b ON b.id = e.branch_id
      WHERE NOT EXISTS (
        SELECT 1 FROM employee_assignment_history h
        WHERE h.employee_id = e.id
      )
    `);
  }

  async down(): Promise<void> {
    // Keep the repaired assignment schema and history data during rollback.
  }
}
