import { describe, it, expect } from 'vitest';
import {
  date,
  range,
  halfUnits,
  document,
  employmentEligible,
} from './leave.policy.js';
import type { Employee, Policy } from './leave.types.js';
describe('Simple leave validation', () => {
  it('uses explicit regular employment while retaining legacy regularization checks', () => {
    const employee: Employee = {
      id: 'e',
      name: 'Employee',
      branchId: 'b',
      status: 'ACTIVE',
      employment: { employeeType: 'REGULAR', startDate: '2025-01-01' },
      probationary: null,
      regularizationDate: null,
    };
    const policy = {
      eligibility: 'REGULAR',
      employmentTypes: [],
      minimumServiceMonths: 0,
      branchId: null,
    } as Policy;
    expect(employmentEligible(employee, policy, '2026-11-06')).toBe(true);
    expect(
      employmentEligible(
        {
          ...employee,
          probationary: false,
          employment: { ...employee.employment, employeeType: 'PROBATIONARY' },
        },
        policy,
        '2026-11-06',
      ),
    ).toBe(false);
    expect(
      employmentEligible(
        {
          ...employee,
          probationary: false,
          employment: { ...employee.employment, employeeType: 'FULL_TIME' },
        },
        policy,
        '2026-11-06',
      ),
    ).toBe(true);
    expect(
      employmentEligible(
        { ...employee, status: 'RETIRED' },
        policy,
        '2026-11-06',
      ),
    ).toBe(false);
  });
  it.each(['2026-02-30', '2026-13-01', 'invalid'])(
    'rejects invalid calendar date %s',
    (value) => expect(() => date(value)).toThrow(),
  );
  it('requires an ordered single credit year', () => {
    expect(() => range('2026-12-31', '2027-01-01')).toThrow('credit year');
    expect(() => range('2026-02-02', '2026-02-01')).toThrow();
  });
  it('uses precise half-day units', () => {
    expect(() => halfUnits(0.5)).not.toThrow();
    expect(() => halfUnits(1.2)).toThrow();
    expect(() => halfUnits(0)).toThrow();
  });
  it('validates attachment signatures rather than browser MIME alone', () => {
    expect(() =>
      document({
        originalname: 'x.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('not a pdf'),
        size: 9,
      }),
    ).toThrow();
  });
});
