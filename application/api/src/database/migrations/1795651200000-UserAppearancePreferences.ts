import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserAppearancePreferences1795651200000 implements MigrationInterface {
  name = 'UserAppearancePreferences1795651200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE user_appearance_preferences (
        user_id varchar(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        theme_mode varchar(10) NOT NULL DEFAULT 'system' CHECK (theme_mode IN ('light', 'dark', 'system')),
        accent_color varchar(10) NOT NULL DEFAULT 'red' CHECK (accent_color IN ('red', 'green', 'blue', 'teal', 'purple', 'orange', 'pink')),
        title_font_size varchar(10) NOT NULL DEFAULT 'default' CHECK (title_font_size IN ('small', 'default', 'large')),
        header_font_size varchar(10) NOT NULL DEFAULT 'default' CHECK (header_font_size IN ('small', 'default', 'large')),
        body_font_size varchar(10) NOT NULL DEFAULT 'default' CHECK (body_font_size IN ('compact', 'default', 'large')),
        layout_density varchar(12) NOT NULL DEFAULT 'comfortable' CHECK (layout_density IN ('compact', 'comfortable', 'spacious')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS user_appearance_preferences');
  }
}
