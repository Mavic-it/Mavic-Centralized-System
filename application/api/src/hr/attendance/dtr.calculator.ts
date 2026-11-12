import type { WorkScheduleDefinition } from './attendance.types.js';
import type {
  DtrCalculation,
  DtrOverride,
  DtrPolicy,
  DtrSource,
  DtrTemplate,
} from './dtr.types.js';
import { nextDate } from './dtr.parser.js';
import { applyOfficialBusiness } from './official-business/ob.calculator.js';

export function localWallTime(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const p = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`;
}
export function wallToInstant(wall: string, timeZone: string): string {
  const target = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Invalid local timestamp');
  const candidates = new Set<number>();
  for (const day of [-1, 0, 1]) {
    const sample = target + day * 86400000;
    const offset =
      Date.parse(`${localWallTime(new Date(sample), timeZone)}:00Z`) - sample;
    const candidate = target - offset;
    if (localWallTime(new Date(candidate), timeZone) === wall)
      candidates.add(candidate);
  }
  if (candidates.size !== 1)
    throw new Error('Ambiguous or nonexistent local timestamp');
  return new Date([...candidates][0]).toISOString();
}
const minutes = (start: number, end: number) =>
  Math.max(0, Math.floor((end - start) / 60000));
const overlap = (a: number, b: number, c: number, d: number) =>
  minutes(Math.max(a, c), Math.min(b, d));

export function calculateDtr(input: {
  officialBusiness?: import('./official-business/ob.types.js').ApprovedOb[];
  workDate: string;
  sources: DtrSource[];
  schedule: WorkScheduleDefinition | null;
  scheduleSource?: string;
  scheduledArrangement?: 'WFH' | 'OB';
  assignmentLabel?: string;
  policy: DtrPolicy;
  pairing: DtrTemplate['pairing'];
  override: DtrOverride;
  active: boolean;
  leaveUnits: number;
  leaveTypes?: string[];
  paidLeaveUnits?: number;
  holiday: string | null;
  now?: Date;
}): DtrCalculation {
  const { workDate, sources, policy, pairing } = input;
  const override = { arrangement: input.scheduledArrangement, ...input.override };
  let schedule = input.schedule ? { ...input.schedule } : null;
  if (schedule && override.shiftStart && override.shiftEnd)
    schedule = {
      ...schedule,
      shiftStart: override.shiftStart,
      shiftEnd: override.shiftEnd,
      workDays: [new Date(workDate).getUTCDay()],
    };
  const timeZone = schedule?.timeZone ?? 'Asia/Manila';
  const exceptions = [...new Set(sources.flatMap((source) => source.errors))];
  const decisions: string[] = [
    override.shiftStart && override.shiftEnd
      ? 'Schedule: authorized employee/date override'
      : `Schedule: ${input.scheduleSource ?? (schedule ? 'assigned schedule' : 'missing')}`,
  ];
  if (sources.some((s) => s.kind === 'PUNCH' && s.date !== workDate))
    decisions.push(
      'Cross-midnight punch assigned to the preceding scheduled work date',
    );
  const toInstant = (wall: string): string | null => {
    try {
      return wallToInstant(wall, timeZone);
    } catch {
      exceptions.push('Ambiguous or invalid local timestamp');
      return null;
    }
  };
  const restDay =
    override.arrangement === 'RD' ||
    Boolean(
      schedule &&
      !schedule.workDays.includes(
        new Date(`${workDate}T00:00:00Z`).getUTCDay(),
      ),
    );
  const scheduled = Boolean(schedule && !restDay);
  const future =
    workDate > localWallTime(input.now ?? new Date(), timeZone).slice(0, 10);
  if (future) exceptions.push('Future attendance date');
  if (!input.active)
    exceptions.push('Employee inactive or employment dates unverified');
  if (!schedule) exceptions.push('Missing Schedule');
  let actualIn: string | null = null,
    actualOut: string | null = null;
  let intervals: [number, number][] = [];
  const daily = sources.filter((source) => source.kind === 'DAILY');
  if (daily.length) {
    if (daily.length > 1 || sources.some((s) => s.kind === 'PUNCH'))
      exceptions.push('Conflicting daily source rows');
    const row = daily[0];
    actualIn = row.actualIn ? toInstant(`${workDate}T${row.actualIn}`) : null;
    let outDate = workDate;
    if (row.actualOut && row.actualIn && row.actualOut < row.actualIn) {
      if (schedule && schedule.shiftEnd < schedule.shiftStart)
        outDate = nextDate(workDate);
      else exceptions.push('OUT precedes IN');
    }
    actualOut = row.actualOut ? toInstant(`${outDate}T${row.actualOut}`) : null;
    if (row.actualIn && row.actualOut && row.actualIn === row.actualOut) {
      exceptions.push('Repeated IN/OUT: incomplete punch');
      actualOut = null;
    }
  } else {
    const punches = sources
      .filter((s) => s.punch)
      .map((s) => ({ ...s, instant: toInstant(s.punch!) }))
      .filter((s) => s.instant)
      .sort((a, b) => a.instant!.localeCompare(b.instant!));
    const seen = new Set<string>();
    const unique = punches.filter((p) => {
      const key = `${p.instant}:${p.direction}:${p.device}`;
      if (seen.has(key)) {
        decisions.push(`Duplicate retained but excluded: ${p.sheet}:${p.row}`);
        return false;
      }
      seen.add(key);
      return true;
    });
    actualIn = unique[0]?.instant ?? null;
    if (pairing === 'FIRST_LAST') {
      actualOut = unique.length > 1 ? unique.at(-1)!.instant : null;
      decisions.push(
        'Authorized FIRST_LAST pairing; intermediate punches retained',
      );
    } else {
      let pending: string | null = null;
      for (const punch of unique) {
        if (punch.direction === 'IN' && !pending) pending = punch.instant;
        else if (
          punch.direction === 'OUT' &&
          pending &&
          punch.instant! > pending
        ) {
          intervals.push([Date.parse(pending), Date.parse(punch.instant!)]);
          pending = null;
        } else exceptions.push('Suspicious punch sequence');
      }
      if (pending) exceptions.push('Missing OUT');
      if (intervals.length) {
        actualIn = new Date(intervals[0][0]).toISOString();
        actualOut = new Date(intervals.at(-1)![1]).toISOString();
      }
      if (unique.length && !intervals.length) {
        actualIn = unique.find((p) => p.direction === 'IN')?.instant ?? null;
        actualOut = unique.find((p) => p.direction === 'OUT')?.instant ?? null;
      }
    }
  }
  if (Object.hasOwn(override, 'actualIn')) actualIn = override.actualIn ?? null;
  if (Object.hasOwn(override, 'actualOut'))
    actualOut = override.actualOut ?? null;
  if (
    Object.hasOwn(override, 'actualIn') ||
    Object.hasOwn(override, 'actualOut')
  )
    intervals = [];
  if (actualIn && actualOut) {
    if (actualOut <= actualIn) {
      exceptions.push('OUT must be later than IN');
      actualOut = null;
    } else if (!intervals.length)
      intervals = [[Date.parse(actualIn), Date.parse(actualOut)]];
  }
  if (
    actualIn &&
    localWallTime(new Date(actualIn), timeZone).slice(0, 10) !== workDate
  )
    exceptions.push('IN outside attendance date');
  if (
    actualIn &&
    actualOut &&
    minutes(Date.parse(actualIn), Date.parse(actualOut)) > 2160
  )
    exceptions.push('Punch span exceeds 36 hours');
  const incomplete =
    Boolean(actualIn) !== Boolean(actualOut) ||
    (!actualOut && exceptions.includes('Repeated IN/OUT: incomplete punch'));
  if (incomplete) exceptions.push('Incomplete Punch');
  const exempt =
    restDay ||
    Boolean(input.holiday) ||
    input.leaveUnits >= 1 ||
    ['WFH', 'OB'].includes(override.arrangement ?? '');
  if(!sources.length&&scheduled&&!future&&input.active&&!exempt&&!input.officialBusiness?.length)exceptions.push('Missing attendance evidence');
  if(input.officialBusiness?.length&&override.arrangement)exceptions.push('Manual attendance arrangement conflicts with approved OB');
  if (input.leaveUnits > 0 && input.leaveUnits < 1 && !actualIn && !actualOut)
    exceptions.push('Partial leave attendance requires review');
  const absent = Number(
    scheduled &&
      input.active &&
      !future &&
      !actualIn &&
      !actualOut &&
      !exempt &&
      sources.length > 0 &&
      !exceptions.length,
  );
  let lateMinutes = 0,
    undertimeMinutes = 0,
    potentialOtMinutes = 0,
    workedMinutes = 0;
  if (schedule && scheduled && !exempt) {
    const startText = toInstant(`${workDate}T${schedule.shiftStart}`);
    const endText = toInstant(
      `${schedule.shiftEnd <= schedule.shiftStart ? nextDate(workDate) : workDate}T${schedule.shiftEnd}`,
    );
    if (startText && endText) {
      const start = Date.parse(startText),
        end = Date.parse(endText);
      let breakStart = 0,
        breakEnd = 0;
      if (schedule.breakMinutes > 0) {
        if (!policy.breakStart || !policy.breakEnd)
          exceptions.push('Break placement requires HR configuration');
        else {
          const breakDate =
            policy.breakStart < schedule.shiftStart &&
            schedule.shiftEnd <= schedule.shiftStart
              ? nextDate(workDate)
              : workDate;
          const bs = toInstant(`${breakDate}T${policy.breakStart}`),
            be = toInstant(
              `${policy.breakEnd <= policy.breakStart ? nextDate(breakDate) : breakDate}T${policy.breakEnd}`,
            );
          breakStart = bs ? Date.parse(bs) : 0;
          breakEnd = be ? Date.parse(be) : 0;
          if (
            breakStart < start ||
            breakEnd > end ||
            minutes(breakStart, breakEnd) !== schedule.breakMinutes
          )
            exceptions.push('Break window differs from assigned schedule');
        }
      }
      if (actualIn) {
        const minutesAfterStart = minutes(start, Date.parse(actualIn));
        const graceMinutes = policy.lateGraceMinutes ?? schedule.graceMinutes;
        lateMinutes = minutesAfterStart > graceMinutes ? minutesAfterStart : 0;
      }
      if (actualIn && actualOut) {
        const workedWithin = intervals.reduce(
          (sum, [a, b]) =>
            sum +
            overlap(a, b, start, end) -
            (breakStart
              ? overlap(
                  Math.max(a, start),
                  Math.min(b, end),
                  breakStart,
                  breakEnd,
                )
              : 0),
          0,
        );
        if (intervals.length && workedWithin === 0)
          exceptions.push('Attendance does not overlap the assigned shift');
        workedMinutes = intervals.reduce(
          (sum, [a, b]) =>
            sum +
            minutes(a, b) -
            (breakStart ? overlap(a, b, breakStart, breakEnd) : 0),
          0,
        );
        // Lateness is a separate deduction; undertime covers the remaining paid-work deficit.
        const missedBefore = Math.max(
          0,
          overlap(start, Math.min(Date.parse(actualIn), end), start, end) -
            (breakStart
              ? overlap(
                  start,
                  Math.min(Date.parse(actualIn), end),
                  breakStart,
                  breakEnd,
                )
              : 0),
        );
        undertimeMinutes = Math.max(
          0,
          minutes(start, end) -
            schedule.breakMinutes -
            workedWithin -
            missedBefore -
            Math.floor(
              input.leaveUnits * (minutes(start, end) - schedule.breakMinutes),
            ),
        );
        const after = intervals.reduce(
          (sum, [a, b]) => sum + overlap(a, b, end, end + 2160 * 60000),
          0,
        );
        const otIncrement = policy.otIncrementMinutes;
        const otRoundingOffset = policy.minimumOtMinutes > 0
          ? Math.max(0, otIncrement - policy.minimumOtMinutes)
          : 0;
        potentialOtMinutes =
          override.noOt || after < policy.minimumOtMinutes
            ? 0
            : Math.floor((after + otRoundingOffset) / otIncrement) * otIncrement;
      }
    }
  } else if (actualIn && actualOut)
    workedMinutes = intervals.reduce((sum, [a, b]) => sum + minutes(a, b), 0);
  for (const source of sources) {
    if (
      source.shiftStart &&
      schedule &&
      (source.shiftStart !== schedule.shiftStart ||
        (source.shiftEnd && source.shiftEnd !== schedule.shiftEnd))
    )
      exceptions.push('Imported shift differs from approved schedule');
    const status = source.status.toLowerCase();
    // Device lateness labels are advisory; the assigned shift and branch grace
    // policy determine lateness. Preserve the original label for audit/review.
    if (status.includes('late') && lateMinutes === 0)
      decisions.push('Imported Late label is advisory; system schedule and grace policy determine lateness');
    if (
      (status.includes('absent') && (actualIn || actualOut)) ||
      (status.includes('present') && (!actualIn || !actualOut))
    )
      exceptions.push('Source status disagrees with calculated attendance');
  }
  const resolvable = [
    'Suspicious punch sequence',
    'Missing OUT',
    'Repeated IN/OUT: incomplete punch',
    'Imported shift differs from approved schedule',
    'Source status disagrees with calculated attendance',
  ];
  const filtered = [...new Set(exceptions)].filter(
    (e) =>
      !(
        override.resolvedExceptions?.includes(e) &&
        resolvable.includes(e) &&
        actualIn &&
        actualOut
      ),
  );
  if ((override.approvedOtMinutes ?? 0) > potentialOtMinutes)
    filtered.push('Approved OT exceeds current potential OT');
  const payrollReady = filtered.length === 0;
  const statuses = [
    restDay
      ? 'RD'
      : (input.holiday ??
        (input.leaveUnits >= 1
          ? 'Approved Leave'
          : override.arrangement === 'WFH'
            ? 'WFH'
            : override.arrangement === 'OB'
              ? 'OB'
              : absent
                ? 'Absent'
                : actualIn && actualOut
                  ? 'Present'
                  : incomplete
                    ? 'Incomplete Punch'
                    : 'Unresolved')),
  ];
  if (lateMinutes) statuses.push('Late');
  if (undertimeMinutes) statuses.push('Undertime');
  if (!schedule) statuses.push('Missing Schedule');
  const result: DtrCalculation = {
    version: 'DTR-1',
    timeZone,
    actualIn,
    actualOut,
    schedule,
    lateMinutes,
    undertimeMinutes,
    potentialOtMinutes,
    approvedOtMinutes: payrollReady ? (override.approvedOtMinutes ?? 0) : 0,
    workedMinutes,
    absent,
    scheduled,
    statuses,
    exceptions: filtered,
    payrollReady,
    restDay,
    holiday: input.holiday,
    leaveUnits: input.leaveUnits,
    leaveTypes: input.leaveTypes ?? [],
    paidLeaveUnits: input.paidLeaveUnits ?? 0,
    remarks: [input.assignmentLabel, override.remarks].filter(Boolean).join(' | '),
    sourceStatus: sources.map((s) => s.status).filter(Boolean),
    decisions,
  };
  return applyOfficialBusiness(result,input.officialBusiness ?? [],workDate,policy,wall=>wallToInstant(wall,timeZone),intervals);
}

export function summarizeDtr(
  rows: { employeeId: string; data: { calculation: DtrCalculation } }[],
) {
  const sum = (
    field:
      | 'lateMinutes'
      | 'undertimeMinutes'
      | 'potentialOtMinutes'
      | 'approvedOtMinutes'
      | 'absent',
  ) =>
    rows.reduce(
      (total, row) =>
        total +
        (row.data.calculation.payrollReady ? row.data.calculation[field] : 0),
      0,
    );
  return {
    employees: new Set(rows.map((r) => r.employeeId)).size,
    employeeDays: rows.length,
    scheduledDays: rows.filter((r) => r.data.calculation.scheduled).length,
    presentDays: rows.filter((r) =>
      r.data.calculation.statuses.includes('Present'),
    ).length,
    lateOccurrences: rows.filter(
      (r) =>
        r.data.calculation.payrollReady && r.data.calculation.lateMinutes > 0,
    ).length,
    lateMinutes: sum('lateMinutes'),
    undertimeMinutes: sum('undertimeMinutes'),
    potentialOtMinutes: sum('potentialOtMinutes'),
    approvedOtMinutes: sum('approvedOtMinutes'),
    absenceDays: sum('absent'),
    missingPunchDays: rows.filter((r) =>
      r.data.calculation.exceptions.includes('Incomplete Punch'),
    ).length,
    exceptionDays: rows.filter((r) => !r.data.calculation.payrollReady).length,
    excludedDays: rows.filter((r) => !r.data.calculation.payrollReady).length,
  };
}
