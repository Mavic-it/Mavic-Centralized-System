export type AttendanceSchedule = {
  branchId: string;
  timeZone: string;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
  defaultLocation?: string | null;
};

function isAttendanceSchedule(value: unknown): value is AttendanceSchedule {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "branchId" in value &&
    typeof value.branchId === "string" &&
    "timeZone" in value &&
    typeof value.timeZone === "string" &&
    "workDays" in value &&
    Array.isArray(value.workDays) &&
    value.workDays.every(
      (day) => Number.isInteger(day) && day >= 0 && day <= 6,
    ) &&
    "shiftStart" in value &&
    typeof value.shiftStart === "string" &&
    "shiftEnd" in value &&
    typeof value.shiftEnd === "string" &&
    "breakMinutes" in value &&
    typeof value.breakMinutes === "number" &&
    Number.isFinite(value.breakMinutes) &&
    "graceMinutes" in value &&
    typeof value.graceMinutes === "number" &&
    Number.isFinite(value.graceMinutes) &&
    (!("defaultLocation" in value) ||
      value.defaultLocation === null ||
      typeof value.defaultLocation === "string")
  );
}

export function normalizeAttendanceSchedule(
  value: unknown,
): AttendanceSchedule | null {
  if (value === null) return null;
  if (!isAttendanceSchedule(value)) {
    throw new Error("The attendance schedule response is invalid.");
  }
  return value;
}

export function parseAttendanceSchedule(
  body: string,
): AttendanceSchedule | null {
  if (!body.trim()) return null;

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("The attendance schedule response is invalid JSON.");
  }

  return normalizeAttendanceSchedule(value);
}
