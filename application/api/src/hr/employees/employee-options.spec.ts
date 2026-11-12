import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateEmployeeDto } from './employee.dto.js';
import { UpdateEmployeeDto } from './employee-action.dto.js';
import { EmployeeService } from './employee.service.js';
import { validateEmployment } from './employee-options.js';

const employment = {
  employeeType: 'PROBATIONARY' as const,
  startDate: '2026-11-01',
  probationEndDate: '2027-04-30',
  evaluationDueDate: '2027-04-15',
};

describe('Employment classifications and provisionary dates', () => {
  it.each([
    'PROBATIONARY',
    'REGULAR',
    'PROJECT_BASED',
    'CONTRACTUAL',
    'FULL_TIME',
    'PART_TIME',
    'CONTRACT',
  ])('accepts %s in create and update DTOs', (employmentType) => {
    const input = {
      name: 'Employee Test',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Admin',
      branchId: 'branch',
      employmentType,
      startDate: '2026-11-01',
      status: 'RETIRED',
    };
    expect(validateSync(plainToInstance(CreateEmployeeDto, input))).toEqual([]);
    expect(
      validateSync(
        plainToInstance(UpdateEmployeeDto, {
          employmentType,
          status: 'TERMINATED',
        }),
      ),
    ).toEqual([]);
  });
  it('rejects unknown employment and status values', () => {
    expect(
      validateSync(
        plainToInstance(UpdateEmployeeDto, {
          employmentType: 'RANDOM',
          status: 'RANDOM',
        }),
      ).map((error) => error.property),
    ).toEqual(expect.arrayContaining(['employmentType', 'status']));
  });
  it('requires real, ordered dates for provisionary employment', () => {
    expect(() => validateEmployment(employment)).not.toThrow();
    expect(() =>
      validateEmployment({ ...employment, probationEndDate: null }),
    ).toThrow('End of provisionary date');
    expect(() =>
      validateEmployment({ ...employment, evaluationDueDate: '2026-02-30' }),
    ).toThrow('Evaluation due date');
    expect(() =>
      validateEmployment({ ...employment, evaluationDueDate: '2026-10-01' }),
    ).toThrow('before');
    expect(() =>
      validateEmployment({ employeeType: 'REGULAR', startDate: '2026-11-01' }),
    ).not.toThrow();
  });
  it('persists both dates, rejects invalid partial edits, and keeps them through status updates', async () => {
    const service = new EmployeeService();
    const created = await service.createEmployee({
      branchId: 'branch',
      name: 'Employee Test',
      email: 'employee@example.test',
      position: 'Associate',
      department: 'Admin',
      status: 'ACTIVE',
      employment,
    });
    expect(created.employment).toMatchObject({
      ...employment,
      workBranchIds: ['branch'],
      allWorkBranches: false,
    });
    await expect(
      service.updateEmployee(created.id, {
        employment: { ...employment, probationEndDate: '2026-10-01' },
      }),
    ).rejects.toThrow('before');
    const retired = await service.updateEmployee(created.id, {
      status: 'RETIRED',
    });
    expect(retired?.status).toBe('RETIRED');
    expect(retired?.employment).toMatchObject({
      ...employment,
      workBranchIds: ['branch'],
      allWorkBranches: false,
    });
  });
});
