import type {
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { LeaveService } from './leave.service.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { today } from './leave.policy.js';
export class LeaveAllocator
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly leave: LeaveService) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.run(), 3600000);
    this.timer.unref();
    void this.run();
  }
  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
  async run() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.leave.runScheduledResets();
      if (process.env.LEAVE_ALLOCATION_SCHEDULER_ENABLED !== 'true') return;
      const id = process.env.LEAVE_ALLOCATION_ACTOR_ID;
      if (!id) return;
      const [actor] = await this.leave.db.query<AuthUserContext[]>(
        `SELECT id AS "userId",email,role,branch_id AS "branchId",CASE WHEN role='SUPER_ADMIN' OR branch_id IS NULL THEN 'ALL' ELSE 'BRANCH' END AS scope FROM users WHERE id=$1 AND status='ACTIVE' AND role IN ('SUPER_ADMIN','HR_ADMIN')`,
        [id],
      );
      if (actor)
        await this.leave.allocate(actor, {
          year: Number(today().slice(0, 4)),
          reason: 'Scheduled annual/onboarding allocation',
        });
    } catch {
      console.warn(
        'Leave allocation failed; the next scheduled run will retry.',
      );
    } finally {
      this.busy = false;
    }
  }
}
