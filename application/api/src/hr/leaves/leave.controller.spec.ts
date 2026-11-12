import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { ValidationPipe } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { LeaveController } from './leave.controller.js';
import type { LeaveService } from './leave.service.js';
import {
  RequestDto,
  AdjustmentDto,
  CommentDto,
  CancellationResponseDto,
  CancellationDecisionDto,
} from './leave.dto.js';
const request = {
  user: {
    userId: 'admin',
    role: 'SUPER_ADMIN',
    email: 'admin@fixture.test',
    branchId: null,
    scope: 'ALL',
  },
} as AuthenticatedRequest;
describe('Leave API contracts and exports', () => {
  it('serves a personal leave context separately from the management context', () => {
    const context = vi.fn().mockReturnValue({ ownEmployee: null });
    const controller = new LeaveController({
      context,
    } as unknown as LeaveService);
    expect(controller.personalContext(request)).toEqual({ ownEmployee: null });
    expect(context).toHaveBeenCalledWith(request.user);
  });
  it('rejects browser-supplied identity and chargeable days', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          typeId: '11111111-1111-4111-8111-111111111111',
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          reason: 'Fixture',
          submissionKey: '22222222-2222-4222-8222-222222222222',
          employeeId: 'another',
          branchId: 'other',
          days: 0,
        },
        { type: 'body', metatype: RequestDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        {
          typeId: '11111111-1111-4111-8111-111111111111',
          year: 2026,
          days: 1.25,
          key: '22222222-2222-4222-8222-222222222222',
          reason: 'Fixture',
        },
        { type: 'body', metatype: AdjustmentDto },
      ),
    ).rejects.toThrow();
  });
  it('normalizes optional null comments before service validation', async () => {
    const decide = vi.fn(),
      cancel = vi.fn();
    const controller = new LeaveController({
      decide,
      cancel,
    } as unknown as LeaveService);
    const input = { comment: null } as unknown as CommentDto;
    await controller.approve(request, 'fixture', input);
    await controller.reject(request, 'fixture', input);
    await controller.cancel(request, 'fixture', input);
    expect(decide).toHaveBeenNthCalledWith(
      1,
      request.user,
      'fixture',
      'APPROVED',
      '',
    );
    expect(cancel).toHaveBeenCalledWith(request.user, 'fixture', '');
  });
  it('validates cancellation responses and delegates each role-specific action', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        {
          action: 'RESCHEDULE',
          comment: 'New dates',
          startDate: '2027-01-20',
          endDate: '2027-01-21',
        },
        { type: 'body', metatype: CancellationResponseDto },
      ),
    ).resolves.toMatchObject({ action: 'RESCHEDULE' });
    await expect(
      pipe.transform(
        { action: 'DELETE', comment: 'No' },
        { type: 'body', metatype: CancellationResponseDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { action: 'APPROVE', comment: 'Okay', employeeId: 'other' },
        { type: 'body', metatype: CancellationDecisionDto },
      ),
    ).rejects.toThrow();
    const proposeCancellation = vi.fn(),
      respondCancellation = vi.fn(),
      decideCancellation = vi.fn();
    const controller = new LeaveController({
      proposeCancellation,
      respondCancellation,
      decideCancellation,
    } as unknown as LeaveService);
    await controller.proposeCancellation(request, 'r-1', {
      comment: 'Staffing change',
    });
    await controller.respondCancellation(request, 'r-1', {
      action: 'CONTINUE',
      comment: 'I need this leave',
    });
    await controller.decideCancellation(request, 'r-1', {
      action: 'REJECT',
      comment: 'Keep original',
    });
    expect(proposeCancellation).toHaveBeenCalledWith(
      request.user,
      'r-1',
      'Staffing change',
    );
    expect(respondCancellation).toHaveBeenCalledWith(request.user, 'r-1', {
      action: 'CONTINUE',
      comment: 'I need this leave',
    });
    expect(decideCancellation).toHaveBeenCalledWith(
      request.user,
      'r-1',
      'REJECT',
      'Keep original',
    );
  });
  it.each(['csv', 'xlsx'])(
    'exports the scoped report with spreadsheet-safe values in %s',
    async (format) => {
      const report = vi.fn().mockResolvedValue({
        year: 2026,
        from: '2026-01-01',
        to: '2026-12-31',
        asOf: '2026-10-22',
        basis: 'Full credit year; filtered requests',
        typeBreakdown: [
          {
            typeId: 'lwop',
            typeName: 'Leave Without Pay',
            code: 'LWOP',
            paid: false,
            active: true,
            effectiveFrom: '2026-01-01',
            used: 0,
            available: 0,
            reserved: 0,
            approvedUnpaidDays: 2.5,
            pendingUnpaidDays: 1,
          },
        ],
        balances: [
          {
            employeeName: '=HYPERLINK("bad")',
            branchName: 'Makati',
            typeName: 'Vacation',
            allocated: 10,
            adjustments: 3,
            used: 2,
            restored: 0,
            reserved: 1,
            available: 10,
            year: 2026,
          },
        ],
        requests: [
          {
            employeeName: '=HYPERLINK("bad")',
            branchName: 'Makati',
            typeName: 'Vacation',
            startDate: '2026-11-02',
            endDate: '2026-11-02',
            days: 1,
            status: 'PENDING',
            reason: 'PRIVATE_REASON',
          },
        ],
      });
      const controller = new LeaveController({
        report,
      } as unknown as LeaveService);
      const setHeader = vi.fn();
      const filter = {
        year: 2026,
        branchId: 'makati',
        status: 'PENDING',
        format,
      };
      const file = await controller.export(request, filter, {
        setHeader,
      } as unknown as Response);
      const chunks: Buffer[] = [];
      for await (const chunk of file.getStream())
        chunks.push(Buffer.from(chunk));
      const bytes = Buffer.concat(chunks);
      expect(report).toHaveBeenCalledWith(request.user, filter);
      expect(setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, no-store',
      );
      if (format === 'xlsx') {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(bytes as never);
        expect(workbook.getWorksheet('Leave types')!.getCell('A2').value).toBe(
          'Leave Without Pay',
        );
        expect(workbook.getWorksheet('Leave types')!.getCell('G2').value).toBe(
          'N/A',
        );
        expect(workbook.getWorksheet('Leave types')!.getCell('I2').value).toBe(
          2.5,
        );
        expect(workbook.getWorksheet('Credits')!.getCell('A2').value).toBe(
          '\'=HYPERLINK("bad")',
        );
        expect(
          JSON.stringify(workbook.getWorksheet('Requests')!.getSheetValues()),
        ).not.toContain('PRIVATE_REASON');
      } else {
        expect(bytes.toString()).toContain("'=HYPERLINK");
        expect(bytes.toString()).toContain('Leave Without Pay');
        expect(bytes.toString()).toContain('N/A');
        expect(bytes.toString()).not.toContain('PRIVATE_REASON');
        expect(bytes.toString()).toContain(
          'Full credit year; filtered requests',
        );
      }
    },
  );
});
