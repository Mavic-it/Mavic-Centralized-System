import { BadRequestException } from '@nestjs/common';
import { nextDate, validDate } from './dtr.parser.js';

export type DtrCutoff = { from: string; to: string };

/** Cutoffs are calendar dates in the attendance timezone, never UTC instants. */
export function requireDtrCutoff(value?: DtrCutoff): DtrCutoff {
  if (value && validDate(value.from) && validDate(value.to)) {
    const first = value.from.slice(0, 7);
    const nextMonth = nextDate(`${first}-28`, 4).slice(0, 7);
    if (
      (value.from === `${first}-11` && value.to === `${first}-25`) ||
      (value.from === `${first}-26` && value.to === `${nextMonth}-10`)
    ) return { from: value.from, to: value.to };
  }
  throw new BadRequestException('Select a complete cutoff: 11–25, or 26–10 of the following month.');
}

type EmployeeIdentity = { id: string; name: string; employeeNumber: string };
const nameParts = (name: string) => name.normalize('NFKD')
  .replace(/\p{M}/gu, '').toLocaleLowerCase('en')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
const normalizedName = (name: string) => nameParts(name).sort().join(' ');

export function matchDtrIdentity(
  identity: { key: string; name: string; identifier: string },
  employees: EmployeeIdentity[],
  saved: Map<string, string>,
) {
  const remembered = employees.find((e) => e.id === saved.get(identity.key));
  const numbered = identity.identifier.trim()
    ? employees.filter((e) => e.employeeNumber.toUpperCase() === identity.identifier.trim().toUpperCase()) : [];
  const name = normalizedName(identity.name);
  const named = name ? employees.filter((e) => normalizedName(e.name) === name) : [];
  const conflict = numbered.length === 1 && named.some((e) => e.id !== numbered[0].id);
  const employee = remembered ?? (!conflict && numbered.length === 1 ? numbered[0]
    : numbered.length === 0 && named.length === 1 ? named[0] : null);
  const tokens = nameParts(identity.name).filter((token) => token.length > 1);
  const suggestions = [...new Set([...numbered, ...named, ...employees.filter((e) => {
    const parts = nameParts(e.name);
    return tokens.length > 0 && tokens.every((token) => parts.includes(token));
  })].map((e) => e.id))];
  return {
    employeeId: employee?.id ?? null,
    matchMethod: remembered ? 'SAVED_MAPPING' : employee && numbered.length === 1 ? 'EMPLOYEE_NUMBER'
      : employee ? 'EXACT_NAME' : 'MANUAL_REQUIRED',
    matchNote: conflict && !remembered ? 'Employee number and name identify different people. Review required.'
      : !employee && (named.length > 1 || numbered.length > 1) ? 'More than one employee matches. Review required.'
        : !employee ? 'Select the correct branch employee before saving.' : null,
    suggestions,
  };
}
