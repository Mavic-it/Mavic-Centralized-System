import * as XLSX from 'xlsx';
import { BadRequestException } from '@nestjs/common';
import type { DtrSource, DtrTemplate } from './dtr.types.js';

export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export function nextDate(value: string, days = 1): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000)
    .toISOString()
    .slice(0, 10);
}
export function timeText(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value >= 1)
      throw new Error('Invalid Excel time');
    const minutes = Math.round(value * 1440);
    if (minutes >= 1440) throw new Error('Invalid Excel time');
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }
  if (typeof value !== 'string') throw new Error('Invalid time');
  const match = value
    .trim()
    .match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!match) throw new Error('Invalid time');
  let hour = Number(match[1]);
  if (
    Number(match[2]) > 59 ||
    Number(match[3] ?? 0) > 59 ||
    hour > (match[4] ? 12 : 23) ||
    (match[4] && hour === 0)
  )
    throw new Error('Invalid time');
  if (match[4]) hour = (hour % 12) + (match[4].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
export function dateTimeText(
  value: unknown,
  order: DtrTemplate['dateOrder'],
  date1904 = false,
): string {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value, { date1904 });
    if (!parsed) throw new Error('Invalid Excel date');
    const date = `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    if (!validDate(date)) throw new Error('Invalid Excel date');
    return `${date}T${String(parsed.H).padStart(2, '0')}:${String(parsed.M).padStart(2, '0')}`;
  }
  if (typeof value !== 'string') throw new Error('Invalid date');
  const valueText = value.trim();
  const match = valueText.match(
    /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})(?:[ T](.+))?$/,
  );
  if (!match) throw new Error('Use ISO date or the configured date order');
  let date = match[1];
  if (date.includes('/')) {
    if (order === 'ISO')
      throw new Error('Ambiguous date: configure MDY or DMY');
    const [a, b, y] = date.split('/');
    date = `${y}-${(order === 'MDY' ? a : b).padStart(2, '0')}-${(order === 'MDY' ? b : a).padStart(2, '0')}`;
  }
  if (!validDate(date)) throw new Error('Invalid date');
  return `${date}T${match[2] ? timeText(match[2]) : '00:00'}`;
}
const cellText = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
const normalize = (value: unknown) =>
  cellText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
const aliases: Record<string, string[]> = {
  timestamp: ['dateandtime', 'datetime', 'timestamp'],
  identifier: [
    'personnelid',
    'employeeid',
    'employeenumber',
    'personnelnumber',
  ],
  name: ['name', 'firstname', 'employeename'],
  lastName: ['lastname'],
  device: ['devicename', 'device'],
  in: ['in', 'timein', 'actualin'],
  out: ['out', 'timeout', 'actualout'],
  date: ['date', 'workdate'],
  direction: ['inoutstatus', 'eventtype'],
  status: ['status'],
  shiftStart: ['shiftstart'],
  shiftEnd: ['shiftend'],
};

// Check central-directory expansion before passing compressed content to the parser.
export function validateFile(bytes: Buffer, fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (
    !['xls', 'xlsx', 'csv'].includes(ext ?? '') ||
    bytes.length === 0 ||
    bytes.length > 8 * 1024 * 1024
  )
    throw new BadRequestException(
      'Choose a nonempty XLS, XLSX or CSV file up to 8 MB.',
    );
  if (
    ext === 'xls' &&
    bytes.subarray(0, 8).toString('hex') !== 'd0cf11e0a1b11ae1'
  )
    throw new BadRequestException('The XLS file signature is invalid.');
  if (ext === 'xlsx') {
    if (bytes.subarray(0, 4).toString('hex') !== '504b0304')
      throw new BadRequestException('The XLSX file signature is invalid.');
    let total = 0,
      count = 0;
    for (let i = 0; i + 46 < bytes.length; i++) {
      if (bytes.readUInt32LE(i) !== 0x02014b50) continue;
      total += bytes.readUInt32LE(i + 24);
      count++;
      if (total > 40 * 1024 * 1024 || count > 2000)
        throw new BadRequestException(
          'Workbook expands beyond the supported limit.',
        );
    }
    if (count === 0)
      throw new BadRequestException('Invalid workbook directory.');
  }
  if (ext === 'csv' && bytes.includes(0))
    throw new BadRequestException('CSV must contain UTF-8 text.');
}

export function parseDtr(
  bytes: Buffer,
  fileName: string,
  template: DtrTemplate,
): DtrSource[] {
  validateFile(bytes, fileName);
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, {
      type: 'buffer',
      cellFormula: true,
      cellDates: false,
      bookVBA: false,
      sheetRows: 10002,
    });
  } catch {
    throw new BadRequestException(
      'Unable to read workbook. Remove encryption and save as XLS, XLSX or CSV.',
    );
  }
  if (book.SheetNames.length > 100)
    throw new BadRequestException('Maximum 100 worksheets.');
  const result: DtrSource[] = [];
  for (const sheetName of book.SheetNames) {
    if (template.sheets?.length && !template.sheets.includes(sheetName))
      continue;
    const sheet = book.Sheets[sheetName];
    if (!sheet['!ref']) continue;
    const range = XLSX.utils.decode_range(sheet['!fullref'] ?? sheet['!ref']);
    if (range.e.r >= 10001 || range.e.c > 100)
      throw new BadRequestException(
        'Maximum 10,000 rows and 101 columns per sheet.',
      );
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: null,
      raw: true,
      blankrows: true,
    });
    const headerIndex = template.headerRow
      ? template.headerRow - 1
      : rows
          .slice(0, 20)
          .findIndex(
            (row) =>
              row.some((cell) =>
                [...aliases.name, ...aliases.identifier].includes(
                  normalize(cell),
                ),
              ) &&
              row.some((cell) =>
                [...aliases.timestamp, ...aliases.in, ...aliases.out].includes(
                  normalize(cell),
                ),
              ),
          );
    if (headerIndex < 0 || !rows[headerIndex])
      throw new BadRequestException(
        `No recognizable header in ${sheetName}. Choose a template header row.`,
      );
    const headers = rows[headerIndex].map(cellText);
    const indices = new Map<string, number>();
    const index = (field: keyof NonNullable<DtrTemplate['fields']>) => {
      if (indices.has(field)) return indices.get(field)!;
      const matches = headers.flatMap((h, i) =>
        (
          template.fields?.[field]
            ? normalize(h) === normalize(template.fields[field])
            : aliases[field].includes(normalize(h))
        )
          ? [i]
          : [],
      );
      if (matches.length > 1)
        throw new BadRequestException(
          `Ambiguous ${field} columns in ${sheetName}. Map a unique source header.`,
        );
      const result = matches[0] ?? -1;
      indices.set(field, result);
      return result;
    };
    const kind =
      template.kind === 'AUTO'
        ? index('timestamp') >= 0
          ? 'PUNCH'
          : 'DAILY'
        : template.kind;
    if (
      (kind === 'PUNCH' && index('timestamp') < 0) ||
      (kind === 'DAILY' && (index('in') < 0 || index('out') < 0)) ||
      (index('name') < 0 && index('identifier') < 0)
    )
      throw new BadRequestException(
        `Required mapped fields are missing in ${sheetName}.`,
      );
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row?.some((v) => v !== null && v !== '')) continue;
      const get = (field: keyof NonNullable<DtrTemplate['fields']>) =>
        row[index(field)] ?? null;
      const str = (field: keyof NonNullable<DtrTemplate['fields']>) =>
        cellText(get(field)).trim();
      const errors: string[] = [];
      const safe = <T>(label: string, fn: () => T): T | null => {
        try {
          return fn();
        } catch {
          errors.push(`Invalid ${label}`);
          return null;
        }
      };
      const raw: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      headers.forEach((h, c) => {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })];
        raw[`${c + 1}:${h}`] = cell?.f
          ? { formula: cell.f, cached: cell.v }
          : (row[c] ?? null);
        if (cell?.f) errors.push('Formula cell requires values-only source');
      });
      const identifier = str('identifier'),
        name = [str('name'), str('lastName')].filter(Boolean).join(' '),
        device = str('device');
      const key = JSON.stringify([
        device,
        identifier ? `ID:${identifier}` : `NAME:${name}`,
      ]);
      if (!identifier && !name) errors.push('Missing employee identity');
      const punch =
        kind === 'PUNCH'
          ? safe('timestamp', () =>
              dateTimeText(
                get('timestamp'),
                template.dateOrder,
                book.Workbook?.WBProps?.date1904 === true,
              ),
            )
          : null;
      const date =
        kind === 'PUNCH'
          ? (punch?.slice(0, 10) ?? null)
          : validDate(sheetName)
            ? sheetName
            : (template.date ??
              safe('date', () =>
                dateTimeText(get('date'), template.dateOrder).slice(0, 10),
              ));
      if (!date || !validDate(date))
        errors.push('Missing valid attendance date');
      const direction = normalize(get('direction'));
      result.push({
        sheet: sheetName,
        row: r + 1,
        kind,
        key,
        identifier,
        name,
        device,
        date,
        punch,
        direction: ['checkin', 'in'].includes(direction)
          ? 'IN'
          : ['checkout', 'out'].includes(direction)
            ? 'OUT'
            : 'UNKNOWN',
        actualIn:
          kind === 'DAILY' ? safe('IN', () => timeText(get('in'))) : null,
        actualOut:
          kind === 'DAILY' ? safe('OUT', () => timeText(get('out'))) : null,
        shiftStart: safe('shift start', () => timeText(get('shiftStart'))),
        shiftEnd: safe('shift end', () => timeText(get('shiftEnd'))),
        status: str('status'),
        raw,
        errors,
      });
      if (result.length > 10000)
        throw new BadRequestException('Maximum 10,000 source rows per import.');
    }
  }
  if (!result.length)
    throw new BadRequestException(
      'No attendance rows found in the selected sheets.',
    );
  return result;
}
