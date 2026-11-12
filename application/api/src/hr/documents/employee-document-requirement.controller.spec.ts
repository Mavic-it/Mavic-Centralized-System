import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeDocumentRequirementController } from './employee-document-requirement.controller.js';
import { EmployeeDocumentService } from './employee-document.service.js';
import { describe, expect, it, vi } from 'vitest';

describe('EmployeeDocumentRequirementController access boundaries', () => {
  it('allows an assigned branch manager to read active requirement names', async () => {
    const listRequirements = vi.fn().mockResolvedValue([]);
    const controller = new EmployeeDocumentRequirementController({
      listRequirements,
    } as unknown as EmployeeDocumentService);
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await controller.list('branch-1', undefined, request);

    expect(listRequirements).toHaveBeenCalledWith('branch-1', false);
  });

  it('rejects managers assigned to another branch before reading requirements', async () => {
    const listRequirements = vi.fn();
    const controller = new EmployeeDocumentRequirementController({
      listRequirements,
    } as unknown as EmployeeDocumentService);
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-2',
      },
    } as AuthenticatedRequest;

    await expect(
      controller.list('branch-1', undefined, request),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listRequirements).not.toHaveBeenCalled();
  });

  it('does not allow branch managers to change HR document policy', async () => {
    const createRequirement = vi.fn();
    const controller = new EmployeeDocumentRequirementController({
      createRequirement,
    } as unknown as EmployeeDocumentService);
    const request = {
      user: {
        userId: 'manager-1',
        email: 'manager@example.test',
        role: 'BRANCH_MANAGER',
        branchId: 'branch-1',
      },
    } as AuthenticatedRequest;

    await expect(
      controller.create('branch-1', request, {
        name: 'Signed contract',
        category: 'CONTRACT_RECORD',
        isRequired: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(createRequirement).not.toHaveBeenCalled();
  });
});
