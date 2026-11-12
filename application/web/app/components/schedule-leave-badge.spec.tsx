import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeWorkScheduleCard from "./employee-work-schedule-card";
import {
  EmployeeScheduleMonthCalendar,
  scheduleMonthDates,
  scheduleMonthWeekStarts,
  type WeekDay,
} from "./employee-work-schedule-card";
import { WeeklyWorkRoster } from "../attendance/weekly-work-roster";
import { ScheduleLeaveBadge } from "./schedule-leave-badge";

describe("Schedule approved leave", () => {
  it("builds complete calendar weeks for short and six-week months", () => {
    const february = scheduleMonthDates("2024-02-01");
    expect(february).toHaveLength(35);
    expect(february[0]).toBe("2024-01-29");
    expect(february.at(-1)).toBe("2024-03-03");
    expect(scheduleMonthWeekStarts("2024-02-01")).toEqual([
      "2024-01-29",
      "2024-02-05",
      "2024-02-12",
      "2024-02-19",
      "2024-02-26",
    ]);

    const march = scheduleMonthDates("2026-03-01");
    expect(march).toHaveLength(42);
    expect(march[0]).toBe("2026-02-23");
    expect(march.at(-1)).toBe("2026-04-05");
    expect(scheduleMonthWeekStarts("2026-03-01")).toHaveLength(6);
  });
  it("shows schedule, rest days, and approved leave in month cells", () => {
    const day = (workDate: string, overrides: Partial<WeekDay> = {}) => ({
      workDate,
      dayType: "WORK" as const,
      shiftStart: "09:00",
      shiftEnd: "18:00",
      assignmentLabel: "Office",
      hasSchedule: true,
      ...overrides,
    });
    const html = renderToStaticMarkup(
      <EmployeeScheduleMonthCalendar
        monthStart="2026-03-01"
        days={
          new Map([
            [
              "2026-03-01",
              day("2026-03-01", {
                approvedLeave: { units: 0.5, codes: ["VL"] },
              }),
            ],
            [
              "2026-03-02",
              day("2026-03-02", {
                dayType: "REST_DAY",
                hasSchedule: false,
              }),
            ],
            ["2026-03-03", day("2026-03-03")],
          ])
        }
      />,
    );
    expect(html).toContain('aria-label="March 2026 work schedule"');
    expect(html.match(/<article\b/g)).toHaveLength(42);
    expect(html).toContain("Approved half-day leave");
    expect(html).toContain("VL");
    expect(html).toContain("Rest</span>");
    expect(html).toContain("09:00");
    expect(html).toContain('aria-label="Sunday, March 1, 2026"');
  });
  it("labels full-day leave and its type", () => {
    const html = renderToStaticMarkup(
      <ScheduleLeaveBadge leave={{ units: 1, codes: ["VL"] }} />,
    );
    expect(html).toContain("Approved leave");
    expect(html).toContain("VL");
    expect(html).not.toContain("half-day");
  });
  it("identifies half-day leave without inventing an AM/PM session", () => {
    const html = renderToStaticMarkup(
      <ScheduleLeaveBadge leave={{ units: 0.5, codes: ["SL"] }} />,
    );
    expect(html).toContain("Approved half-day leave");
    expect(html).toContain("SL");
  });
  it("does not mark dates with no approved leave", () => {
    expect(renderToStaticMarkup(<ScheduleLeaveBadge leave={null} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <ScheduleLeaveBadge leave={{ units: 0, codes: [] }} />,
      ),
    ).toBe("");
  });
});

describe("Approved leave in actual schedule views", () => {
  it("shows full and half-day leave in the personal schedule and management roster", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T04:00:00Z"));
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    try {
      const days = Array.from({ length: 7 }, (_, index) => ({
        workDate: `2026-10-${26 + index}`,
        dayType: "WORK",
        shiftStart: "09:00",
        shiftEnd: "18:00",
        baseShiftStart: "09:00",
        baseShiftEnd: "18:00",
        assignmentLabel: "Office",
        hasSchedule: true,
        approvedLeave:
          index === 1
            ? { units: 1, codes: ["VL"] }
            : index === 2
              ? { units: 0.5, codes: ["SL"] }
              : null,
      }));
      // The last date falls into November.
      days[6].workDate = "2026-11-01";
      const roster = {
        branchId: "branch",
        branchName: "Test branch",
        weekStart: "2026-10-26",
        dates: days.map((day) => day.workDate),
        defaultLocation: "Office",
        employees: [
          {
            employeeId: "employee",
            employeeNumber: "EMP001",
            name: "Test Employee",
            days,
          },
        ],
      };
      client.setQueryData(["employee-work-schedule", "employee"], {
        current: {
          shiftStart: "09:00",
          shiftEnd: "18:00",
          timeZone: "Asia/Manila",
          workDays: [1, 2, 3, 4, 5],
          effectiveDate: null,
        },
        history: [],
      });
      client.setQueryData(
        ["employee-work-schedule-week", "employee", "2026-10-26"],
        roster,
      );
      client.setQueryData(
        ["attendance-work-roster", "branch", "2026-10-26"],
        roster,
      );
      const personal = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <EmployeeWorkScheduleCard
            employeeId="employee"
            role="EMPLOYEE"
            readOnly
          />
        </QueryClientProvider>,
      );
      const cards =
        personal.match(
          /<article class="[^"]*dayCard[^"]*"[\s\S]*?<\/article>/g,
        ) ?? [];
      expect(cards[1]).toContain("Approved leave");
      expect(cards[1]).toContain("VL");
      expect(cards[1]).not.toContain("09:00");
      expect(cards[2]).toContain("Approved half-day leave");
      expect(cards[2]).toContain("09:00");
      expect(cards[0]).not.toContain("Approved leave");
      const management = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <WeeklyWorkRoster branchId="branch" enabled />
        </QueryClientProvider>,
      );
      expect(management).toContain("Approved leave");
      expect(management).toContain("Approved half-day leave");
      expect(management).toContain('value="09:00"');
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  });
});
