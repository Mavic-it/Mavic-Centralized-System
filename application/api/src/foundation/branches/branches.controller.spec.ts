import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import type { RoleName } from '../../security/authorization/authorization.service.js';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';
import { UserService } from '../users/user.service.js';
import { BranchService } from './branches.service.js';
import { BranchesController } from './branches.controller.js';

async function setup() {
  const branches = new BranchService();
  const users = new UserService();
  const first = await branches.create({
    code: 'FIRST', name: 'First branch', address: 'First street', city: 'Makati',
  });
  const second = await branches.create({
    code: 'SECOND', name: 'Second branch', address: 'Second street', city: 'Pasig',
  });
  for (const [id, branchId] of [
    ['first-manager', first.id],
    ['second-manager', second.id],
    ['unassigned-manager', undefined],
  ] as const) {
    users.create({
      id, branchId, employeeId: `${id}-employee`, name: id,
      email: `${id}@example.test`, role: 'BRANCH_MANAGER', status: 'ACTIVE',
    });
  }
  const controller = new BranchesController(branches, new AuthorizationService(), users);
  const request = (role: RoleName, branchId: string | null = first.id) => ({
    user: { userId: 'viewer', email: 'viewer@example.test', role, branchId },
  }) as AuthenticatedRequest;
  return { controller, first, second, request, branches, users };
}

describe('branch manager list access', () => {
  it('allows a company-wide admin to select a manager already scoped to another branch', async () => {
    const { controller, first, request } = await setup();
    const response = await controller.managerOptions(request('SUPER_ADMIN', null), first.id);
    expect(response.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'second-manager', isAssignable: true }),
      expect.objectContaining({ id: 'first-manager', isAssignable: true }),
    ]));
  });
  it('shows HR Admin candidates to an authorized admin', async () => {
    const { controller, first, request, users } = await setup();
    users.create({
      id: 'hr-1', name: 'HR Admin', email: 'hr@example.test', role: 'HR_ADMIN',
      employeeId: 'hr-employee', status: 'ACTIVE', branchId: first.id,
    });
    const response = await controller.managerOptions(request('SUPER_ADMIN', null), first.id);
    expect(response.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'hr-1', role: 'HR_ADMIN' }),
    ]));
  });

  it('shows the assigned company-wide HR Admin to their branch viewer', async () => {
    const { controller, first, request, branches, users } = await setup();
    for (const id of ['assigned-hr', 'other-hr']) users.create({
      id, name: id, email: `${id}@example.test`, role: 'HR_ADMIN',
      employeeId: `${id}-employee`, status: 'ACTIVE',
    });
    await branches.update(first.id, { managerUserId: 'assigned-hr' });
    const response = await controller.managerOptions(request('BRANCH_MANAGER'), first.id);
    expect(response.data.map((manager) => manager.id)).toEqual(['assigned-hr', 'first-manager']);
  });

  it('lets a Branch Manager view only managers scoped to their branch', async () => {
    const { controller, first, request } = await setup();
    const response = await controller.managerOptions(request('BRANCH_MANAGER'), first.id);
    expect(response.data.map((manager) => manager.id)).toEqual(['first-manager']);
  });

  it('shows managers from other branches to a scoped HR Admin assigning their branch', async () => {
    const { controller, request } = await setup();
    const response = await controller.managerOptions(request('HR_ADMIN'));
    expect(response.data.map((manager) => manager.id))
      .toEqual(['first-manager', 'second-manager', 'unassigned-manager']);
  });

  it('defaults a Branch Manager viewer to managers in the active branch', async () => {
    const { controller, request } = await setup();
    const response = await controller.managerOptions(request('BRANCH_MANAGER'));
    expect(response.data.map((manager) => manager.id)).toEqual(['first-manager']);
  });

  it.each(['SUPER_ADMIN', 'HR_ADMIN'] as const)(
    'lets company-wide %s load candidates without a branch-create permission', async (role) => {
      const { controller, request } = await setup();
      const response = await controller.managerOptions(request(role, null));
      expect(response.data.map((manager) => manager.id))
        .toEqual(['first-manager', 'second-manager', 'unassigned-manager']);
      expect(response.data.filter((manager) => manager.isAssignable)
        .map((manager) => manager.id)).toEqual(['first-manager', 'second-manager', 'unassigned-manager']);
    },
  );

  it.each(['HR_ADMIN', 'BRANCH_MANAGER'] as const)(
    'blocks another branch for scoped %s', async (role) => {
      const { controller, second, request } = await setup();
      await expect(controller.managerOptions(request(role), second.id))
        .rejects.toThrow(ForbiddenException);
    },
  );

  it('denies an unassigned Branch Manager even when a branch is requested', async () => {
    const { controller, first, request } = await setup();
    await expect(controller.managerOptions(request('BRANCH_MANAGER', null), first.id))
      .rejects.toThrow(ForbiddenException);
  });

  it.each(['IT_ADMIN', 'STAFF', 'EMPLOYEE'] as const)(
    'denies list access for %s', async (role) => {
      const { controller, first, request } = await setup();
      await expect(controller.managerOptions(request(role), first.id))
        .rejects.toThrow(ForbiddenException);
    },
  );

  it('keeps manager assignment changes forbidden to Branch Managers', async () => {
    const { controller, first, request } = await setup();
    await expect(controller.update(request('BRANCH_MANAGER'), first.id, {
      managerUserId: 'first-manager',
    })).rejects.toThrow(ForbiddenException);
  });
});
