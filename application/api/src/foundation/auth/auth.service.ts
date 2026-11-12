import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { InMemoryRateLimiter, type RateLimiter } from '../../security/persistent-rate-limiter.js';
import { compare as compareBcrypt } from 'bcryptjs';
import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { BranchService } from '../branches/branches.service.js';
import { PermissionService } from '../permissions/permission.service.js';
import { RoleService } from '../roles/role.service.js';
import { UserService, type UserRecord } from '../users/user.service.js';
import {
  SessionService,
  SESSION_LIFETIME_SECONDS,
  type SessionPayload,
  type SessionValidationResult,
} from './session.service.js';

export type AuthLoginInput = {
  email: string;
  password: string;
};

export class AuthService {
  constructor(
    private readonly users = new UserService(),
    private readonly roles = new RoleService(),
    private readonly permissions = new PermissionService(this.roles),
    private readonly branches = new BranchService(),
    private readonly sessions = new SessionService(),
    private readonly rateLimiter: RateLimiter = new InMemoryRateLimiter(),
  ) {}

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const iterations = 120000;
    const hash = pbkdf2Sync(password, salt, iterations, 64, 'sha512').toString(
      'hex',
    );
    return `${iterations}:${salt}:${hash}`;
  }

  async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (/^\$2[aby]\$\d{2}\$/.test(storedHash)) {
      try {
        return await compareBcrypt(password, storedHash);
      } catch {
        return false;
      }
    }

    const hashParts = /^(\d{1,7}):([a-f\d]{32}):([a-f\d]{128})$/i.exec(
      storedHash,
    );
    if (!hashParts) return false;

    try {
      const iterations = Number(hashParts[1]);
      if (iterations < 10_000 || iterations > 1_000_000) return false;
      const derived = pbkdf2Sync(
        password,
        hashParts[2],
        iterations,
        64,
        'sha512',
      );
      const expected = Buffer.from(hashParts[3], 'hex');
      return timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  createSessionCookie(token: string): string {
    const maxAge = this.sessions.cookieMaxAge(token);
    return `mspaces_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
  }

  readSessionCookie(header?: string): string | undefined {
    if (!header) {
      return undefined;
    }

    const match = header
      .split(';')
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith('mspaces_session='));

    return match ? match.replace('mspaces_session=', '') : undefined;
  }

  async login(input: AuthLoginInput, sourceIp = 'unknown'): Promise<string> {
    // Account and source-IP limits are atomic across all API replicas.
    // Count attempts before password verification to close concurrent-request races.
    const loginKey = input.email?.trim().toLowerCase();
    if (!loginKey || typeof input.password !== 'string' ||
        loginKey.length > 320 || input.password.length > 1024) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const [allowedAccount, allowedSource] = await Promise.all([
      this.rateLimiter.consume('auth-account', loginKey, 10, 15 * 60),
      this.rateLimiter.consume('auth-source', sourceIp, 50, 15 * 60),
    ]);
    if (!allowedAccount || !allowedSource) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const user = await this.users.findByEmail(input.email);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = user.passwordHash
      ? await this.verifyPassword(input.password, user.passwordHash)
      : false;
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.temporaryPasswordExpiresAt && new Date(user.temporaryPasswordExpiresAt).getTime() <= Date.now()) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.credentialEmailStatus && ['PENDING', 'PROCESSING', 'FAILED'].includes(user.credentialEmailStatus)) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // Do not reset the IP counter on success; it protects against rotating accounts.
    await this.rateLimiter.reset('auth-account', loginKey);

    let branchId: string | null = null;
    if (user.role === 'BRANCH_MANAGER' || (user.role === 'HR_ADMIN' && user.branchId)) {
      const branches = await this.branches.listAccessibleBranches(user.id, user.branchId, user.role);
      branchId = branches.find((branch) => branch.id === user.branchId)?.id ?? branches[0]?.id ?? null;
      if (!branchId) throw new UnauthorizedException('No active assigned branch is available.');
    } else if (user.branchId) {
      const branch = await this.branches.findById(user.branchId);
      if (!branch || branch.status !== 'ACTIVE') {
        throw new UnauthorizedException('Invalid email or password');
      }
      branchId = branch.id;
    }
    const access = await this.branchAccessFor(user);
    if (access.canSwitch && !access.branches.length && !access.companyWide)
      throw new UnauthorizedException('No active assigned branch is available.');
    if (access.canSwitch && !access.companyWide)
      branchId = branchId ?? access.branches[0]?.id ?? null;
    const payload: SessionPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      branchId,
      ...(access.canSwitch ? { allBranches: true } : {}),
      scope: access.canSwitch ? (access.companyWide ? 'ALL' : 'BRANCH') : branchId ? 'BRANCH' : 'ALL',
      expiresAt: new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000).toISOString(),
      jti: randomUUID(),
    };

    const session = await this.sessions.createSession(payload);
    await this.users.recordSuccessfulLogin(user.id);
    return session.token;
  }

  async getPasswordSecurityState(userId: string) {
    return this.users.getPasswordSecurityState(userId);
  }

  async getBranchAccess(userId: string) {
    const user = await this.users.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is unavailable');
    }
    return this.branchAccessFor(user);
  }
  private async branchAccessFor(user: UserRecord) {
    const canSwitch = ['SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER'].includes(user.role);
    if (!canSwitch) return { canSwitch: false, branches: [] as {id:string;name:string}[], defaultAll: false, companyWide: false };
    if (['SUPER_ADMIN','IT_ADMIN'].includes(user.role)) return { canSwitch: true, branches: await this.branches.listAllActiveBranches(), defaultAll: true, companyWide: true };
    const setting = await this.branches.getAdminBranchAccess(user.id);
    const global = ['SUPER_ADMIN','IT_ADMIN'].includes(user.role) || (user.role === 'HR_ADMIN' && !user.branchId && setting.mode === 'ASSIGNED');
    const branches = !canSwitch ? [] : global ? await this.branches.listAllActiveBranches() : await this.branches.listAccessibleBranches(user.id, user.branchId, user.role);
    return { canSwitch, branches, defaultAll: true, companyWide: user.role === 'HR_ADMIN' && !user.branchId && (global || setting.mode === 'ALL') };
  }

  async validateWorkspaceSession(token: string): Promise<SessionValidationResult> {
    const validation = await this.validateSession(token);
    if (!validation.valid || !validation.payload) return validation;
    const payload = validation.payload;
    if (!['SUPER_ADMIN', 'IT_ADMIN', 'BRANCH_MANAGER', 'HR_ADMIN', 'EMPLOYEE', 'STAFF'].includes(payload.role)) return validation;
    const user = await this.users.findById(payload.sub);
    if (!user || user.status !== 'ACTIVE' || user.role !== payload.role) {
      return { valid: false, reason: 'session_account_changed' };
    }
    // Database assignments are authoritative on every request, including old
    // cookies that still contain a manually narrowed viewing selection.
    if (['SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER'].includes(user.role)) {
      const access = await this.getBranchAccess(user.id);
      const allowed = access.branches.map(branch => branch.id);
      if (!allowed.length && !access.companyWide)
        return { valid: false, reason: 'session_branch_access_removed' };
      const primary = user.branchId && allowed.includes(user.branchId) ? user.branchId : allowed[0] ?? null;
      return { ...validation, payload: { ...payload, branchIds: allowed, allBranches: true,
        branchId: primary, scope: access.companyWide ? 'ALL' : 'BRANCH' } };
    }
    if (user.role === 'EMPLOYEE' || user.role === 'STAFF') {
      return user.branchId && payload.branchId === user.branchId && payload.scope === 'BRANCH'
        ? validation : { valid: false, reason: 'session_scope_changed' };
    }

    return validation;
  }

  async switchBranchSelection(token: string, input: { branchId?: string; branchIds?: string[]; allBranches?: boolean }): Promise<string> {
    const validation = await this.validateWorkspaceSession(token);
    if (!validation.valid || !validation.payload || !validation.sessionId) throw new UnauthorizedException('Sign in again to change branches.');
    const access = await this.getBranchAccess(validation.payload.sub);
    const ids = input.allBranches ? access.branches.map(branch => branch.id) : input.branchIds ?? (input.branchId ? [input.branchId] : []);
    if (!access.canSwitch || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !access.branches.some(branch => branch.id === id))) throw new ForbiddenException('Select authorized active branches.');
    // Compatibility for older clients: validate the requested branches, but
    // never persist a second access selection alongside the database assignment.
    const session = await this.sessions.createSession({ ...validation.payload, branchIds: undefined, allBranches: true, jti: randomUUID() });
    await this.sessions.revokeSession(validation.sessionId);
    return session.token;
  }
  async switchBranch(token: string, branchId: string): Promise<string> {
    return this.switchBranchSelection(token, { branchId });
  }

  async revokeSessionToken(token: string): Promise<void> {
    const validation = await this.validateSession(token);
    if (validation.sessionId) await this.sessions.revokeSession(validation.sessionId);
  }

  canAccess(
    role: string,
    module: string,
    action:
      | 'VIEW'
      | 'CREATE'
      | 'UPDATE'
      | 'DELETE'
      | 'APPROVE'
      | 'REJECT'
      | 'EXPORT'
      | 'IMPORT',
    scope: 'OWN' | 'TEAM' | 'BRANCH' | 'ALL',
  ): boolean {
    return this.permissions.can(role as any, module, action, scope);
  }

  validateSession(token: string): Promise<SessionValidationResult> {
    return this.sessions.validateSession(token);
  }

  revokeSession(sessionId: string) {
    return this.sessions.revokeSession(sessionId);
  }

  revokeSessionsForUser(userId: string): Promise<void> {
    return this.sessions.revokeSessionsForUser(userId);
  }
}
