import type { DtrCalculation, DtrPolicy } from '../dtr.types.js';
import type { ApprovedOb } from './ob.types.js';
type Span = [number, number];
export function unionSpans(spans: Span[]): Span[] {
  const result: Span[] = [];
  for (const [start, end] of spans
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a)
    .sort((a, b) => a[0] - b[0])) {
    const last = result.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else result.push([start, end]);
  }
  return result;
}
export function applyOfficialBusiness(
  c: DtrCalculation,
  rows: ApprovedOb[],
  workDate: string,
  policy: DtrPolicy,
  instant: (wall: string) => string,
  actualIntervals: Span[],
): DtrCalculation {
  if (!rows.length) return c;
  rows=[...rows].sort((a,b)=>Date.parse(String(a.start))-Date.parse(String(b.start)));
  const schedule = c.schedule;
  const exceptions = [...c.exceptions];
  const fail = (message: string) => ({
    ...c,
    officialBusiness: rows,
    exceptions: [...exceptions, message],
    payrollReady: false,
    approvedOtMinutes: 0,
  });
  if (!schedule || c.restDay || c.holiday || c.leaveUnits)
    return fail(
      'OB requires a scheduled workday without conflicting leave/holiday',
    );
  const signature = (s: typeof schedule) =>
    JSON.stringify([
      s.timeZone,
      s.shiftStart,
      s.shiftEnd,
      s.breakMinutes,
      s.graceMinutes,
      s.workDays,
    ]);
  if (rows.some((r) => signature(r.schedule) !== signature(schedule)))
    return fail('OB schedule changed: cancel and refile for review');
  const next = new Date(`${workDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const endDate =
    schedule.shiftEnd <= schedule.shiftStart
      ? next.toISOString().slice(0, 10)
      : workDate;
  const start = Date.parse(instant(`${workDate}T${schedule.shiftStart}`));
  const end = Date.parse(instant(`${endDate}T${schedule.shiftEnd}`));
  let breakSpan: Span | null = null;
  if (schedule.breakMinutes) {
    if (!policy.breakStart || !policy.breakEnd)
      return fail('Break placement requires HR configuration');
    const breakDate =
      endDate !== workDate && policy.breakStart < schedule.shiftStart
        ? endDate
        : workDate;
    const breakEndDate =
      policy.breakEnd <= policy.breakStart
        ? new Date(Date.parse(`${breakDate}T00:00:00Z`) + 86400000)
            .toISOString()
            .slice(0, 10)
        : breakDate;
    breakSpan = [
      Date.parse(instant(`${breakDate}T${policy.breakStart}`)),
      Date.parse(instant(`${breakEndDate}T${policy.breakEnd}`)),
    ];
    if (
      breakSpan[0] < start ||
      breakSpan[1] > end ||
      (breakSpan[1] - breakSpan[0]) / 60000 !== schedule.breakMinutes
    )
      return fail('Break window differs from assigned schedule');
  }
  const clip = (spans: Span[]) =>
    unionSpans(spans.map(([a, b]) => [Math.max(start, a), Math.min(end, b)]));
  const paid = (spans: Span[]) =>
    clip(spans).reduce(
      (sum, [a, b]) =>
        sum +
        (b - a) / 60000 -
        (breakSpan
          ? Math.max(0, Math.min(b, breakSpan[1]) - Math.max(a, breakSpan[0])) /
            60000
          : 0),
      0,
    );
  const obSpans = rows.map(
    (r) => [Date.parse(String(r.start)), Date.parse(String(r.end))] as Span,
  );
  if (obSpans.some(([a, b]) => a < start || b > end))
    return fail('OB interval is outside the scheduled shift');
  const office: Span[] = [...actualIntervals];
  let continuity = false;
  // A single IN may cover the office-to-field interval only after explicit reviewer attestation.
  if (
    c.actualIn &&
    !c.actualOut &&
    rows[0].officeContinuity &&
    Date.parse(c.actualIn) <= obSpans[0][0]
  ) {
    office.push([Date.parse(c.actualIn), obSpans[0][0]]);
    continuity = true;
  }
  const coverage = clip([...office, ...obSpans]);
  const required = (end - start) / 60000 - schedule.breakMinutes;
  const credited = Math.floor(paid(coverage));
  const first = coverage[0]?.[0] ?? end;
  const late = Math.floor(paid([[start, first]]));
  const lateMinutes =
    late > (policy.lateGraceMinutes ?? schedule.graceMinutes) ? late : 0;
  const uncovered = Math.max(0, required - credited);
  let filtered = exceptions.filter(
    (e) =>
      ![
        'Incomplete Punch',
        'Missing OUT',
        'Source status disagrees with calculated attendance',
      ].includes(e) ||
      (!continuity && !(credited >= required && !c.actualIn && !c.actualOut)),
  );
  if (
    c.sourceStatus.length &&
    c.actualIn &&
    c.actualOut &&
    actualIntervals.length === 0
  )
    filtered.push('Office attendance intervals require review');
  if (uncovered > 0)
    filtered.push(
      'OB leaves uncovered scheduled time: attendance review required',
    );
  filtered = [...new Set(filtered)];
  return {
    ...c,
    officialBusiness: rows,
    obCreditedMinutes: Math.floor(paid(obSpans)),
    actualWorkedMinutes: Math.floor(paid(actualIntervals)),
    attestedOfficeMinutes: Math.floor(paid(office) - paid(actualIntervals)),
    workedMinutes: credited,
    lateMinutes,
    undertimeMinutes: Math.max(0, uncovered - late),
    potentialOtMinutes: 0,
    approvedOtMinutes: 0,
    absent: 0,
    statuses: [
      'OB',
      ...(lateMinutes ? ['Late'] : []),
      ...(uncovered > 0 ? ['Incomplete coverage'] : []),
    ],
    exceptions: filtered,
    payrollReady: filtered.length === 0,
    remarks: [c.remarks, ...rows.map((r) => `OB ${r.id}: ${r.destination}`)]
      .filter(Boolean)
      .join(' | '),
    decisions: [
      ...c.decisions,
      'Approved OB credited separately; overlapping office/OB time counted once',
      ...(continuity
        ? ['Reviewer confirmed office attendance until OB departure']
        : []),
    ],
  };
}
