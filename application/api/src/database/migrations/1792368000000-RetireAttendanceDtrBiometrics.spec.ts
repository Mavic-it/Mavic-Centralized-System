import type { QueryRunner } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { RetireAttendanceDtrBiometrics1792368000000 } from './1792368000000-RetireAttendanceDtrBiometrics.js';

describe('retire attendance DTR and biometrics migration', () => {
  it('drops only retired tables in foreign-key-safe order', async () => {
    const query = vi.fn().mockResolvedValue([]);
    await new RetireAttendanceDtrBiometrics1792368000000().up({
      query,
    } as unknown as QueryRunner);

    const dropped = query.mock.calls.map(([statement]) =>
      String(statement).replace(/^DROP TABLE IF EXISTS /, ''),
    );
    expect(dropped).toEqual([
      'payroll_dtr_exports',
      'payroll_attendance_cutoff_history',
      'payroll_attendance_cutoff_rows',
      'payroll_attendance_cutoffs',
      'payroll_dtr_export_templates',
      'attendance_holiday_reviews',
      'attendance_holidays',
      'attendance_payroll_policies',
      'attendance_biometric_raw_events',
      'employee_biometric_identifiers',
      'attendance_import_format_versions',
      'attendance_import_rows',
      'attendance_import_batches',
      'attendance_import_formats',
    ]);
    expect(dropped).not.toContain('attendance_records');
    expect(dropped).not.toContain('attendance_corrections');
    expect(dropped).not.toContain('attendance_overtime_approvals');
    expect(dropped).not.toContain('audit_logs');
  });

  it('is forward-only because deleted DTR data cannot be reconstructed', async () => {
    const query = vi.fn();
    await expect(
      new RetireAttendanceDtrBiometrics1792368000000().down(
        { query } as unknown as QueryRunner,
      ),
    ).rejects.toThrow('Restore a pre-migration database backup');
    expect(query).not.toHaveBeenCalled();
  });
});
