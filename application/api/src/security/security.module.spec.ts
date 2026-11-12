import { describe, expect, it } from 'vitest';
import { AuthorizationController } from './authorization/authorization.controller.js';
import { AuthorizationService } from './authorization/authorization.service.js';

describe('MSPACES security module', () => {
  it('authorizes branch-scoped access for manager roles and blocks unscoped actions', () => {
    const service = new AuthorizationService();
    const controller = new AuthorizationController(service);

    const managerDecision = controller.authorize({
      userId: 'u-1',
      role: 'BRANCH_MANAGER',
      branchId: 'branch-1',
      module: 'employees',
      action: 'VIEW',
      scope: 'BRANCH',
      resourceOwnerId: 'u-2',
    });

    expect(managerDecision.allowed).toBe(true);

    const unauthorizedDecision = controller.authorize({
      userId: 'u-3',
      role: 'EMPLOYEE',
      branchId: 'branch-2',
      module: 'leaves',
      action: 'APPROVE',
      scope: 'BRANCH',
      resourceOwnerId: 'u-4',
    });

    expect(unauthorizedDecision.allowed).toBe(false);
  });
});
