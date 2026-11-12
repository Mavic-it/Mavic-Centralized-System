import type { MigrationInterface, QueryRunner } from 'typeorm';

export class MultipleBranchManagers1792108800000 implements MigrationInterface {
  name = 'MultipleBranchManagers1792108800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS branches_manager_user_id_idx
      ON branches (manager_user_id) WHERE manager_user_id IS NOT NULL
    `);
    await queryRunner.query('DROP INDEX IF EXISTS branches_manager_user_id_uidx');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const duplicates = (await queryRunner.query(`
      SELECT EXISTS (
        SELECT manager_user_id FROM branches
        WHERE manager_user_id IS NOT NULL
        GROUP BY manager_user_id HAVING COUNT(*) > 1
      ) AS exists
    `)) as Array<{ exists: boolean }>;
    if (duplicates[0]?.exists) {
      throw new Error('Unassign managers from additional branches before reverting this migration.');
    }
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS branches_manager_user_id_uidx
      ON branches (manager_user_id) WHERE manager_user_id IS NOT NULL
    `);
    await queryRunner.query('DROP INDEX IF EXISTS branches_manager_user_id_idx');
  }
}
