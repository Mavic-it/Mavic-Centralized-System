import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { MultipleBranchManagers1792108800000 } from './1792108800000-MultipleBranchManagers.js';

describe('multiple manager branches migration', () => {
  it('replaces the single-branch uniqueness rule without modifying branch records', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new MultipleBranchManagers1792108800000().up({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('CREATE INDEX IF NOT EXISTS branches_manager_user_id_idx'));
    expect(query).toHaveBeenCalledWith('DROP INDEX IF EXISTS branches_manager_user_id_uidx');
    expect(query.mock.calls.every(([sql]) => !/DELETE FROM|UPDATE branches|DROP COLUMN/i.test(String(sql)))).toBe(true);
  });

  it('refuses to revert when doing so would discard multiple branch assignments', async () => {
    const query = vi.fn().mockResolvedValue([{ exists: true }]);
    await expect(new MultipleBranchManagers1792108800000().down({ query } as unknown as QueryRunner))
      .rejects.toThrow('Unassign managers from additional branches');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
