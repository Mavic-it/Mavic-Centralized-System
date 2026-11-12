import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskExportMenu } from "./task-export-menu";
import { IncidentExport } from "./incident-export";

describe("task export menu", () => {
  it("offers the same Excel and PDF menu for incidents", () => {
    const html = renderToStaticMarkup(
      <IncidentExport
        filters={{
          branchId: "makati",
          category: "CONDUCT",
          queue: "active-cases",
        }}
      />,
    );
    expect(html).toContain('aria-label="Export incident list"');
    expect(html).toContain("Incident export format");
    expect(html).toContain("Excel (.xlsx)");
    expect(html).toContain("PDF report");
    expect(html).not.toContain("Export CSV");
  });
  it("offers both export formats and receives the current filter state", () => {
    const html = renderToStaticMarkup(
      <TaskExportMenu
        filters={{
          status: "IN_PROGRESS",
          view: "team",
          search: "room",
          branchId: "makati",
          assigneeId: "employee-1",
        }}
      />,
    );
    expect(html).toContain('aria-label="Export task list"');
    expect(html).toContain("Excel (.xlsx)");
    expect(html).toContain("PDF report");
    expect(html).toContain("Export");
  });
});
