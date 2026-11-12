import { BadRequestException, ConflictException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceService } from './attendance.service.js';

describe('AttendanceService', () => {
  it('rejects unbounded attendance ranges before querying the database', async () => {
    const query = vi.fn();
    const service = new AttendanceService({ query } as unknown as DataSource);

    await expect(
      service.list({ from: '2024-01-01', to: '2025-01-02' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('requires a branch schedule before clocking in', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const dataSource = {
      query,
    } as unknown as DataSource;
    const service = new AttendanceService(dataSource);

    await expect(
      service.clockIn({ id: 'employee-1', branchId: 'branch-1' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('uses an employee effective schedule before the branch schedule', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          branchId: 'branch-1',
          timeZone: 'Asia/Manila',
          workDays: [1, 2, 3, 4, 5],
          shiftStart: '11:00:00',
          shiftEnd: '20:00:00',
          breakMinutes: 30,
          graceMinutes: 0,
        },
      ])
      .mockResolvedValueOnce([]);
    const managerQuery = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn(async (operation: (manager: EntityManager) => unknown) =>
      operation({ query: managerQuery } as unknown as EntityManager));
    const service = new AttendanceService({ query, transaction } as unknown as DataSource);

    await expect(
      service.clockIn(
        { id: 'employee-1', branchId: 'branch-1' },
        new Date('2026-10-07T01:00:00.000Z'),
      ),
    ).rejects.toThrow('Attendance has already been started for today.');

    const insert = managerQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO attendance_records'));
    expect(insert?.[1]?.[5]).toBe('11:00');
    expect(insert?.[1]?.[6]).toBe('20:00');
    expect(insert?.[0]).toContain('INSERT INTO attendance_records');
  });

  it('prevents duplicate daily clock-ins when the database uniqueness guard wins', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce([
        {
          branchId: 'branch-1',
          timeZone: 'Asia/Manila',
          workDays: [1, 2, 3, 4, 5, 6, 0],
          shiftStart: '09:00:00',
          shiftEnd: '18:00:00',
          breakMinutes: 60,
          graceMinutes: 5,
        },
      ])
      .mockResolvedValueOnce([]);
    const managerQuery = vi.fn().mockResolvedValue([]);
    const transaction = vi.fn(async (operation: (manager: EntityManager) => unknown) =>
      operation({ query: managerQuery } as unknown as EntityManager));
    const dataSource = { query, transaction } as unknown as DataSource;
    const service = new AttendanceService(dataSource);

    await expect(
      service.clockIn(
        { id: 'employee-1', branchId: 'branch-1' },
        new Date('2026-10-07T01:00:00.000Z'),
      ),
    ).rejects.toThrow('Attendance has already been started for today.');
    const insert = managerQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO attendance_records'));
    expect(insert?.[0]).toContain(
      'ON CONFLICT (employee_id, work_date) DO NOTHING',
    );
    expect(insert?.[1]).toContain('2026-10-07');
  });

  it('records an audit event in the same transaction as an attendance correction', async () => {
    const record = {
      id: 'attendance-1',
      employeeId: 'employee-1',
      employeeName: 'Employee One',
      branchId: 'branch-1',
      branchName: 'Branch One',
      workDate: '2026-10-07',
      timeIn: '2026-10-07T01:00:00.000Z',
      timeOut: '2026-10-07T10:00:00.000Z',
      source: 'MANUAL' as const,
      status: 'CORRECTED',
      totalMinutes: 480,
      regularMinutes: 480,
      overtimeMinutes: 0,
      lateMinutes: 0,
      undertimeMinutes: 0,
    };
    const managerQuery = vi.fn(async (sql: string) => {
      if (sql.startsWith('SELECT id, employee_id')) {
        return [{ ...record, employeeName: undefined, branchName: undefined }];
      }
      if (sql.startsWith('UPDATE attendance_records'))
        return [{ id: record.id }];
      if (sql.startsWith('INSERT INTO audit_logs')) return [];
      if (sql.startsWith('SELECT a.id')) return [record];
      return [];
    });
    const manager = { query: managerQuery } as unknown as EntityManager;
    const transaction = vi.fn(
      async (operation: (transactionManager: EntityManager) => unknown) =>
        operation(manager),
    );
    const dataSource = {
      transaction,
    } as unknown as DataSource;
    const service = new AttendanceService(dataSource);

    await service.correct(
      'attendance-1',
      {
        timeIn: '2026-10-07T01:05:00.000Z',
        reason: 'Corrected after manager review',
      },
      {
        userId: 'manager-1',
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      },
    );

    expect(transaction).toHaveBeenCalledOnce();
    const auditInsert = managerQuery.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO audit_logs'),
    );
    expect(auditInsert).toBeDefined();
    expect(auditInsert?.[1]?.[3]).toContain('Corrected after manager review');
  });
});
