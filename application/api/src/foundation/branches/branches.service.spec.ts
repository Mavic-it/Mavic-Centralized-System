import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { BranchService } from './branches.service.js';
import { BadRequestException } from '@nestjs/common';

describe('BranchService database updates', () => {
  it('returns the persisted branch after update without relying on UPDATE timestamps', async () => {
    const persisted = {
      id: 'branch-1',
      code: 'MAKATI',
      name: 'Mspaces Makati',
      description: null,
      address: 'Rufino',
      city: 'Makati',
      province: null,
      postalCode: null,
      phone: null,
      email: null,
      managerName: null,
      status: 'ACTIVE',
      isActive: true,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
      updatedAt: new Date('2026-09-01T00:00:00.000Z'),
    };

    const manager = {
      query: vi.fn(async (sql: string, parameters: unknown[] = []) => {
        if (sql.startsWith('SELECT')) return [{ ...persisted }];
        if (sql.startsWith('UPDATE')) {
          persisted.name = String(parameters[0]);
          persisted.updatedAt = new Date('2026-09-29T07:19:00.000Z');
          // Model drivers that don't return aliased timestamp fields consistently.
          return [{ ...persisted, createdAt: undefined, updatedAt: undefined }];
        }
        return [];
      }),
    } as unknown as EntityManager;
    const dataSource = {
      transaction: vi.fn(
        (work: (transactionManager: EntityManager) => Promise<unknown>) =>
          work(manager),
      ),
    } as unknown as DataSource;

    const service = new BranchService(dataSource);
    const result = await service.update(
      'branch-1',
      { name: 'Mspaces Makati Center' },
      'admin-1',
    );

    expect(result.name).toBe('Mspaces Makati Center');
    expect(result.createdAt).toBe('2026-09-01T00:00:00.000Z');
    expect(result.updatedAt).toBe('2026-09-29T07:19:00.000Z');
  });
});

describe('branch manager account assignment', () => {
  function setup(options: {
    role?: string;
    accountBranchId?: string | null;
    employeeId?: string | null;
    status?: string;
    assignedElsewhere?: boolean;
  } = {}) {
    const branch = {
      id: 'branch-1', code: 'FIRST', name: 'First branch', address: 'Street',
      city: 'Makati', status: 'ACTIVE', isActive: true,
      managerUserId: null as string | null, managerName: null as string | null,
      createdAt: new Date(), updatedAt: new Date(),
    };
    const account = {
      id: 'manager-1', name: 'Manager', role: options.role ?? 'HR_ADMIN',
      branchId: options.accountBranchId ?? null,
      employeeId: options.employeeId === undefined ? 'employee-1' : options.employeeId,
      status: options.status ?? 'ACTIVE',
    };
    const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('FROM users WHERE id')) return [{ ...account }];
      if (sql.includes('SELECT id FROM branches')) {
        return options.assignedElsewhere ? [{ id: 'branch-2' }] : [];
      }
      if (sql.includes('FROM branches b')) return [{ ...branch }];
      if (sql.startsWith('UPDATE users')) account.branchId = String(parameters[1]);
      if (sql.startsWith('UPDATE branches')) {
        branch.managerName = String(parameters[0]);
        branch.managerUserId = String(parameters[1]);
      }
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
    } as unknown as DataSource;
    return { service: new BranchService(dataSource), account, query };
  }

  it.each([null, 'branch-1'])(
    'assigns an HR Admin and preserves their existing branch scope (%s)', async (branchId) => {
      const { service, account, query } = setup({ accountBranchId: branchId });
      await expect(service.update('branch-1', { managerUserId: account.id }, 'admin-1'))
        .resolves.toMatchObject({ managerUserId: account.id, managerName: account.name });
      expect(account.branchId).toBe(branchId);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('UPDATE users'))).toBe(false);
      expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO audit_logs'))).toBe(true);
    },
  );

  it('still assigns branch scope to an unassigned Branch Manager', async () => {
    const { service, account } = setup({ role: 'BRANCH_MANAGER' });
    await service.update('branch-1', { managerUserId: account.id }, 'admin-1');
    expect(account.branchId).toBe('branch-1');
  });

  it.each(['IT_ADMIN', 'EMPLOYEE', 'SUPER_ADMIN'])(
    'rejects an account with the %s role', async (role) => {
      const { service } = setup({ role });
      await expect(service.update('branch-1', { managerUserId: 'manager-1' }, 'admin-1'))
        .rejects.toThrow(BadRequestException);
    },
  );

  it.each([
    { employeeId: null },
    { status: 'INACTIVE' },
  ])('rejects new assignments without an active employee-linked account: %o', async (options) => {
    const { service } = setup(options);
    await expect(service.update('branch-1', { managerUserId: 'manager-1' }, 'admin-1'))
      .rejects.toThrow(BadRequestException);
  });

  it.each(['HR_ADMIN', 'BRANCH_MANAGER'])(
    'allows the same %s on an additional branch and preserves the primary scope', async (role) => {
    const { service, account } = setup({ role, accountBranchId: 'branch-2', assignedElsewhere: true });
    await expect(service.update('branch-1', { managerUserId: account.id }, 'admin-1'))
      .resolves.toMatchObject({ managerUserId: account.id });
    expect(account.branchId).toBe('branch-2');
  });
});
