import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest, AuthUserContext } from '../foundation/auth/auth.context.js';
import { AuthorizationService } from '../security/authorization/authorization.service.js';
import { InventoryController } from './inventory/inventory.controller.js';
import { InventoryService } from './inventory/inventory.service.js';

const request = (overrides: Partial<AuthUserContext> = {}) => ({ user: {
  userId: 'custodian', email: 'custodian@example.test', role: 'BRANCH_MANAGER',
  branchId: 'assigned', branchIds: ['assigned'], scope: 'BRANCH', ...overrides,
} }) as AuthenticatedRequest;

describe('inventory branch isolation', () => {
  it.each(['overview', 'items', 'stock', 'movements', 'receive', 'issue', 'registerBranch'] as const)(
    'rejects a direct cross-branch %s call before reaching persistence', async endpoint => {
      const controller = new InventoryController({} as InventoryService, new AuthorizationService());
      const req = request({ moduleAccessKey: 'inventory.stock', moduleAccessMode: 'EDIT' });
      const movement = { branchId: 'unassigned', quantity: 1, reason: 'Delivery' };
      const action = () => {
        if (endpoint === 'overview') return controller.overview(req, 'unassigned');
        if (endpoint === 'items' || endpoint === 'stock' || endpoint === 'movements') {
          return controller[endpoint](req, { branchId: 'unassigned', page: 1, pageSize: 50 });
        }
        if (endpoint === 'registerBranch') return controller.registerBranch(req, 'item', { branchId: 'unassigned', openingStock: 0 });
        return controller[endpoint](req, 'item', movement, 'test-key');
      };
      await expect(action()).rejects.toThrow('Branch access denied');
    },
  );

  it.each(['SUPER_ADMIN', 'IT_ADMIN', 'HR_ADMIN'] as const)('does not infer branch access from the %s role', async role => {
    const controller = new InventoryController({} as InventoryService, new AuthorizationService());
    await expect(controller.branches(request({ role, branchId: null, branchIds: undefined, scope: 'ALL' })))
      .rejects.toThrow('No active branch access');
  });

  it('passes only assigned branches to combined stock queries and restricts catalog visibility', async () => {
    const listItems = vi.fn().mockResolvedValue({ items: [], total: 0 });
    const controller = new InventoryController({ listItems } as unknown as InventoryService, new AuthorizationService());
    const query = { page: 1, pageSize: 50 };
    await controller.stock(request({ branchIds: ['assigned', 'also-assigned'] }), query);
    expect(listItems).toHaveBeenCalledWith(query, ['assigned', 'also-assigned'], true);
    await controller.items(request(), query);
    expect(listItems).toHaveBeenLastCalledWith(query, ['assigned'], true);
  });

  it('applies the registration scope to both item rows and pagination totals', async () => {
    const query = vi.fn(async (_sql: string, _parameters: unknown[] = []) => []);
    const service = new InventoryService({ query } as unknown as DataSource);
    await service.listItems({ page: 1, pageSize: 50 }, ['assigned'], true);
    for (const [sql, parameters] of query.mock.calls) {
      expect(sql).toContain('EXISTS (SELECT 1 FROM inventory_balances visible');
      expect(parameters[0]).toEqual(['assigned']);
    }
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('keeps category usage counts within assigned branches', async () => {
    const query = vi.fn(async (_sql: string, _parameters: unknown[] = []) => []);
    await new InventoryService({ query } as unknown as DataSource).listCategories(['assigned']);
    expect(query.mock.calls[0][0]).toContain('cb.branch_id=ANY($1::varchar[])');
    expect(query.mock.calls[0][1]).toEqual([['assigned']]);
  });
});
