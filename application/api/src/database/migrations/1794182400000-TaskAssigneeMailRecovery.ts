import type { MigrationInterface, QueryRunner } from 'typeorm';

export class TaskAssigneeMailRecovery1794182400000 implements MigrationInterface {
  name = 'TaskAssigneeMailRecovery1794182400000';

  async up(r: QueryRunner): Promise<void> {
    // Earlier delivery policy terminally suppressed task-assignment mail for
    // IT Admins, despite their existing access to explicitly assigned tasks.
    // Requeue only still-open assignments for active linked accounts.
    await r.query(`
      UPDATE work_task_mail_outbox o
      SET attempts=0,available_at=now(),failure=NULL
      FROM users u JOIN employees e ON e.id=u.employee_id
      WHERE o.user_id=u.id
        AND o.event='ASSIGNED'
        AND o.audience='ASSIGNEE'
        AND o.sent_at IS NULL
        AND o.attempts>=8
        AND o.failure='RECIPIENT_NO_LONGER_AUTHORIZED'
        AND u.status='ACTIVE'
        AND u.role='IT_ADMIN'
        AND e.status='ACTIVE'
        AND EXISTS(
          SELECT 1 FROM work_tasks t
          WHERE t.id=o.task_id
            AND t.deleted_at IS NULL
            AND t.status NOT IN ('COMPLETED','CANCELLED')
        )
        AND EXISTS(
          SELECT 1 FROM work_task_assignees ta
          WHERE ta.task_id=o.task_id AND ta.employee_id=u.employee_id
        )
    `);
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve recovered task-mail history with a forward migration.',
    );
  }
}
