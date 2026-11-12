import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from './auth.context.js';
import { AuthService } from './auth.service.js';
import { SessionService } from './session.service.js';
import { BranchService } from '../branches/branches.service.js';
import { BranchesController } from '../branches/branches.controller.js';
import { UserService } from '../users/user.service.js';
import { RoleService } from '../roles/role.service.js';
import { PermissionService } from '../permissions/permission.service.js';
import { DtrService } from '../../hr/attendance/dtr.service.js';
import { LeaveService } from '../../hr/leaves/leave.service.js';
import { EmployeeController } from '../../hr/employees/employee.controller.js';
import { EmployeeService } from '../../hr/employees/employee.service.js';
import type { DataSource } from 'typeorm';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';

async function setup(role = 'BRANCH_MANAGER', companyWide = false) {
  const branches = new BranchService();
  const first = await branches.create({ code: 'FIRST', name: 'First', address: 'Street', city: 'Makati' });
  const second = await branches.create({ code: 'SECOND', name: 'Second', address: 'Street', city: 'Pasig', managerUserId: 'manager' });
  const other = await branches.create({ code: 'OTHER', name: 'Other', address: 'Street', city: 'Taguig' });
  const inactive = await branches.create({ code: 'INACTIVE', name: 'Inactive', address: 'Street', city: 'Makati', status: 'INACTIVE', managerUserId: 'manager' });
  const users = new UserService();
  const roles = new RoleService();
  const sessions = new SessionService();
  const auth = new AuthService(users, roles, new PermissionService(roles), branches, sessions);
  const user = users.create({
    id: 'manager', name: 'Manager', email: 'manager@example.test', status: 'ACTIVE',
    employeeId: 'employee-1', role, branchId: companyWide ? undefined : first.id,
    passwordHash: auth.hashPassword('KnownTestPassword!'),
  });
  const login = () => auth.login({ email: user.email, password: 'KnownTestPassword!' });
  return { auth, branches, users, user, first, second, other, inactive, login, sessions };
}

