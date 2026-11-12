import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchManagerAssignment1792022400000 implements MigrationInterface {
  name = 'BranchManagerAssignment1792022400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches
        ADD COLUMN IF NOT EXISTS manager_user_id varchar(100)
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'branches_manager_user_id_fkey'
        ) THEN
          ALTER TABLE branches
            ADD CONSTRAINT branches_manager_user_id_fkey
            FOREIGN KEY (manager_user_id) REFERENCES users(id) ON DELETE RESTRICT;
        END IF;
      END $$
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS branches_manager_user_id_uidx
      ON branches (manager_user_id)
      WHERE manager_user_id IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS branches_manager_user_id_uidx');
    await queryRunner.query(`
      ALTER TABLE branches
        DROP CONSTRAINT IF EXISTS branches_manager_user_id_fkey,
        DROP COLUMN IF EXISTS manager_user_id
    `);
  }
}
