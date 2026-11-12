import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Clock3, ListChecks, CalendarDays } from "lucide-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider } from "../components/ui/confirmation-provider";
import { AttendanceSectionNav } from "./attendance-section-nav";
import { DtrLoading } from "./dtr-loading";
import { DtrLedger } from "./dtr-ledger";
import { DtrImport } from "./dtr-import";
import { DtrSettings } from "./dtr-settings";
import theme from "../components/ui/workspace-theme.module.css";
import pageStyles from "./workspace.module.css";
import dtrStyles from "./dtr.module.css";
import type { Configuration, Ledger } from "./dtr-client";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const items = [
  {
    id: "overview",
    label: "Overview",
    description: "Today & working time",
    icon: Clock3,
  },
  {
    id: "dtr",
    label: "Attendance & DTR",
    description: "Import, review & export",
    icon: ListChecks,
  },
  {
    id: "roster",
    label: "Weekly roster",
    description: "Employee schedules",
    icon: CalendarDays,
  },
];
describe("attendance navigation and loading", () => {
  it("exposes the selected section and uses native keyboard-operable buttons", () => {
    const html = renderToStaticMarkup(
      createElement(AttendanceSectionNav, {
        items,
        activeId: "dtr",
        onChange: () => {},
      }),
    );
    expect(html).toContain('aria-label="Attendance sections"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('id="attendance-section-content-tab-dtr"');
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/type="button"/g)).toHaveLength(3);
    expect(html).toContain('aria-controls="attendance-section-content"');
  });
  it("renders only the supplied role-authorized navigation items", () => {
    const html = renderToStaticMarkup(
      createElement(AttendanceSectionNav, {
        items: items.slice(0, 1),
        activeId: "overview",
        onChange: () => {},
      }),
    );
    expect(html).not.toContain("Attendance &amp; DTR");
    expect(html).not.toContain("Weekly roster");
  });
  it("announces loading once and hides structural placeholders", () => {
    const html = renderToStaticMarkup(createElement(DtrLoading));
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading saved attendance"');
    expect(html).toContain('aria-hidden="true"');
  });
  it("can produce an isolated visual fixture using real attendance components", () => {
    if (process.env.ATTENDANCE_VISUAL_FIXTURE !== "true") return;
    const configuration: Configuration = {
      templates: [],
      employees: [],
      mappings: [],
      settings: {
        policy: {
          breakStart: "12:00",
          breakEnd: "13:00",
          lateGraceMinutes: 15,
          minimumOtMinutes: 50,
          otIncrementMinutes: 60,
        },
        holidays: {},
      },
    };
    const ledger: Ledger = {
      summary: {
        employees: 16,
        presentDays: 136,
        absenceDays: 8,
        lateMinutes: 224,
        undertimeMinutes: 95,
        exceptionDays: 3,
        employeeDays: 240,
        approvedOtMinutes: 60,
        potentialOtMinutes: 183,
        excludedDays: 3,
      },
      rows: Array.from({ length: 4 }, (_, i) => ({
        id: `test-${i}`,
        employeeId: `test-${i}`,
        employeeName: ["Alex Santos", "Bea Cruz", "Casey Reyes", "Drew Lim"][i],
        branchId: "test",
        branchName: "Test branch",
        workDate: "2026-10-08",
        data: {
          batchId: "visual-test",
          revision: 1,
          approval: "DRAFT",
          source: [],
          override: {},
          calculation: {
            timeZone: "Asia/Manila",
            actualIn: "2026-10-08T00:00:00Z",
            actualOut: i === 2 ? null : "2026-10-08T09:00:00Z",
            schedule: { shiftStart: "08:00", shiftEnd: "17:00" },
            lateMinutes: 0,
            undertimeMinutes: 0,
            potentialOtMinutes: 0,
            approvedOtMinutes: 0,
            workedMinutes: 480,
            absent: 0,
            statuses: [i === 2 ? "Incomplete Punch" : "Present"],
            exceptions: i === 2 ? ["Incomplete Punch"] : [],
            payrollReady: i !== 2,
            restDay: false,
            holiday: null,
            remarks: "",
            sourceStatus: [],
            decisions: [],
          },
        },
      })),
    };
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["dtr-import-history", "test"], { batches: [] });
    const content = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DialogProvider>
          <main className={`${theme.scope} ${pageStyles.page}`}>
            <header className={pageStyles.header}>
              <div>
                <p className={pageStyles.eyebrow}>
                  WORKFORCE / TIME &amp; ATTENDANCE
                </p>
                <h1>Attendance &amp; timekeeping</h1>
                <p className={pageStyles.description}>
                  Visual test fixture · no live employee data
                </p>
              </div>
            </header>
            <AttendanceSectionNav
              items={items}
              activeId="dtr"
              onChange={() => {}}
            />
            <section id="ledger">
              <DtrLedger ledger={ledger} canManage onReview={() => {}} />
            </section>
            <section id="import">
              <DtrImport
                branchId="test"
                configuration={configuration}
                onSaved={() => {}}
              />
            </section>
            <section id="settings">
              <DtrSettings
                branchId="test"
                configuration={configuration}
                onSaved={() => {}}
              />
            </section>
          </main>
        </DialogProvider>
      </QueryClientProvider>,
    );
    const css = (path: string, mapping: Record<string, string>) =>
      readFileSync(resolve(path), "utf8").replace(
        /\.([a-zA-Z_][\w-]*)/g,
        (match, key: string) => (mapping[key] ? `.${mapping[key]}` : match),
      );
    const styles =
      css("app/components/ui/workspace-theme.module.css", theme) +
      css("app/attendance/workspace.module.css", pageStyles) +
      css("app/attendance/dtr.module.css", dtrStyles);
    const output = resolve("../../tmp/attendance-visual");
    mkdirSync(output, { recursive: true });
    writeFileSync(
      resolve(output, "index.html"),
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7f9;font-family:Arial,sans-serif}button,input,select,textarea{font-family:inherit}section[id]{scroll-margin-top:20px} ${styles}</style></head><body>${content}</body></html>`,
    );
    expect(content).toContain("Attendance ledger");
  });
});
