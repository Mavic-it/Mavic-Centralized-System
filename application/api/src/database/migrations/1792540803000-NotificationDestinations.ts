import type { MigrationInterface, QueryRunner } from 'typeorm';

export class NotificationDestinations1792540803000 implements MigrationInterface {
  name = 'NotificationDestinations1792540803000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS href text');
    await queryRunner.query(`UPDATE notifications n SET href =
      CASE
        WHEN n.title = 'Password reset requested' THEN
          COALESCE((SELECT '/system/password-reset-requests?requestId=' || min(r.id::text)
            FROM password_reset_requests r WHERE r.requested_at = n.created_at
            HAVING count(*) = 1), '/system/password-reset-requests')
        WHEN n.title IN ('Leave request updated', 'Leave request rejected', 'Leave approved') THEN
          '/my-leave' || COALESCE('?requestId=' || substring(n.message from '^Leave request ([A-Za-z0-9_-]+) is now '), '')
      END
      WHERE n.href IS NULL AND n.title IN ('Password reset requested', 'Leave request updated', 'Leave request rejected', 'Leave approved')`);
  }

  async down(): Promise<void> {
    // Preserve notification destinations and history on rollback.
  }
}
