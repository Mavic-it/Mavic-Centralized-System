import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { IndependentSuperAdminProfiles1791936000000 } from './1791936000000-IndependentSuperAdminProfiles.js';

describe('IndependentSuperAdminProfiles1791936000000', () => {
  it('adds isolated profiles and preserves unknown account creation dates', async () => {
    const statements: string[] = [];
    const query = vi.fn(async (statement: string) => {
      statements.push(statement);
      return [];
    });

    await new IndependentSuperAdminProfiles1791936000000().up(
      { query } as unknown as QueryRunner,
    );

    expect(statements[0]).toContain(
      'ADD COLUMN IF NOT EXISTS created_at timestamptz',
    );
    expect(statements[0]).toContain(
      'ADD COLUMN IF NOT EXISTS last_login_at timestamptz',
    );
    expect(statements[0]).not.toContain('DEFAULT');
    expect(statements[1]).toContain('SET DEFAULT now()');
    expect(statements[2]).toContain(
      'DROP CONSTRAINT IF EXISTS users_super_admin_scope_check',
    );
    expect(statements[3]).toContain("CHECK (role <> 'SUPER_ADMIN' OR branch_id IS NULL)");
    expect(statements[4]).toContain(
      'user_id varchar(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE',
    );
    expect(statements[4]).not.toContain('REFERENCES employees');
    expect(statements[4]).toContain('profile_picture_data bytea');
  });

  it('does not drop user profile data during rollback', async () => {
    const query = vi.fn();

    await new IndependentSuperAdminProfiles1791936000000().down(
      { query } as unknown as QueryRunner,
    );

    expect(query).not.toHaveBeenCalled();
  });
});
