import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairUserEmployeeLink1764000000000 } from './1764000000000-RepairUserEmployeeLink.js';

describe('RepairUserEmployeeLink1764000000', () => {
  it('restores the employee link and its constraints idempotently', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: string) => {
      statements.push(statement);
      return [];
    });

    await new RepairUserEmployeeLink1764000000000().up(
      { query } as unknown as QueryRunner,
    );

    expect(statements[0]).toContain('ADD COLUMN IF NOT EXISTS employee_id');
    expect(statements[1]).toContain('users_employee_id_fkey');
    expect(statements[1]).toContain('REFERENCES employees(id) ON DELETE SET NULL');
    expect(statements[2]).toContain("WHERE role = 'SUPER_ADMIN'");
    expect(statements[3]).toContain('users_super_admin_scope_check');
    expect(statements[4]).toContain('CREATE INDEX IF NOT EXISTS users_employee_id_idx');
    expect(statements[5]).toContain('CREATE UNIQUE INDEX IF NOT EXISTS users_employee_id_uidx');
    expect(statements[5]).toContain('WHERE employee_id IS NOT NULL');
  });
});
