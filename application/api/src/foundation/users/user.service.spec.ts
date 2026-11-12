import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { UserService } from './user.service.js';

describe('UserService account lifecycle', () => {
  it('returns the stored sign-in timestamp in the branch-scoped account list', async () => {
    const query = vi.fn().mockResolvedValue([{id:'user-1',lastLoginAt:'2026-11-07T04:00:00.000Z'}]);
    const service = new UserService({query} as unknown as DataSource);
    expect(await service.list('branch-1')).toEqual([{id:'user-1',lastLoginAt:'2026-11-07T04:00:00.000Z'}]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('u.last_login_at AS "lastLoginAt"'),['branch-1']);
  });
  it('records successful logins for active in-memory accounts only', async () => {
    const service = new UserService();
    service.create({id:'user-1',name:'Account',email:'account@example.test',role:'EMPLOYEE',status:'ACTIVE'});
    await service.recordSuccessfulLogin('user-1');
    expect((await service.list())[0].lastLoginAt).toEqual(expect.any(String));
    service.create({id:'inactive',name:'Inactive',email:'inactive@example.test',role:'EMPLOYEE',status:'INACTIVE'});
    await service.recordSuccessfulLogin('inactive');
    expect((await service.findById('inactive'))?.lastLoginAt).toBeUndefined();
  });
  it.each(['EMPLOYEE', 'STAFF'])('keeps a %s account in its employee branch during account setup and role edits', async (role) => {
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('FROM employees')) return [{ name: 'Employee', email: 'employee@example.test', branchId: 'alabang' }];
      if (sql.includes('FROM users WHERE')) return [{ id: 'account-1', role, employeeId: 'employee-1', branchId: 'makati' }];
      if (sql.includes('FROM branches')) return sql.includes('manager_user_id') ? [] : [{ isActive: true }];
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('INSERT INTO users')) return [{ branchId: parameters?.[5] }];
      if (sql.includes('UPDATE users')) return [{ branchId: parameters?.[3] }];
      return [];
    });
    const dataSource = { transaction: async (callback: (manager: { query: typeof query }) => unknown) => callback({ query }) } as unknown as DataSource;
    const service = new UserService(dataSource);
    await expect(service.createAccount({ name: 'Employee', email: 'employee@example.test', passwordHash: 'hashed', role, employeeId: 'employee-1', branchId: 'makati' }))
      .resolves.toMatchObject({ branchId: 'alabang' });
    await expect(service.updateRole('account-1', role, 'employee-1', 'makati'))
      .resolves.toMatchObject({ branchId: 'alabang' });
  });
  it('loads the linked employee ID with an account', async () => {
    let executedQuery = '';
    const dataSource = {
      query: vi.fn(async (query: string) => {
        executedQuery = query;
        return [
          {
            id: 'account-1',
            email: 'employee@example.test',
            name: 'Employee',
            role: 'EMPLOYEE',
            branchId: 'branch-1',
            employeeId: 'employee-1',
            status: 'ACTIVE',
          },
        ];
      }),
    } as unknown as DataSource;

    await expect(
      new UserService(dataSource).findById('account-1'),
    ).resolves.toMatchObject({
      employeeId: 'employee-1',
    });
    expect(executedQuery).toContain('employee_id AS "employeeId"');
  });
  it('lists linked photo versions without embedding image bytes', async () => {
    let executedQuery = '';
    const dataSource = {
      query: vi.fn(async (query: string) => {
        executedQuery = query;
        return [{ id: 'account-1', employeeId: 'employee-1', profilePictureUpdatedAt: '2026-10-30T00:00:00Z' }];
      }),
    } as unknown as DataSource;
    const listed = await new UserService(dataSource).list('branch-1');
    expect(listed[0]).toMatchObject({ employeeId: 'employee-1', profilePictureUpdatedAt: '2026-10-30T00:00:00Z' });
    expect(executedQuery).toContain('employee_profile_pictures picture');
    expect(executedQuery).toContain('u.employee_id AS "employeeId"');
    expect(executedQuery).not.toContain('picture.data');
  });

  it('deletes an archived unlinked account', async () => {
    const service = new UserService();
    service.create({
      id: 'new-account',
      email: 'new@example.test',
      name: 'New Account',
      role: 'EMPLOYEE',
      status: 'ARCHIVED',
    });

    await expect(service.deleteAccount('new-account')).resolves.toBeUndefined();
    expect(await service.findByEmail('new@example.test')).toBeUndefined();
  });

  it('rejects deletion of an account that is not archived', async () => {
    const service = new UserService();
    service.create({
      id: 'active-account',
      email: 'active@example.test',
      name: 'Active Account',
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    });

    await expect(service.deleteAccount('active-account')).rejects.toThrow(
      'Only archived accounts can be deleted.',
    );
    await expect(
      service.findByEmail('active@example.test'),
    ).resolves.toBeDefined();
  });

  it('allows a Super Admin without employee or branch assignments', async () => {
    const account = await new UserService().createAccount({
      name: 'System Admin',
      email: 'admin@example.test',
      passwordHash: 'hashed',
      role: 'SUPER_ADMIN',
    });
    expect(account.employeeId).toBeUndefined();
    expect(account.branchId).toBeUndefined();
  });

  it('allows an explicitly linked Super Admin while leaving branch scope null', async () => {
    const account = await new UserService().createAccount({
      name: 'Linked System Admin',
      email: 'linked-admin@example.test',
      passwordHash: 'hashed',
      role: 'SUPER_ADMIN',
      employeeId: 'employee-1',
    });

    expect(account.employeeId).toBe('employee-1');
    expect(account.branchId).toBeUndefined();
  });

  it('preserves an existing employee link when promoting the account to Super Admin', async () => {
    const service = new UserService();
    service.create({
      id: 'linked-account',
      email: 'linked@example.test',
      name: 'Linked Employee',
      role: 'EMPLOYEE',
      employeeId: 'employee-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
    });

    await expect(
      service.updateRole('linked-account', 'SUPER_ADMIN'),
    ).resolves.toMatchObject({
      role: 'SUPER_ADMIN',
      employeeId: 'employee-1',
      branchId: undefined,
    });
  });

  it('persists a deliberate employee link when creating a Super Admin', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM employees')) {
        return [{ name: 'Linked Admin', email: 'admin@example.test' }];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('INSERT INTO users')) {
        return [
          {
            id: 'account-1',
            name: 'Linked Admin',
            email: 'admin@example.test',
            role: 'SUPER_ADMIN',
            employeeId: 'employee-1',
            branchId: null,
            status: 'ACTIVE',
          },
        ];
      }
      return [];
    });
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    const account = await new UserService(dataSource).createAccount({
      name: 'Submitted name',
      email: 'admin@example.test',
      passwordHash: 'hashed',
      role: 'SUPER_ADMIN',
      employeeId: 'employee-1',
    });

    expect(account).toMatchObject({ role: 'SUPER_ADMIN', employeeId: 'employee-1' });
    expect(calls.find(({ sql }) => sql.includes('INSERT INTO users'))?.parameters).toEqual(
      expect.arrayContaining([null, 'employee-1']),
    );
  });

  it('keeps an employee link in the database when changing an account to Super Admin', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM users WHERE id = $1')) {
        return [
          {
            id: 'linked-account',
            email: 'linked@example.test',
            name: 'Linked Employee',
            role: 'EMPLOYEE',
            branchId: 'branch-1',
            employeeId: 'employee-1',
            status: 'ACTIVE',
          },
        ];
      }
      if (sql.includes('UPDATE users')) {
        return [
          {
            id: 'linked-account',
            email: 'linked@example.test',
            name: 'Linked Employee',
            role: 'SUPER_ADMIN',
            branchId: null,
            employeeId: 'employee-1',
            status: 'ACTIVE',
          },
        ];
      }
      return [];
    });
    const service = new UserService({
      query,
      transaction: async (callback: (manager: { query: typeof query }) => unknown) => callback({ query }),
    } as unknown as DataSource);

    await expect(
      service.updateRole('linked-account', 'SUPER_ADMIN'),
    ).resolves.toMatchObject({ employeeId: 'employee-1', branchId: null });
    const update = calls.find(({ sql }) => sql.includes('UPDATE users'));
    expect(update?.sql).not.toContain('employee_id = NULL');
    expect(update?.sql).toContain('SET role = $2, branch_id = NULL');
  });

  it('removes and audits positive overrides when an account role changes', async () => {
    const calls: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('FROM users WHERE id = $1')) return [{ id:'target', email:'target@example.test', name:'Target', role:'EMPLOYEE', employeeId:'employee-1', branchId:'branch-1', status:'ACTIVE' }];
      if (sql.includes('UPDATE users')) return [{ id:'target', role:'SUPER_ADMIN', employeeId:'employee-1', branchId:null, status:'ACTIVE' }];
      if (sql.includes('FROM user_module_permissions')) return [{ permissionKey:'operations.reservations', effect:'EDIT' }];
      return [];
    });
    const service = new UserService({ query, transaction: async (work: (manager:{query:typeof query})=>unknown) => work({query}) } as unknown as DataSource);
    await service.updateRole('target','SUPER_ADMIN',undefined,undefined,'actor');
    expect(calls.some(call => call.sql.includes('DELETE FROM user_module_permissions') && call.parameters?.[1] === 'operations.reservations')).toBe(true);
    expect(calls.find(call => call.sql.includes('INSERT INTO user_module_permission_audit'))?.parameters?.slice(1)).toEqual(['actor','target',null,'operations.reservations','EDIT']);
  });

  it('requires an employee and branch for a normal account', async () => {
    await expect(
      new UserService().createAccount({
        name: 'Employee',
        email: 'employee@example.test',
        passwordHash: 'hashed',
        role: 'EMPLOYEE',
      }),
    ).rejects.toThrow('Employee and active branch are required');
  });

  it('allows all-branch assignment for HR and manager roles but not staff roles', async () => {
    const service = new UserService();
    const hrAccount = await service.createAccount({
      name: 'HR User',
      email: 'hr@example.test',
      passwordHash: 'hashed',
      role: 'HR_ADMIN',
      employeeId: 'employee-1',
      branchId: null,
    });

    expect(hrAccount.role).toBe('HR_ADMIN');
    expect(hrAccount.branchId).toBeUndefined();
    await expect(
      service.createAccount({
        name: 'Staff User',
        email: 'staff@example.test',
        passwordHash: 'hashed',
        role: 'STAFF',
        employeeId: 'employee-2',
        branchId: null,
      }),
    ).rejects.toThrow('Employee and active branch are required');
  });

  it('allows all-branch role updates only for eligible roles', async () => {
    const service = new UserService();
    service.create({
      id: 'linked-user',
      email: 'linked@example.test',
      name: 'Linked User',
      role: 'EMPLOYEE',
      employeeId: 'employee-1',
      branchId: 'branch-1',
      status: 'ACTIVE',
    });

    await expect(
      service.updateRole('linked-user', 'BRANCH_MANAGER', 'employee-1', null),
    ).resolves.toMatchObject({
      role: 'BRANCH_MANAGER',
      employeeId: 'employee-1',
      branchId: undefined,
    });
    await expect(
      service.updateRole('linked-user', 'STAFF', 'employee-1', null),
    ).rejects.toThrow('Employee and active branch are required');
  });

  it('persists the employee link when creating an employee account', async () => {
    const executedQueries: Array<{ sql: string; parameters?: unknown[] }> = [];
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      executedQueries.push({ sql, parameters });
      if (sql.includes('FROM employees')) {
        return [{ name: 'Sample Employee', email: 'employee@example.test', branchId: 'branch-1' }];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: false }];
      if (sql.includes('FROM branches')) return [{ isActive: true }];
      return [
        {
          id: 'account-1',
          name: 'Sample Employee',
          email: 'employee@example.test',
          role: 'EMPLOYEE',
          branchId: 'branch-1',
          employeeId: 'employee-1',
          status: 'ACTIVE',
        },
      ];
    });
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    const account = await new UserService(dataSource).createAccount({
      name: 'Ignored submitted name',
      email: 'employee@example.test',
      passwordHash: 'hashed',
      role: 'EMPLOYEE',
      branchId: 'branch-1',
      employeeId: 'employee-1',
    });
    const insert = executedQueries.find(({ sql }) =>
      sql.includes('INSERT INTO users'),
    );

    expect(account.employeeId).toBe('employee-1');
    expect(insert?.sql).toContain('branch_id, employee_id, status');
    expect(insert?.parameters?.[6]).toBe('employee-1');
    expect(
      executedQueries.find(({ sql }) => sql.includes('FROM employees'))?.sql,
    ).toContain('FOR UPDATE');
  });

  it('rejects creating another account for an employee who is already linked', async () => {
    const queries: string[] = [];
    const query = vi.fn(async (sql: string) => {
      queries.push(sql);
      if (sql.includes('FROM employees')) {
        return [{ name: 'Sample Employee', email: 'employee@example.test', branchId: 'branch-1' }];
      }
      if (sql.includes('SELECT EXISTS')) return [{ exists: true }];
      return [];
    });
    const dataSource = {
      transaction: async (
        callback: (manager: { query: typeof query }) => unknown,
      ) => callback({ query }),
    } as unknown as DataSource;

    await expect(
      new UserService(dataSource).createAccount({
        name: 'Sample Employee',
        email: 'employee@example.test',
        passwordHash: 'hashed',
        role: 'EMPLOYEE',
        branchId: 'branch-1',
        employeeId: 'employee-1',
      }),
    ).rejects.toThrow('An account already exists for this employee.');
    expect(queries.some((sql) => sql.includes('INSERT INTO users'))).toBe(
      false,
    );
  });

  it('reports linked accounts from either employee ID or matching email', async () => {
    const dataSource = {
      query: vi.fn().mockResolvedValue([{ exists: true }]),
    } as unknown as DataSource;

    await expect(
      new UserService(dataSource).hasAccountForEmployee(
        'employee-1',
        'Employee@Example.Test',
      ),
    ).resolves.toBe(true);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('employee_id = $1 OR LOWER(email) = $2'),
      ['employee-1', 'employee@example.test'],
    );
  });

  it('lists all accounts with their optional employee photo metadata', async () => {
    let executedQuery = '';
    const dataSource = {
      query: async (query: string) => {
        executedQuery = query;
        return [];
      },
    } as unknown as DataSource;

    await expect(new UserService(dataSource).list()).resolves.toEqual([]);
    expect(executedQuery).toContain('u.employee_id AS "employeeId"');
    expect(executedQuery).toContain('employee_profile_pictures picture');
  });
});
