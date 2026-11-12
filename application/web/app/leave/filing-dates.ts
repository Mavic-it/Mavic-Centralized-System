export function addCalendarDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function noticeLabel(days: number): string {
  return days === 0
    ? "Same-day filing allowed. Past dates are not allowed."
    : `File at least ${days} calendar day${days === 1 ? "" : "s"} in advance. Past dates are not allowed.`;
}

export function effectiveNoticeDays(code: string, configured: number): number {
  return Math.max(configured, code === "VL" || code === "LWOP" ? 3 : 0);
}
