import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairEmployeeProfiles1767000000000
  implements MigrationInterface
{
  name = 'RepairEmployeeProfiles1767000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_profiles (
        employee_id varchar(100) PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
        first_name varchar(100),
        middle_name varchar(100),
        last_name varchar(100),
        suffix varchar(30),
        preferred_name varchar(100),
        date_of_birth date,
        gender varchar(50),
        civil_status varchar(50),
        nationality varchar(100),
        personal_email varchar(320),
        current_address varchar(1000),
        permanent_address varchar(1000),
        job_level varchar(100),
        salary_grade varchar(100),
        basic_salary numeric(12, 2),
        work_schedule varchar(200),
        shift varchar(100),
        probationary boolean,
        regularization_date date,
        separation_date date,
        separation_reason varchar(1000),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_profiles_salary_check
          CHECK (basic_salary IS NULL OR basic_salary >= 0)
      )
    `);
  }

  async down(): Promise<void> {
    // Preserve employee profile data when reverting this schema repair.
  }
}
