import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAppearanceLightDefault1795824000000 implements MigrationInterface {
  name = 'UserAppearanceLightDefault1795824000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      ALTER COLUMN theme_mode SET DEFAULT 'light'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      ALTER COLUMN theme_mode SET DEFAULT 'system'
    `);
  }
}
