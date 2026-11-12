import { describe, expect, it, vi } from 'vitest';
import { hash as bcryptHash } from 'bcryptjs';
import type { DataSource } from 'typeorm';
import { AppModule } from '../app.module.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthMiddleware } from './auth/auth.middleware.js';
import { AuthService } from './auth/auth.service.js';
import { BranchService } from './branches/branches.service.js';
import { PermissionService } from './permissions/permission.service.js';
import { RoleService } from './roles/role.service.js';
import { UserService } from './users/user.service.js';

describe('MSPACES foundation modules', () => {
  it('should initialize the core foundation services', () => {
    expect(AppModule).toBeDefined();
    expect(AuthService).toBeDefined();
    expect(BranchService).toBeDefined();
    expect(PermissionService).toBeDefined();
    expect(RoleService).toBeDefined();
    expect(UserService).toBeDefined();
  });

  it('should allow branch-aware permission checks for the MVP roles', async () => {
    const roles = new RoleService();
    const permissions = new PermissionService();
    const users = new UserService();
    const branches = new BranchService();
    const auth = new AuthService(users, roles, permissions, branches);

    const branch = await branches.create({
      name: 'Makati',
      code: 'MAKATI',
      address: '123 Test Street',
      city: 'Makati',
    });
    users.create({
      id: 'usr-100',
      email: 'manager@makati.mspaces.test',
      role: 'BRANCH_MANAGER',
      branchId: branch.id,
      status: 'ACTIVE',
      name: 'Branch Manager',
      passwordHash: auth.hashPassword('Password123!'),
    });

    const token = await auth.login({
      email: 'manager@makati.mspaces.test',
      password: 'Password123!',
    });

    expect(token).toMatch(/\./);
    expect(
      roles.hasPermission('BRANCH_MANAGER', 'employees', 'VIEW', 'BRANCH'),
    ).toBe(true);
    expect(permissions.can('BRANCH_MANAGER', 'rooms', 'VIEW', 'BRANCH')).toBe(
      true,
    );
    expect(roles.hasPermission('BRANCH_MANAGER', 'password_resets', 'UPDATE', 'BRANCH')).toBe(true);
    expect(roles.hasPermission('HR_ADMIN', 'password_resets', 'UPDATE', 'ALL')).toBe(true);
    expect(roles.hasPermission('STAFF', 'password_resets', 'UPDATE', 'OWN')).toBe(false);
  });

  it('hashes passwords and validates session cookies through middleware', async () => {
    const users = new UserService();
    const roles = new RoleService();
    const permissions = new PermissionService(roles);
    const branches = new BranchService();
    const auth = new AuthService(users, roles, permissions, branches);
    const middleware = new AuthMiddleware(auth);

    const branch = await branches.create({
      name: 'Makati',
      code: 'MAKATI',
      address: '123 Test Street',
      city: 'Makati',
    });
    const password = 'SuperSecurePass!';
    users.create({
      id: 'usr-200',
      email: 'security@makati.mspaces.test',
      role: 'HR_ADMIN',
      branchId: branch.id,
      status: 'ACTIVE',
      name: 'Security Admin',
      passwordHash: auth.hashPassword(password),
    });

    const sessionToken = await auth.login({
      email: 'security@makati.mspaces.test',
      password,
    });
    const req: any = {
      headers: {
        cookie: `mspaces_session=${sessionToken}`,
      },
    };
    const res: any = {
      setHeader: vi.fn(),
      clearCookie: vi.fn(),
    };
    const next = vi.fn();

    await middleware.use(req, res, next);

    expect(req.user.email).toBe('security@makati.mspaces.test');
    expect(next).toHaveBeenCalled();
  });

  it('supports a dedicated login/logout controller flow with secure cookies', async () => {
    const users = new UserService();
    const roles = new RoleService();
    const permissions = new PermissionService(roles);
    const branches = new BranchService();
    const auth = new AuthService(users, roles, permissions, branches);
    const controller = new AuthController(auth);
    expect(
      controller.currentUser({
        user: {
          userId: 'usr-300',
          email: 'frontdesk@bgc.mspaces.test',
          role: 'BRANCH_MANAGER',
          branchId: 'branch-1',
        },
      } as any),
    ).toEqual({
      userId: 'usr-300',
      email: 'frontdesk@bgc.mspaces.test',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
      expiresAt: undefined,
      mustChangePassword: false,
    });

    const branch = await branches.create({
      name: 'BGC',
      code: 'BGC',
      address: '123 Test Street',
      city: 'Taguig',
    });
    const password = 'BGC-Login-Strong!';
    users.create({
      id: 'usr-300',
      email: 'frontdesk@bgc.mspaces.test',
      role: 'FRONT_DESK',
      branchId: branch.id,
      status: 'ACTIVE',
      name: 'Front Desk Agent',
      passwordHash: auth.hashPassword(password),
    });

    const res: any = {
      setHeader: vi.fn(),
      clearCookie: vi.fn(),
    };

    const loginResult = await controller.login(
      { email: 'frontdesk@bgc.mspaces.test', password },
      res,
    );

    expect(loginResult.ok).toBe(true);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('mspaces_session='),
    );

    const cookieValue = String(res.setHeader.mock.calls[0][1]).match(
      /mspaces_session=([^;]+)/,
    )?.[1];
    expect(cookieValue).toBeDefined();

    controller.logout(
      { headers: { cookie: `mspaces_session=${cookieValue}` } } as any,
      res,
    );

    expect(res.clearCookie).toHaveBeenCalledWith(
      'mspaces_session',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('authenticates an active bcrypt-hashed user loaded from PostgreSQL', async () => {
    const password = 'Database-Backed-Test!';
    const query = vi.fn().mockResolvedValue([
      {
        id: 'usr-db-1',
        email: 'superadmin@example.test',
        name: 'Database Super Admin',
        passwordHash: await bcryptHash(password, 4),
        role: 'SUPER_ADMIN',
        branchId: null,
        status: 'ACTIVE',
      },
    ]);
    const users = new UserService({ query } as unknown as DataSource);
    const roles = new RoleService();
    const branches = new BranchService();
    const auth = new AuthService(
      users,
      roles,
      new PermissionService(roles),
      branches,
    );

    const token = await auth.login({
      email: ' SUPERADMIN@example.test ',
      password,
    });

    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM users'), [
      'superadmin@example.test',
    ]);
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SET last_login_at = now()'),
      ['usr-db-1'],
    );
    expect(auth.validateSession(token)).toMatchObject({
      valid: true,
      payload: { sub: 'usr-db-1', role: 'SUPER_ADMIN', scope: 'ALL' },
    });
  });
});
