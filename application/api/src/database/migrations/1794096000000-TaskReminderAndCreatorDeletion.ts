import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskReminderAndCreatorDeletion1794096000000
  implements MigrationInterface
{
  name = 'TaskReminderAndCreatorDeletion1794096000000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      ALTER TABLE work_tasks
        ADD COLUMN deleted_at timestamptz,
        ADD COLUMN deleted_by varchar(100) REFERENCES users(id),
        ADD CONSTRAINT work_tasks_deletion_actor_check
          CHECK ((deleted_at IS NULL) = (deleted_by IS NULL));
      CREATE INDEX work_tasks_active_scope ON work_tasks(branch_id, created_at DESC)
        WHERE deleted_at IS NULL;

      ALTER TABLE work_task_mail_outbox
        ADD COLUMN reminder_for_date date;
      ALTER TABLE work_task_mail_outbox
        DROP CONSTRAINT work_task_mail_outbox_event_check;
      ALTER TABLE work_task_mail_outbox
        ADD CONSTRAINT work_task_mail_event_check
        CHECK (event IN ('ASSIGNED','REVIEW_REQUIRED','CHANGES_REQUESTED','COMPLETED','CANCELLED','DUE_TOMORROW'));
      ALTER TABLE work_task_mail_outbox
        ADD CONSTRAINT work_task_mail_reminder_date_check
        CHECK (event<>'DUE_TOMORROW' OR reminder_for_date IS NOT NULL);
      CREATE UNIQUE INDEX work_task_due_reminder_once
        ON work_task_mail_outbox(task_id,user_id,reminder_for_date)
        WHERE event='DUE_TOMORROW';
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve task deletion and notification history with a forward migration.',
    );
  }
}
