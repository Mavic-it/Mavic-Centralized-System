import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { BranchBiometricPayrollDtr1792195200000 } from './1792195200000-BranchBiometricPayrollDtr.js';

describe('branch biometric and payroll DTR migration', () => {
  it('adds source retention, template versions, branch rules, cutoff snapshots, and export records', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new BranchBiometricPayrollDtr1792195200000().up({ query } as unknown as QueryRunner);
    const sql = query.mock.calls.map(([statement]) => String(statement)).join('\n');
    expect(sql).toContain('source_file_bytes bytea');
    expect(sql).toContain('attendance_import_format_versions');
    expect(sql).toContain('employee_biometric_identifiers');
    expect(sql).toContain('attendance_holiday_reviews');
    expect(sql).toContain("overtime_unit = 'MINUTES'");
    expect(sql).toContain('payroll_attendance_cutoff_rows');
    expect(sql).toContain('snapshot_ready boolean NOT NULL DEFAULT false');
    expect(sql).toContain('payroll_dtr_exports');
    expect(sql).not.toMatch(/\b(DELETE FROM|TRUNCATE|UPDATE attendance_records)\b/i);
  });

  it('refuses to drop retained source or payroll data during rollback', async () => {
    const query = vi.fn().mockResolvedValue([{ exists: true }]);
    await expect(new BranchBiometricPayrollDtr1792195200000().down({ query } as unknown as QueryRunner))
      .rejects.toThrow('Biometric and payroll DTR data exists');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
