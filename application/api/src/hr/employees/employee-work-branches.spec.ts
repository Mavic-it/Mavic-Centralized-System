import { describe, expect, it } from 'vitest';
import { EmployeeController } from './employee.controller.js';
import { EmployeeService } from './employee.service.js';
import { UserService } from '../../foundation/users/user.service.js';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';

const input = { name: 'Branch Manager', email: 'manager@example.test', branchId: 'makati', position: 'Manager', department: 'Operations', employmentType: 'REGULAR' as const, startDate: '2026-01-01', status: 'ACTIVE' as const };
const admin = { user: { userId: 'admin', role: 'SUPER_ADMIN', email: 'admin@example.test' }, headers: {} } as AuthenticatedRequest;

describe('employee work branch assignments', () => {
  it('saves multiple work branches, retains them through unrelated edits and supports all branches', async () => {
    const service = new EmployeeService();
    const controller = new EmployeeController(service, new UserService());
    const created = await controller.createEmployee({ ...input, workBranchIds: ['makati', 'ortigas'], allWorkBranches: false }, admin);
    await controller.updateEmployee(created.id, admin, { phone: '09171234567' });
    expect((await controller.get(created.id, admin)).employment).toMatchObject({ workBranchIds: ['makati', 'ortigas'], allWorkBranches: false });
    await controller.updateEmployee(created.id, admin, { workBranchIds: [], allWorkBranches: true });
    const saved = await controller.get(created.id, admin);
    expect(saved.branchId).toBe('makati');
    expect(saved.employment).toMatchObject({ workBranchIds: [], allWorkBranches: true });
    expect((await service.listAssignmentHistory(created.id))[0].eventType).toBe('ASSIGNMENT_CHANGE');
  });

  it('rejects a selected assignment without its primary branch', async () => {
    const controller = new EmployeeController(new EmployeeService(), new UserService());
    await expect(controller.createEmployee({ ...input, workBranchIds: ['ortigas'] }, admin)).rejects.toThrow('include the primary branch');
  });

  it('does not let a scoped manager assign outside their authorized branches or select all', async () => {
    const controller = new EmployeeController(new EmployeeService(), new UserService());
    const manager = { ...admin, user: { ...admin.user!, role: 'BRANCH_MANAGER', branchId: 'makati', branchIds: ['makati'] } } as AuthenticatedRequest;
    await expect(controller.createEmployee({ ...input, workBranchIds: ['makati', 'ortigas'] }, manager)).rejects.toThrow('Work branch assignment access denied');
    await expect(controller.createEmployee({ ...input, allWorkBranches: true }, manager)).rejects.toThrow('Only a Super Admin');
  });
});
