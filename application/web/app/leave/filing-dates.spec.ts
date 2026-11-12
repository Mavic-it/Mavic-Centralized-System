import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  effectiveNoticeDays,
  noticeLabel,
} from "./filing-dates";

describe("Leave filing date presentation", () => {
  it("uses the supplied server calendar date for each notice period", () => {
    expect(addCalendarDays("2026-10-26", 0)).toBe("2026-10-26");
    expect(addCalendarDays("2026-10-26", 1)).toBe("2026-10-27");
    expect(addCalendarDays("2026-10-26", 2)).toBe("2026-10-28");
  });
  it("handles month, leap-year and year boundaries independent of browser timezone", () => {
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addCalendarDays("2028-02-28", 2)).toBe("2028-03-01");
  });
  it("explains same-day versus advance filing as calendar dates", () => {
    expect(noticeLabel(0)).toContain("Same-day filing allowed");
    expect(noticeLabel(1)).toContain("1 calendar day in advance");
    expect(noticeLabel(2)).toContain("2 calendar days in advance");
  });
  it("requires three days for planned paid and unpaid leave while preserving longer policies", () => {
    expect(effectiveNoticeDays("VL", 1)).toBe(3);
    expect(effectiveNoticeDays("LWOP", 0)).toBe(3);
    expect(effectiveNoticeDays("VL", 7)).toBe(7);
    expect(effectiveNoticeDays("SL", 0)).toBe(0);
  });
});
