import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeHrProfileService } from './employee-hr-profile.service.js';

function fixture(previousLevel: string | null) {
  const previous = {
    employeeId: 'employee',
    jobLevel: previousLevel,
    basicSalary: null,
  };
  const query = vi.fn(async (sql: string, parameters?: unknown[]) =>
    sql.includes('INSERT INTO employee_profiles')
      ? [{ ...previous, jobLevel: parameters?.[1] }]
      : [previous],
  );
  const db = {
    transaction: (
      work: (manager: { query: typeof query }) => Promise<unknown>,
    ) => work({ query }),
  } as unknown as DataSource;
  return { service: new EmployeeHrProfileService(db), query };
}

describe('Job level selection', () => {
  it.each(['RANK_AND_FILE', 'SUPERVISORY', 'MANAGERIAL'])(
    'saves %s',
    async (jobLevel) => {
      const { service } = fixture(null);
      expect(
        (
          await service.update('employee', { jobLevel }, 'branch', {
            userId: 'admin',
          })
        ).jobLevel,
      ).toBe(jobLevel);
    },
  );
  it('preserves a historical level but rejects a newly invented level', async () => {
    const { service, query } = fixture('L2');
    await expect(
      service.update('employee', { jobLevel: 'L2' }, 'branch', {
        userId: 'admin',
      }),
    ).resolves.toHaveProperty('jobLevel', 'L2');
    query.mockClear();
    await expect(
      service.update('employee', { jobLevel: 'Random' }, 'branch', {
        userId: 'admin',
      }),
    ).rejects.toThrow('Select');
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO employee_profiles'),
      ),
    ).toBe(false);
  });
});
