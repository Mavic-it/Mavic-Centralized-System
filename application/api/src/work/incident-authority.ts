import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import { selectedBranchScope } from '../foundation/auth/branch-scope.js';
import type { IncidentAuthorityDto } from './work.dto.js';

export async function hasDisciplinaryAuthority(
  m: EntityManager,
  actor: AuthUserContext,
  lock = false,
): Promise<boolean> {
  if (!['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(actor.role))
    return false;
  if (lock) {
    // Lock first, then read the grant with a fresh statement snapshot. A concurrent
    // revocation must finish before this action can read its authority.
    await m.query('SELECT id FROM users WHERE id=$1 FOR SHARE', [actor.userId]);
  }
  const [row] = await m.query<Array<{ granted: boolean }>>(
    `SELECT EXISTS(SELECT 1 FROM incident_disciplinary_authority a WHERE a.user_id=u.id) AS granted
     FROM users u WHERE u.id=$1 AND u.status='ACTIVE' AND u.role=$2`,
    [actor.userId, actor.role],
  );
  return row?.granted === true;
}

export class IncidentAuthorityService {
  constructor(private readonly db: DataSource) {}
  async list(actor: AuthUserContext) {
    this.admin(actor);
    return this.db.query<
      Array<{ id: string; name: string; role: string; granted: boolean }>
    >(
      `SELECT u.id,u.name,u.role,(a.user_id IS NOT NULL) AS granted FROM users u
       LEFT JOIN employees e ON e.id=u.employee_id
       LEFT JOIN incident_disciplinary_authority a ON a.user_id=u.id
       WHERE u.status='ACTIVE' AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER')
       AND ($1::text[] IS NULL OR COALESCE(e.branch_id,u.branch_id)=ANY($1)) ORDER BY u.name,u.id`,
      [selectedBranchScope(actor) ?? null],
    );
  }
  async update(actor: AuthUserContext, dto: IncidentAuthorityDto) {
    this.admin(actor);
    const reason = dto.reason.trim();
    if (!reason)
      throw new BadRequestException('An authority change requires a reason.');
    await this.db.transaction(async (m) => {
      const [target] = await m.query<
        Array<{ role: string; status: string; branchId: string | null }>
      >(
        `SELECT u.role,u.status,COALESCE(e.branch_id,u.branch_id) AS "branchId" FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE u.id=$1 FOR UPDATE OF u`,
        [dto.userId],
      );
      const scope = selectedBranchScope(actor);
      if (
        !target ||
        target.status !== 'ACTIVE' ||
        !['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(target.role) ||
        (scope && (!target.branchId || !scope.includes(target.branchId)))
      )
        throw new ForbiddenException(
          'Choose an active authorized account within your branch scope.',
        );
      const [before] = await m.query<Array<{ user_id: string }>>(
        'SELECT user_id FROM incident_disciplinary_authority WHERE user_id=$1',
        [dto.userId],
      );
      if (dto.granted)
        await m.query(
          'INSERT INTO incident_disciplinary_authority(user_id,granted_by) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING',
          [dto.userId, actor.userId],
        );
      else
        await m.query(
          'DELETE FROM incident_disciplinary_authority WHERE user_id=$1',
          [dto.userId],
        );
      if (!!before !== dto.granted)
        await m.query(
          `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'INCIDENT_AUTHORITY_CHANGED','incidents',$4,now())`,
          [
            randomUUID(),
            actor.userId,
            target.branchId,
            {
              targetUserId: dto.userId,
              previouslyGranted: !!before,
              granted: dto.granted,
              reason,
              actorRole: actor.role,
            },
          ],
        );
    });
    return this.list(actor);
  }
  private admin(actor: AuthUserContext) {
    if (actor.role !== 'SUPER_ADMIN')
      throw new ForbiddenException(
        'Only Super Admin can assign disciplinary authority.',
      );
  }
}
