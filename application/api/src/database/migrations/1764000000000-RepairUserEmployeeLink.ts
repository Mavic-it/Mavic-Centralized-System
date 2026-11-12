import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairUserEmployeeLink1764000000000 implements MigrationInterface {
  name = 'RepairUserEmployeeLink1764000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS employee_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_employee_id_fkey'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT users_employee_id_fkey
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      UPDATE users
      SET branch_id = NULL, employee_id = NULL
      WHERE role = 'SUPER_ADMIN'
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'users_super_admin_scope_check'
            AND conrelid = 'users'::regclass
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT users_super_admin_scope_check
            CHECK (role <> 'SUPER_ADMIN' OR (branch_id IS NULL AND employee_id IS NULL));
        END IF;
      END $$
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS users_employee_id_idx ON users(employee_id)',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_uidx ON users(employee_id) WHERE employee_id IS NOT NULL',
    );
  }

  async down(): Promise<void> {
    // Keep employee links intact when rolling back a schema-repair release.
  }
}
