import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { UserService } from './user.service.js';

describe('branch manager candidates', () => {
  it('lists saved HR Admins and Branch Managers and marks unavailable accounts instead of hiding them', async () => {
    const service = new UserService();
    for (const account of [
      { id: 'hr-company', role: 'HR_ADMIN' },
      { id: 'hr-branch', role: 'HR_ADMIN', branchId: 'branch-1' },
      { id: 'manager', role: 'BRANCH_MANAGER', branchId: 'branch-1' },
      { id: 'other-hr', role: 'HR_ADMIN', branchId: 'branch-2' },
      { id: 'inactive-hr', role: 'HR_ADMIN', status: 'INACTIVE' as const },
      { id: 'unlinked-hr', role: 'HR_ADMIN', employeeId: undefined },
      { id: 'staff', role: 'STAFF' },
      { id: 'admin', role: 'SUPER_ADMIN' },
    ]) {
      service.create({
        name: account.id, email: `${account.id}@example.test`, status: 'ACTIVE',
        employeeId: `${account.id}-employee`, ...account,
      });
    }
    const options = await service.listBranchManagerOptions('branch-1');
    expect(options.map((option) => option.id)).toEqual([
      'hr-branch', 'hr-company', 'manager', 'other-hr', 'unlinked-hr',
    ]);
    expect(options.filter((option) => option.isAssignable).map((option) => option.id))
      .toEqual(['hr-branch', 'hr-company', 'manager', 'other-hr']);
    expect(options.find((option) => option.id === 'other-hr')).toMatchObject({
      isAssignable: true, unavailableReason: null,
    });
    expect(options.find((option) => option.id === 'unlinked-hr')).toMatchObject({
      isAssignable: false, unavailableReason: 'Link an employee in User Access first',
    });
    expect((await service.listBranchManagerOptions())
      .filter((option) => option.isAssignable).map((option) => option.id))
      .toEqual(['hr-branch', 'hr-company', 'manager', 'other-hr']);
    expect(options.every((option) => !('passwordHash' in option))).toBe(true);
  });

  it('returns a manager once with multiple branch assignments and keeps them assignable', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([{
        id: 'hr-1', name: 'HR User', email: 'hr@example.test', role: 'HR_ADMIN',
        status: 'ACTIVE', branchId: null, phone: '09123456789', hasEmployeeLink: true,
        managedBranches: [
          { id: 'branch-2', name: 'Second branch' },
          { id: 'branch-3', name: 'Third branch' },
        ],
      }]),
    } as unknown as DataSource;
    const service = new UserService(dataSource);
    await expect(service.listBranchManagerOptions('branch-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'hr-1', isAssignable: true, unavailableReason: null,
        managedBranches: expect.arrayContaining([
          { id: 'branch-2', name: 'Second branch' },
          { id: 'branch-3', name: 'Third branch' },
        ]),
      }),
    ]);
    await expect(service.listBranchManagerOptions('branch-2')).resolves.toEqual([
      expect.objectContaining({ id: 'hr-1', isAssignable: true, unavailableReason: null }),
    ]);
  });
});

describe('role updates for assigned branch managers', () => {
  function setup() {
    const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM users WHERE')) return [{ id: 'hr', role: 'HR_ADMIN' }];
      if (sql.includes('WHERE manager_user_id')) return [{ branchId: 'branch-1' }];
      if (sql.includes('FROM employees')) return [{ name: 'HR User', email: 'hr@example.test' }];
      if (sql.includes('FROM branches') && sql.includes('FOR SHARE')) return [{ isActive: true }];
      if (sql.includes('UPDATE users')) return [{ id: 'hr', role: parameters[1], branchId: parameters[3] }];
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
    } as unknown as DataSource;
    return new UserService(dataSource);
  }

  it('preserves a company-wide HR role while the account manages a branch', async () => {
    await expect(setup().updateRole('hr', 'HR_ADMIN', 'employee-1', null))
      .resolves.toMatchObject({ role: 'HR_ADMIN' });
  });

  it.each([
    ['EMPLOYEE', 'branch-1'],
    ['SUPER_ADMIN', null],
    ['STAFF', 'branch-2'],
  ] as const)('blocks incompatible role/scope changes: %s, %s', async (role, branchId) => {
    await expect(setup().updateRole('hr', role, 'employee-1', branchId))
      .rejects.toThrow('Remove this account from all branch manager assignments');
  });

  it('allows a deliberate primary-branch change while retaining a valid management role', async () => {
    await expect(setup().updateRole('hr', 'HR_ADMIN', 'employee-1', 'branch-2'))
      .resolves.toMatchObject({ role: 'HR_ADMIN', branchId: 'branch-2' });
  });
});
