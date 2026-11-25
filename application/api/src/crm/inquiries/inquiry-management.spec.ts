import { describe, expect, it, vi } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DataSource } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { InquiryManagementService } from './inquiry-management.service.js';
import { SaveInquiryDto, InquiryQueryDto } from './inquiry.dto.js';
import { csvCell, validateTransition } from './inquiry.domain.js';
import {
  importDate,
  importStatus,
  parseInquiryWorkbook,
  serviceName,
} from './inquiry-import.js';
import * as XLSX from 'xlsx';
import { parseImportOptions } from './inquiry-import-options.js';

const user: AuthUserContext = {
  userId: 'staff',
  email: 'staff@example.invalid',
  role: 'STAFF',
  branchId: 'a',
  branchIds: ['a'],
};
const workbook = (rows: unknown[][], sheet = 'ORTIGAS') => {
  const w = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(w, XLSX.utils.aoa_to_sheet(rows), sheet);
  return XLSX.write(w, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
};
describe('Inquiry workflow rules', () => {
  it('requires reasons for loss and reopening', () => {
    expect(() => validateTransition('NEW', 'LOST')).toThrow('reason');
    expect(() => validateTransition('LOST', 'IN_PROGRESS')).toThrow('reason');
    expect(() =>
      validateTransition('LOST', 'IN_PROGRESS', 'Client returned'),
    ).not.toThrow();
    expect(() => validateTransition('CLOSED', 'NEW', 'Returned')).toThrow(
      'Reopen',
    );
  });
  it.each(['PENDING_RESERVATION', 'RESERVED', 'CONVERTED'])(
    'rejects manual conversion to %s',
    (status) =>
      expect(() => validateTransition('NEW', status, 'test')).toThrow(
        'conversion',
      ),
  );
  it('does not cancel an inquiry for no response', () =>
    expect(() => validateTransition('FOLLOW_UP', 'NO_RESPONSE')).not.toThrow());
  it.each(['=SUM(A1)', ' +123', '@command', '-2', '\tformula'])(
    'neutralizes spreadsheet formula %s',
    (value) => expect(csvCell(value)).toContain("'"),
  );
  it('escapes quotes in CSV values', () =>
    expect(csvCell('a"b')).toBe('"a""b"'));
});
describe('Inquiry request validation', () => {
  const input = {
    branchId: 'a',
    clientName: 'Client',
    inquiryDate: '2026-11-24',
    preferredBranchIds: ['a'],
    serviceIds: ['service'],
    channelId: 'call',
    assignedStaffId: 'staff',
  };
  it('accepts a client without contacts or customer ID', async () =>
    expect(await validate(plainToInstance(SaveInquiryDto, input))).toEqual([]));
  it('rejects invalid dates and empty branch/service lists', async () =>
    expect(
      (
        await validate(
          plainToInstance(SaveInquiryDto, {
            ...input,
            inquiryDate: '2026-02-30',
            preferredBranchIds: [],
            serviceIds: [],
          }),
        )
      ).length,
    ).toBeGreaterThan(0));
  it('rejects duplicate multi-select values', async () =>
    expect(
      (
        await validate(
          plainToInstance(SaveInquiryDto, { ...input, serviceIds: ['s', 's'] }),
        )
      ).length,
    ).toBeGreaterThan(0));
  it('bounds page size and rejects sort injection', async () =>
    expect(
      (
        await validate(
          plainToInstance(InquiryQueryDto, {
            pageSize: 5000,
            sort: 'DROP TABLE inquiries',
          }),
        )
      ).length,
    ).toBeGreaterThan(0));
});
describe('Handling branch and permission boundaries', () => {
  it('rejects foreign branch filters before querying records', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new InquiryManagementService({
      query,
    } as unknown as DataSource);
    await expect(
      service.list(user, plainToInstance(InquiryQueryDto, { branchId: 'b' })),
    ).rejects.toThrow('branch');
    expect(
      query.mock.calls.some((c) => String(c[0]).includes('FROM inquiries')),
    ).toBe(false);
  });
  it('uses handling ownership rather than preferred branch for detail', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new InquiryManagementService({
      query,
    } as unknown as DataSource);
    await expect(service.detail(user, 'foreign')).rejects.toThrow('not found');
    const call = query.mock.calls.find((c) =>
      String(c[0]).includes('FROM inquiries'),
    )!;
    expect(call[0]).toContain('i.branch_id=ANY($2)');
    expect(call[0]).not.toContain('inquiry_preferred_branches');
    expect(call[1]).toEqual(['foreign', ['a']]);
  });
  it('enforces explicit parent deny even for default staff access', async () => {
    const service = new InquiryManagementService({
      query: vi
        .fn()
        .mockResolvedValue([
          { permission_key: 'crm.inquiries', effect: 'DENY' },
        ]),
    } as unknown as DataSource);
    await expect(service.authorize(user)).rejects.toThrow('denied');
  });
  it('enforces view-only and granular export denial', async () => {
    const query = vi.fn().mockResolvedValue([
      { permission_key: 'crm.inquiries.update', effect: 'VIEW' },
      { permission_key: 'crm.inquiries.export', effect: 'DENY' },
    ]);
    const service = new InquiryManagementService({
      query,
    } as unknown as DataSource);
    await expect(service.authorize(user, 'update', true)).rejects.toThrow(
      'not permitted',
    );
    await expect(service.export(user, new InquiryQueryDto())).rejects.toThrow(
      'denied',
    );
  });
  it('keeps empty selected scope closed and parameterizes search', () => {
    const service = new InquiryManagementService({} as DataSource);
    const result = service.filter(
      { ...user, branchIds: [] },
      plainToInstance(InquiryQueryDto, { search: "x' OR 1=1 --" }),
    );
    expect(result.params[0]).toEqual([]);
    expect(result.where).not.toContain("x'");
    expect(result.params).toContain("x' OR 1=1 --");
  });
});
describe('Historical workbook normalization', () => {
  const headers = [
    '',
    'RESERVATION DATES',
    "CLIENT'S NAME",
    'LOCATION',
    'DETAILS INQUIRY',
    'INQUIRY CHANNEL',
    'SOURCE OF INQUIRY',
    'ACTION TAKEN',
    'NEXT STEPS',
    'DATE OF FOLLOW-UP',
    'INQUIRY STATUS',
    'REASON',
    'OTHER REMARKS',
  ];
  it('reads blank Ortigas date header without replacing it with reservation date', () => {
    const parsed = parseInquiryWorkbook(
      workbook([
        headers,
        [
          'September 1, 2026',
          'September 3, 2026',
          'Client',
          'Ortigas',
          'Meeting Rooms',
          'Call',
          'Google',
          'Sent Proposal',
          'Follow-up',
          'Reserved',
          'Reserved',
          'N/A',
          'Note',
        ],
      ]),
    );
    expect(parsed.rows[0]).toMatchObject({
      row: 2,
      date: '2026-09-01',
      reservationDate: '2026-09-03',
      services: ['Meeting Room'],
      followUpDate: null,
      status: 'CLOSED',
      legacyOutcome: 'RESERVED',
    });
  });
  it('preserves original row numbers and skips repeated headers and blank rows', () => {
    const parsed = parseInquiryWorkbook(
      workbook([
        headers,
        [],
        headers,
        [
          '2026-11-24',
          null,
          'Client',
          null,
          'Cowoking',
          'Facebook',
          null,
          null,
          null,
          null,
          'No response',
        ],
      ]),
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].row).toBe(4);
    expect(parsed.rows[0].services).toEqual(['Coworking']);
  });
  it('supports different Makati columns', () => {
    const parsed = parseInquiryWorkbook(
      workbook(
        [
          ['DATE', "CLIENT'S NAME", 'DETAILS INQUIRY', 'INQUIRY STATUS'],
          [
            '2026-11-24',
            'Client',
            'Virtual Office, Private Office',
            'In progress',
          ],
        ],
        'MAKATI',
      ),
    );
    expect(parsed.rows[0]).toMatchObject({
      date: '2026-11-24',
      services: ['Virtual Office', 'Private Office'],
      status: 'IN_PROGRESS',
    });
  });
  it('preserves unknown states for review', () =>
    expect(importStatus('unrecognized')).toBe('NEEDS_REVIEW'));
  it.each(['Reserved', 'Ocular', '04/05/2026', '2026-02-30'])(
    'rejects ambiguous or invalid date %s',
    (v) => expect(importDate(v)).toBeNull(),
  );
  it('supports serial dates', () =>
    expect(importDate(46350)).toMatch(/^2026-/));
  it('normalizes spelling', () =>
    expect(serviceName(' Cowoking ')).toBe('Coworking'));
  it('bounds upload size', () =>
    expect(() =>
      parseInquiryWorkbook(Buffer.alloc(5 * 1024 * 1024 + 1)),
    ).toThrow('5 MB'));
  it('maps custom headers and keeps source row numbers', () => {
    const parsed = parseInquiryWorkbook(
      workbook(
        [['Report'], ['Name', 'When'], ['Synthetic', '2026-11-24']],
        'Custom',
      ),
      { Custom: { headerRow: 2, columns: { clientName: 0, date: 1 } } },
    );
    expect(parsed.rows[0]).toMatchObject({
      clientName: 'Synthetic',
      date: '2026-11-24',
      row: 3,
    });
  });
  it('strictly validates mappings and correction fields', () => {
    expect(() =>
      parseImportOptions(
        '{"mapping":{"Sheet":{"headerRow":1,"columns":{"date":999}}}}',
      ),
    ).toThrow('Invalid');
    expect(() =>
      parseImportOptions('{"corrections":{"Sheet:2":{"branchId":"foreign"}}}'),
    ).toThrow('Invalid');
  });
});
