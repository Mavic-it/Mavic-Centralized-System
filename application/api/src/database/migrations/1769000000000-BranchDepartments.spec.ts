import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { BranchDepartments1769000000000 } from './1769000000000-BranchDepartments.js';

describe('BranchDepartments migration', () => {
  it('creates a branch scoped catalog and backfills existing employee departments', async () => {
    const query = vi.fn(async (_sql: string) => undefined);
    await new BranchDepartments1769000000000().up({ query } as unknown as QueryRunner);

    const statements = query.mock.calls.map(([sql]) => String(sql));
    expect(statements.some((sql) => sql.includes('REFERENCES branches(id)'))).toBe(true);
    expect(statements.some((sql) => sql.includes('lower(name)'))).toBe(true);
    expect(statements.some((sql) => sql.includes('FROM employees e'))).toBe(true);
    expect(statements.some((sql) => sql.includes('ON CONFLICT DO NOTHING'))).toBe(true);
  });
});
