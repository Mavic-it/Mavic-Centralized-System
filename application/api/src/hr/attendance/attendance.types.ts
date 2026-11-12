export type WorkScheduleDefinition = {
  timeZone: string;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
};

export type AttendanceSchedule = WorkScheduleDefinition & {
  branchId: string;
  defaultLocation?: string | null;
};

export type EmployeeWorkScheduleHistoryRecord = WorkScheduleDefinition & {
  id: string;
  employeeId: string;
  branchId: string;
  effectiveDate: string;
  assignedBy: string | null;
  assignedByName?: string | null;
  recordedAt: string;
};

export type EffectiveEmployeeWorkSchedule = WorkScheduleDefinition & {
  branchId: string;
  source: 'EMPLOYEE' | 'BRANCH';
  effectiveDate: string | null;
};

export function workScheduleValidationError(
  schedule: WorkScheduleDefinition,
): string | undefined {
  try {
    new Intl.DateTimeFormat('en', { timeZone: schedule.timeZone });
  } catch {
    return 'Enter a valid IANA time zone.';
  }
  if (
    !Array.isArray(schedule.workDays) ||
    schedule.workDays.length < 1 ||
    schedule.workDays.length > 7 ||
    schedule.workDays.some(
      (day) => !Number.isInteger(day) || day < 0 || day > 6,
    ) ||
    new Set(schedule.workDays).size !== schedule.workDays.length
  ) {
    return 'Select one to seven unique work days.';
  }
  if (
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.shiftStart) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.shiftEnd) ||
    schedule.shiftEnd === schedule.shiftStart
  ) {
    return 'Enter different valid shift start and end times.';
  }
  if (
    !Number.isInteger(schedule.breakMinutes) ||
    schedule.breakMinutes < 0 ||
    schedule.breakMinutes > 720
  ) {
    return 'Break minutes must be between 0 and 720.';
  }
  if (
    !Number.isInteger(schedule.graceMinutes) ||
    schedule.graceMinutes < 0 ||
    schedule.graceMinutes > 240
  ) {
    return 'Grace minutes must be between 0 and 240.';
  }
}
