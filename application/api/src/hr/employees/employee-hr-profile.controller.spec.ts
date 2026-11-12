import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from './employee.service.js';
import { EmployeeHrProfileController } from './employee-hr-profile.controller.js';
import {
  EmployeeHrProfileService,
  type EmployeeHrProfile,
} from './employee-hr-profile.service.js';
import { describe, expect, it, vi } from 'vitest';

const profile: EmployeeHrProfile = {
  employeeId: 'employee-1',
  firstName: 'Employee',
  middleName: null,
  lastName: 'One',
  suffix: null,
  preferredName: null,
  dateOfBirth: null,
  gender: null,
  civilStatus: null,
  nationality: null,
  personalEmail: null,
  currentAddress: null,
  permanentAddress: null,
  jobLevel: 'L2',
  salaryGrade: 'G5',
  basicSalary: 75000,
  workSchedule: null,
  shift: null,
  probationary: null,
  regularizationDate: null,
  separationDate: null,
  separationReason: null,
};

function makeController() {
  const findById = vi.fn().mockResolvedValue({
    id: 'employee-1',
    branchId: 'branch-1',
    email: 'employee@example.test',
  });
  const findByEmployeeId = vi.fn().mockResolvedValue(profile);
  const update = vi.fn().mockResolvedValue(profile);
  const controller = new EmployeeHrProfileController(
    { findByEmployeeId, update } as unknown as EmployeeHrProfileService,
    { findById } as unknown as EmployeeService,
  );
  return { controller, findById, findByEmployeeId, update };
}

function makeRequest(
  role: string,
  email: string,
  branchId: string | null,
): AuthenticatedRequest {
  return {
    ip: '127.0.0.1',
    get: vi.fn().mockReturnValue('test-agent'),
    user: {
      userId: 'user-1',
      email,
      role,
      branchId,
    },
  } as unknown as AuthenticatedRequest;
}

describe('EmployeeHrProfileController access boundaries', () => {
  it('hides salary fields from branch managers', async () => {
    const { controller } = makeController();

    const result = await controller.get(
      'employee-1',
      makeRequest('BRANCH_MANAGER', 'manager@example.test', 'branch-1'),
    );

    expect(result?.basicSalary).toBeNull();
    expect(result?.salaryGrade).toBeNull();
    expect(result?.jobLevel).toBe('L2');
  });

  it('allows employees to update personal fields only', async () => {
    const { controller, update } = makeController();

    await controller.update(
      'employee-1',
      makeRequest('EMPLOYEE', 'employee@example.test', 'branch-1'),
      { preferredName: 'Alex' },
    );

    expect(update).toHaveBeenCalledOnce();
    await expect(
      controller.update(
        'employee-1',
        makeRequest('EMPLOYEE', 'employee@example.test', 'branch-1'),
        { basicSalary: 1 },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).toHaveBeenCalledOnce();
  });

  it('allows IT administrators to read only their own profile and hides compensation', async () => {
    const { controller, findById, findByEmployeeId } = makeController();

    const result = await controller.get(
      'employee-1',
      makeRequest('IT_ADMIN', 'employee@example.test', 'branch-1'),
    );

    expect(result?.basicSalary).toBeNull();
    expect(result?.salaryGrade).toBeNull();
    expect(findById).toHaveBeenCalledOnce();
    expect(findByEmployeeId).toHaveBeenCalledOnce();
    await expect(
      controller.get(
        'employee-1',
        makeRequest('IT_ADMIN', 'it@example.test', 'branch-1'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps HR profile editing unavailable to IT administrators', async () => {
    const { controller, update } = makeController();
    await expect(
      controller.update(
        'employee-1',
        makeRequest('IT_ADMIN', 'employee@example.test', 'branch-1'),
        { preferredName: 'Alex' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects reads outside a branch manager branch', async () => {
    const { controller, findByEmployeeId } = makeController();

    await expect(
      controller.get(
        'employee-1',
        makeRequest('BRANCH_MANAGER', 'manager@example.test', 'branch-2'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findByEmployeeId).not.toHaveBeenCalled();
  });
});
