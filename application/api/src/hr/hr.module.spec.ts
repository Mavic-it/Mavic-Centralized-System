import { describe, expect, it } from 'vitest';
import { EmployeeController } from './employees/employee.controller.js';
import { EmployeeService } from './employees/employee.service.js';
import { UserService } from '../foundation/users/user.service.js';

describe('MSPACES HR module', () => {
  it('creates a branch-scoped employee record with 201 file data', async () => {
    const employees = new EmployeeService();
    const controller = new EmployeeController(employees, new UserService());

    const employee = controller.create({
      id: 'emp-1',
      branchId: 'branch-1',
      name: 'Maria Santos',
      email: 'maria.santos@mspaces.test',
      position: 'Operations Manager',
      department: 'Operations',
      status: 'ACTIVE',
      employment: {
        employeeType: 'FULL_TIME',
        startDate: '2024-01-15',
      },
      emergencyContact: {
        name: 'Ana Santos',
        relationship: 'Sister',
        phone: '+639171234567',
      },
    });

    expect(employee.name).toBe('Maria Santos');
    expect(employee.branchId).toBe('branch-1');
    await expect(
      controller.list({ user: { role: 'SUPER_ADMIN' } } as any, 'branch-1'),
    ).resolves.toHaveLength(1);
  });

  it('allows an all-branch HR Admin to manage employees across branches', async () => {
    const employees = new EmployeeService();
    employees.create({
      id: 'emp-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Maya Santos',
      email: 'maya@mspaces.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2024-01-15' },
    });
    const controller = new EmployeeController(employees, new UserService());
    const request = {
      headers: {},
      user: {
        userId: 'hr-all',
        scope: 'ALL',
        email: 'hr@mspaces.test',
        role: 'HR_ADMIN',
        branchId: null,
      },
    } as any;

    await expect(controller.list(request)).resolves.toHaveLength(1);
    await expect(
      controller.createEmployee(
        {
          branchId: 'branch-2',
          name: 'Paolo Reyes',
          email: 'paolo@mspaces.test',
          position: 'Associate',
          department: 'Operations',
          status: 'ACTIVE',
          employmentType: 'FULL_TIME',
          startDate: '2024-01-15',
        } as any,
        request,
      ),
    ).resolves.toMatchObject({ branchId: 'branch-2' });
  });

});
