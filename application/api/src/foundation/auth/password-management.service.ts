import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { AuthService } from './auth.service.js';
import { BranchService } from '../branches/branches.service.js';
import type { AuthUserContext } from './auth.context.js';
import { EmailService } from '../../email/email.service.js';
import { generateTemporaryPassword } from './temporary-password.js';

type Account = { id: string; email: string; name: string; role: string; branchId: string | null; status: string; passwordHash: string | null; employeeId: string | null };
const GENERIC = 'Request submitted successfully. If the details match an account, your password reset request will be reviewed by Superadmin or IT.';

@Injectable()
export class PasswordManagementService {
  private readonly attempts = new Map<string, number[]>();
  private readonly changeAttempts = new Map<string, number[]>();
  constructor(private readonly db: DataSource, private readonly auth: AuthService, private readonly branches: BranchService, private readonly email?: EmailService) {}

  async request(identifier: string, reason: string | undefined, source: string): Promise<{ message: string }> {
    const normalized = identifier.trim().toLowerCase();
    if (!normalized || normalized.length > 254 || reason && reason.length > 500) throw new BadRequestException('Check the account identifier and message.');
    const now = Date.now();
    const recent = (this.attempts.get(source) ?? []).filter((time) => now - time < 60 * 60 * 1000);
    if (recent.length >= 5) return { message: GENERIC };
    recent.push(now); this.attempts.set(source, recent);
    const rows = await this.db.query<Account[]>(`SELECT u.id,u.email,u.name,u.role,u.branch_id AS "branchId",u.status,u.employee_id AS "employeeId"
      FROM users u LEFT JOIN employees e ON e.id=u.employee_id
      WHERE u.status='ACTIVE' AND (lower(u.email)=$1 OR lower(u.id::text)=$1 OR lower(u.employee_id::text)=$1 OR lower(e.employee_number)=$1) LIMIT 1`, [normalized]);
    const account = rows[0];
    if (!account) return { message: GENERIC };
    try {
      await this.db.query(`WITH created_request AS (
        INSERT INTO password_reset_requests(id,user_id,branch_id,reason)
        VALUES($1,$2,$3,$4) ON CONFLICT (user_id) WHERE status IN ('PENDING','VERIFIED','APPROVED') DO NOTHING
        RETURNING id, branch_id
      )
      INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name)
      SELECT gen_random_uuid()::text,admin.id,r.branch_id,'Password reset requested',
        $5,'WARNING',false,now(),'/system/password-reset-requests?requestId=' || r.id::text,(SELECT name FROM users WHERE id=$2)
      FROM created_request r CROSS JOIN users admin
      WHERE admin.status='ACTIVE' AND admin.role IN ('SUPER_ADMIN','IT_ADMIN')`,
      [randomUUID(), account.id, account.branchId, reason?.trim() || null,
        `${account.name} requested a password reset. Review it in System > Password reset requests.`]);
    } catch (error) {
      if ((error as { code?: string }).code !== '23505') throw error;
    }
    return { message: GENERIC };
  }

