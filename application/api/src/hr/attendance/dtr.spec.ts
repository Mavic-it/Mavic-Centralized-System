import { describe, it, expect, vi } from 'vitest';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import type { DataSource } from 'typeorm';
import { parseDtr, timeText, dateTimeText, nextDate } from './dtr.parser.js';
import { calculateDtr, summarizeDtr, wallToInstant } from './dtr.calculator.js';
import { exportDtr, safeCell } from './dtr.export.js';
import {
  DEFAULT_DTR_POLICY,
  type DtrSource,
  type DtrRecord,
} from './dtr.types.js';
import { DtrService } from './dtr.service.js';
import { ValidationPipe } from '@nestjs/common';
import {
  DtrCorrectionDto,
  DtrImportSelectionDto,
  DtrSettingsDto,
  DtrSaveTemplateDto,
} from './dtr.dto.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

function workbook(
  sheets: Record<string, unknown[][]>,
  type: 'xls' | 'xlsx' = 'xlsx',
): Buffer {
  const book = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), name);
  return XLSX.write(book, {
    type: 'buffer',
    bookType: type === 'xls' ? 'biff8' : 'xlsx',
  }) as Buffer;
}
const template = { kind: 'AUTO', dateOrder: 'MDY', pairing: 'STRICT' } as const;
const schedule = {
  timeZone: 'Asia/Manila',
  workDays: [1, 2, 3, 4, 5],
  shiftStart: '08:00',
  shiftEnd: '17:00',
  breakMinutes: 60,
  graceMinutes: 0,
};
const policy = {
  ...DEFAULT_DTR_POLICY,
  breakStart: '12:00',
  breakEnd: '13:00',
};
function source(values: Partial<DtrSource> = {}): DtrSource {
  return {
    sheet: '2026-09-28',
    row: 2,
    kind: 'DAILY',
    key: 'employee',
    identifier: '65',
    name: 'Lea',
    device: 'mspaces',
    date: '2026-09-28',
    punch: null,
    direction: 'UNKNOWN',
    actualIn: '08:00',
    actualOut: '17:00',
    shiftStart: null,
    shiftEnd: null,
    status: '',
    raw: {},
    errors: [],
    ...values,
  };
}
function calc(values: Partial<Parameters<typeof calculateDtr>[0]> = {}) {
  return calculateDtr({
    workDate: '2026-09-28',
    sources: [source()],
    schedule,
    policy,
    pairing: 'STRICT',
    override: {},
    active: true,
    leaveUnits: 0,
    holiday: null,
    now: new Date('2026-10-17T00:00Z'),
    ...values,
  });
}
describe('DTR reference workbook parsing', () => {
  it('retains every raw XLS punch for personnel 65 including true repeats and contradictory statuses', () => {
    const bytes = workbook(
      {
        Sheet1: [
          [
            'Date And Time',
            'Personnel ID',
            'First Name',
            'Last Name',
            'Device Name',
            'In/Out Status',
          ],
          ['2/25/2025 15:23', 65, 'Lea', '', 'mspaces', 'Check-In'],
          ['2/25/2025 5:14', 65, 'Lea', '', 'mspaces', 'Check-Out'],
          ['2/25/2025 5:14', 65, 'Lea', '', 'mspaces', 'Check-Out'],
        ],
      },
      'xls',
    );
    const rows = parseDtr(bytes, 'Lea.xls', template);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.identifier === '65')).toBe(true);
    const result = calc({ workDate: '2025-02-25', sources: rows });
    expect(result.exceptions).toContain('Suspicious punch sequence');
    expect(result.payrollReady).toBe(false);
    expect(result.decisions.some((d) => d.includes('Duplicate retained'))).toBe(
      true,
    );
  });
  it('processes all 15 date worksheets and 16 employees without fabricating identities', () => {
    const sheets: Record<string, unknown[][]> = {};
    for (let day = 0; day < 15; day++)
      sheets[nextDate('2026-09-26', day)] = [
        ['Name', 'Dept', 'Shift Start', 'Shift End', 'In', 'Out', 'Status'],
        ...Array.from({ length: 16 }, (_, i) => [
          `Employee ${i}`,
          'Dept1',
          '08:00',
          '17:00',
          i === 0 ? null : '7:46 AM',
          i === 0 ? null : '5:08 PM',
          i === 0 ? 'Absent' : 'Present',
        ]),
      ];
    const rows = parseDtr(workbook(sheets), 'Attendance.xlsx', template);
    expect(rows).toHaveLength(240);
    expect(new Set(rows.map((r) => r.date)).size).toBe(15);
    expect(rows[0].actualIn).toBeNull();
    expect(rows[1].actualIn).toBe('07:46');
    expect(rows[1].actualOut).toBe('17:08');
    expect(rows[0].status).toBe('Absent');
  });
  it('flags repeated daily IN/OUT and source-status contradictions', () => {
    const c = calc({
      sources: [
        source({ actualIn: '10:38', actualOut: '10:38', status: 'Present' }),
      ],
    });
    expect(c.actualOut).toBeNull();
    expect(c.exceptions).toContain('Incomplete Punch');
    expect(c.payrollReady).toBe(false);
    expect(c.undertimeMinutes).toBe(0);
  });
  it('supports CSV with an explicit date and custom mapping', () => {
    const rows = parseDtr(
      Buffer.from('Worker,Arrived,Left\r\nLea,08:00,17:00'),
      'daily.csv',
      {
        ...template,
        date: '2026-09-28',
        headerRow: 1,
        fields: { name: 'Worker', in: 'Arrived', out: 'Left' },
      },
    );
    expect(rows[0].date).toBe('2026-09-28');
  });
  it('rejects unsupported signatures and oversized input', () => {
    expect(() => parseDtr(Buffer.from('csv'), 'fake.xls', template)).toThrow();
    expect(() =>
      parseDtr(Buffer.alloc(9 * 1024 * 1024), 'large.csv', template),
    ).toThrow();
  });
  it('isolates formula cells instead of treating cached results as payroll truth', () => {
    const b = XLSX.utils.book_new(),
      s = XLSX.utils.aoa_to_sheet([
        ['Name', 'In', 'Out'],
        ['Lea', '08:00', '17:00'],
      ]);
    s.B2 = { t: 's', f: '"08:00"', v: '08:00' };
    XLSX.utils.book_append_sheet(b, s, '2026-09-28');
    const rows = parseDtr(
      XLSX.write(b, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
      'formula.xlsx',
      template,
    );
    expect(rows[0].errors).toContain(
      'Formula cell requires values-only source',
    );
  });
});
describe('DTR date and minute rules', () => {
  it.each([
    [0, '00:00'],
    [0.5, '12:00'],
    ['7:46 AM', '07:46'],
    ['5:08 PM', '17:08'],
    ['12:00 AM', '00:00'],
    [null, null],
    ['', null],
  ])('parses %s as %s', (input, expected) =>
    expect(timeText(input)).toBe(expected),
  );
  it.each(['25:00', '13:00 PM', '8:91', -1, 1])(
    'rejects invalid time %s',
    (input) => expect(() => timeText(input)).toThrow(),
  );
  it('requires an explicit date order and rejects nonexistent dates', () => {
    expect(() => dateTimeText('2/25/2025 15:23', 'ISO')).toThrow();
    expect(dateTimeText('2/25/2025 15:23', 'MDY')).toBe('2025-02-25T15:23');
    expect(() => dateTimeText('2025-02-30 10:00', 'ISO')).toThrow();
    expect(dateTimeText(46000.5, 'ISO')).toMatch(/T12:00$/);
  });
  it('resolves branch local time and rejects DST folds/gaps', () => {
    expect(wallToInstant('2026-09-28T08:00', 'Asia/Manila')).toBe(
      '2026-09-28T00:00:00.000Z',
    );
    expect(() =>
      wallToInstant('2026-11-01T01:30', 'America/New_York'),
    ).toThrow();
    expect(() =>
      wallToInstant('2026-03-08T02:30', 'America/New_York'),
    ).toThrow();
  });
  it('keeps late and remaining undertime separate using paid work and break placement', () => {
    const c = calc({
      sources: [source({ actualIn: '08:27', actualOut: '12:06' })],
    });
    expect(c.lateMinutes).toBe(27);
    expect(c.undertimeMinutes).toBe(240);
    expect(c.workedMinutes).toBe(213);
  });
  it('applies grace without negative late and distinguishes potential from approved OT', () => {
    const c = calc({
      schedule: { ...schedule, graceMinutes: 10 },
      sources: [source({ actualIn: '08:06', actualOut: '18:43' })],
    });
    expect(c.lateMinutes).toBe(0);
    expect(c.potentialOtMinutes).toBe(60);
    expect(c.approvedOtMinutes).toBe(0);
  });
  it('uses the default 15-minute late grace from the scheduled start', () => {
    expect(calc({ sources: [source({ actualIn: '08:15', actualOut: '17:00' })] }).lateMinutes).toBe(0);
    expect(calc({ sources: [source({ actualIn: '08:16', actualOut: '17:00' })] }).lateMinutes).toBe(16);
  });
  it.each(['08:00', '08:12', '08:15', '08:16'])(
    'uses system grace rather than blocking an imported Late label at %s',
    (actualIn) => {
      const c = calc({ sources: [source({ actualIn, actualOut: '17:10', status: 'Present, Late' })] });
      expect(c.lateMinutes).toBe(actualIn === '08:16' ? 16 : 0);
      expect(c.payrollReady).toBe(true);
      expect(c.exceptions).not.toContain('Source status disagrees with calculated attendance');
      expect(c.sourceStatus).toEqual(['Present, Late']);
      if (actualIn !== '08:16') expect(c.decisions).toContain('Imported Late label is advisory; system schedule and grace policy determine lateness');
    },
  );
  it('still requires review for missing punches and absent/present source contradictions', () => {
    const missing = calc({ sources: [source({ actualIn: '08:15', actualOut: null, status: 'Present, Late' })] });
    expect(missing.payrollReady).toBe(false);
    expect(missing.exceptions).toContain('Incomplete Punch');
    expect(missing.exceptions).toContain('Source status disagrees with calculated attendance');
    const conflicting = calc({ sources: [source({ status: 'Absent' })] });
    expect(conflicting.payrollReady).toBe(false);
    expect(conflicting.exceptions).toContain('Source status disagrees with calculated attendance');
  });
  it('requires 50 minutes for OT and rounds each hour at the 50-minute mark', () => {
    expect(calc({ sources: [source({ actualOut: '17:49' })] }).potentialOtMinutes).toBe(0);
    expect(calc({ sources: [source({ actualOut: '17:50' })] }).potentialOtMinutes).toBe(60);
    expect(calc({ sources: [source({ actualOut: '18:49' })] }).potentialOtMinutes).toBe(60);
    expect(calc({ sources: [source({ actualOut: '18:50' })] }).potentialOtMinutes).toBe(120);
  });
  it('applies explicit OT increment and No OT', () => {
    expect(
      calc({
        policy: { ...policy, otIncrementMinutes: 30 },
        sources: [source({ actualOut: '18:43' })],
      }).potentialOtMinutes,
    ).toBe(90);
    expect(
      calc({
        override: { noOt: true },
        sources: [source({ actualOut: '18:43' })],
      }).potentialOtMinutes,
    ).toBe(0);
  });
  it('never calculates a whole-day undertime for missing OUT', () => {
    const c = calc({ sources: [source({ actualOut: null })] });
    expect(c.undertimeMinutes).toBe(0);
    expect(c.payrollReady).toBe(false);
  });
  it('does not invent a schedule or break policy', () => {
    expect(calc({ schedule: null }).exceptions).toContain('Missing Schedule');
    expect(calc({ policy: DEFAULT_DTR_POLICY }).exceptions).toContain(
      'Break placement requires HR configuration',
    );
  });
  it('recognizes imported shifts as advisory', () => {
    const c = calc({
      sources: [source({ shiftStart: '09:00', shiftEnd: '18:00' })],
    });
    expect(c.schedule?.shiftStart).toBe('08:00');
    expect(c.payrollReady).toBe(false);
  });
  it.each([
    { holiday: 'Regular Holiday' },
    { leaveUnits: 1 },
    { override: { arrangement: 'WFH' as const } },
    { override: { arrangement: 'OB' as const } },
  ])('does not mark an exempt day absent', (extra) =>
    expect(
      calc({ sources: [source({ actualIn: null, actualOut: null })], ...extra })
        .absent,
    ).toBe(0),
  );
  it('handles rest days, future days, inactive employees and unimported dates safely', () => {
    expect(
      calc({
        workDate: '2026-09-27',
        sources: [source({ actualIn: null, actualOut: null })],
      }).absent,
    ).toBe(0);
    expect(
      calc({
        workDate: '2027-09-28',
        sources: [source({ actualIn: null, actualOut: null })],
      }).absent,
    ).toBe(0);
    expect(
      calc({
        active: false,
        sources: [source({ actualIn: null, actualOut: null })],
      }).absent,
    ).toBe(0);
    expect(calc({ sources: [] }).absent).toBe(0);
  });
  it('marks a covered scheduled past date absent, but not a partial-leave day', () => {
    expect(
      calc({ sources: [source({ actualIn: null, actualOut: null })] }).absent,
    ).toBe(1);
    const partial = calc({
      leaveUnits: 0.5,
      sources: [source({ actualIn: null, actualOut: null })],
    });
    expect(partial.absent).toBe(0);
    expect(partial.payrollReady).toBe(false);
  });
  it('handles overnight daily shifts and does not silently swap normal shifts', () => {
    const c = calc({
      schedule: {
        ...schedule,
        shiftStart: '22:00',
        shiftEnd: '06:00',
        breakMinutes: 0,
      },
      sources: [source({ actualIn: '22:00', actualOut: '06:00' })],
    });
    expect(c.workedMinutes).toBe(480);
    expect(c.actualOut).toBe('2026-09-28T22:00:00.000Z');
    expect(c.payrollReady).toBe(true);
    expect(
      calc({ sources: [source({ actualIn: '17:00', actualOut: '08:00' })] })
        .payrollReady,
    ).toBe(false);
  });
  it('pairs multiple breaks without double subtracting the break', () => {
    const sources = [
      ['08:00', 'IN'],
      ['12:00', 'OUT'],
      ['13:00', 'IN'],
      ['17:00', 'OUT'],
    ].map(([time, direction], i) =>
      source({
        kind: 'PUNCH',
        punch: `2026-09-28T${time}`,
        direction: direction as 'IN' | 'OUT',
        row: i + 2,
      }),
    );
    const c = calc({ sources });
    expect(c.workedMinutes).toBe(480);
    expect(c.undertimeMinutes).toBe(0);
    expect(c.payrollReady).toBe(true);
  });
  it('requires explicit reconciliation for suspicious source; valid corrections remove incomplete state', () => {
    const c = calc({
      sources: [source({ actualIn: '10:38', actualOut: '10:38' })],
      override: {
        actualIn: '2026-09-28T00:00:00.000Z',
        actualOut: '2026-09-28T09:00:00.000Z',
        resolvedExceptions: ['Repeated IN/OUT: incomplete punch'],
      },
    });
    expect(c.payrollReady).toBe(true);
    expect(c.workedMinutes).toBe(480);
  });
  it('uses planned WFH/OB and allows an attendance-only normal override', () => {
    for (const arrangement of ['WFH', 'OB'] as const) {
      const sources = [source({ actualIn: null, actualOut: null })];
      const planned = calc({ sources, scheduledArrangement: arrangement, assignmentLabel: `${arrangement}: Client site` });
      expect(planned.absent).toBe(0);
      expect(planned.remarks).toBe(`${arrangement}: Client site`);
      expect(calc({ sources, scheduledArrangement: arrangement, override: { arrangement: 'NORMAL' } }).absent).toBe(1);
    }
  });
  it('recalculates an attendance shift without mutating the assigned schedule', () => {
    const before = { ...schedule };
    const result = calc({ sources: [source({ actualIn: '09:00', actualOut: '18:00' })], override: { shiftStart: '09:00', shiftEnd: '18:00', remarks: 'Sudden shift change' } });
    expect(result.lateMinutes).toBe(0);
    expect(result.schedule?.shiftStart).toBe('09:00');
    expect(result.remarks).toBe('Sudden shift change');
    expect(schedule).toEqual(before);
  });
  it('free-text remarks have no attendance effect and unresolved rows are excluded from totals', () => {
    const c = calc({
      sources: [source({ actualIn: null, actualOut: null })],
      override: { remarks: 'WFH Holiday No OT' },
    });
    expect(c.absent).toBe(1);
    const bad = calc({
      sources: [source({ actualIn: '09:00', actualOut: null })],
    });
    expect(
      summarizeDtr([{ employeeId: '1', data: { calculation: bad } }])
        .lateMinutes,
    ).toBe(0);
  });
});
describe('DTR export and access boundaries', () => {
  it.each([
    {
      metatype: DtrCorrectionDto,
      body: { branchId: 'branch', revision: 1, reason: 'Reviewed correction' },
      field: 'override',
      value: { remarks: 'Reviewed' },
    },
    {
      metatype: DtrSettingsDto,
      body: { branchId: 'branch', reason: 'Reviewed policy', holidays: {} },
      field: 'policy',
      value: DEFAULT_DTR_POLICY,
    },
    {
      metatype: DtrSaveTemplateDto,
      body: { branchId: 'branch', name: 'Template' },
      field: 'configuration',
      value: template,
    },
  ])(
    'validates required nested objects at the HTTP boundary',
    async ({ metatype, body, field, value }) => {
      const pipe = new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      });
      await expect(
        pipe.transform(body, { type: 'body', metatype }),
      ).rejects.toThrow();
      await expect(
        pipe.transform({ ...body, [field]: value }, { type: 'body', metatype }),
      ).resolves.toBeInstanceOf(metatype);
      await expect(
        pipe.transform({ ...body, [field]: [] }, { type: 'body', metatype }),
      ).rejects.toThrow();
    },
  );
  const row: DtrRecord = {
    id: '1',
    employeeId: 'e1',
    employeeName: '=HYPERLINK("bad")',
    branchId: 'b1',
    branchName: 'Makati',
    workDate: '2026-09-28',
    data: {
      batchId: 'batch',
      sourceKeys: [],
      source: [source()],
      override: {},
      policy,
      pairing: 'STRICT',
      approval: 'APPROVED',
      revision: 1,
      calculation: calc({
        sources: [source({ actualIn: '08:27', actualOut: '18:43' })],
      }),
    },
  };
  it('round-trips a styled XLSX with Summary, Employee DTR, Exceptions and numeric minutes', async () => {
    const bytes = await exportDtr([row], {
      branchName: 'Makati',
      from: '2026-09-28',
      to: '2026-09-28',
      actor: 'hr@example.test',
      format: 'xlsx',
    });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer);
    expect(book.worksheets.map((s) => s.name)).toEqual([
      'Summary',
      'Employee DTR',
      'Exceptions',
    ]);
    const sheet = book.getWorksheet('Employee DTR')!;
    expect(sheet.getCell('H3').value).toBe(27);
    expect(sheet.getCell('G3').value).toBe(60);
    expect(sheet.getCell('N3').value).toBe(0);
    expect(sheet.getCell('A4').value).toMatch(/^TOTAL/);
    expect(sheet.getCell('A3').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('B3').value).toBeInstanceOf(Date);
    expect(sheet.getCell('C3').numFmt).toBe('hh:mm');
  });
  it('escapes CSV injection and keeps total rows', async () => {
    const bytes = await exportDtr([row], {
      branchName: 'Makati',
      from: '2026-09-28',
      to: '2026-09-28',
      actor: 'hr',
      format: 'csv',
    });
    expect(bytes.toString()).toContain("'=HYPERLINK");
    expect(bytes.toString()).toContain('TOTAL');
    expect(safeCell(' \t@SUM(1)')).toMatch(/^'/);
  });
  it.each(['IT_ADMIN', 'EMPLOYEE', 'STAFF'] as const)(
    'denies %s import/settings without a database call',
    (role) => {
      const query = vi.fn();
      const service = new DtrService({ query } as unknown as DataSource);
      expect(() =>
        service.requireManager(
          { userId: 'u', email: 'x', role, branchId: 'b1' },
          'b1',
          'IMPORT',
        ),
      ).toThrow();
      expect(query).not.toHaveBeenCalled();
    },
  );
  it('denies cross-branch manager access but allows company HR and Super Admin', () => {
    const service = new DtrService({} as DataSource);
    const user: AuthUserContext = {
      userId: 'u',
      email: 'x',
      role: 'HR_ADMIN',
      branchId: 'b1',
    };
    expect(() => service.requireManager(user, 'b2')).toThrow();
    expect(() =>
      service.requireManager({ ...user, branchId: null }, 'b2'),
    ).not.toThrow();
    expect(() =>
      service.requireManager({ ...user, role: 'SUPER_ADMIN' }, 'b2'),
    ).not.toThrow();
  });
});

