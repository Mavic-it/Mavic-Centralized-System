import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { ModuleAccessLevels1794009600000 } from './1794009600000-ModuleAccessLevels.js';

describe('ModuleAccessLevels migration', () => {
  it('converts legacy grants to edit and permits view/edit audit values', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (sql: string) => {
      statements.push(sql);
      return [];
    });

    await new ModuleAccessLevels1794009600000().up({ query } as unknown as QueryRunner);

    expect(statements[1]).toContain("SET effect='EDIT' WHERE effect='ALLOW'");
    expect(statements[2]).toContain("CHECK (effect IN ('VIEW','EDIT','DENY'))");
    expect(statements[5]).toContain("'ALLOW','VIEW','EDIT','DENY'");
    expect(statements[6]).toContain("'ALLOW','VIEW','EDIT','DENY'");
  });
});