  async list(actor: AuthUserContext, status = 'OPEN') {
    const access = await this.scope(actor);
    const allowedStatus = ['PENDING','VERIFIED','APPROVED','COMPLETED','REJECTED','EXPIRED','ALL','OPEN'].includes(status) ? status : 'OPEN';
    const values: unknown[] = []; const where: string[] = [];
    if (allowedStatus === 'OPEN') where.push(`r.status IN ('PENDING','VERIFIED','APPROVED')`);
    else if (allowedStatus !== 'ALL' && allowedStatus !== 'EXPIRED') { values.push(allowedStatus); where.push(`r.status=$${values.length}`); }
    if (allowedStatus === 'EXPIRED') where.push(`r.status='COMPLETED' AND u.temporary_password_expires_at < now()`);
    if (access) { values.push(access); where.push(`r.branch_id = ANY($${values.length}::varchar[])`); }
    const rows = await this.db.query(`SELECT r.id,r.user_id AS "userId",r.branch_id AS "branchId",r.reason,r.status,
      r.requested_at AS "requestedAt",r.reviewed_at AS "reviewedAt",r.identity_verified_at AS "identityVerifiedAt",
      r.approved_at AS "approvedAt",r.fulfilled_at AS "fulfilledAt",r.rejection_reason AS "rejectionReason",
      verified_user.name AS "verifiedByName",approved_user.name AS "approvedByName",fulfilled_user.name AS "fulfilledByName",
      r.email_dispatch_status AS "emailDispatchStatus",u.name AS "accountName",u.email AS "email",u.employee_id AS "employeeId",
      b.name AS "branchName",u.temporary_password_expires_at AS "credentialExpiresAt"
      FROM password_reset_requests r JOIN users u ON u.id=r.user_id LEFT JOIN branches b ON b.id=r.branch_id
      LEFT JOIN users verified_user ON verified_user.id=r.verified_by
      LEFT JOIN users approved_user ON approved_user.id=r.approved_by
      LEFT JOIN users fulfilled_user ON fulfilled_user.id=r.fulfilled_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY r.requested_at DESC LIMIT 300`, values);
    return rows.map((row: Record<string, unknown>) => ({ ...row, email: maskEmail(typeof row.email === 'string' ? row.email : '') }));
  }

  async approve(actor: AuthUserContext, id: string) {
    return this.updateRequest(actor, id, async (manager, row) => {
      if (!['PENDING', 'VERIFIED'].includes(row.status)) throw new BadRequestException('Only pending requests can be approved.');
      await manager.query(`UPDATE password_reset_requests SET status='APPROVED',approved_at=now(),approved_by=$2,reviewed_at=now(),reviewed_by=$2,updated_at=now() WHERE id=$1`, [id, actor.userId]);
      await this.audit(manager, actor.userId, id, 'PASSWORD_RESET_APPROVED');
      return { ok: true, status: 'APPROVED' };
    });
  }

  async reject(actor: AuthUserContext, id: string, reason: string) {
    if (!reason.trim() || reason.length > 500) throw new BadRequestException('A rejection reason is required.');
    return this.updateRequest(actor, id, async (manager, row) => {
      if (!['PENDING','VERIFIED','APPROVED'].includes(row.status)) throw new BadRequestException('This request can no longer be rejected.');
      await manager.query(`UPDATE password_reset_requests SET status='REJECTED',rejected_at=now(),rejection_reason=$2,reviewed_at=now(),reviewed_by=$3,updated_at=now() WHERE id=$1`, [id, reason.trim(), actor.userId]);
      await this.audit(manager, actor.userId, id, 'PASSWORD_RESET_REJECTED', { reason: reason.trim() });
      return { ok: true, status: 'REJECTED' };
    });
  }

