import { BadRequestException } from '@nestjs/common';
export const importFields = [
  'date',
  'reservationDate',
  'clientName',
  'location',
  'services',
  'channel',
  'source',
  'action',
  'nextAction',
  'followUpDate',
  'status',
  'reason',
  'remarks',
] as const;
export type ColumnMapping = {
  headerRow: number;
  columns: Partial<Record<(typeof importFields)[number], number>>;
};
export type RowCorrection = {
  clientName?: string;
  date?: string;
  status?: string;
  serviceIds?: string[];
  channelId?: string;
  sourceId?: string;
  reason?: string;
  skip?: boolean;
};
export type ImportOptions = {
  mapping: Record<string, ColumnMapping>;
  corrections: Record<string, RowCorrection>;
};
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
export function parseImportOptions(raw: unknown): ImportOptions {
  const result: ImportOptions = { mapping: {}, corrections: {} };
  if (raw === undefined) return result;
  if (typeof raw !== 'string' || raw.length > 65536)
    throw new BadRequestException('Import options exceed supported limits.');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new BadRequestException('Invalid import options.');
  }
  const invalid = () => {
    throw new BadRequestException('Invalid column mapping or row corrections.');
  };
  if (
    !object(value) ||
    Object.keys(value).some((k) => !['mapping', 'corrections'].includes(k))
  )
    return invalid();
  if (value.mapping !== undefined) {
    if (!object(value.mapping) || Object.keys(value.mapping).length > 30)
      return invalid();
    for (const [sheet, map] of Object.entries(value.mapping)) {
      if (
        sheet.length > 100 ||
        !object(map) ||
        !Number.isInteger(map.headerRow) ||
        Number(map.headerRow) < 1 ||
        Number(map.headerRow) > 5000 ||
        !object(map.columns) ||
        Object.keys(map).some((k) => !['headerRow', 'columns'].includes(k))
      )
        return invalid();
      const columns: ColumnMapping['columns'] = {};
      for (const [field, index] of Object.entries(map.columns)) {
        if (
          !importFields.includes(field as (typeof importFields)[number]) ||
          !Number.isInteger(index) ||
          Number(index) < -1 ||
          Number(index) > 50
        )
          return invalid();
        columns[field as (typeof importFields)[number]] = Number(index);
      }
      Object.defineProperty(result.mapping, sheet, {
        value: { headerRow: Number(map.headerRow), columns },
        enumerable: true,
      });
    }
  }
  if (value.corrections !== undefined) {
    if (
      !object(value.corrections) ||
      Object.keys(value.corrections).length > 100
    )
      return invalid();
    for (const [key, entry] of Object.entries(value.corrections)) {
      if (
        key.length > 120 ||
        !object(entry) ||
        Object.keys(entry).some(
          (k) =>
            ![
              'clientName',
              'date',
              'status',
              'serviceIds',
              'channelId',
              'sourceId',
              'reason',
              'skip',
            ].includes(k),
        )
      )
        return invalid();
      const correction: RowCorrection = {};
      for (const field of [
        'clientName',
        'date',
        'status',
        'channelId',
        'sourceId',
        'reason',
      ] as const)
        if (entry[field] !== undefined) {
          if (
            typeof entry[field] !== 'string' ||
            entry[field].length > (field === 'reason' ? 1000 : 200)
          )
            return invalid();
          correction[field] = entry[field].trim();
        }
      if (entry.serviceIds !== undefined) {
        if (
          !Array.isArray(entry.serviceIds) ||
          entry.serviceIds.length < 1 ||
          entry.serviceIds.length > 20 ||
          entry.serviceIds.some(
            (id) => typeof id !== 'string' || id.length > 100,
          )
        )
          return invalid();
        correction.serviceIds = [...new Set(entry.serviceIds as string[])];
      }
      if (entry.skip !== undefined) {
        if (typeof entry.skip !== 'boolean') return invalid();
        correction.skip = entry.skip;
      }
      Object.defineProperty(result.corrections, key, {
        value: correction,
        enumerable: true,
      });
    }
  }
  return result;
}
