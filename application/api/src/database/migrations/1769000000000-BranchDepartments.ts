import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchDepartments1769000000000 implements MigrationInterface {
  name = 'BranchDepartments1769000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id varchar(100) PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name varchar(150) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS departments_branch_name_lower_uidx
      ON departments (branch_id, lower(name))
    `);
    await queryRunner.query(`
      INSERT INTO departments (id, branch_id, name)
      SELECT md5(e.branch_id || ':' || lower(trim(e.department))), e.branch_id,
             min(trim(e.department))
      FROM employees e
      WHERE trim(e.department) <> ''
      GROUP BY e.branch_id, lower(trim(e.department))
      ON CONFLICT DO NOTHING
    `);
  }

  async down(): Promise<void> {
    // Keep department records on rollback to avoid removing user-created data.
  }
}