  async issue(actor: AuthUserContext, id: string) {
    const accountEmail = await this.db.transaction(async (manager) => {
      const rows = await manager.query<Array<{ id: string; status: string; verifiedBy: string | null; approvedBy: string | null; userId: string }>>(
        `SELECT r.id,r.status,r.verified_by AS "verifiedBy",r.approved_by AS "approvedBy",r.user_id AS "userId"
         FROM password_reset_requests r WHERE r.id=$1 FOR UPDATE`, [id]);
      const row = rows[0]; if (!row) throw new BadRequestException('Request not found.');
      if (row.userId === actor.userId) throw new ForbiddenException('Another authorized administrator must review your request.');
      await this.assertScope(actor, id, manager);
      if (row.status !== 'APPROVED' || !row.approvedBy) throw new BadRequestException('Only approved requests can be fulfilled.');
      await manager.query(`UPDATE password_reset_requests SET email_dispatch_status='PROCESSING',last_email_attempt_at=now(),updated_at=now() WHERE id=$1`, [id]);
      const users = await manager.query<Account[]>(`SELECT id,email,name,role,branch_id AS "branchId",status,password_hash AS "passwordHash",employee_id AS "employeeId" FROM users WHERE id=$1 AND status='ACTIVE' FOR UPDATE`, [row.userId]);
      const user = users[0]; if (!user) throw new BadRequestException('Account unavailable.');
      const temporaryPassword = generateTemporaryPassword();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      const sent = await this.sendTemporaryCredential(user.email, user.name, temporaryPassword, expiresAt);
      if (!sent) {
        await manager.query(`UPDATE password_reset_requests SET email_dispatch_status='FAILED',updated_at=now() WHERE id=$1`, [id]);
        return { failed: true as const };
      }
      await manager.query(`UPDATE users SET password_hash=$2,must_change_password=true,temporary_password_expires_at=$3,
        credential_email_status='NOT_REQUIRED',credential_email_attempt_id=NULL WHERE id=$1`, [user.id, this.auth.hashPassword(temporaryPassword), expiresAt]);
      await manager.query(`UPDATE password_reset_requests SET status='COMPLETED',fulfilled_at=now(),fulfilled_by=$2,email_dispatch_status='ACCEPTED_BY_PROVIDER',updated_at=now() WHERE id=$1`, [id, actor.userId]);
      await manager.query(`INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'PASSWORD_RESET_ISSUED','users',$4::jsonb,now())`, [randomUUID(), actor.userId, user.branchId, JSON.stringify({ requestId: id, targetUserId: user.id, providerStatus: 'ACCEPTED_BY_PROVIDER', expiresAt: expiresAt.toISOString() })]);
      return { email: user.email, name: user.name, userId: user.id, failed: false as const, expiresAt: expiresAt.toISOString() };
    });
    if (accountEmail.failed) throw new ServiceUnavailableException('Email could not be accepted. The account password was not changed; retry to generate a new temporary password.');
    await this.auth.revokeSessionsForUser(accountEmail.userId);
    return { ok: true, email: maskEmail(accountEmail.email), expiresAt: accountEmail.expiresAt, delivery: 'ACCEPTED_BY_PROVIDER' };
  }

  async changePassword(user: AuthUserContext, input: { currentPassword: string; newPassword: string; confirmPassword: string }) {
    const recent = (this.changeAttempts.get(user.userId) ?? []).filter(time => Date.now() - time < 15 * 60 * 1000);
    if (recent.length >= 10) throw new UnauthorizedException('Too many password verification attempts. Try again later.');
    recent.push(Date.now()); this.changeAttempts.set(user.userId, recent);
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException('New passwords do not match.');
    validatePassword(input.newPassword);
    const rows = await this.db.query<Account[]>(`SELECT id,email,name,role,branch_id AS "branchId",status,password_hash AS "passwordHash",employee_id AS "employeeId",must_change_password AS "mustChangePassword",temporary_password_expires_at AS "temporaryPasswordExpiresAt" FROM users WHERE id=$1 AND status='ACTIVE'`, [user.userId]);
    const account = rows[0]; if (!account?.passwordHash) throw new UnauthorizedException('Account unavailable.');
    const extended = account as Account & { mustChangePassword?: boolean; temporaryPasswordExpiresAt?: Date | null };
    if (extended.temporaryPasswordExpiresAt && new Date(extended.temporaryPasswordExpiresAt).getTime() <= Date.now()) throw new UnauthorizedException('Your temporary password expired. Request a new password reset.');
    if (!await this.auth.verifyPassword(input.currentPassword, account.passwordHash)) throw new UnauthorizedException('Current password is incorrect.');
    if (await this.auth.verifyPassword(input.newPassword, account.passwordHash)) throw new BadRequestException('Choose a password you have not used before.');
    const hash = this.auth.hashPassword(input.newPassword);
    await this.db.transaction(async (manager) => {
      const changed = await manager.query<Array<{ id: string }>>(`WITH changed AS (UPDATE users SET password_hash=$2,must_change_password=false,temporary_password_expires_at=NULL,password_changed_at=now()
        WHERE id=$1 AND password_hash=$3 AND (temporary_password_expires_at IS NULL OR temporary_password_expires_at>now()) RETURNING id) SELECT id FROM changed`, [user.userId, hash, account.passwordHash]);
      if (!changed[0]) throw new UnauthorizedException('Your credential changed or expired. Sign in again.');
      await manager.query(`INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'PASSWORD_CHANGED','users',$4::jsonb,now())`, [randomUUID(), user.userId, user.branchId, JSON.stringify({ forced: Boolean(extended.mustChangePassword) })]);
    });
    await this.auth.revokeSessionsForUser(user.userId);
    this.changeAttempts.delete(user.userId);
    void this.sendPasswordChangedNotice(account.email, account.name);
    return { ok: true, requireLogin: true };
  }

