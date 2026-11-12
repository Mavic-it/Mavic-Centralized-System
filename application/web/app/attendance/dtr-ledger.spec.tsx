import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DtrLedger } from "./dtr-ledger";
import type { Ledger, RecordRow } from "./dtr-client";
const row: RecordRow = {
  id: "r1",
  employeeId: "e1",
  employeeName: "Lea <script>",
  branchId: "b1",
  branchName: "Makati",
  workDate: "2026-09-28",
  data: {
    batchId: "batch1",
    revision: 1,
    approval: "DRAFT",
    source: [],
    override: {},
    calculation: {
      timeZone: "Asia/Manila",
      actualIn: "2026-09-28T00:10:00.000Z",
      actualOut: null,
      schedule: { shiftStart: "08:00", shiftEnd: "17:00" },
      lateMinutes: 10,
      undertimeMinutes: 0,
      potentialOtMinutes: 0,
      approvedOtMinutes: 0,
      workedMinutes: 0,
      absent: 0,
      statuses: ["Incomplete Punch", "Late"],
      exceptions: ["Incomplete Punch"],
      payrollReady: false,
      restDay: false,
      holiday: null,
      remarks: "",
      sourceStatus: [],
      decisions: [],
    },
  },
};
const ledger: Ledger = {
  rows: [row],
  summary: {
    employees: 1,
    employeeDays: 1,
    excludedDays: 1,
    exceptionDays: 1,
    lateMinutes: 0,
  },
};
describe("saved DTR presentation", () => {
  it("renders branch-local times, missing punches, units, exclusions and accessible review actions", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, { ledger, canManage: true, onReview: () => {} }),
    );
    expect(html).toContain("08:10");
    expect(html).toContain("No time out");
    expect(html).toContain("Late · minutes");
    expect(html).toContain("1 unresolved employee-days");
    expect(html).toContain("Review / edit");
    expect(html).toContain('aria-label="DTR');
  });
  it("hides editing in employee self service and escapes employee text", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, {
        ledger,
        canManage: false,
        onReview: () => {},
      }),
    );
    expect(html).not.toContain("Review / edit");
    expect(html).toContain("Lea &lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
  it("shows employee totals and excludes unresolved minutes in export preview", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, {
        ledger,
        canManage: true,
        onReview: () => {},
        summaryOnly: true,
      }),
    );
    expect(html).toContain("Employee totals / export preview");
    expect(html).toContain("TOTAL");
    expect(html).toContain("Excluded days");
    expect(html).not.toContain("Review / edit");
  });
  it("keeps secondary metrics collapsed and exposes a review-filter action", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, { ledger, canManage: true, onReview: () => {} }),
    );
    expect(html).toContain('aria-label="Attendance summary"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Filter records");
    expect(html).toContain("More metrics &amp; calculation basis");
    expect(html).not.toMatch(/<details[^>]*\sopen[=>\s]/);
    expect(html).toContain("Potential OT is separate from approved OT");
  });
  it("does not show a warning banner for an empty resolved period", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, {
        ledger: { rows: [], summary: { excludedDays: 0 } },
        canManage: true,
        onReview: () => {},
      }),
    );
    expect(html).not.toContain('role="status"');
    expect(html).toContain("Only imported employee-days");
  });
  it("explains an empty saved period", () => {
    const html = renderToStaticMarkup(
      createElement(DtrLedger, {
        ledger: { rows: [], summary: {} },
        canManage: true,
        onReview: () => {},
      }),
    );
    expect(html).toContain("No attendance in this period");
    expect(html).toContain("Choose a saved cutoff or import attendance");
    expect(html).not.toContain("<thead>");
  });
});
