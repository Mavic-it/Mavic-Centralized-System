import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Restore inquiry task fields omitted by databases that recorded an earlier inquiry migration. */
export class InquiryReminderSchemaRepair1795910403000 implements MigrationInterface {
  name = 'InquiryReminderSchemaRepair1795910403000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE inquiry_tasks
        ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'FOLLOW_UP',
        ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS reminder_checked_at timestamptz;

      CREATE TABLE IF NOT EXISTS inquiry_task_reminders (
        task_id uuid NOT NULL REFERENCES inquiry_tasks(id),
        user_id varchar(100) NOT NULL REFERENCES users(id),
        kind text NOT NULL,
        schedule_version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (task_id, user_id, kind, schedule_version)
      );
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Retain inquiry reminder history and restored task fields.',
    );
  }
}