  private async sendPasswordChangedNotice(email: string, name: string): Promise<void> {
    await this.email?.sendSecurityNotice(email, name, 'Your Mspaces account password was successfully changed. Existing sessions have been signed out.');
  }

  private async sendTemporaryCredential(email: string, name: string, password: string, expiresAt: Date): Promise<boolean> {
    if (!this.email) return false;
    return (await this.email.sendCredential({ email, name, password, expiresAt, purpose: 'RESET' })).status === 'ACCEPTED_BY_PROVIDER';
  }

  private async scope(actor: AuthUserContext): Promise<string[] | undefined> {
    if (!this.canManage(actor)) throw new ForbiddenException('Password reset management is not permitted.');
    if (['HR_ADMIN','BRANCH_MANAGER'].includes(actor.role) && actor.branchIds !== undefined) return actor.branchIds;
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'IT_ADMIN' || actor.role === 'HR_ADMIN' && !actor.branchId) return undefined;
    if (!actor.branchId) throw new ForbiddenException('Branch assignment required.');
    const access = await this.branches.listAccessibleBranches(actor.userId, actor.branchId, actor.role);
    return access.map((branch) => branch.id);
  }
  private canManage(actor: AuthUserContext) { return ['SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER'].includes(actor.role) && this.auth.canAccess(actor.role, 'password_resets', 'UPDATE', actor.role === 'BRANCH_MANAGER' || actor.role === 'HR_ADMIN' && actor.branchId ? 'BRANCH' : 'ALL'); }
  private async assertScope(actor: AuthUserContext, id: string, manager: EntityManager) {
    const scope = await this.scope(actor); if (!scope) return;
    const rows = await manager.query<Array<{ branchId: string | null }>>(`SELECT branch_id AS "branchId" FROM password_reset_requests WHERE id=$1`, [id]);
    if (!rows[0] || !rows[0].branchId || !scope.includes(rows[0].branchId)) throw new ForbiddenException('Password reset request is outside your branch access.');
  }
  private async audit(manager: EntityManager, actorId: string, requestId: string, action: string, details: Record<string, unknown> = {}) {
    await manager.query(`INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
      SELECT $1,$2,branch_id,$3,'password_reset_requests',$4::jsonb,now() FROM password_reset_requests WHERE id=$5`,
    [randomUUID(), actorId, action, JSON.stringify({ requestId, ...details }), requestId]);
  }
  private async updateRequest<T>(actor: AuthUserContext, id: string, action: (manager: EntityManager, row: { status: string; verifiedBy: string | null }) => Promise<T>): Promise<T> {
    if (!this.canManage(actor)) throw new ForbiddenException('Password reset management is not permitted.');
    return this.db.transaction(async manager => {
      await this.assertScope(actor, id, manager);
      const rows = await manager.query<Array<{ status: string; verifiedBy: string | null; userId: string }>>(`SELECT status,verified_by AS "verifiedBy",user_id AS "userId" FROM password_reset_requests WHERE id=$1 FOR UPDATE`, [id]);
      if (!rows[0]) throw new BadRequestException('Request not found.');
      if (rows[0].userId === actor.userId) throw new ForbiddenException('Another authorized administrator must review your request.');
      return action(manager, rows[0]);
    });
  }
}

function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) throw new BadRequestException('Use at least 12 characters with upper and lowercase letters, a number, and a symbol.');
}
function maskEmail(email: string) { const [name, domain] = email.split('@'); return name && domain ? `${name.slice(0, 1)}***@${domain}` : 'Hidden'; }
