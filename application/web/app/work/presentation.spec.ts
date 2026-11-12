import { describe, expect, it } from "vitest";
import {
  isOverdue,
  nextAction,
  statusTone,
  visibleRecords,
  workDate,
} from "./presentation";
import type { Detail, RecordItem } from "./types";
const item = (
  id: string,
  title: string,
  extra: Partial<RecordItem> = {},
): RecordItem => ({
  id,
  title,
  description: "Authorized description",
  branchName: "Test branch",
  employeeName: "Test Employee",
  employeeId: "employee",
  version: 1,
  status: "TODO",
  ...extra,
});
describe("work collection presentation", () => {
  it("searches only visible fields, normalizes accents, and distinguishes active and closed", () => {
    const items = [
      item("one", "Prepare room", { employeeName: "Loel Campaña" }),
      item("two", "Publish checklist", { status: "COMPLETED" }),
    ];
    expect(
      visibleRecords(items, "campana", "newest", "all").map((r) => r.id),
    ).toEqual(["one"]);
    expect(
      visibleRecords(items, "", "newest", "active").map((r) => r.id),
    ).toEqual(["one"]);
    expect(
      visibleRecords(items, "", "newest", "closed").map((r) => r.id),
    ).toEqual(["two"]);
    expect(
      visibleRecords(items, "unshared investigation", "newest", "all"),
    ).toEqual([]);
  });
  it("sorts records without mutating the authorized query result", () => {
    const items = [
      item("one", "Zebra", { priority: "LOW", dueDate: "2026-11-02" }),
      item("two", "Alpha", { priority: "URGENT", dueDate: "2026-10-01" }),
    ];
    for (const sort of ["title", "priority", "date"] as const)
      expect(visibleRecords(items, "", sort, "all")[0].id).toBe("two");
    expect(items[0].id).toBe("one");
    expect(visibleRecords(items, "", "newest", "all")[0].id).toBe("one");
  });
  it("shows overdue only on open tasks and formats calendar dates without shifting them", () => {
    expect(
      isOverdue(item("one", "Old", { dueDate: "2026-10-01" }), "2026-10-28"),
    ).toBe(true);
    expect(
      isOverdue(
        item("one", "Closed", { dueDate: "2026-10-01", status: "COMPLETED" }),
        "2026-10-28",
      ),
    ).toBe(false);
    expect(
      isOverdue(item("one", "Today", { dueDate: "2026-10-28" }), "2026-10-28"),
    ).toBe(false);
    expect(workDate("2026-10-28")).toContain("28");
    expect(workDate(undefined)).toBe("No date");
  });
  it("uses text-supported status tones and recommends only permitted actions", () => {
    expect(statusTone("COMPLETED")).toBe("success");
    expect(statusTone("FOR_REVIEW")).toBe("warning");
    const d = {
      ...item("one", "Task"),
      canManage: false,
      isAssignee: true,
      isReporter: false,
      isSubject: false,
      canAssignReviewer: false,
      events: [],
      attachments: [],
    } satisfies Detail;
    expect(nextAction("tasks", d)).toBe("START");
    expect(
      nextAction("tasks", {
        ...d,
        status: "FOR_REVIEW",
        isAssignee: false,
        canManage: true,
      }),
    ).toBe("ACCEPT");
    expect(
      nextAction("incidents", {
        ...d,
        status: "NOTICE_ISSUED",
        isSubject: true,
      }),
    ).toBe("ACKNOWLEDGE");
    expect(nextAction("incidents", { ...d, status: "CLOSED" })).toBeUndefined();
  });
});
