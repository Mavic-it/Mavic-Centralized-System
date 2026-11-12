import { describe, expect, it } from "vitest";
import { parseAttendanceSchedule } from "./attendance-schedule";

describe("parseAttendanceSchedule", () => {
  it("treats an empty successful response as an unconfigured schedule", () => {
    expect(parseAttendanceSchedule("")).toBeNull();
    expect(parseAttendanceSchedule("  ")).toBeNull();
    expect(parseAttendanceSchedule("null")).toBeNull();
  });

  it("accepts a configured schedule with a valid work-days array", () => {
    expect(
      parseAttendanceSchedule(
        JSON.stringify({
          branchId: "branch-1",
          timeZone: "Asia/Manila",
          workDays: [1, 2, 3, 4, 5],
          shiftStart: "09:00",
          shiftEnd: "18:00",
          breakMinutes: 60,
          graceMinutes: 5,
        }),
      )?.workDays,
    ).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects malformed schedule data rather than returning an unsafe object", () => {
    expect(() =>
      parseAttendanceSchedule(JSON.stringify({ timeZone: "Asia/Manila" })),
    ).toThrow("The attendance schedule response is invalid.");
  });
});
