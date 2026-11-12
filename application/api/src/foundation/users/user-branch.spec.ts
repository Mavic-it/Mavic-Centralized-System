import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { AuthService } from '../auth/auth.service.js';
import { BranchService } from '../branches/branches.service.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { EmployeeService, type EmployeeRecord } from '../../hr/employees/employee.service.js';

function employeeRecord(id: string, branchId: string): EmployeeRecord {
  return { id, employeeNumber: 'EMP001', branchId, name: 'Employee', email: 'employee@test.example',
    position: 'Associate', department: 'Operations', status: 'ACTIVE',
    employment: { employeeType: 'FULL_TIME', startDate: '2026-01-01' } };
}

async function setup(role: string, companyWide = false) {
  const employees = new EmployeeService();
  const users = new UserService(undefined, employees);
  const branches = new BranchService();
  const first = await branches.create({ code: 'FIRST', name: 'First', address: 'Street', city: 'City' });
  const second = await branches.create({ code: 'SECOND', name: 'Second', address: 'Street', city: 'City', managerUserId: 'actor' });
  const other = await branches.create({ code: 'OTHER', name: 'Other', address: 'Street', city: 'City' });
  employees.create(employeeRecord('employee-record', first.id));
  employees.create(employeeRecord('outside-record', other.id));
  users.create({ id: 'actor', name: 'Actor', email: 'actor@test.example', role, branchId: companyWide ? undefined : first.id, status: 'ACTIVE' });
  users.create({ id: 'employee', name: 'Employee', email: 'employee@test.example', role: 'EMPLOYEE', branchId: first.id, employeeId: 'employee-record', status: 'ACTIVE' });
  users.create({ id: 'outside', name: 'Outside', email: 'outside@test.example', role: 'STAFF', branchId: other.id, employeeId: 'outside-record', status: 'ACTIVE' });
  const auth = new AuthService(users, undefined, undefined, branches);
  const revoke = vi.spyOn(auth, 'revokeSessionsForUser');
  const controller = new UserController(users, branches, auth);
  const request = { user: { userId: 'actor', role, branchId: companyWide ? null : first.id } } as AuthenticatedRequest;
  return { controller, request, first, second, other, users, employees, revoke };
}

