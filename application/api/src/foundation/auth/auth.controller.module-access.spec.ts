import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from './auth.context.js';
import type { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';

const request = (role: 'EMPLOYEE' | 'IT_ADMIN'): AuthenticatedRequest => ({
  user: { userId:'user-1', email:'user@example.test', role, branchId:'makati' },
}) as AuthenticatedRequest;

describe('session module access projection', () => {
  it('projects inherited personal defaults and denied administration', async () => {
    const controller = new AuthController({} as AuthService, { query:async()=>[] } as unknown as DataSource);
    const session = await controller.currentUser(request('EMPLOYEE'));
    expect(session.grantedPermissionKeys).toContain('people.my-portal');
    expect(session.grantedPermissionKeys).toContain('workspace.overview');
    expect(session.deniedPermissionKeys).toContain('system.module-access');
  });

  it('shows an explicitly granted child through a navigation parent and ignores critical denies', async () => {
    const controller = new AuthController({} as AuthService, { query:async()=>[
      {permissionKey:'operations.reservations.list',effect:'EDIT'},
      {permissionKey:'system.users',effect:'DENY'},
    ] } as unknown as DataSource);
    const employee = await controller.currentUser(request('EMPLOYEE'));
    expect(employee.grantedPermissionKeys).toContain('operations.reservations.list');
    expect(employee.grantedPermissionKeys).toContain('operations.reservations');
    const it = await controller.currentUser(request('IT_ADMIN'));
    expect(it.grantedPermissionKeys).toContain('system.users');
  });
});
