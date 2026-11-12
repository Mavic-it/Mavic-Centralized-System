import type { DataSource } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';

describe('MSPACES system module', () => {
  it('persists audit logs and branch settings through parameterized queries', async () => {
    const auditRows: Array<Record<string, unknown>> = [];
    const settingRows = new Map<string, unknown>();
    const query = vi.fn(async (sql: string, parameters: unknown[] = []) => {
      if (sql.includes('INSERT INTO audit_logs')) {
        const [id, userId, branchId, action, resource, details, createdAt] =
          parameters;
        const row = {
          id,
          userId,
          branchId,
          action,
          resource,
          details,
          createdAt,
        };
        auditRows.push(row);
        return [row];
      }
      if (sql.includes('FROM audit_logs')) {
        return auditRows;
      }
      if (sql.includes('INSERT INTO branch_settings')) {
        settingRows.set(
          `${parameters[0]}:${parameters[1]}`,
          JSON.parse(String(parameters[2])),
        );
        return [];
      }
      if (sql.includes('FROM branch_settings')) {
        return Array.from(settingRows.entries())
          .filter(([key]) => key.startsWith(`${parameters[0]}:`))
          .map(([key, value]) => ({
            settingKey: key.slice(String(parameters[0]).length + 1),
            settingValue: value,
          }));
      }
      return [];
    });
    const dataSource = { query } as unknown as DataSource;
    const audit = new AuditService(dataSource);
    const auditController = new AuditController(audit);

    const log = await auditController.record({
      id: 'audit-1',
      userId: 'u-1',
      branchId: 'branch-1',
      action: 'APPROVE_LEAVE',
      resource: 'leave_requests',
      details: 'Approved annual leave for Maria Santos',
      createdAt: '2026-10-10T12:00:00Z',
    });

    expect(log.action).toBe('APPROVE_LEAVE');
    expect(await auditController.list('branch-1')).toHaveLength(1);

    const settings = new SettingsService(dataSource);
    const settingsController = new SettingsController(settings);
    await settingsController.set('branch-1', 'leaveApprovalMode', 'manager_hr');

    expect(await settingsController.get('branch-1', 'leaveApprovalMode')).toBe(
      'manager_hr',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO branch_settings'),
      ['branch-1', 'leaveApprovalMode', JSON.stringify('manager_hr')],
    );
  });
});