describe('DTR preview day changes', () => {
  const selection = {
    branchId: 'branch', from: '2026-09-26', to: '2026-10-10',
    mappings: [],
    dayOverrides: [{ employeeId: 'employee', workDate: '2026-09-28', arrangement: 'OB', remarks: 'Client visit', shiftStart: '09:00', shiftEnd: '18:00' }],
  };
  it('validates nested changes and rejects payroll approval or actual punch fields', async () => {
    const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
    const metadata = { type: 'body' as const, metatype: DtrImportSelectionDto };
    expect((await pipe.transform(selection, metadata)).dayOverrides[0].remarks).toBe('Client visit');
    await expect(pipe.transform({ ...selection, dayOverrides: [{ ...selection.dayOverrides[0], approvedOtMinutes: 60 }] }, metadata)).rejects.toThrow();
    await expect(pipe.transform({ ...selection, dayOverrides: [{ ...selection.dayOverrides[0], shiftStart: '25:00' }] }, metadata)).rejects.toThrow();
  });
  it('rejects unmatched and duplicate day changes and incomplete shift pairs', async () => {
    const employee = { id: 'employee', name: 'Lea', employeeNumber: '65', status: 'ACTIVE', employment: { startDate: '2020-01-01' } };
    const service = new DtrService({} as DataSource);
    const internal = service as unknown as {
      context: (...args: unknown[]) => Promise<unknown>;
      prepareImport: (manager: unknown, batch: unknown, input: unknown) => Promise<{ getOverride: (id: string, date: string) => unknown }>;
    };
    vi.spyOn(internal, 'context').mockResolvedValue({ schedule, policy });
    const manager = { query: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('attendance_source_rows')) return [{ normalized: source() }];
      if (sql.includes('FROM employees')) return [employee];
      return [];
    }) };
    const batch = { id: 'batch', template };
    const result = await internal.prepareImport(manager, batch, selection);
    expect(result.getOverride('employee', '2026-09-28')).toEqual({ arrangement: 'OB', remarks: 'Client visit', shiftStart: '09:00', shiftEnd: '18:00' });
    for (const dayOverrides of [
      [{ ...selection.dayOverrides[0], employeeId: 'outside-branch' }],
      [selection.dayOverrides[0], selection.dayOverrides[0]],
      [{ ...selection.dayOverrides[0], shiftEnd: undefined }],
    ]) await expect(internal.prepareImport(manager, batch, { ...selection, dayOverrides })).rejects.toThrow();
  });
});
