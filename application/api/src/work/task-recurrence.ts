export type TaskRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY';

function parseDate(value: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new RangeError('Expected a calendar date in YYYY-MM-DD format.');
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new RangeError('Expected a valid calendar date.');
  return { year, month, day };
}

function formatDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addCalendarDays(value: string, days: number) {
  const { year, month, day } = parseDate(value);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}

export function nextTaskOccurrence(
  current: string,
  recurrence: TaskRecurrence,
  anchorDay: number,
) {
  if (recurrence === 'DAILY') return addCalendarDays(current, 1);
  if (recurrence === 'WEEKLY') return addCalendarDays(current, 7);
  const { year, month } = parseDate(current);
  const target = new Date(Date.UTC(year, month, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  return formatDate(targetYear, targetMonth, Math.min(anchorDay, lastDay));
}

export function manilaCalendarDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