describe('automatic database branch scope', () => {
  it.each(['BRANCH_MANAGER', 'HR_ADMIN'])('loads all assigned branches for %s immediately at sign-in', async role => {
    const { auth, first, second, other, login } = await setup(role);
    const token = await login();
    const payload = (await auth.validateWorkspaceSession(token)).payload!;
    expect(payload.branchIds).toEqual([first.id, second.id]);
    expect(payload.branchIds).not.toContain(other.id);
    expect(payload.scope).toBe('BRANCH');
    expect(payload.allBranches).toBe(true);
    expect((await auth.validateSession(token)).payload?.branchIds).toBeUndefined();
  });

  it.each(['SUPER_ADMIN', 'IT_ADMIN'])('loads every active branch for the global %s role', async role => {
    const { auth, first, second, other, inactive, login } = await setup(role);
    const payload = (await auth.validateWorkspaceSession(await login())).payload!;
    expect(payload.branchIds).toEqual(expect.arrayContaining([first.id, second.id, other.id]));
    expect(payload.branchIds).not.toContain(inactive.id);
  });

  it('loads single, multiple and all saved assignments without user selection', async () => {
    const { auth, branches, user, first, second, other, inactive, login } = await setup();
    await branches.saveAdminBranchAccess(user.id, { mode: 'SELECTED', branchIds: [first.id] }, 'actor');
    const token = await login();
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toEqual([first.id]);
    await branches.saveAdminBranchAccess(user.id, { mode: 'SELECTED', branchIds: [first.id, second.id] }, 'actor');
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toEqual([first.id, second.id]);
    await branches.saveAdminBranchAccess(user.id, { mode: 'ALL', branchIds: [] }, 'actor');
    const all = (await auth.validateWorkspaceSession(token)).payload!;
    expect(all.branchIds).toContain(other.id);
    expect(all.branchIds).not.toContain(inactive.id);
    expect(all.scope).toBe('BRANCH');
  });

  it('ignores a legacy manually narrowed cookie and uses the database assignment', async () => {
    const { auth, user, first, second, sessions } = await setup();
    const token = (await sessions.createSession({ sub: user.id, email: user.email, role: user.role,
      branchId: first.id, branchIds: [first.id], allBranches: false, scope: 'BRANCH',
      jti: 'legacy', expiresAt: new Date(Date.now() + 60000).toISOString() })).token;
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toEqual([first.id, second.id]);
  });

  it('removes revoked/deactivated branches from an existing session on the next request', async () => {
    const { auth, branches, first, second, login } = await setup();
    const token = await login();
    await branches.update(second.id, { managerUserId: null });
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toEqual([first.id]);
    await expect(auth.switchBranch(token, second.id)).rejects.toThrow(ForbiddenException);
    await branches.setStatus(first.id, 'INACTIVE');
    expect((await auth.validateWorkspaceSession(token)).valid).toBe(false);
  });

  it('legacy switch requests cannot narrow database access and still reject unauthorized branches', async () => {
    const { auth, first, second, other, login } = await setup();
    const original = await login();
    const rotated = await auth.switchBranch(original, second.id);
    expect((await auth.validateSession(original)).valid).toBe(false);
    expect((await auth.validateWorkspaceSession(rotated)).payload).toMatchObject({ branchId: first.id, branchIds: [first.id, second.id], allBranches: true });
    await expect(auth.switchBranch(rotated, other.id)).rejects.toThrow(ForbiddenException);
    await expect(auth.switchBranchSelection(rotated, { branchIds: [] })).rejects.toThrow(ForbiddenException);
    await expect(auth.switchBranchSelection(rotated, { branchIds: [first.id, first.id] })).rejects.toThrow(ForbiddenException);
  });

  it('allows every assigned branch across modules while rejecting an unassigned branch', async () => {
    const { auth, branches, users, first, second, other, login } = await setup();
    const payload = (await auth.validateWorkspaceSession(await login())).payload!;
    const actor = { userId: payload.sub, email: payload.email, role: payload.role, branchId: payload.branchId,
      branchIds: payload.branchIds, allBranches: payload.allBranches, scope: payload.scope } as NonNullable<AuthenticatedRequest['user']>;
    const request = { user: actor } as AuthenticatedRequest;
    const controller = new BranchesController(branches, new AuthorizationService(), users, auth);
    expect((await controller.list(request, {})).data.map(branch => branch.id)).toEqual([first.id, second.id]);
    await expect(controller.get(request, other.id)).rejects.toThrow(ForbiddenException);
    expect(() => new DtrService({} as DataSource).requireManager(actor, second.id, 'IMPORT')).not.toThrow();
    expect(() => new DtrService({} as DataSource).requireManager(actor, other.id, 'IMPORT')).toThrow();
    expect(await new LeaveService({} as DataSource).scope(actor, second.id)).toEqual([second.id]);
    await expect(new LeaveService({} as DataSource).scope(actor, other.id)).rejects.toThrow();
    expect(await new EmployeeController(new EmployeeService(), users).list(request, second.id)).toEqual([]);
    await expect(new EmployeeController(new EmployeeService(), users).list(request, other.id)).rejects.toThrow();
  });

  it.each(['HR_ADMIN', 'BRANCH_MANAGER'])('includes future active branches only for saved ALL %s assignments', async role => {
    const { auth, branches, user, first, login } = await setup(role);
    await branches.saveAdminBranchAccess(user.id, { mode: 'SELECTED', branchIds: [first.id] }, 'actor');
    const token = await login();
    const created = await branches.create({ code: 'NEW', name: 'New branch', address: 'Street', city: 'Makati' });
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).not.toContain(created.id);
    await branches.saveAdminBranchAccess(user.id, { mode: 'ALL', branchIds: [] }, 'actor');
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toContain(created.id);
  });

  it('preserves company-wide HR defaults and finite unscoped HR permission boundaries', async () => {
    const { auth, user, branches, first, login } = await setup('HR_ADMIN', true);
    const token = await login();
    expect((await auth.validateWorkspaceSession(token)).payload?.scope).toBe('ALL');
    await branches.saveAdminBranchAccess(user.id, { mode: 'SELECTED', branchIds: [first.id] }, 'actor');
    expect((await auth.validateWorkspaceSession(token)).payload).toMatchObject({ scope: 'BRANCH', branchIds: [first.id] });
  });

  it('keeps cookies small even for large finite assignments', async () => {
    const { auth, branches, user, login } = await setup('HR_ADMIN');
    for (let index = 0; index < 70; index++) await branches.create({ code: `EXTRA${index}`, name: `Extra ${index}`, address: 'Street', city: 'Makati' });
    const ids = (await branches.listAllActiveBranches()).map(branch => branch.id);
    await branches.saveAdminBranchAccess(user.id, { mode: 'SELECTED', branchIds: ids }, 'actor');
    const token = await login();
    expect(token.length).toBeLessThan(3800);
    expect((await auth.validateSession(token)).payload?.branchIds).toBeUndefined();
    expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toHaveLength(ids.length);
  });

  it('rejects a manager with no active assignment', async () => {
    const { branches, second, login } = await setup('BRANCH_MANAGER', true);
    await branches.update(second.id, { managerUserId: null });
    await expect(login()).rejects.toThrow(UnauthorizedException);
  });

  it('rejects sessions after account status or role changes', async () => {
    const { auth, user, login } = await setup();
    const token = await login(); user.status = 'INACTIVE';
    expect((await auth.validateWorkspaceSession(token)).valid).toBe(false);
    user.status = 'ACTIVE'; user.role = 'STAFF';
    expect((await auth.validateWorkspaceSession(token)).valid).toBe(false);
  });

  it.each(['EMPLOYEE', 'STAFF'])('preserves own-record isolation for %s', async role => {
    const { auth, user, first, second, login } = await setup(role);
    const token = await login();
    expect((await auth.validateWorkspaceSession(token)).payload?.branchId).toBe(first.id);
    await expect(auth.switchBranchSelection(token, { branchIds: [first.id, second.id] })).rejects.toThrow(ForbiddenException);
    user.branchId = second.id;
    expect((await auth.validateWorkspaceSession(token)).valid).toBe(false);
  });
});
