import {
  ForbiddenException,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { BranchService } from '../../foundation/branches/branches.service.js';
import { InquiryManagementService } from './inquiry-management.service.js';
const kindSql =
  "CASE WHEN t.due_at<now() THEN 'OVERDUE' WHEN (t.due_at AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date THEN 'TODAY' ELSE 'UPCOMING' END";
const escalationSql =
  "COALESCE((p.setting_value->>'escalationHours')::integer,0)";
export class InquiryReminderWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly logger = new Logger(InquiryReminderWorker.name);
  constructor(private readonly inquiries: InquiryManagementService) {}
  onModuleInit() {
    this.timer = setInterval(() => void this.run(), 60000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async deliver(
    m: EntityManager,
    task: { id: string; branchId: string; version: number },
    userId: string,
    kind: string,
  ) {
    const [account] = await m.query<
      { role: AuthUserContext['role']; branchId: string | null }[]
    >(
      `SELECT role,branch_id AS "branchId" FROM users WHERE id=$1 AND status='ACTIVE'`,
      [userId],
    );
    if (!account) return;
    const branches =
      account.role === 'SUPER_ADMIN'
        ? undefined
        : await new BranchService(this.inquiries.db).listAccessibleBranches(
            userId,
            account.branchId ?? undefined,
            account.role,
          );
    if (branches && !branches.some((b) => b.id === task.branchId)) return;
    try {
      await this.inquiries.authorize(
        {
          userId,
          email: '',
          role: account.role,
          branchId: account.branchId,
          branchIds: branches?.map((b) => b.id),
        },
        'followups',
      );
    } catch (e) {
      if (e instanceof ForbiddenException) return;
      throw e;
    }
    const [inserted] = await m.query(
      `WITH inserted AS(INSERT INTO inquiry_task_reminders(task_id,user_id,kind,schedule_version) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING task_id) SELECT task_id FROM inserted`,
      [task.id, userId, kind, task.version],
    );
    if (!inserted) return;
    await m.query(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href) VALUES($1,$2,$3,$4,'Review the authorized inquiry follow-up queue.','INFO',false,now(),'/inquiries/followups')`,
      [
        randomUUID(),
        userId,
        task.branchId,
        kind === 'ESCALATED'
          ? 'Overdue inquiry follow-up needs attention'
          : kind === 'OVERDUE'
            ? 'Inquiry follow-up overdue'
            : kind === 'TODAY'
              ? 'Inquiry follow-up today'
              : 'Upcoming inquiry follow-up',
      ],
    );
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.inquiries.db.transaction(async (m) => {
        const tasks = await m.query<
          {
            id: string;
            branchId: string;
            userId: string;
            version: number;
            kind: string;
            managerId: string | null;
            escalate: boolean;
          }[]
        >(`SELECT t.id,i.branch_id AS "branchId",t.assigned_staff_id AS "userId",t.version,${kindSql} AS kind,b.manager_user_id AS "managerId",(${escalationSql}>0 AND t.due_at<=now()-(${escalationSql}*interval '1 hour')) AS escalate
      FROM inquiry_tasks t JOIN inquiries i ON i.id=t.inquiry_id JOIN branches b ON b.id=i.branch_id
      LEFT JOIN branch_settings p ON p.branch_id=i.branch_id AND p.setting_key='inquiry.reminders'
      WHERE t.status='OPEN' AND i.archived_at IS NULL AND i.status NOT IN ('LOST','CLOSED','CONVERTED') AND COALESCE((p.setting_value->>'enabled')::boolean,true)
      AND (t.due_at>=now() OR COALESCE((p.setting_value->>'overdueEnabled')::boolean,true))
      AND ((t.due_at AT TIME ZONE 'Asia/Manila')::date<=(now() AT TIME ZONE 'Asia/Manila')::date OR t.due_at<=now()+(COALESCE((p.setting_value->>'leadMinutes')::integer,0)*interval '1 minute'))
      AND (NOT EXISTS(SELECT 1 FROM inquiry_task_reminders r WHERE r.task_id=t.id AND r.user_id=t.assigned_staff_id AND r.kind=${kindSql} AND r.schedule_version=t.version)
        OR (${escalationSql}>0 AND b.manager_user_id IS NOT NULL AND b.manager_user_id<>t.assigned_staff_id AND t.due_at<=now()-(${escalationSql}*interval '1 hour') AND NOT EXISTS(SELECT 1 FROM inquiry_task_reminders r WHERE r.task_id=t.id AND r.user_id=b.manager_user_id AND r.kind='ESCALATED' AND r.schedule_version=t.version)))
      ORDER BY t.reminder_checked_at NULLS FIRST,t.due_at LIMIT 200 FOR UPDATE OF t SKIP LOCKED`);
        for (const t of tasks) {
          await m.query(
            `UPDATE inquiry_tasks SET reminder_checked_at=clock_timestamp() WHERE id=$1`,
            [t.id],
          );
          await this.deliver(m, t, t.userId, t.kind);
          if (t.escalate && t.managerId && t.managerId !== t.userId)
            await this.deliver(m, t, t.managerId, 'ESCALATED');
        }
      });
    } catch {
      this.logger.warn(
        'Inquiry reminder processing failed; private details suppressed.',
      );
    } finally {
      this.busy = false;
    }
  }
}
