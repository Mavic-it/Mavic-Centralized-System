import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeProfilePictureController } from './employee-profile-picture.controller.js';
import { EmployeeProfilePictureService } from './employee-profile-picture.service.js';
import { EmployeeService } from './employee.service.js';

const employee = {
  id: 'employee-1',
  branchId: 'branch-1',
  email: 'employee@example.test',
};

function setup() {
  const save = vi.fn().mockResolvedValue({ updatedAt: '2026-10-08T00:00:00.000Z' });
  const controller = new EmployeeProfilePictureController(
    { save } as unknown as EmployeeProfilePictureService,
    { findById: vi.fn().mockResolvedValue(employee) } as unknown as EmployeeService,
  );
  return { controller, save };
}

describe('EmployeeProfilePictureController', () => {
  it('allows employees to upload a valid picture to their own profile', async () => {
    const { controller, save } = setup();
    const request = {
      user: {
        userId: 'user-1',
        role: 'EMPLOYEE',
        email: 'EMPLOYEE@example.test',
      },
    } as AuthenticatedRequest;
    const file = {
      mimetype: 'image/png',
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    };

    await expect(controller.upload('employee-1', request, file)).resolves.toEqual({
      profilePictureUpdatedAt: '2026-10-08T00:00:00.000Z',
    });
    expect(save).toHaveBeenCalledWith(
      'employee-1',
      'branch-1',
      'user-1',
      'image/png',
      file.buffer,
    );
  });

  it('rejects an employee uploading to another employee profile', async () => {
    const { controller, save } = setup();
    const request = {
      user: {
        userId: 'user-2',
        role: 'EMPLOYEE',
        email: 'other@example.test',
      },
    } as AuthenticatedRequest;

    await expect(
      controller.upload('employee-1', request, {
        mimetype: 'image/png',
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(save).not.toHaveBeenCalled();
  });

  it('rejects a picture whose bytes do not match its declared image type', async () => {
    const { controller, save } = setup();
    const request = {
      user: {
        userId: 'user-1',
        role: 'HR_ADMIN',
        email: 'hr@example.test',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await expect(
      controller.upload('employee-1', request, {
        mimetype: 'image/png',
        buffer: Buffer.from('not an image'),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
});
