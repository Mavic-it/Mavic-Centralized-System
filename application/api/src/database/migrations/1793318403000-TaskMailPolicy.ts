import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskMailPolicy1793318403000 implements MigrationInterface {
  name = 'TaskMailPolicy1793318403000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE work_task_mail_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      notification_id text NOT NULL UNIQUE,
      user_id varchar(100) NOT NULL REFERENCES users(id),
      task_id uuid NOT NULL REFERENCES work_tasks(id),
      event varchar(30) NOT NULL CHECK (event IN ('ASSIGNED','REVIEW_REQUIRED','CHANGES_REQUESTED','COMPLETED','CANCELLED')),
      audience varchar(20) NOT NULL CHECK (audience IN ('ASSIGNEE','CREATOR')),
      attempts integer NOT NULL DEFAULT 0,
      available_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz,
      failure varchar(40),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX work_task_mail_pending ON work_task_mail_outbox(available_at) WHERE sent_at IS NULL;`);
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve task notification history with a forward migration.',
    );
  }
}
