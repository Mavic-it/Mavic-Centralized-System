import {
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { EmailService } from '../email/email.service.js';
// Column names are a fixed internal allowlist; recipient and current employee scopes are checked independently.
const mailBranchScope = (
  column: 't.branch_id' | 'e.branch_id' | 'ta.branch_id' | 'ae.branch_id',
) =>
  `(u.role='SUPER_ADMIN' OR a.mode='ALL' OR a.mode='SELECTED' AND ${column}=ANY(a.branch_ids) OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.role='HR_ADMIN' AND u.branch_id IS NULL OR u.branch_id=${column} OR EXISTS(SELECT 1 FROM branches b WHERE b.id=${column} AND b.manager_user_id=u.id)))`;
export class WorkMailService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(WorkMailService.name);
  constructor(
    private readonly db: DataSource,
    private readonly email: Pick<EmailService, 'sendIncidentNotice'> &
      Partial<Pick<EmailService, 'sendTaskNotice'>>,
  ) {}
  onModuleInit() {
    this.timer = setInterval(() => {
      void this.flush().catch(() =>
        this.logger.warn(
          'Work email retry failed; private details suppressed.',
        ),
      );
    }, 30_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async flush() {
    if (this.busy) return;
    this.busy = true;
    try {
      // A separate transaction consumes only committed jobs; business mutations never await SMTP.
      for (let i = 0; i < 20; i++) {
        const found = await this.db.transaction(async (m) => {
          const rows = await m.query<
            Array<{
              id: string;
              incidentId: string;
              reference: string;
              category: string;
              status: string;
              email: string;
              name: string;
              active: boolean;
            }>
          >(
            `SELECT o.id,o.incident_id AS "incidentId",o.reference_number AS reference,o.category,o.status,u.email,u.name,(u.status='ACTIVE' AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE') AND (u.id=t.reporter_id OR (u.employee_id=t.employee_id AND (t.report_source='MANAGEMENT_REPORTED' OR EXISTS(SELECT 1 FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='NOTICE'))) OR (u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER') AND (u.role IN ('SUPER_ADMIN','HR_ADMIN') OR u.id=t.reviewer_id) AND ${mailBranchScope('t.branch_id')} AND (e.branch_id IS NULL OR ${mailBranchScope('e.branch_id')})))) AS active FROM work_mail_outbox o JOIN users u ON u.id=o.user_id JOIN workplace_incidents t ON t.id=o.incident_id LEFT JOIN employees e ON e.id=t.employee_id LEFT JOIN employee_branch_access a ON a.user_id=u.id WHERE o.sent_at IS NULL AND o.attempts<8 AND o.available_at<=now() ORDER BY o.created_at LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
          );
          const job = rows[0];
          if (!job) return false;
          if (!job.active) {
            await m.query(
              "UPDATE work_mail_outbox SET attempts=8,failure='RECIPIENT_NO_LONGER_AUTHORIZED' WHERE id=$1",
              [job.id],
            );
            return true;
          }
          let result: Awaited<ReturnType<EmailService['sendIncidentNotice']>>;
          try {
            result = await this.email.sendIncidentNotice(
              job.email,
              job.name,
              job.incidentId,
              job.reference,
              job.category,
              job.status,
            );
          } catch {
            result = { status: 'FAILED', failure: 'SMTP_UNAVAILABLE' };
          }
          await m.query(
            `UPDATE work_mail_outbox SET attempts=attempts+1,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,failure=$3,available_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::int)) WHERE id=$1`,
            [job.id, result.status === 'ACCEPTED_BY_PROVIDER', result.failure],
          );
          return true;
        });
        if (!found) break;
      }
      if (this.email.sendTaskNotice) await this.flushTasks();
    } finally {
      this.busy = false;
    }
  }

  private async flushTasks() {
    await this.db.transaction(async (m) => {
      await m.query(`
      INSERT INTO work_task_mail_outbox
        (notification_id,user_id,task_id,event,audience,reminder_for_date)
      SELECT gen_random_uuid()::text,u.id,t.id,'DUE_TOMORROW','ASSIGNEE',t.due_date
      FROM work_tasks t
      JOIN work_task_assignees ta ON ta.task_id=t.id
      JOIN employees e ON e.id=ta.employee_id AND e.status='ACTIVE'
      JOIN users u ON u.employee_id=e.id AND u.status='ACTIVE'
        AND u.role IN ('SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE')
      WHERE t.deleted_at IS NULL
        AND t.status NOT IN ('COMPLETED','CANCELLED')
        AND t.due_date=(now() AT TIME ZONE 'Asia/Manila')::date+1
      ON CONFLICT (task_id,user_id,reminder_for_date) WHERE event='DUE_TOMORROW'
      DO NOTHING
      `);
    });
    // A task can have up to 50 assignees, and a due-date reminder creates one
    // more job per assignee. Drain a full task batch in one pass so recipients
    // later in the assignment list do not wait for the next scheduler tick.
    for (let i = 0; i < 100; i++) {
      const found = await this.db.transaction(async (m) => {
        const rows = await m.query<
          Array<{
            id: string;
            taskId: string;
            event:
              | 'ASSIGNED'
              | 'REVIEW_REQUIRED'
              | 'CHANGES_REQUESTED'
              | 'COMPLETED'
              | 'CANCELLED'
              | 'DUE_TOMORROW';
            email: string;
            name: string;
            active: boolean;
          }>
        >(
          `SELECT o.id,o.task_id AS "taskId",o.event,u.email,u.name,
            (u.status='ACTIVE' AND t.deleted_at IS NULL
              AND (o.event<>'DUE_TOMORROW' OR
                (t.status NOT IN ('COMPLETED','CANCELLED') AND o.reminder_for_date=t.due_date
                  AND t.due_date=(now() AT TIME ZONE 'Asia/Manila')::date+1))
              AND (CASE WHEN o.audience='ASSIGNEE' THEN
                u.role IN ('SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE')
                AND e.status='ACTIVE' AND EXISTS(SELECT 1 FROM work_task_assignees ta WHERE ta.task_id=t.id AND ta.employee_id=u.employee_id)
              ELSE u.id=t.created_by AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER')
                AND NOT EXISTS(SELECT 1 FROM work_task_assignees ta WHERE ta.task_id=t.id AND ta.employee_id=u.employee_id)
                AND ${mailBranchScope('t.branch_id')}
                AND NOT EXISTS(SELECT 1 FROM work_task_assignees ta JOIN employees ae ON ae.id=ta.employee_id
                  WHERE ta.task_id=t.id AND (NOT ${mailBranchScope('ta.branch_id')} OR NOT ${mailBranchScope('ae.branch_id')})) END)) AS active
           FROM work_task_mail_outbox o JOIN users u ON u.id=o.user_id JOIN work_tasks t ON t.id=o.task_id
           LEFT JOIN employees e ON e.id=u.employee_id LEFT JOIN employee_branch_access a ON a.user_id=u.id
           WHERE o.sent_at IS NULL AND o.attempts<8 AND o.available_at<=now()
           ORDER BY o.created_at,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED`,
        );
        const job = rows[0];
        if (!job) return false;
        if (!job.active) {
          await m.query(
            "UPDATE work_task_mail_outbox SET attempts=8,failure='RECIPIENT_NO_LONGER_AUTHORIZED' WHERE id=$1",
            [job.id],
          );
          return true;
        }
        let result: Awaited<ReturnType<EmailService['sendTaskNotice']>>;
        try {
          result = await this.email.sendTaskNotice!(
            job.email,
            job.name,
            job.taskId,
            job.event,
          );
        } catch {
          result = { status: 'FAILED', failure: 'SMTP_UNAVAILABLE' };
        }
        await m.query(
          `UPDATE work_task_mail_outbox SET attempts=attempts+1,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,failure=$3,available_at=now()+make_interval(secs=>LEAST(3600,60*power(2,attempts)::int)) WHERE id=$1`,
          [job.id, result.status === 'ACCEPTED_BY_PROVIDER', result.failure],
        );
        return true;
      });
      if (!found) break;
    }
  }
}
