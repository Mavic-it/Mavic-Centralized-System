import type { MigrationInterface, QueryRunner } from 'typeorm';
export class NotificationSenders1794700800000 implements MigrationInterface {
  name = 'NotificationSenders1794700800000';
  async up(r: QueryRunner): Promise<void> {
    await r.query('ALTER TABLE notifications ADD COLUMN IF NOT EXISTS sender_name text');
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query('ALTER TABLE notifications DROP COLUMN IF EXISTS sender_name');
  }
}