describe('account access branch permissions', () => {
  it.each(['SUPER_ADMIN', 'IT_ADMIN'])('allows %s to change an employee access branch', async (role) => {
    const { controller, request, other, revoke, employees } = await setup(role);
    expect(await controller.updateBranch('employee', request, { branchId: other.id }))
      .toMatchObject({ data: { branchId: other.id, employeeId: 'employee-record' } });
    expect(revoke).toHaveBeenCalledWith('employee');
    expect((await employees.findById('employee-record'))?.branchId).toBe(other.id);
    expect((await employees.listAssignmentHistory('employee-record'))[0]).toMatchObject({ eventType: 'TRANSFER', branchId: other.id });
  });
  it.each(['HR_ADMIN', 'BRANCH_MANAGER'])('limits %s to managed source and destination branches', async (role) => {
    const { controller, request, second, other, first } = await setup(role);
    expect((await controller.list(request)).map((account) => account.id)).toEqual(['employee']);
    expect((await controller.branchOptions(request)).map((branch) => branch.id)).toEqual([first.id, second.id]);
    await expect(controller.updateBranch('employee', request, { branchId: other.id })).rejects.toThrow(ForbiddenException);
    await expect(controller.updateBranch('outside', request, { branchId: first.id })).rejects.toThrow(ForbiddenException);
    expect(await controller.updateBranch('employee', request, { branchId: second.id })).toMatchObject({ success: true });
  });
  it('allows company-wide HR to change access branches across the company', async () => {
    const { controller, request, other } = await setup('HR_ADMIN', true);
    expect(await controller.updateBranch('employee', request, { branchId: other.id })).toMatchObject({ success: true });
  });
  it.each(['STAFF', 'EMPLOYEE'])('denies %s account management', async (role) => {
    const { controller, request, other } = await setup(role);
    await expect(controller.list(request)).rejects.toThrow(ForbiddenException);
    await expect(controller.branchOptions(request)).rejects.toThrow(ForbiddenException);
    await expect(controller.updateBranch('employee', request, { branchId: other.id })).rejects.toThrow(ForbiddenException);
  });
  it('transfers the employee, clears the previous supervisor, and audits both records in one transaction', async () => {
    const current = { ...employeeRecord('employee-record', 'old'), managerEmployeeId: 'old-supervisor' };
    const query = vi.fn(async (sql: string, parameters?: unknown[]) => {
      if (sql.includes('FROM users')) return [{ id: 'employee', role: 'EMPLOYEE', employeeId: 'employee-record', branchId: 'old' }];
      if (sql.includes('FROM employees')) return [current];
      if (sql.includes('FROM branches')) return [{ isActive: true }];
      if (sql.includes('FROM departments')) return [{ id: 'destination-department' }];
      if (sql.includes('INSERT INTO employee_positions')) return [{ id: 'position-1' }];
      if (sql.includes('UPDATE employees')) return [{ ...current, branchId: parameters?.[1], department: parameters?.[5], managerEmployeeId: null }];
      if (sql.includes('UPDATE users')) return [{ id: 'employee', branchId: 'new' }];
      return [];
    });
    const transaction = vi.fn(async (callback: (manager: { query: typeof query }) => unknown) => callback({ query }));
    const service = new UserService({ transaction } as unknown as DataSource);
    await expect(service.updateAccessBranch('employee', 'new', { userId: 'admin' }, 'IT')).resolves.toMatchObject({ branchId: 'new' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE employees'), expect.arrayContaining(['new', 'IT']));
    const employeeUpdate = query.mock.calls.find(([sql]) => sql.includes('UPDATE employees'));
    expect(employeeUpdate?.[1]?.[14]).toBeNull();
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO employee_assignment_history'))).toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_logs'), expect.arrayContaining(['admin', 'new']));
  });
  it('rejects admin targets, unlinked accounts, and self changes', async () => {
    const { users, first } = await setup('SUPER_ADMIN');
    await expect(users.updateAccessBranch('actor', first.id, { userId: 'other-admin' })).rejects.toThrow('Select an employee or staff account.');
    await expect(users.updateAccessBranch('employee', first.id, { userId: 'employee' })).rejects.toThrow('own access branch');
    users.create({ id: 'unlinked', name: 'Unlinked', email: 'unlinked@test.example', role: 'EMPLOYEE', status: 'ACTIVE' });
    await expect(users.updateAccessBranch('unlinked', first.id, { userId: 'actor' })).rejects.toThrow('Select an employee or staff account.');
  });
  it('rejects inactive destinations before writing account or audit data', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users')) return [{ id: 'employee', employeeId: 'employee-record', role: 'STAFF', branchId: 'old' }];
      if (sql.includes('FROM employees')) return [{ branchId: 'old' }];
      return [{ isActive: false }];
    });
    const users = new UserService({ transaction: async (callback: (manager: { query: typeof query }) => unknown) => callback({ query }) } as unknown as DataSource);
    await expect(users.updateAccessBranch('employee', 'inactive', { userId: 'actor' })).rejects.toThrow('Select an active branch.');
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE users') || sql.includes('INSERT INTO audit_logs'))).toBe(false);
  });
  it('checks the employee source branch even when the account branch is in scope', async () => {
    const { controller, request, employees, first, second, other } = await setup('BRANCH_MANAGER');
    employees.create(employeeRecord('employee-record', other.id));
    await expect(controller.updateBranch('employee', request, { branchId: second.id })).rejects.toThrow(ForbiddenException);
    expect((await employees.findById('employee-record'))?.branchId).toBe(other.id);
    expect((await controller.list(request))[0].branchId).toBe(first.id);
  });
  it('does not update either branch when the destination department is invalid', async () => {
    const current = employeeRecord('employee-record', 'old');
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('FROM users')) return [{ id: 'employee', role: 'EMPLOYEE', employeeId: current.id, branchId: 'old' }];
      if (sql.includes('FROM employees')) return [current];
      if (sql.includes('FROM branches')) return [{ isActive: true }];
      return [];
    });
    const service = new UserService({ transaction: async (callback: (manager: { query: typeof query }) => unknown) => callback({ query }) } as unknown as DataSource);
    await expect(service.updateAccessBranch('employee', 'new', { userId: 'admin' }, 'Invalid')).rejects.toThrow('Select a department');
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE users') || sql.includes('UPDATE employees'))).toBe(false);
  });
});
