import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairPayrollDtrSnapshotReady1792195201000 } from './1792195201000-RepairPayrollDtrSnapshotReady.js';

describe('repair payroll DTR snapshot readiness migration', () => {
  it('adds the missing readiness flag without changing existing cutoff values', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new RepairPayrollDtrSnapshotReady1792195201000().up({ query } as unknown as QueryRunner);
    expect(String(query.mock.calls[0]?.[0])).toContain(
      'ADD COLUMN IF NOT EXISTS snapshot_ready boolean NOT NULL DEFAULT false');
  });

  it('refuses to remove the flag when snapshots depend on it', async () => {
    const query = vi.fn().mockResolvedValue([{ has_ready_snapshots: true }]);
    await expect(new RepairPayrollDtrSnapshotReady1792195201000().down({ query } as unknown as QueryRunner))
      .rejects.toThrow('Payroll cutoff snapshots use snapshot_ready');
    expect(query).toHaveBeenCalledOnce();
  });

  it('removes the flag on rollback only when no cutoff is marked ready', async () => {
    const query = vi.fn().mockResolvedValue([{ has_ready_snapshots: false }]);
    await new RepairPayrollDtrSnapshotReady1792195201000().down({ query } as unknown as QueryRunner);
    expect(query).toHaveBeenCalledTimes(2);
    expect(String(query.mock.calls[1]?.[0])).toContain('DROP COLUMN IF EXISTS snapshot_ready');
  });
});
