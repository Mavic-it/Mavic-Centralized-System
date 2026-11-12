import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { EmployeeDocumentService } from '../documents/employee-document.service.js';
import { EmployeeService } from './employee.service.js';
import { EmployeeWorkflowController } from './employee-workflow.controller.js';
import { describe, expect, it, vi } from 'vitest';

describe('EmployeeWorkflowController access boundaries', () => {
  const employee = {
    id: 'employee-1',
    branchId: 'branch-1',
    email: 'employee@example.test',
  };

  it('limits branch managers to schedule history from their assigned branch', async () => {
    const getEmployeeWorkSchedule = vi
      .fn()
      .mockResolvedValue({ current: null, history: [] });
    const controller = new EmployeeWorkflowController(
      {
        findById: vi.fn().mockResolvedValue(employee),
      } as unknown as EmployeeService,
      { getEmployeeWorkSchedule } as unknown as AttendanceService,
      {} as EmployeeDocumentService,
    );
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await controller.getWorkSchedule('employee-1', request);

    expect(getEmployeeWorkSchedule).toHaveBeenCalledWith(
      'employee-1',
      'branch-1',
      'branch-1',
    );
  });

  it('allows an employee to see their own schedule history across transfers', async () => {
    const getEmployeeWorkSchedule = vi
      .fn()
      .mockResolvedValue({ current: null, history: [] });
    const controller = new EmployeeWorkflowController(
      {
        findById: vi.fn().mockResolvedValue(employee),
      } as unknown as EmployeeService,
      { getEmployeeWorkSchedule } as unknown as AttendanceService,
      {} as EmployeeDocumentService,
    );
    const request = {
      user: {
        userId: 'user-1',
        email: employee.email,
        role: 'EMPLOYEE',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await controller.getWorkSchedule('employee-1', request);

    expect(getEmployeeWorkSchedule).toHaveBeenCalledWith(
      'employee-1',
      'branch-1',
      null,
    );
  });

  it('allows IT Admin to read their own work schedule, but not another employee schedule', async () => {
    const getEmployeeWorkSchedule = vi.fn().mockResolvedValue({ current: null, history: [] });
    const controller = new EmployeeWorkflowController(
      { findById: vi.fn().mockResolvedValue(employee) } as unknown as EmployeeService,
      { getEmployeeWorkSchedule } as unknown as AttendanceService,
      {} as EmployeeDocumentService,
    );
    const ownRequest = { user: { userId: 'it-1', email: employee.email, role: 'IT_ADMIN', branchId: 'branch-1' } } as AuthenticatedRequest;
    await controller.getWorkSchedule('employee-1', ownRequest);
    expect(getEmployeeWorkSchedule).toHaveBeenCalledWith('employee-1', 'branch-1', null);

    const otherRequest = { user: { userId: 'it-2', email: 'other@example.test', role: 'IT_ADMIN', branchId: 'branch-1' } } as AuthenticatedRequest;
    await expect(controller.getWorkSchedule('employee-1', otherRequest)).rejects.toBeInstanceOf(ForbiddenException);
    expect(getEmployeeWorkSchedule).toHaveBeenCalledOnce();
  });

  it('does not expose another employee workflow to an employee account', async () => {
    const getEmployeeWorkSchedule = vi.fn();
    const controller = new EmployeeWorkflowController(
      {
        findById: vi.fn().mockResolvedValue(employee),
      } as unknown as EmployeeService,
      { getEmployeeWorkSchedule } as unknown as AttendanceService,
      {} as EmployeeDocumentService,
    );
    const request = {
      user: {
        userId: 'user-2',
        email: 'other@example.test',
        role: 'EMPLOYEE',
        branchId: null,
      },
    } as AuthenticatedRequest;

    await expect(
      controller.getWorkSchedule('employee-1', request),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(getEmployeeWorkSchedule).not.toHaveBeenCalled();
  });
});
