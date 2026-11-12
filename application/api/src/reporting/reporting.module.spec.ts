import { describe, expect, it } from 'vitest';
import { ReportController } from './reports/report.controller.js';
import { ReportService } from './reports/report.service.js';

describe('MSPACES reporting module', () => {
  it('builds a branch-aware summary across HR, rooms, and inventory', () => {
    const reports = new ReportService();
    const controller = new ReportController(reports);

    controller.record('hr', {
      branchId: 'branch-1',
      amount: 12,
      label: 'Active employees',
    });
    controller.record('rooms', {
      branchId: 'branch-1',
      amount: 8,
      label: 'Available rooms',
    });
    controller.record('inventory', {
      branchId: 'branch-1',
      amount: 240,
      label: 'Inventory units',
    });

    const summary = controller.summary('branch-1');

    expect(summary.total).toBe(260);
    expect(summary.modules).toEqual(['hr', 'rooms', 'inventory']);
  });
});
