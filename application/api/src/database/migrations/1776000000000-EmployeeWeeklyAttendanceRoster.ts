import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeWeeklyAttendanceRoster1776000000000 implements MigrationInterface {
  name = 'EmployeeWeeklyAttendanceRoster1776000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_work_schedule_days (
        id varchar(100) PRIMARY KEY,
        employee_id varchar(100) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        work_date date NOT NULL,
        day_type varchar(20) NOT NULL,
        shift_start time,
        shift_end time,
        assignment_label varchar(100),
        created_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        updated_by varchar(100) REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_work_schedule_days_type_check
          CHECK (day_type IN ('WORK', 'REST_DAY')),
        CONSTRAINT employee_work_schedule_days_shift_check
          CHECK (
            (shift_start IS NULL AND shift_end IS NULL) OR
            (shift_start IS NOT NULL AND shift_end IS NOT NULL AND shift_start <> shift_end)
          ),
        CONSTRAINT employee_work_schedule_days_rest_check
          CHECK (day_type <> 'REST_DAY' OR shift_start IS NULL),
        CONSTRAINT employee_work_schedule_days_employee_date_unique
          UNIQUE (employee_id, work_date)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS employee_work_schedule_days_branch_week_idx
      ON employee_work_schedule_days (branch_id, work_date, employee_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS employee_work_schedule_days');
  }
}
