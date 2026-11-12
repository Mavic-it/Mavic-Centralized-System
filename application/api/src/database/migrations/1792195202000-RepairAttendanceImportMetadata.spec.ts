import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RepairAttendanceImportMetadata1792195202000 } from './1792195202000-RepairAttendanceImportMetadata.js';

describe('attendance import metadata repair', () => {
  it('repairs missing batch metadata without overwriting existing source or attendance', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new RepairAttendanceImportMetadata1792195202000().up({ query } as unknown as QueryRunner);
    const sql = String(query.mock.calls[0]?.[0]);
    for (const column of ['column_headers', 'summary_date', 'punch_in_values', 'punch_out_values']) {
      expect(sql).toContain(`ADD COLUMN IF NOT EXISTS ${column}`);
    }
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|DROP|TRUNCATE)\b/);
  });

  it('preserves metadata on rollback because the columns are shared with the base schema', async () => {
    await expect(new RepairAttendanceImportMetadata1792195202000().down()).resolves.toBeUndefined();
  });
});
