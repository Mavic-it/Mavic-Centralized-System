import { BadRequestException } from '@nestjs/common';

export const inquiryStatuses = [
  'NEW',
  'IN_PROGRESS',
  'FOLLOW_UP',
  'NO_RESPONSE',
  'OCULAR_SCHEDULED',
  'PROPOSAL_SENT',
  'PENDING_RESERVATION',
  'RESERVED',
  'CONVERTED',
  'LOST',
  'CLOSED',
  'NEEDS_REVIEW',
] as const;
export const lookupKinds = [
  'SERVICE',
  'CHANNEL',
  'SOURCE',
  'ACTION',
  'LOST_REASON',
] as const;
export const terminalStatuses = ['LOST', 'CLOSED', 'CONVERTED'];
export function validateTransition(from: string, to: string, reason?: string) {
  if (from === to) return;
  if (['PENDING_RESERVATION', 'RESERVED'].includes(from))
    throw new BadRequestException(
      'Update the linked reservation using its existing workflow.',
    );
  if (
    !inquiryStatuses.includes(to as (typeof inquiryStatuses)[number]) ||
    to === 'NEEDS_REVIEW'
  )
    throw new BadRequestException('Choose a workflow status.');
  if (['RESERVED', 'CONVERTED', 'PENDING_RESERVATION'].includes(to))
    throw new BadRequestException('Use the verified conversion workflow.');
  if ((to === 'LOST' || terminalStatuses.includes(from)) && !reason?.trim())
    throw new BadRequestException('A loss or reopening reason is required.');
  if (terminalStatuses.includes(from) && to !== 'IN_PROGRESS')
    throw new BadRequestException('Reopen this inquiry to In Progress first.');
}
export function formulaSafe(value: unknown): string {
  const text =
    value == null
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : (JSON.stringify(value) ?? '');
  let first = 0;
  while (first < text.length) {
    const code = text.charCodeAt(first);
    if (code > 32 && code !== 127 && !/\s/u.test(text[first])) break;
    first++;
  }
  const prefix = text.slice(0, first);
  return (first < text.length && '=+-@'.includes(text[first])) ||
    prefix.includes('\t') ||
    prefix.includes('\r')
    ? `'${text}`
    : text;
}
export function csvCell(value: unknown) {
  return `"${formulaSafe(value).replaceAll('"', '""')}"`;
}
