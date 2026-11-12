import { ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { DepartmentService } from './departments.service.js';
import { DEFAULT_DEPARTMENTS } from './default-departments.js';

describe('DepartmentService', () => {
  it('creates normalized departments and keeps departments branch scoped', async () => {
    const service = new DepartmentService();
    const created = await service.create(
      'branch-1',
      '  People Operations  ',
      'admin-1',
    );

    expect(created.name).toBe('People Operations');
    expect(await service.hasName('branch-1', 'people operations')).toBe(true);
    expect(await service.hasName('branch-2', 'People Operations')).toBe(false);
    expect(
      (await service.list('branch-2'))
        .map((department) => department.name)
        .sort(),
    ).toEqual([...DEFAULT_DEPARTMENTS].sort());
    expect(await service.hasName('branch-2', 'Accounting')).toBe(true);
  });

  it('rejects a duplicate department name within the same branch', async () => {
    const service = new DepartmentService();
    await service.create('branch-1', 'Operations', 'admin-1');

    await expect(
      service.create('branch-1', ' operations ', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('renames a department and rejects a conflicting name in its branch', async () => {
    const service = new DepartmentService();
    const operations = await service.create(
      'branch-1',
      'Operations',
      'admin-1',
    );
    await service.create('branch-1', 'Finance', 'admin-1');

    const updated = await service.update(
      'branch-1',
      operations.id,
      'Business Operations',
      'admin-1',
    );
    expect(updated.name).toBe('Business Operations');
    await expect(
      service.update('branch-1', operations.id, 'Finance', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('updates employee department names in the same transaction as a rename', async () => {
    const current = {
      id: 'department-1',
      branchId: 'branch-1',
      name: 'Operations',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const updated = { ...current, name: 'Business Operations' };
    const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
      if (sql.startsWith('SELECT')) return [current];
      if (sql.startsWith('UPDATE departments')) return [updated];
      return [];
    });
    const manager = {
      query,
    } as unknown as EntityManager;
    const transaction = vi.fn(
      (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
    );
    const dataSource = {
      transaction,
    } as unknown as DataSource;
    const service = new DepartmentService(dataSource);

    await service.update(
      'branch-1',
      'department-1',
      'Business Operations',
      'admin-1',
    );

    expect(
      query.mock.calls.some(
        ([sql, parameters]) =>
          sql.includes('UPDATE employees SET department') &&
          JSON.stringify(parameters) ===
            JSON.stringify(['branch-1', 'Operations', 'Business Operations']),
      ),
    ).toBe(true);
    expect(transaction.mock.calls).toHaveLength(1);
  });

  it('refuses to delete a department that still has assigned employees', async () => {
    const department = {
      id: 'department-1',
      branchId: 'branch-1',
      name: 'Operations',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return [{ count: 2 }];
      if (sql.startsWith('SELECT')) return [department];
      return [];
    });
    const manager = { query } as unknown as EntityManager;
    const dataSource = {
      transaction: vi.fn((work: (manager: EntityManager) => Promise<unknown>) =>
        work(manager),
      ),
    } as unknown as DataSource;
    const service = new DepartmentService(dataSource);

    await expect(
      service.delete('branch-1', 'department-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.startsWith('DELETE'))).toBe(
      false,
    );
  });
});
