import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DtrOutputTable } from "./dtr-output-table";
import type { RecordRow } from "./dtr-client";

describe("DTR arrangement remarks", () => {
  it("shows the location in its own column and offers preview day changes", () => {
    const row: RecordRow = {
      id: "preview:e:2026-10-19",
      employeeId: "e",
      employeeName: "Test Employee",
      branchId: "b",
      branchName: "Test Branch",
      workDate: "2026-10-19",
      data: {
        batchId: "batch",
        source: [],
        override: { arrangement: "OB", remarks: "Client visit" },
        approval: "DRAFT",
        revision: 0,
        calculation: {
          timeZone: "Asia/Manila",
          actualIn: null,
          actualOut: null,
          schedule: { shiftStart: "08:00", shiftEnd: "17:00" },
          lateMinutes: 0,
          undertimeMinutes: 0,
          potentialOtMinutes: 0,
          approvedOtMinutes: 0,
          workedMinutes: 0,
          absent: 0,
          statuses: ["OB"],
          exceptions: [],
          payrollReady: true,
          restDay: false,
          holiday: null,
          remarks: "OB: Client office",
          sourceStatus: [],
          decisions: [],
        },
      },
    };
    const html = renderToStaticMarkup(
      <DtrOutputTable rows={[row]} preview onReview={() => {}} />,
    );
    expect(html).toContain("Remarks / where");
    expect(html).toContain("<td>OB: Client office</td>");
    expect(html).toContain("Change day / remarks");
    expect(html).toContain('colSpan="5"');
    expect(html).toContain("0 days need review");
  });
});
