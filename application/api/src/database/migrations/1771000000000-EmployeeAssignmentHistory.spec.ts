import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeAssignmentHistory1771000000000 } from './1771000000000-EmployeeAssignmentHistory.js';

describe('EmployeeAssignmentHistory migration', () => {
  it('adds normalized assignment references and preserves legacy employee rows', async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new EmployeeAssignmentHistory1771000000000().up({
      query,
    } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(
      statements.some((sql) =>
        sql.includes('CREATE TABLE IF NOT EXISTS employee_positions'),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) =>
        sql.includes('REFERENCES departments(id) ON DELETE RESTRICT'),
      ),
    ).toBe(true);
    expect(
      statements.some((sql) =>
        sql.includes('REFERENCES employee_positions(id) ON DELETE RESTRICT'),
      ),
    ).toBe(true);
    expect(
      statements.some(
        (sql) =>
          sql.includes('INSERT INTO employee_assignment_history') &&
          sql.includes('WHERE NOT EXISTS'),
      ),
    ).toBe(true);
    expect(statements.some((sql) => sql.includes('CURRENT_DATE'))).toBe(false);
    expect(
      statements.some(
        (sql) => sql.includes('DROP TABLE') || sql.includes('DROP COLUMN'),
      ),
    ).toBe(false);
    await expect(
      new EmployeeAssignmentHistory1771000000000().down(),
    ).resolves.toBeUndefined();
  });
});
