import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { UserService } from '../../foundation/users/user.service.js';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DepartmentService } from '../../foundation/branches/departments.service.js';
import { EmployeeController } from './employee.controller.js';
import { EmployeeService, type EmployeeRecord } from './employee.service.js';
import { EmployeeHrProfileService } from './employee-hr-profile.service.js';
import { describe, expect, it, vi } from 'vitest';

describe('EmployeeController sensitive-field filtering', () => {
  it('rejects an employee department that is not registered to the selected branch', async () => {
    const createEmployee = vi.fn();
    const controller = new EmployeeController(
      { createEmployee } as unknown as EmployeeService,
      {} as UserService,
      undefined,
      {
        hasName: vi.fn().mockResolvedValue(false),
      } as unknown as DepartmentService,
    );

    await expect(
      controller.createEmployee(
        {
          branchId: 'branch-1',
          name: 'Employee Name',
          email: 'employee@example.test',
          position: 'Associate',
          department: 'Operations',
          employmentType: 'FULL_TIME',
          startDate: '2026-01-01',
          status: 'ACTIVE',
        },
        {
          user: { userId: 'admin-1', role: 'SUPER_ADMIN', branchId: null },
        } as AuthenticatedRequest,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createEmployee).not.toHaveBeenCalled();
  });

  it('prevents branch scoped users from reassigning an employee to another branch', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Employee Name',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const updateEmployee = vi.fn();
    const controller = new EmployeeController(
      {
        findById: vi.fn().mockResolvedValue(employee),
        updateEmployee,
      } as unknown as EmployeeService,
      {} as UserService,
    );

    await expect(
      controller.updateEmployee(
        'employee-1',
        {
          user: {
            userId: 'manager-1',
            role: 'BRANCH_MANAGER',
            branchId: 'branch-1',
            email: 'manager@example.test',
          },
        } as AuthenticatedRequest,
        { branchId: 'branch-2' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it('marks an employee as linked when an account uses its employee ID', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Employee',
      email: 'new-email@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const controller = new EmployeeController(
      {
        list: vi.fn().mockResolvedValue([employee]),
      } as unknown as EmployeeService,
      {
        listAccountEmails: vi
          .fn()
          .mockResolvedValue(['old-email@example.test']),
        listLinkedEmployeeIds: vi.fn().mockResolvedValue(['employee-1']),
      } as unknown as UserService,
    );
    const request = {
      user: { userId: 'it-1', role: 'IT_ADMIN' },
    } as AuthenticatedRequest;

    await expect(controller.accountOptions(request)).resolves.toEqual([
      expect.objectContaining({ id: 'employee-1', hasUserAccount: true }),
    ]);
  });

  it('does not infer a Super Admin employee link from matching email alone', async () => {
    const findByEmail = vi.fn().mockResolvedValue({ id: 'employee-1' });
    const controller = new EmployeeController(
      {
        findById: vi.fn().mockResolvedValue(undefined),
        findByEmail,
      } as unknown as EmployeeService,
      {
        findById: vi.fn().mockResolvedValue({
          id: 'admin-1',
          email: 'same@example.test',
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
        }),
      } as unknown as UserService,
    );

    await expect(
      controller.me({
        user: {
          userId: 'admin-1',
          email: 'same@example.test',
          role: 'SUPER_ADMIN',
          branchId: null,
        },
      } as AuthenticatedRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('initializes the HR profile name from the create employee form', async () => {
    const employee = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Maya Anne Santos',
      email: 'maya@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE' as const,
      employment: {
        employeeType: 'FULL_TIME' as const,
        startDate: '2026-01-01',
      },
    };
    const createEmployee = vi.fn().mockResolvedValue(employee);
    const updateProfile = vi.fn().mockResolvedValue({});
    const controller = new EmployeeController(
      { createEmployee } as unknown as EmployeeService,
      {} as UserService,
      { update: updateProfile } as unknown as EmployeeHrProfileService,
    );
    const request = {
      user: {
        userId: 'hr-user-1',
        role: 'HR_ADMIN',
        branchId: null,
      },
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
    } as AuthenticatedRequest;

    await controller.createEmployee(
      {
        branchId: 'branch-1',
        name: 'Maya Anne Santos',
        email: 'maya@example.test',
        position: 'Associate',
        department: 'Operations',
        employmentType: 'FULL_TIME',
        startDate: '2026-01-01',
        status: 'ACTIVE',
      },
      request,
    );

    expect(updateProfile).toHaveBeenCalledWith(
      'employee-1',
      {
        firstName: 'Maya',
        middleName: 'Anne',
        lastName: 'Santos',
      },
      'branch-1',
      expect.objectContaining({ userId: 'hr-user-1' }),
    );
  });

  it('omits HR-sensitive fields from IT admin employee profiles', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'IT Admin',
      email: 'it@example.test',
      position: 'Administrator',
      department: 'IT',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
      salary: 100000,
      phone: '+639171234567',
      emergencyContact: {
        name: 'Contact',
        relationship: 'Family',
        phone: '+639171234568',
      },
      governmentIds: ['private-id'],
      documents: ['private-document'],
      attendance: [],
    };
    const controller = new EmployeeController(
      {
        findById: vi.fn().mockResolvedValue(employee),
      } as unknown as EmployeeService,
      {
        hasAccountForEmployee: vi.fn().mockResolvedValue(false),
      } as unknown as UserService,
    );
    const request = {
      user: {
        userId: 'it-user-1',
        email: employee.email,
        role: 'IT_ADMIN',
        branchId: employee.branchId,
      },
    } as AuthenticatedRequest;

    const response = await controller.get(employee.id, request);

    expect(response.salary).toBeUndefined();
    expect(response.phone).toBeUndefined();
    expect(response.governmentIds).toBeUndefined();
    expect(response.documents).toBeUndefined();
    expect(response.emergencyContact).toBeUndefined();
    expect(response).not.toHaveProperty('leaveBalance');
    expect(response.attendance).toBeUndefined();
  });

  it('omits compensation from the employee directory for branch managers', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Branch Employee',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
      salary: 75000,
    };
    const service = {
      list: vi.fn().mockResolvedValue([employee]),
    } as unknown as EmployeeService;
    const controller = new EmployeeController(service, {} as UserService);
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    const response = await controller.list(request);

    expect(response[0].salary).toBeUndefined();
  });

  it('denies branch managers who have no assigned branch', async () => {
    const list = vi.fn();
    const controller = new EmployeeController({
      list,
    } as unknown as EmployeeService);
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(controller.list(request)).rejects.toThrow(
      'Branch manager must be assigned to a branch.',
    );
    expect(list).not.toHaveBeenCalled();
  });

  it('resolves the current employee through the account link before email fallback', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Linked Employee',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const findById = vi.fn().mockResolvedValue(employee);
    const findByEmail = vi.fn();
    const users = {
      findById: vi.fn().mockResolvedValue({ employeeId: employee.id }),
    };
    const controller = new EmployeeController(
      { findById, findByEmail } as unknown as EmployeeService,
      users as unknown as UserService,
    );
    const request = {
      user: {
        userId: 'user-1',
        email: 'legacy-email@example.test',
        role: 'EMPLOYEE',
        branchId: employee.branchId,
      },
    } as AuthenticatedRequest;

    await expect(controller.me(request)).resolves.toEqual(employee);
    expect(users.findById).toHaveBeenCalledWith('user-1');
    expect(findById).toHaveBeenCalledWith(employee.id);
    expect(findByEmail).not.toHaveBeenCalled();
  });

  it('keeps email lookup as a fallback for accounts without an employee link', async () => {
    const employee = { id: 'employee-1', salary: 50000 } as EmployeeRecord;
    const findByEmail = vi.fn().mockResolvedValue(employee);
    const controller = new EmployeeController(
      { findByEmail } as unknown as EmployeeService,
      {
        findById: vi.fn().mockResolvedValue({ employeeId: undefined }),
      } as unknown as UserService,
    );
    const request = {
      user: {
        userId: 'user-1',
        email: 'employee@example.test',
        role: 'EMPLOYEE',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(controller.me(request)).resolves.toEqual(employee);
    expect(findByEmail).toHaveBeenCalledWith('employee@example.test');
  });

  it('returns not found when neither the account link nor email identifies an employee', async () => {
    const controller = new EmployeeController(
      {
        findByEmail: vi.fn().mockResolvedValue(undefined),
      } as unknown as EmployeeService,
      {
        findById: vi.fn().mockResolvedValue(undefined),
      } as unknown as UserService,
    );
    const request = {
      user: {
        userId: 'user-1',
        email: 'employee@example.test',
        role: 'EMPLOYEE',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(controller.me(request)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('limits assignment history to the employee branch or the employee themself', async () => {
    const employee: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Employee Name',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const listAssignmentHistory = vi.fn().mockResolvedValue([]);
    const controller = new EmployeeController(
      {
        findById: vi.fn().mockResolvedValue(employee),
        listAssignmentHistory,
      } as unknown as EmployeeService,
      {} as UserService,
    );

    await expect(
      controller.assignmentHistory('employee-1', {
        user: {
          userId: 'manager-1',
          email: 'manager@example.test',
          role: 'BRANCH_MANAGER',
          branchId: 'branch-2',
        },
      } as AuthenticatedRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listAssignmentHistory).not.toHaveBeenCalled();

    await expect(
      controller.assignmentHistory('employee-1', {
        user: {
          userId: 'employee-user-1',
          email: employee.email,
          role: 'EMPLOYEE',
          branchId: null,
        },
      } as AuthenticatedRequest),
    ).resolves.toEqual([]);
    expect(listAssignmentHistory).toHaveBeenCalledWith(employee.id);
  });
});
