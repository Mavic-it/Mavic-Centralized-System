import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { PayrollDtrExportFormats1792281600000 } from './1792281600000-PayrollDtrExportFormats.js';

describe('payroll DTR export format migration', () => {
  it('adds format and optional employee scope without changing existing XLSX history', async () => {
    const query = vi.fn(async () => []);
    await new PayrollDtrExportFormats1792281600000().up({ query } as unknown as QueryRunner);
    expect(query.mock.calls[0][0]).toContain("DEFAULT 'XLSX'");
    expect(query.mock.calls[0][0]).toContain('employee_id');
    expect(query.mock.calls[2][0]).toContain('payroll_dtr_exports_cutoff_history_idx');
  });
});
