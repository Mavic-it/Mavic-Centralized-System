import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from '../employees/employee.service.js';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { describe, expect, it, vi } from 'vitest';

describe('AttendanceController access boundaries', () => {
  it('limits an employee attendance query to their own employee record', async () => {
    const list = vi.fn().mockResolvedValue([]);
    const service = { list } as unknown as AttendanceService;
    const employees = {
      findByEmail: vi
        .fn()
        .mockResolvedValue({ id: 'employee-1', branchId: 'branch-1' }),
    } as unknown as EmployeeService;
    const controller = new AttendanceController(service, employees);
    const request = {
      user: {
        userId: 'user-1',
        email: 'staff@example.test',
        role: 'STAFF',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await controller.list(request, {
      employeeId: 'someone-else',
      branchId: 'branch-2',
    });

    const filters = list.mock.calls[0][0];
    expect(filters.employeeId).toBe('employee-1');
    expect(filters.branchId).toBe('branch-1');
    expect(filters.employeeId).not.toBe('someone-else');
  });

  it('rejects branch managers without an assigned branch', async () => {
    const controller = new AttendanceController(
      { list: vi.fn() } as unknown as AttendanceService,
      {} as EmployeeService,
    );
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(controller.list(request, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects schedule reads outside an employee’s own branch', async () => {
    const getSchedule = vi.fn();
    const controller = new AttendanceController(
      { getSchedule } as unknown as AttendanceService,
      {
        findByEmail: vi
          .fn()
          .mockResolvedValue({ id: 'employee-1', branchId: 'branch-1' }),
      } as unknown as EmployeeService,
    );
    const request = {
      user: {
        userId: 'staff-1',
        email: 'staff@example.test',
        role: 'STAFF',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await expect(
      controller.getSchedule('branch-2', request),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(getSchedule).not.toHaveBeenCalled();
  });
});
