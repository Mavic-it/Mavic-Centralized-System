import { describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { EmployeeService, type EmployeeRecord } from './employee.service.js';

describe('EmployeeService generated employee numbers', () => {
  it('creates unique human-readable IDs separate from internal IDs', async () => {
    const service = new EmployeeService();
    const base = {
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'test@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE' as const,
      employment: {
        employeeType: 'FULL_TIME' as const,
        startDate: '2026-01-01',
      },
    };

    const first = await service.createEmployee(base);
    const second = await service.createEmployee(base);

    expect(first.employeeNumber).toBe('EMP001');
    expect(second.employeeNumber).toBe('EMP002');
    expect(first.id).not.toBe(first.employeeNumber);
    expect(first.employeeNumber.length).toBeGreaterThanOrEqual(6);
    expect(first.employeeNumber.length).toBeLessThanOrEqual(10);
  });

  it('preserves the employee branch when a partial update has an undefined branchId', async () => {
    const current: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Original Employee',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      queries.push({ sql, parameters });
      if (sql.includes('FROM departments')) return [{ id: 'department-1' }];
      if (sql.includes('INSERT INTO employee_positions')) {
        return [{ id: 'position-1' }];
      }
      if (sql.includes('FOR UPDATE')) {
        return [
          {
            ...current,
            departmentId: 'department-1',
            positionId: 'position-1',
          },
        ];
      }
      if (sql.startsWith('UPDATE employees')) {
        return [
          {
            ...current,
            branchId: parameters?.[1],
            name: parameters?.[2],
            departmentId: parameters?.[14],
            positionId: parameters?.[15],
          },
        ];
      }
      return [
        {
          ...current,
          branchId: parameters?.[1],
          name: parameters?.[2],
        },
      ];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await new EmployeeService(dataSource).updateEmployee('employee-1', {
      branchId: undefined,
      name: 'Updated Employee',
    });

    const update = queries.find(({ sql }) =>
      sql.startsWith('UPDATE employees'),
    );
    expect(update?.parameters?.[1]).toBe('branch-1');
    expect(update?.parameters?.[2]).toBe('Updated Employee');
  });

  it('normalizes leave balances when the updated employee has no employment JSON', async () => {
    const current: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Original Employee',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const dataSource = {
      transaction: async (
        callback: (manager: {
          query: (sql: string, parameters?: unknown[]) => Promise<unknown[]>;
        }) => unknown,
      ) =>
        callback({
          query: async (sql: string, parameters?: unknown[]) => {
            if (sql.includes('FROM departments')) {
              return [{ id: 'department-1' }];
            }
            if (sql.includes('INSERT INTO employee_positions')) {
              return [{ id: 'position-1' }];
            }
            if (sql.includes('FOR UPDATE')) {
              return [
                {
                  ...current,
                  departmentId: 'department-1',
                  positionId: 'position-1',
                },
              ];
            }
            return [
              {
                ...current,
                employment: null,
                departmentId: parameters?.[14],
                positionId: parameters?.[15],
              },
            ];
          },
        }),
    } as unknown as DataSource;

    const updated = await new EmployeeService(dataSource).updateEmployee(
      'employee-1',
      { name: 'Updated Employee' },
    );

    expect(updated).not.toHaveProperty('leaveBalance');
  });

  it('keeps assignment snapshots when an employee is promoted and skips unrelated edits', async () => {
    const service = new EmployeeService();
    const employee = await service.createEmployee({
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'test@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    });

    await service.updateEmployee(employee.id, { email: 'new@example.test' });
    await service.updateEmployee(employee.id, { position: 'Team Lead' });

    const history = await service.listAssignmentHistory(employee.id);
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      eventType: 'PROMOTION',
      position: 'Team Lead',
    });
    expect(history[1]).toMatchObject({
      eventType: 'INITIAL',
      position: 'Associate',
    });
  });

  it('persists a linked supervisor, effective work schedule, and initial history transactionally', async () => {
    const queries: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      queries.push({ sql, parameters });
      if (sql.includes('FROM departments')) return [{ id: 'department-1' }];
      if (sql.includes('FROM employees WHERE id = $1 FOR SHARE')) {
        return [
          {
            id: 'manager-1',
            name: 'Manager Name',
            status: 'ACTIVE',
            branchId: 'branch-1',
          },
        ];
      }
      if (sql.includes('INSERT INTO employee_positions')) {
        return [{ id: 'position-1' }];
      }
      if (sql.startsWith('INSERT INTO employees')) {
        return [
          {
            id: parameters?.[0],
            employeeNumber: 'EMP001',
            branchId: 'branch-1',
            name: 'Test Employee',
            email: 'test@example.test',
            position: 'Associate',
            department: 'Operations',
            status: 'ACTIVE',
            employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
            manager: parameters?.[13],
            managerEmployeeId: parameters?.[14],
            departmentId: parameters?.[15],
            positionId: parameters?.[16],
          },
        ];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    const created = await new EmployeeService(dataSource).createEmployee(
      {
        branchId: 'branch-1',
        name: 'Test Employee',
        email: 'test@example.test',
        position: 'Associate',
        department: 'Operations',
        status: 'ACTIVE',
        employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
        manager: 'Manager Name',
        managerEmployeeId: 'manager-1',
        workSchedule: {
          timeZone: 'Asia/Manila',
          workDays: [1, 2, 3, 4, 5],
          shiftStart: '09:00',
          shiftEnd: '18:00',
          breakMinutes: 60,
          graceMinutes: 5,
        },
      },
      { userId: 'hr-user-1' },
    );

    expect(created.manager).toBe('Manager Name');
    expect(created.managerEmployeeId).toBe('manager-1');
    expect(
      queries.some(
        ({ sql, parameters }) =>
          sql.startsWith('INSERT INTO employees') &&
          sql.includes('manager_name') &&
          parameters?.[13] === 'Manager Name',
      ),
    ).toBe(true);
    expect(
      queries.some(({ sql }) =>
        sql.includes('INSERT INTO employee_assignment_history'),
      ),
    ).toBe(true);
    expect(
      queries.some(({ sql }) => sql.includes('INSERT INTO audit_logs')),
    ).toBe(true);
    expect(
      queries.some(
        ({ sql, parameters }) =>
          sql.includes('INSERT INTO employee_work_schedule_history') &&
          parameters?.[2] === 'branch-1' &&
          parameters?.[3] === '2026-01-01',
      ),
    ).toBe(true);
  });

  it('requires an employee link when a supervisor name cannot be resolved uniquely', async () => {
    const query = async (sql: string) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      if (sql.includes('FROM employees') && sql.includes('lower(trim(name))')) {
        return [];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await expect(
      new EmployeeService(dataSource).createEmployee({
        branchId: 'branch-1',
        name: 'Test Employee',
        email: 'test@example.test',
        position: 'Associate',
        department: 'Operations',
        status: 'ACTIVE',
        employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
        manager: 'Unmatched Name',
        workSchedule: {
          timeZone: 'Asia/Manila',
          workDays: [1, 2, 3, 4, 5],
          shiftStart: '09:00',
          shiftEnd: '18:00',
          breakMinutes: 0,
          graceMinutes: 0,
        },
      }),
    ).rejects.toThrow('Select a supervisor from the employee list.');
  });

  it('copies the branch schedule into employee history when no override is supplied', async () => {
    const statements: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      statements.push({ sql, parameters });
      if (sql.includes('FROM attendance_schedules')) {
        return [
          {
            timeZone: 'Asia/Singapore',
            workDays: [1, 2, 3, 4, 5],
            shiftStart: '08:30:00',
            shiftEnd: '17:30:00',
            breakMinutes: 45,
            graceMinutes: 10,
          },
        ];
      }
      if (sql.includes('FROM departments')) return [{ id: 'department-1' }];
      if (sql.includes('INSERT INTO employee_positions'))
        return [{ id: 'position-1' }];
      if (sql.startsWith('INSERT INTO employees')) {
        return [
          {
            id: parameters?.[0],
            employeeNumber: 'EMP001',
            branchId: 'branch-1',
            name: 'Test Employee',
            email: 'test@example.test',
            position: 'Associate',
            department: 'Operations',
            status: 'ACTIVE',
            employment: { employeeType: 'FULL_TIME', startDate: '2026-10-01' },
          },
        ];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await new EmployeeService(dataSource).createEmployee({
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'test@example.test',
      position: 'Associate',
      department: 'Operations',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-10-01' },
    });

    const snapshot = statements.find(({ sql }) =>
      sql.includes('INSERT INTO employee_work_schedule_history'),
    );
    expect(snapshot?.parameters).toEqual([
      expect.any(String),
      expect.any(String),
      'branch-1',
      '2026-10-01',
      'Asia/Singapore',
      [1, 2, 3, 4, 5],
      '08:30',
      '17:30',
      45,
      10,
      null,
    ]);
  });

  it('records assignment history from merged employee data when RETURNING omits employment', async () => {
    const current: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'test@example.test',
      position: 'Associate',
      department: 'Operations',
      departmentId: 'department-1',
      positionId: 'position-1',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const statements: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      statements.push({ sql, parameters });
      if (sql.includes('FOR UPDATE OF e')) return [current];
      if (sql.includes('INSERT INTO employee_positions')) {
        return [{ id: 'position-2' }];
      }
      if (sql.startsWith('UPDATE employees')) {
        return [
          {
            ...current,
            position: 'Team Lead',
            positionId: 'position-2',
            employment: undefined,
          },
        ];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await new EmployeeService(dataSource).updateEmployee(current.id, {
      position: 'Team Lead',
    });

    const historyInsert = statements.find(({ sql }) =>
      sql.includes('INSERT INTO employee_assignment_history'),
    );
    expect(historyInsert?.parameters?.[9]).toBe('FULL_TIME');
  });

  it('records transfers and moves only branch-scoped linked accounts', async () => {
    const current: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'test@example.test',
      position: 'Associate',
      department: 'Operations',
      departmentId: 'department-1',
      positionId: 'position-1',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const statements: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      statements.push({ sql, parameters });
      if (sql.includes('FROM departments')) return [{ id: 'department-2' }];
      if (sql.includes('INSERT INTO employee_positions')) {
        return [{ id: 'position-1' }];
      }
      if (sql.includes('FOR UPDATE')) return [current];
      if (sql.startsWith('UPDATE employees')) {
        return [
          {
            ...current,
            branchId: parameters?.[1],
            department: parameters?.[5],
            departmentId: parameters?.[14],
            positionId: parameters?.[15],
          },
        ];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await new EmployeeService(dataSource).updateEmployee(
      current.id,
      { branchId: 'branch-2', department: 'Operations' },
      { userId: 'hr-user-1', effectiveDate: '2026-04-01' },
    );

    const branchScopedAccountUpdate = statements.find(({ sql }) =>
      sql.includes('UPDATE users SET branch_id'),
    );
    expect(branchScopedAccountUpdate?.parameters).toEqual([
      'employee-1',
      'branch-1',
      'branch-2',
    ]);
    expect(branchScopedAccountUpdate?.sql).toContain('AND branch_id = $2');
    expect(branchScopedAccountUpdate?.sql).toContain("role <> 'SUPER_ADMIN'");
    expect(
      statements.some(
        ({ sql, parameters }) =>
          sql.includes('INSERT INTO employee_assignment_history') &&
          sql.includes('$12, $13::date, $14') &&
          parameters?.[11] === 'TRANSFER' &&
          parameters?.[12] === '2026-04-01',
      ),
    ).toBe(true);
  });

  it('syncs employee identity changes to the linked account and audits field names only', async () => {
    const current: EmployeeRecord = {
      id: 'employee-1',
      employeeNumber: 'EMP001',
      branchId: 'branch-1',
      name: 'Test Employee',
      email: 'old@example.test',
      position: 'Associate',
      department: 'Operations',
      departmentId: 'department-1',
      positionId: 'position-1',
      status: 'ACTIVE',
      employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' },
    };
    const statements: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = async (sql: string, parameters?: unknown[]) => {
      if (sql.includes("SELECT id FROM branches WHERE id=ANY")) return [{ id: 'branch-1' }];
      statements.push({ sql, parameters });
      if (sql.includes('FOR UPDATE')) return [current];
      if (sql.startsWith('UPDATE employees')) {
        return [
          {
            ...current,
            email: parameters?.[3],
            departmentId: parameters?.[14],
            positionId: parameters?.[15],
          },
        ];
      }
      if (sql.includes('FROM departments')) return [{ id: 'department-1' }];
      if (sql.includes('INSERT INTO employee_positions')) {
        return [{ id: 'position-1' }];
      }
      return [];
    };
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await new EmployeeService(dataSource).updateEmployee(
      current.id,
      { email: 'new@example.test' },
      { userId: 'hr-user-1' },
    );

    expect(
      statements.find(({ sql }) => sql.includes('UPDATE users SET name'))
        ?.parameters,
    ).toEqual(['employee-1', 'Test Employee', 'new@example.test']);
    const audit = statements.find(
      ({ sql }) =>
        sql.includes("'employees'") && sql.includes('INSERT INTO audit_logs'),
    );
    expect(audit?.parameters?.[3]).toContain('"changedFields":["email"]');
    expect(audit?.parameters?.[3]).not.toContain('new@example.test');
  });
});
