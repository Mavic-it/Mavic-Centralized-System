import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairEmployeeProfiles1767000000000 } from './1767000000000-RepairEmployeeProfiles.js';

describe('RepairEmployeeProfiles1767000000000', () => {
  it('restores the employee profile table idempotently without dropping data on rollback', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const migration = new RepairEmployeeProfiles1767000000000();

    await migration.up({ query } as unknown as QueryRunner);

    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain(
      'CREATE TABLE IF NOT EXISTS employee_profiles',
    );
    expect(query.mock.calls[0][0]).toContain(
      'REFERENCES employees(id) ON DELETE CASCADE',
    );
    expect(query.mock.calls[0][0]).toContain('basic_salary numeric(12, 2)');
    expect(query.mock.calls[0][0]).toContain('employee_profiles_salary_check');

    await expect(migration.down()).resolves.toBeUndefined();
  });
});
