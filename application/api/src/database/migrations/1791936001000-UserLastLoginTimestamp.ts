import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserLastLoginTimestamp1791936001000 implements MigrationInterface {
  name = 'UserLastLoginTimestamp1791936001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // The profile migration may already have run before login tracking was added.
    // Keep historical login times unknown and preserve any recorded timestamps.
    await queryRunner.query(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at timestamptz',
    );
  }

  async down(): Promise<void> {
    // Retain recorded login times when rolling back the application version.
  }
}
