import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountRecoveryNotifications1792540801000 implements MigrationInterface {
  name = 'AccountRecoveryNotifications1792540801000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Standalone administrators may request recovery without a branch assignment.
    await queryRunner.query('ALTER TABLE notifications ALTER COLUMN branch_id DROP NOT NULL');
  }

  async down(): Promise<void> {
    // Preserve notifications for accounts without a branch on rollback.
  }
}
