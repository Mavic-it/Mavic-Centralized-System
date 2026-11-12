import { describe, expect, it } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '../foundation/auth/auth.guard.js';
import type { AuthenticatedRequest } from '../foundation/auth/auth.context.js';
import { AUTH_PERMISSION_KEY } from '../foundation/auth/auth.decorators.js';
import { AuthorizationService } from './authorization/authorization.service.js';
import type { DataSource } from 'typeorm';

describe('MSPACES auth guard', () => {
  const createContext = (
    request: Partial<AuthenticatedRequest>,
    metadata?: unknown,
  ) => ({
    getHandler: () => ({}),
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
    metadata,
  });

  it('allows an authenticated user with the required role and branch', async () => {
    const reflector = new Reflector();
    const authorization = new AuthorizationService();
    const guard = new AuthGuard(reflector, authorization);
    const context = createContext({
      user: {
        userId: 'u-1',
        email: 'manager@mspaces.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-1',
        scope: 'BRANCH',
      },
      params: { branchId: 'branch-1' },
    });

    reflector.getAllAndOverride = ((key: string) =>
      key === AUTH_PERMISSION_KEY
        ? {
            module: 'employees',
            action: 'VIEW',
            scope: 'BRANCH',
            branchParam: 'branchId',
          }
        : undefined) as any;

    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });

  it('rejects missing users, unauthorized roles, and cross-branch access', async () => {
    const reflector = new Reflector();
    const authorization = new AuthorizationService();
    const guard = new AuthGuard(reflector, authorization);
    reflector.getAllAndOverride = ((key: string) =>
      key === AUTH_PERMISSION_KEY
        ? {
            module: 'employees',
            action: 'VIEW',
            scope: 'BRANCH',
            branchParam: 'branchId',
          }
        : undefined) as any;

    await expect(
      guard.canActivate(
        createContext({ params: { branchId: 'branch-1' } }) as any,
      ),
    ).rejects.toThrow(UnauthorizedException);

    const wrongRole = createContext({
      user: {
        userId: 'u-2',
        email: 'employee@mspaces.test',
        role: 'EMPLOYEE',
        branchId: 'branch-1',
        scope: 'BRANCH',
      },
      params: { branchId: 'branch-1' },
    });
    await expect(guard.canActivate(wrongRole as any)).rejects.toThrow(ForbiddenException);

    const wrongBranch = createContext({
      user: {
        userId: 'u-3',
        email: 'manager@other.mspaces.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-2',
        scope: 'BRANCH',
      },
      params: { branchId: 'branch-1' },
    });
    await expect(guard.canActivate(wrongBranch as any)).rejects.toThrow(ForbiddenException);
  });

  it('restricts temporary-password sessions to account recovery and sign-out', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const guard = new AuthGuard(reflector, new AuthorizationService());
    const user = { userId: 'u-temp', email: 'temp@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1', mustChangePassword: true };
    await expect(guard.canActivate(createContext({ user, path: '/employees' }) as any)).rejects.toThrow(ForbiddenException);
    await expect(guard.canActivate(createContext({ user, path: '/auth/change-password' }) as any)).resolves.toBe(true);
    await expect(guard.canActivate(createContext({ user, path: '/auth/me' }) as any)).resolves.toBe(true);
  });
  it('allows a selected secondary branch and rejects an unselected branch at the shared guard', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = ((key: string) => key === AUTH_PERMISSION_KEY ? { module:'employees',action:'VIEW',scope:'BRANCH',branchParam:'branchId' } : undefined) as any;
    const guard = new AuthGuard(reflector, new AuthorizationService());
    const user = { userId:'manager',email:'manager@example.test',role:'BRANCH_MANAGER' as const,branchId:'first',branchIds:['first','second'],scope:'BRANCH' as const };
    await expect(guard.canActivate(createContext({user,params:{branchId:'second'}}) as any)).resolves.toBe(true);
    await expect(guard.canActivate(createContext({user,params:{branchId:'third'}}) as any)).rejects.toThrow(ForbiddenException);
  });

  it('returns 403 for a denied nested module page and for pages outside the role ceiling', async () => {
    const reflector=new Reflector();reflector.getAllAndOverride=(()=>undefined) as any;
    const dataSource={query:async()=>[{permission_key:'hr.leave',effect:'DENY'}]} as unknown as DataSource;
    const guard=new AuthGuard(reflector,new AuthorizationService(),dataSource);
    const manager={userId:'hr-1',email:'hr@example.test',role:'HR_ADMIN' as const,branchId:'branch-1',scope:'BRANCH' as const};
    await expect(guard.canActivate(createContext({user:manager,path:'/leave/reports'}) as any)).rejects.toThrow(ForbiddenException);
    const employee={...manager,role:'EMPLOYEE' as const};
    await expect(guard.canActivate(createContext({user:employee,path:'/leave/settings'}) as any)).rejects.toThrow(ForbiddenException);
  });

  it.each(['/employees/me', '/attendance/me', '/attendance/clock-in', '/leave/me/context', '/leave/me/overview'])('allows Employee self-service endpoint %s under its own permission key', async (path) => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const dataSource = { query: async () => [] } as unknown as DataSource;
    const guard = new AuthGuard(reflector, new AuthorizationService(), dataSource);
    const employee = {
      userId: 'employee-1',
      email: 'employee@example.test',
      role: 'EMPLOYEE' as const,
      branchId: 'branch-1',
      scope: 'BRANCH' as const,
    };

    await expect(guard.canActivate(createContext({ user: employee, path }) as any)).resolves.toBe(true);

    const explicitlyDeniedGuard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [{ permission_key: path.startsWith('/leave/') ? 'people.my-leave' : 'people.my-portal', effect: 'DENY' }] } as unknown as DataSource,
    );
    await expect(
      explicitlyDeniedGuard.canActivate(createContext({ user: employee, path }) as any),
    ).rejects.toThrow('Module access denied');
  });

  it('allows IT personal leave context but denies its management context', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const guard = new AuthGuard(reflector, new AuthorizationService(), { query:async()=>[] } as unknown as DataSource);
    const itAdmin = { userId:'it', email:'it@example.test', role:'IT_ADMIN' as const, branchId:'makati' };
    await expect(guard.canActivate(createContext({user:itAdmin,path:'/leave/me/context',method:'GET'}) as any)).resolves.toBe(true);
    await expect(guard.canActivate(createContext({user:itAdmin,path:'/leave/context',method:'GET'}) as any)).rejects.toThrow('Insufficient permission');
  });
  it.each(['', '/document'])('allows owned leave detail%s through personal leave while denying other records', async (suffix) => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const user = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };
    const path = `/leave/requests/9c069548-1a67-4084-8b64-995d5879b304${suffix}`;
    const db = (owned: boolean, denied = false) => ({ query: async (sql: string) => sql.includes('JOIN users u ON u.employee_id') ? owned ? [{ id: 'request' }] : [] : denied ? [{ permission_key: 'people.my-leave', effect: 'DENY' }] : [] }) as unknown as DataSource;
    await expect(new AuthGuard(reflector, new AuthorizationService(), db(true)).canActivate(createContext({ user: { ...user }, path, method: 'GET' }) as any)).resolves.toBe(true);
    await expect(new AuthGuard(reflector, new AuthorizationService(), db(false)).canActivate(createContext({ user: { ...user }, path, method: 'GET' }) as any)).rejects.toThrow('Insufficient permission');
    await expect(new AuthGuard(reflector, new AuthorizationService(), db(true, true)).canActivate(createContext({ user: { ...user }, path, method: 'GET' }) as any)).rejects.toThrow('Module access denied');
  });

  it('applies the shared incidents module permission to every work API endpoint', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const employee = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };
    const allowed = new AuthGuard(reflector, new AuthorizationService(), { query: async () => [] } as unknown as DataSource);
    const request = { user: { ...employee }, path: '/work/incidents/context', method: 'GET' };
    await expect(allowed.canActivate(createContext(request) as any)).resolves.toBe(true);
    expect(request.user).toMatchObject({ moduleAccessKey: 'work.incidents', moduleAccessMode: 'EDIT' });

    const denied = new AuthGuard(reflector, new AuthorizationService(), { query: async () => [{ permission_key: 'work.incidents', effect: 'DENY' }] } as unknown as DataSource);
    await expect(denied.canActivate(createContext({ user: { ...employee }, path: '/work/incidents', method: 'GET' }) as any)).rejects.toThrow('Module access denied');

    const viewOnly = new AuthGuard(reflector, new AuthorizationService(), { query: async () => [{ permission_key: 'work.incidents', effect: 'VIEW' }] } as unknown as DataSource);
    await expect(viewOnly.canActivate(createContext({ user: { ...employee }, path: '/work/incidents/report', method: 'POST' }) as any)).rejects.toThrow('View-only module access');
  });

  it('enforces view-only overrides on writes while allowing reads', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const dataSource = { query: async () => [{ permission_key: 'people.my-portal', effect: 'VIEW' }] } as unknown as DataSource;
    const guard = new AuthGuard(reflector, new AuthorizationService(), dataSource);
    const employee = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };

    await expect(guard.canActivate(createContext({ user: employee, path: '/employees/me', method: 'GET' }) as any)).resolves.toBe(true);
    await expect(guard.canActivate(createContext({ user: employee, path: '/employees/me', method: 'PATCH' }) as any)).rejects.toThrow('View-only module access');
  });

  it('opens reservation-list API to a branch-scoped Staff grant and keeps parent denies effective', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const user = { userId:'receptionist', email:'receptionist@example.test', role:'STAFF' as const, branchId:'makati' };
    const request = { user, path:'/reservations', method:'POST' };
    const allowed = new AuthGuard(reflector, new AuthorizationService(), { query:async()=>[{permission_key:'operations.reservations.list',effect:'EDIT'}] } as unknown as DataSource);
    await expect(allowed.canActivate(createContext(request) as any)).resolves.toBe(true);
    expect(request.user).toMatchObject({ moduleAccessKey:'operations.reservations.list', moduleAccessMode:'EDIT' });
    const denied = new AuthGuard(reflector, new AuthorizationService(), { query:async()=>[{permission_key:'operations.reservations.list',effect:'EDIT'},{permission_key:'operations.reservations',effect:'DENY'}] } as unknown as DataSource);
    await expect(denied.canActivate(createContext({ user:{ ...user }, path:'/reservations', method:'GET' }) as any)).rejects.toThrow('Module access denied');
  });

  it('ignores legacy critical overrides so account recovery cannot be locked out', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const guard = new AuthGuard(reflector, new AuthorizationService(), { query:async()=>[{permission_key:'system.users',effect:'DENY'}] } as unknown as DataSource);
    const itAdmin = { userId:'it', email:'it@example.test', role:'IT_ADMIN' as const, branchId:'makati' };
    await expect(guard.canActivate(createContext({user:itAdmin,path:'/users',method:'GET'}) as any)).resolves.toBe(true);
  });

  it('applies an explicit Edit override when a page defaults to View', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const admin = { userId: 'hr-1', email: 'hr@example.test', role: 'HR_ADMIN' as const, branchId: 'branch-1' };
    const viewGuard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [{ permission_key: 'hr.dashboard', effect: 'VIEW' }] } as unknown as DataSource,
    );
    await expect(viewGuard.canActivate(createContext({ user: admin, path: '/hr', method: 'POST' }) as any)).rejects.toThrow('View-only module access');

    const editGuard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [{ permission_key: 'hr.dashboard', effect: 'EDIT' }] } as unknown as DataSource,
    );
    await expect(editGuard.canActivate(createContext({ user: admin, path: '/hr', method: 'POST' }) as any)).resolves.toBe(true);
  });

  it('honors an explicit user module grant when the target role default is No access', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const employee = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };
    const grantedGuard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [{ permission_key: 'hr.employees', effect: 'EDIT' }] } as unknown as DataSource,
    );
    await expect(grantedGuard.canActivate(createContext({ user: employee, path: '/employees', method: 'GET' }) as any)).resolves.toBe(true);

    const deniedGuard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [] } as unknown as DataSource,
    );
    await expect(deniedGuard.canActivate(createContext({ user: employee, path: '/employees', method: 'GET' }) as any)).rejects.toThrow('Insufficient permission');
  });

  it('applies an explicit module grant to bounded API permissions while preserving branch scope', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = ((key: string) => key === AUTH_PERMISSION_KEY
      ? { module: 'employees', action: 'VIEW', scope: 'BRANCH', branchParam: 'branchId' }
      : undefined) as any;
    const employee = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };
    const guard = new AuthGuard(
      reflector,
      new AuthorizationService(),
      { query: async () => [{ permission_key: 'hr.employees', effect: 'VIEW' }] } as unknown as DataSource,
    );
    await expect(guard.canActivate(createContext({ user: employee, path: '/employees', method: 'GET' }) as any)).resolves.toBe(true);
    await expect(guard.canActivate(createContext({ user: employee, path: '/employees', method: 'GET', params: { branchId: 'branch-2' } }) as any)).rejects.toThrow('Branch access denied');
  });

  it('maps linked employee self-service detail routes to the portal permission', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const dataSource = {
      query: async (sql: string) => sql.includes('SELECT COALESCE') ? [{ employeeId: 'employee-1' }] : [],
    } as unknown as DataSource;
    const guard = new AuthGuard(reflector, new AuthorizationService(), dataSource);
    const employee = { userId: 'employee-1', email: 'employee@example.test', role: 'EMPLOYEE' as const, branchId: 'branch-1' };

    await expect(guard.canActivate(createContext({ user: employee, path: '/employees/employee-1/emergency-contact', method: 'PATCH' }) as any)).resolves.toBe(true);
    for (const path of [
      '/employees/employee-1',
      '/employees/employee-1/hr-profile',
      '/employees/employee-1/workflow/work-schedule',
      '/employees/employee-1/workflow/work-schedule/week',
      '/employees/employee-1/assignment-history',
      '/employees/employee-1/document-records',
    ]) {
      const request = { user:{ ...employee }, path, method:'GET' };
      await expect(guard.canActivate(createContext(request) as any)).resolves.toBe(true);
      expect(request.user).toMatchObject({ moduleAccessKey:'people.my-portal', moduleAccessMode:'EDIT' });
    }
    await expect(guard.canActivate(createContext({ user:{ ...employee }, path:'/employees/employee-1/workflow/work-schedule', method:'POST' }) as any)).rejects.toThrow('Insufficient permission');
    await expect(guard.canActivate(createContext({ user: employee, path: '/employees/other-employee/profile-picture', method: 'GET' }) as any)).rejects.toThrow('Insufficient permission');
  });

  it.each([
    '/employees/employee-1/hr-profile',
    '/employees/employee-1/workflow/work-schedule/week',
    '/employees/employee-1/document-records',
  ])('maps linked IT Admin self-service route %s to the portal permission', async (path) => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const dataSource = {
      query: async (sql: string) => sql.includes('SELECT COALESCE') ? [{ employeeId: 'employee-1' }] : [],
    } as unknown as DataSource;
    const guard = new AuthGuard(reflector, new AuthorizationService(), dataSource);
    const request = {
      user: { userId: 'it-1', email: 'it@example.test', role: 'IT_ADMIN' as const, branchId: 'branch-1' },
      path,
      method: 'GET',
    };
    await expect(guard.canActivate(createContext(request) as any)).resolves.toBe(true);
    expect(request.user).toMatchObject({ moduleAccessKey: 'people.my-portal', moduleAccessMode: 'EDIT' });
  });

  it('enforces the employee-profile permission key on dynamic employee API routes', async () => {
    const reflector = new Reflector();
    reflector.getAllAndOverride = (() => undefined) as any;
    const dataSource = { query: async () => [{ permission_key: 'hr.employee-profile', effect: 'DENY' }] } as unknown as DataSource;
    const guard = new AuthGuard(reflector, new AuthorizationService(), dataSource);
    const manager = { userId: 'manager', email: 'manager@example.test', role: 'HR_ADMIN' as const, branchId: 'branch-1' };

    await expect(guard.canActivate(createContext({ user: manager, path: '/employees/employee-2', method: 'GET' }) as any)).rejects.toThrow('Module access denied');
  });

});
