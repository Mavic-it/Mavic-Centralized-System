import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairModuleAccessAudit1793923200000 } from './1793923200000-RepairModuleAccessAudit.js';

describe('RepairModuleAccessAudit migration', () => {
  it('creates the missing audit table and index idempotently', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return [];
    });

    await new RepairModuleAccessAudit1793923200000().up({ query } as unknown as QueryRunner);

    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS user_module_permission_audit');
    expect(statements[0]).toContain('REFERENCES users(id)');
    expect(statements[0]).toContain('REFERENCES branches(id) ON DELETE SET NULL');
    expect(statements[1]).toContain('CREATE INDEX IF NOT EXISTS idx_user_module_permission_audit_target_created');
  });
});
