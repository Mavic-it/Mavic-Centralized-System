import { BadRequestException } from '@nestjs/common';
import type { Employee, Policy, Document } from './leave.types.js';
export const today = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export function earliestFilingDate(
  minimumNoticeDays: number,
  now = new Date(),
) {
  if (
    !Number.isInteger(minimumNoticeDays) ||
    minimumNoticeDays < 0 ||
    minimumNoticeDays > 365
  )
    throw new BadRequestException(
      'Minimum notice must be 0 to 365 calendar days.',
    );
  const start = new Date(`${today(now)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + minimumNoticeDays);
  return start.toISOString().slice(0, 10);
}
export function validateFilingDate(
  startDate: string,
  minimumNoticeDays: number,
  now = new Date(),
) {
  const earliest = earliestFilingDate(minimumNoticeDays, now);
  if (startDate < earliest)
    throw new BadRequestException(
      minimumNoticeDays === 0
        ? 'Past dates are not allowed. This leave type can be filed for today or a future date (Philippine Time).'
        : `This leave type requires at least ${minimumNoticeDays} calendar day${minimumNoticeDays === 1 ? '' : 's'} advance notice. Earliest start date: ${earliest} (Philippine Time).`,
    );
  return earliest;
}
export function date(value: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new BadRequestException('Choose a valid calendar date.');
  return value;
}
export function year(value: number) {
  if (
    !Number.isInteger(value) ||
    value < 2000 ||
    value > Number(today().slice(0, 4)) + 1
  )
    throw new BadRequestException('Choose a supported credit year.');
  return value;
}
export function range(from: string, to: string) {
  date(from);
  date(to);
  if (from > to || from.slice(0, 4) !== to.slice(0, 4))
    throw new BadRequestException(
      'Choose an ordered range within one credit year; split cross-year requests.',
    );
  year(Number(from.slice(0, 4)));
}
export function halfUnits(value: number, zero = false) {
  if (
    !Number.isFinite(value) ||
    value * 2 !== Math.trunc(value * 2) ||
    (!zero && value === 0)
  )
    throw new BadRequestException('Use non-zero whole or half days.');
}
export function employmentEligible(employee: Employee, p: Policy, on: string) {
  const start = employee.employment.startDate,
    end = employee.employment.endDate;
  const employmentType =
    employee.employment.employmentType ?? employee.employment.employeeType;
  if (
    employee.status !== 'ACTIVE' ||
    typeof start !== 'string' ||
    !start ||
    start > on
  )
    return false;
  if (end && (typeof end !== 'string' || end < on)) return false;
  if (p.branchId && p.branchId !== employee.branchId) return false;
  if (
    p.employmentTypes.length &&
    (typeof employmentType !== 'string' ||
      !p.employmentTypes.includes(employmentType))
  )
    return false;
  if (
    p.eligibility === 'REGULAR' &&
    !(
      employmentType === 'REGULAR' ||
      (!['PROBATIONARY', 'PROJECT_BASED', 'CONTRACTUAL'].includes(
        String(employmentType),
      ) &&
        (employee.probationary === false ||
          (employee.regularizationDate && employee.regularizationDate <= on)))
    )
  )
    return false;
  const hired = new Date(start);
  const due = new Date(
    Date.UTC(
      hired.getUTCFullYear(),
      hired.getUTCMonth() + p.minimumServiceMonths,
      hired.getUTCDate(),
    ),
  );
  return Number.isFinite(due.getTime()) && due.toISOString().slice(0, 10) <= on;
}
export function document(file?: {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}): Document | undefined {
  if (!file) return undefined;
  const b = file.buffer;
  const mime =
    b.subarray(0, 5).toString() === '%PDF-'
      ? 'application/pdf'
      : b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff
        ? 'image/jpeg'
        : b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : null;
  if (!mime || mime !== file.mimetype || !b.length || b.length > 5242880)
    throw new BadRequestException(
      'Choose a valid PDF, PNG or JPEG no larger than 5 MB.',
    );
  return {
    name:
      Array.from(file.originalname)
        .map((c) => (c === '/' || c === '\\' || c.charCodeAt(0) < 32 ? '_' : c))
        .slice(0, 180)
        .join('') || 'document',
    mime,
    data: b,
  };
}
