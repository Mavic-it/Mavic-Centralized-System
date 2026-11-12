import { describe, expect, it } from 'vitest';
import { BranchesController } from './branches/branches.controller.js';
import { BranchService } from './branches/branches.service.js';
import { PermissionController } from './permissions/permission.controller.js';
import { PermissionService } from './permissions/permission.service.js';
import { RoleController } from './roles/role.controller.js';
import { RoleService } from './roles/role.service.js';
import { UserController } from './users/user.controller.js';
import { UserService } from './users/user.service.js';
import type { AuthenticatedRequest } from './auth/auth.context.js';
import { AuthorizationService } from '../security/authorization/authorization.service.js';
import { EmployeeController } from '../hr/employees/employee.controller.js';
import { EmployeeService } from '../hr/employees/employee.service.js';
import { ConflictException, ForbiddenException } from '@nestjs/common';

describe('MSPACES foundation controllers', () => {
  it('exposes dynamic branch records through the authorized API contract', async () => {
    const service = new BranchService();
    const authorization = new AuthorizationService();
    const controller = new BranchesController(service, authorization);
    const request = {
      user: {
        userId: 'admin-1',
        email: 'admin@mspaces.test',
        role: 'SUPER_ADMIN' as const,
        branchId: null,
        scope: 'ALL' as const,
      },
    };

    const makati = await service.create({
      name: 'Mspaces Makati',
      code: ' makati ',
      address: '123 Example Street',
      city: 'Makati',
    });
    expect(makati.code).toBe('MAKATI');
    expect(
      (await controller.list(request, { status: 'ACTIVE' })).data,
    ).toHaveLength(1);

    const ortigas = await controller.create(request, {
      name: 'Mspaces Ortigas',
      code: 'ORTIGAS',
      address: '20 Example Avenue',
      city: 'Pasig',
    });
    expect(ortigas.data.code).toBe('ORTIGAS');

    const branchManagerRequest = {
      user: {
        userId: 'manager-1',
        email: 'manager@mspaces.test',
        role: 'BRANCH_MANAGER' as const,
        branchId: makati.id,
        scope: 'BRANCH' as const,
      },
    };
    await controller.update(branchManagerRequest, makati.id, {
      city: 'Makati City',
    });
    await expect(
      controller.update(branchManagerRequest, ortigas.data.id, {
        city: 'Pasig',
      }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.setStatus(branchManagerRequest, ortigas.data.id, {
        status: 'INACTIVE',
      }),
    ).rejects.toThrow(ForbiddenException);

    const allBranchHrRequest = {
      user: {
        userId: 'hr-all-1',
        email: 'hr@mspaces.test',
        role: 'HR_ADMIN' as const,
        branchId: null,
        scope: 'ALL' as const,
      },
    };
    await expect(
      controller.list(allBranchHrRequest, { status: 'ALL' }),
    ).resolves.toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ id: makati.id }),
        expect.objectContaining({ id: ortigas.data.id }),
      ]),
    });
    await expect(
      controller.update(allBranchHrRequest, ortigas.data.id, {
        city: 'Pasig City',
      }),
    ).resolves.toMatchObject({ data: { city: 'Pasig City' } });

    await expect(
      service.create({
        name: 'Duplicate Makati',
        code: 'makati',
        address: 'Another address',
        city: 'Makati',
      }),
    ).rejects.toThrow(ConflictException);

    const edited = await service.update(ortigas.data.id, {
      name: 'Mspaces Ortigas Center',
      city: 'Ortigas Center',
    });
    expect(edited).toMatchObject({
      code: 'ORTIGAS',
      name: 'Mspaces Ortigas Center',
    });

    const inactive = await service.setStatus(ortigas.data.id, 'INACTIVE');
    expect(inactive.status).toBe('INACTIVE');
    expect(
      (await controller.list(request, { status: 'INACTIVE' })).data,
    ).toHaveLength(1);

    const inactiveViewRequest = {
      user: {
        userId: 'staff-1',
        email: 'staff@mspaces.test',
        role: 'STAFF' as const,
        branchId: makati.id,
        scope: 'BRANCH' as const,
      },
    };
    await expect(
      controller.create(inactiveViewRequest, {
        name: 'Unauthorized Branch',
        code: 'UNAUTHORIZED',
        address: 'Nowhere',
        city: 'Nowhere',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('provides role-level permission resolution for branch managers', () => {
    const controller = new RoleController(new RoleService());
    const permissions = controller.permissions('BRANCH_MANAGER');

    expect(
      permissions.some(
        (permission) =>
          permission.module === 'employees' && permission.action === 'VIEW',
      ),
    ).toBe(true);
    expect(
      permissions.some(
        (permission) =>
          permission.module === 'rooms' && permission.action === 'UPDATE',
      ),
    ).toBe(true);
  });

  it('checks a permission against the role matrix', () => {
    const controller = new PermissionController(new PermissionService());
    expect(controller.check('HR_ADMIN', 'employees', 'UPDATE', 'BRANCH')).toEqual(
      { allowed: true },
    );
    expect(controller.check('EMPLOYEE', 'profile', 'UPDATE', 'OWN')).toEqual({
      allowed: true,
    });
  });

  it('filters users by branch for scoped access', async () => {
    const users = new UserService();
    const controller = new UserController(users, new BranchService());

    users.create({
      id: 'u-1',
      email: 'a@mspaces.test',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
      status: 'ACTIVE',
      name: 'A',
    });
    users.create({
      id: 'u-2',
      email: 'b@mspaces.test',
      role: 'EMPLOYEE',
      branchId: 'branch-2',
      status: 'ACTIVE',
      name: 'B',
    });

    await expect(controller.list({ user: { role: 'SUPER_ADMIN' } } as AuthenticatedRequest, 'branch-1')).resolves.toHaveLength(1);
  });

  it('prevents IT Admin from changing Super Admin credentials or status', async () => {
    const users = new UserService();
    const controller = new UserController(users, new BranchService());
    users.create({
      id: 'super-1',
      email: 'super@mspaces.test',
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
    });
    const request = {
      user: {
        userId: 'it-1',
        email: 'it@mspaces.test',
        role: 'IT_ADMIN' as const,
        branchId: null,
      },
    };

    await expect(
      controller.updateStatus('super-1', request, { status: 'INACTIVE' }),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.resetPassword('super-1', request, {
        password: 'Password1234',
      } as any),
    ).rejects.toThrow(ForbiddenException);
    await expect(controller.deleteAccount('super-1', request)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('returns account-selection and branch context without exposing sensitive employee fields', async () => {
    const employees = new EmployeeService();
    employees.create({
      id: 'emp-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Maria Santos',
      email: 'maria@mspaces.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2024-01-15' },
      salary: 50000,
    });
    const controller = new EmployeeController(employees, new UserService());

    const options = await controller.accountOptions({
      user: { role: 'IT_ADMIN' },
    } as any);
    expect(options).toEqual([
      expect.objectContaining({
        id: 'emp-1',
        employeeNumber: 'EMP001',
        name: 'Maria Santos',
        email: 'maria@mspaces.test',
        branchId: 'branch-1',
        hasUserAccount: false,
        employment: expect.objectContaining({
          employeeType: 'FULL_TIME',
          startDate: '2024-01-15',
        }),
      }),
    ]);
    // New account-selection fields can be added without leaking sensitive payroll/PII.
    expect(options[0]).not.toHaveProperty('salary');
    expect(options[0]).not.toHaveProperty('governmentIds');
    expect(options[0]).not.toHaveProperty('passwordHash');
    await expect(
      controller.accountOptions({ user: { role: 'HR_ADMIN' } } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows IT Admin to edit linked account roles but not grant Super Admin', async () => {
    const users = new UserService();
    const controller = new UserController(users, new BranchService());
    users.create({
      id: 'employee-user',
      email: 'employee@mspaces.test',
      name: 'Employee',
      role: 'EMPLOYEE',
      employeeId: 'emp-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
    });
    const itRequest = {
      user: {
        userId: 'it-1',
        email: 'it@mspaces.test',
        role: 'IT_ADMIN' as const,
        branchId: null,
      },
    };

    await expect(
      controller.updateRole('employee-user', itRequest, {
        role: 'STAFF',
        employeeId: 'emp-1',
        branchId: 'branch-1',
      } as any),
    ).resolves.toMatchObject({
      data: { role: 'STAFF', employeeId: 'emp-1', branchId: 'branch-1' },
    });
    await expect(
      controller.updateRole('employee-user', itRequest, {
        role: 'SUPER_ADMIN',
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows only Super Admin to promote an account, clear branch scope and retain its explicit employee link', async () => {
    const users = new UserService();
    const controller = new UserController(users, new BranchService());
    users.create({
      id: 'employee-user',
      email: 'employee@mspaces.test',
      name: 'Employee',
      role: 'EMPLOYEE',
      employeeId: 'emp-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
    });
    const superAdminRequest = {
      user: {
        userId: 'super-1',
        email: 'super@mspaces.test',
        role: 'SUPER_ADMIN' as const,
        branchId: null,
      },
    };

    await expect(
      controller.updateRole('employee-user', superAdminRequest, {
        role: 'SUPER_ADMIN',
      } as any),
    ).resolves.toMatchObject({
      data: { role: 'SUPER_ADMIN', employeeId: 'emp-1', branchId: undefined },
    });
  });
});
