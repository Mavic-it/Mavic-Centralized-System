import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeIdentityAndContact1763000000000 implements MigrationInterface {
  name = 'EmployeeIdentityAndContact1763000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS employee_number_seq AS bigint MINVALUE 1 MAXVALUE 9999999 START WITH 1`);
    await queryRunner.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_number varchar(10), ADD COLUMN IF NOT EXISTS phone varchar(30)`);
    await queryRunner.query(`
      WITH numbered AS (
        SELECT id, row_number() OVER (ORDER BY id) AS seq
        FROM employees WHERE employee_number IS NULL
      )
      UPDATE employees e SET employee_number = 'EMP' || lpad(numbered.seq::text, 3, '0')
      FROM numbered WHERE e.id = numbered.id
    `);
    await queryRunner.query(`SELECT setval('employee_number_seq', COALESCE(MAX(substring(employee_number FROM 4)::bigint), 1), COUNT(*) > 0) FROM employees WHERE employee_number ~ '^EMP[0-9]+$'`);
    await queryRunner.query(`ALTER TABLE employees ALTER COLUMN employee_number SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE employees ADD CONSTRAINT employees_employee_number_length_check CHECK (length(employee_number) BETWEEN 6 AND 10)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS employees_employee_number_uidx ON employees(employee_number)`);
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id varchar(100) REFERENCES employees(id) ON DELETE SET NULL`);
    await queryRunner.query(`UPDATE users SET branch_id = NULL, employee_id = NULL WHERE role = 'SUPER_ADMIN'`);
    await queryRunner.query(`ALTER TABLE users ADD CONSTRAINT users_super_admin_scope_check CHECK (role <> 'SUPER_ADMIN' OR (branch_id IS NULL AND employee_id IS NULL))`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS users_employee_id_idx ON users(employee_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_uidx ON users(employee_id) WHERE employee_id IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS employees_employee_number_uidx');
    await queryRunner.query('DROP INDEX IF EXISTS users_employee_id_idx');
    await queryRunner.query('DROP INDEX IF EXISTS users_employee_id_uidx');
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_super_admin_scope_check, DROP COLUMN IF EXISTS employee_id`);
    await queryRunner.query(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employee_number_length_check, DROP COLUMN IF EXISTS employee_number, DROP COLUMN IF EXISTS phone`);
    await queryRunner.query('DROP SEQUENCE IF EXISTS employee_number_seq');
  }
}
