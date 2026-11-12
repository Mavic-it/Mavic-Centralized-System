import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeEmploymentDefaults1794528000000 implements MigrationInterface {
  name = 'EmployeeEmploymentDefaults1794528000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE employee_assignment_history
      DROP CONSTRAINT IF EXISTS employee_assignment_history_type_check`);
    await queryRunner.query(`ALTER TABLE employee_assignment_history
      ADD CONSTRAINT employee_assignment_history_type_check CHECK (
        employment_type IS NULL OR employment_type IN (
          'FULL_TIME', 'PART_TIME', 'CONTRACT', 'PROBATIONARY', 'REGULAR', 'PROJECT_BASED', 'CONTRACTUAL'
        )
      )`);
    await queryRunner.query(`INSERT INTO departments (id, branch_id, name)
      SELECT md5(b.id || ':default:' || lower(d.name)), b.id, d.name
      FROM branches b CROSS JOIN unnest(ARRAY[
        'Executive Department', 'Admin', 'Marketing', 'Accounting', 'IT', 'Maintenance'
      ]::text[]) AS d(name)
      ON CONFLICT DO NOTHING`);
  }

  async down(): Promise<void> {
    // Keep recorded employment types and department assignments on rollback.
  }
}
