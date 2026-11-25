import * as XLSX from 'xlsx';
import { createHash } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { ColumnMapping } from './inquiry-import-options.js';

export type ImportRow = {
  sheet: string;
  row: number;
  raw: unknown[];
  clientName: string;
  date: string | null;
  reservationDate: string | null;
  services: string[];
  channel: string;
  source: string;
  status: string;
  legacyOutcome: string | null;
  action: string;
  nextAction: string;
  followUpDate: string | null;
  reason: string;
  remarks: string;
  location: string;
  warnings: string[];
  fingerprint: string;
};
export function sourceText(v: unknown) {
  const s =
    typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      ? String(v).trim().replace(/\s+/g, ' ')
      : '';
  return /^n\/?a$/i.test(s) ? '' : s;
}
export function importDate(v: unknown): string | null {
  if (typeof v === 'number' && v > 0 && v < 100000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d
      ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
      : null;
  }
  const s = sourceText(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s))
    return Number.isFinite(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s
      ? s
      : null;
  // Numeric day/month dates are intentionally ambiguous and retained for review.
  if (!/^[A-Za-z]+ \d{1,2},? \d{4}$/.test(s)) return null;
  const t = Date.parse(`${s} UTC`);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}
export function importStatus(v: unknown) {
  const s = sourceText(v)
    .toLowerCase()
    .replace(/[\s_-]/g, '');
  return (
    (
      {
        new: 'NEW',
        inprogress: 'IN_PROGRESS',
        followup: 'FOLLOW_UP',
        noresponse: 'NO_RESPONSE',
        reserved: 'RESERVED',
        reserve: 'RESERVED',
        cancelled: 'LOST',
        canceled: 'LOST',
        lost: 'LOST',
        closed: 'CLOSED',
        ocular: 'OCULAR_SCHEDULED',
        proposalsent: 'PROPOSAL_SENT',
      } as Record<string, string>
    )[s] ?? 'NEEDS_REVIEW'
  );
}
export function serviceName(s: string) {
  const v = sourceText(s).toLowerCase();
  return (
    (
      {
        'meeting rooms': 'Meeting Room',
        'meeting room': 'Meeting Room',
        cowoking: 'Coworking',
        coworking: 'Coworking',
        'private office': 'Private Office',
        'virtual office': 'Virtual Office',
        location: 'Location Inquiry',
        availability: 'Availability Inquiry',
        amenities: 'Amenities Inquiry',
        'business registration services': 'Business Registration Services',
      } as Record<string, string>
    )[v] ?? sourceText(s)
  );
}
/** Check ZIP metadata before SheetJS inflates OOXML entries. Reject ZIP64/encrypted archives. */
export function boundWorkbookArchive(buffer: Buffer) {
  if (buffer.readUInt16LE(0) !== 0x4b50) return;
  let end = -1;
  for (let p = buffer.length - 22; p >= Math.max(0, buffer.length - 65557); p--)
    if (buffer.readUInt32LE(p) === 0x06054b50) {
      end = p;
      break;
    }
  if (end < 0) throw new BadRequestException('Invalid workbook archive.');
  const count = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (count > 1000 || offset === 0xffffffff)
    throw new BadRequestException('Workbook archive exceeds supported limits.');
  let cursor = offset,
    total = 0;
  for (let n = 0; n < count; n++) {
    if (
      cursor + 46 > buffer.length ||
      buffer.readUInt32LE(cursor) !== 0x02014b50
    )
      throw new BadRequestException('Invalid workbook archive directory.');
    if (buffer.readUInt16LE(cursor + 8) & 1)
      throw new BadRequestException('Encrypted workbooks are not supported.');
    const size = buffer.readUInt32LE(cursor + 24);
    total += size;
    if (total > 30 * 1024 * 1024)
      throw new BadRequestException(
        'Expanded workbook must be smaller than 30 MB.',
      );
    cursor +=
      46 +
      buffer.readUInt16LE(cursor + 28) +
      buffer.readUInt16LE(cursor + 30) +
      buffer.readUInt16LE(cursor + 32);
  }
}
export function parseInquiryWorkbook(
  buffer: Buffer,
  mapping: Record<string, ColumnMapping> = {},
): {
  checksum: string;
  rows: ImportRow[];
  skipped: number;
  sheets: {
    name: string;
    headerRow: number;
    headers: string[];
    columns: Record<string, number>;
  }[];
} {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024)
    throw new BadRequestException('Upload a workbook or CSV up to 5 MB.');
  if (buffer.length >= 2) boundWorkbookArchive(buffer);
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      sheetRows: 5002,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      bookVBA: false,
    });
  } catch {
    throw new BadRequestException(
      'The file could not be read as Excel or CSV.',
    );
  }
  if (workbook.SheetNames.length > 30)
    throw new BadRequestException('At most 30 worksheets are supported.');
  const rows: ImportRow[] = [];
  const sheets: {
    name: string;
    headerRow: number;
    headers: string[];
    columns: Record<string, number>;
  }[] = [];
  let skipped = 0;
  for (const sheet of workbook.SheetNames) {
    if (/pivot/i.test(sheet)) {
      skipped++;
      continue;
    }
    const ws = workbook.Sheets[sheet];
    if (ws['!ref']) {
      const range = XLSX.utils.decode_range(ws['!fullref'] ?? ws['!ref']);
      if (range.e.r > 5000 || range.e.c > 50)
        throw new BadRequestException(
          'Limit each worksheet to 5,000 rows and 51 columns.',
        );
    }
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
      blankrows: true,
      range: 0,
    });
    const detected = data.findIndex((row) =>
      row.some((v) => /client.?s? name/i.test(sourceText(v))),
    );
    const custom = Object.hasOwn(mapping, sheet) ? mapping[sheet] : undefined;
    const headerIndex = custom ? custom.headerRow - 1 : Math.max(0, detected);
    if (!data[headerIndex]) continue;
    const headers = data[headerIndex].map((v) => sourceText(v).toLowerCase());
    const index = (pattern: RegExp) =>
      headers.findIndex((h) => pattern.test(h));
    const patterns: Record<string, RegExp> = {
      date: /^date$/,
      reservationDate: /reservation dates/,
      clientName: /client.?s? name/,
      location: /location/,
      services: /details inquiry/,
      channel: /inquiry channel/,
      source: /source of inquiry/,
      action: /action taken/,
      nextAction: /next step/,
      followUpDate: /date of follow/,
      status: /inquiry status/,
      reason: /^reason$/,
      remarks: /other remarks/,
    };
    const columns = Object.fromEntries(
      Object.entries(patterns).map(([field, pattern]) => [
        field,
        custom?.columns[field as keyof ColumnMapping['columns']] ??
          (field === 'date' && index(pattern) < 0 ? 0 : index(pattern)),
      ]),
    );
    sheets.push({
      name: sheet,
      headerRow: headerIndex + 1,
      headers: data[headerIndex].map(sourceText),
      columns,
    });
    if (!custom && detected < 0) {
      skipped += data.length;
      continue;
    }
    const get = (row: unknown[], pattern: RegExp) =>
      row[
        columns[
          Object.keys(patterns).find(
            (key) => patterns[key].source === pattern.source,
          ) ?? ''
        ] ?? -1
      ];
    for (let n = headerIndex + 1; n < data.length; n++) {
      const raw = data[n];
      if (
        raw.every((v) => !sourceText(v)) ||
        raw.some((v) => /^client.?s? name$/i.test(sourceText(v)))
      ) {
        skipped++;
        continue;
      }
      const clientName = sourceText(get(raw, /client.?s? name/));
      const date = importDate(raw[columns.date]);
      const status = importStatus(get(raw, /inquiry status/));
      const followUpValue = get(raw, /date of follow/),
        followUpDate = importDate(followUpValue);
      const warnings: string[] = [];
      if (!date) warnings.push('Inquiry date needs review');
      if (!clientName) warnings.push('Client name is missing');
      if (status === 'NEEDS_REVIEW') warnings.push('Unknown historical status');
      if (sourceText(followUpValue) && !followUpDate)
        warnings.push('Follow-up value is not an unambiguous date');
      const services = sourceText(get(raw, /details inquiry/))
        .split(/[,;\n]+/)
        .map(serviceName)
        .filter(Boolean);
      const row: ImportRow = {
        sheet,
        row: n + 1,
        raw,
        clientName,
        date,
        reservationDate: importDate(get(raw, /reservation dates/)),
        services,
        channel: sourceText(get(raw, /inquiry channel/)),
        source: sourceText(get(raw, /source of inquiry/)),
        status: status === 'RESERVED' ? 'CLOSED' : status,
        legacyOutcome: status === 'RESERVED' ? 'RESERVED' : null,
        action: sourceText(get(raw, /action taken/)),
        nextAction: sourceText(get(raw, /next step/)),
        followUpDate,
        reason: sourceText(get(raw, /^reason$/)),
        remarks: sourceText(get(raw, /other remarks/)),
        location: sourceText(get(raw, /location/)),
        warnings,
        fingerprint: createHash('sha256')
          .update(JSON.stringify([sheet, n + 1, raw]))
          .digest('hex'),
      };
      rows.push(row);
      if (rows.length > 5000)
        throw new BadRequestException(
          'Import at most 5,000 records per workbook.',
        );
    }
  }
  return {
    checksum: createHash('sha256').update(buffer).digest('hex'),
    rows,
    skipped,
    sheets,
  };
}
