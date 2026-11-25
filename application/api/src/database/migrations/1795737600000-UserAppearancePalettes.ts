import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAppearancePalettes1795737600000 implements MigrationInterface {
  name = 'UserAppearancePalettes1795737600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      ALTER COLUMN accent_color SET DEFAULT 'red'
    `);
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      DROP CONSTRAINT IF EXISTS user_appearance_preferences_accent_color_check,
      ADD CONSTRAINT user_appearance_preferences_accent_color_check
        CHECK (accent_color IN ('red', 'green', 'blue', 'teal', 'purple', 'orange', 'pink'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const unsupported = await queryRunner.query(
      "SELECT EXISTS (SELECT 1 FROM user_appearance_preferences WHERE accent_color IN ('red', 'green')) AS present",
    );
    if (unsupported[0]?.present) {
      throw new Error('Red or green palettes are in use; preserve preferences and roll back by deploying a forward migration.');
    }
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      DROP CONSTRAINT IF EXISTS user_appearance_preferences_accent_color_check,
      ADD CONSTRAINT user_appearance_preferences_accent_color_check
        CHECK (accent_color IN ('blue', 'teal', 'purple', 'orange', 'pink'))
    `);
    await queryRunner.query(`
      ALTER TABLE user_appearance_preferences
      ALTER COLUMN accent_color SET DEFAULT 'blue'
    `);
  }
}
