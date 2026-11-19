import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { LoadingTable } from "./components/content-loading";
import { LeavePageLoading, LeaveRequestsLoading } from "./leave/leave-loading";
import { ReservationCalendarSkeleton, ReservationPageSkeleton } from "./reservations/reservation-skeleton";
import { BookingCalendar } from "./reservations/workspace";
import { DtrLoading } from "./attendance/dtr-loading";
import { AttendanceRecordsLoading, WeeklyRosterLoading } from "./attendance/attendance-loading";
import { ObPageLoading } from "./attendance/official-business/ob-loading";
import { EmployeeScheduleLoading } from "./components/employee-section-loading";
import { PeopleWorkspaceLoading, BranchesLoading, OverviewLoading } from "./components/page-loading";
import { ModuleAccessLoading } from "./components/module-access-loading";
import { PasswordResetQueueLoading } from "./components/password-reset-queue-loading";
import { MyProfileLoading } from "./components/my-profile-loading";
import { InventoryOverviewLoading, InventoryItemsLoading } from "./(workspace)/inventory/inventory-loading";
import { CollectionSkeleton } from "./work/record-collection";
import { WorkDetailLoading } from "./work/work-loading";
import reservation from "./reservations/workspace.module.css";
import gallery from "./reservations/space-gallery.module.css";
import payment from "./reservations/payments.module.css";
import content from "./components/content-loading.module.css";
import people from "./components/people-workspace.module.css";
import theme from "./components/ui/workspace-theme.module.css";
import tabs from "./components/employee-profile-tabs.module.css";
import file from "./components/employee-file-presentation.module.css";
import hr from "./components/employee-hr-profile-card.module.css";
import profile from "./components/my-profile-workspace.module.css";
import accounts from "./components/admin-directory.module.css";
import resets from "./components/password-reset-queue.module.css";
import leave from "./leave/leave.module.css";
import attendance from "./attendance/workspace.module.css";
import dtr from "./attendance/dtr.module.css";
import ob from "./attendance/official-business/ob.module.css";
import schedule from "./components/employee-work-schedule-card.module.css";
import grid from "./components/schedule-grid.module.css";
import inventory from "./(workspace)/inventory/inventory.module.css";
import work from "./work/workspace.module.css";
import branch from "./branches/workspace.module.css";

const markup = (node: ReactNode) => renderToStaticMarkup(node);
const headers = (html: string) => [...html.matchAll(/<th(?:\s[^>]*)?>([\s\S]*?)<\/th>/g)].map(match => match[1]);
describe("content-aware loading", () => {
  it("keeps static column headers and hides only decorative cells", () => {
    const html = markup(<LoadingTable label="Loading results" headers={["Name", "Status", "Action"]} rows={4} />);
    expect(headers(html)).toEqual(["Name", "Status", "Action"]);
    expect(html.match(/<td>/g)).toHaveLength(12);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toMatch(/<(button|input|select)\b/);
    expect(html).not.toContain("No records");
  });
  it("uses personal versus manager leave columns", () => {
    expect(headers(markup(<LeaveRequestsLoading own />))).toHaveLength(6);
    expect(headers(markup(<LeaveRequestsLoading />))).toHaveLength(8);
    expect(headers(markup(<LeaveRequestsLoading own />))).not.toContain("Employee");
  });
  it.each(["month", "week", "day"] as const)("matches the real %s calendar cell count and layout", view => {
    const actual = markup(<BookingCalendar date="2026-11-19" view={view} items={[]} onSelect={() => {}} onCreate={() => {}} selectedDate="2026-11-19" onDateSelect={() => {}} showBranch={false} />);
    const loading = markup(<ReservationCalendarSkeleton view={view} />);
    const cells = (html: string) => html.split(reservation.dayCell).length - 1;
    expect(cells(loading)).toBe(cells(actual));
    expect(loading).toContain(reservation.days);
    if (view === "day") expect(loading).toContain(reservation.dayCalendar);
    expect(loading).not.toContain("Create reservation");
  });
  it("preserves role-specific attendance columns", () => {
    expect(headers(markup(<AttendanceRecordsLoading canManage />))).toHaveLength(11);
    expect(headers(markup(<AttendanceRecordsLoading canManage={false} />))).toHaveLength(8);
  });
  it("uses table placeholders in task table mode", () => {
    expect(headers(markup(<CollectionSkeleton layout="table" kind="tasks" />))).toHaveLength(6);
    expect(headers(markup(<CollectionSkeleton layout="table" kind="incidents" />))).toHaveLength(7);
  });
  it("does not render booking totals on settings and payment routes", () => {
    for (const section of ["settings", "payments"] as const) {
      expect(markup(<ReservationPageSkeleton section={section} />)).not.toContain("Available spaces");
    }
  });
});

// Browser-review artifacts use the actual module CSS and server-rendered components.
it("writes all-module responsive loading previews", () => {
  const styles: [string, Record<string, string>][] = [
    ["reservations/workspace", reservation], ["reservations/space-gallery", gallery], ["reservations/payments", payment],
    ["components/content-loading", content], ["components/people-workspace", people], ["components/ui/workspace-theme", theme],
    ["components/employee-profile-tabs", tabs], ["components/employee-file-presentation", file], ["components/employee-hr-profile-card", hr],
    ["components/my-profile-workspace", profile], ["components/admin-directory", accounts], ["components/password-reset-queue", resets],
    ["leave/leave", leave], ["attendance/workspace", attendance], ["attendance/dtr", dtr], ["attendance/official-business/ob", ob],
    ["components/employee-work-schedule-card", schedule], ["components/schedule-grid", grid], ["(workspace)/inventory/inventory", inventory],
    ["work/workspace", work], ["branches/workspace", branch],
  ];
  const sheet = readFileSync(resolve("app/globals.css"), "utf8") + readFileSync(resolve("app/components/module-access-workspace.css"), "utf8") + styles.map(([path, map]) => readFileSync(resolve(`app/${path}.module.css`), "utf8").replace(/:global\(([^)]+)\)/g, "$1").replace(/\.([a-zA-Z_][\w-]*)/g, (match, key: string) => map[key] ? `.${map[key]}` : match)).join("\n");
  const views: Record<string, ReactNode> = {
    overview: <OverviewLoading />, hr: <PeopleWorkspaceLoading variant="hr" />, employees: <PeopleWorkspaceLoading variant="employees" />,
    employee: <PeopleWorkspaceLoading variant="employee-profile" />, portal: <PeopleWorkspaceLoading variant="me" />, profile: <MyProfileLoading />,
    users: <PeopleWorkspaceLoading variant="users" />, branches: <BranchesLoading />, permissions: <ModuleAccessLoading />, resets: <PasswordResetQueueLoading />,
    "leave-requests": <LeavePageLoading section="requests" />, "leave-balances": <LeavePageLoading section="balances" />, "leave-mine": <LeavePageLoading section="mine" />,
    "leave-settings": <LeavePageLoading section="settings" />, "leave-reports": <LeavePageLoading section="reports" />,
    "reservation-calendar": <ReservationPageSkeleton />, "reservation-spaces": <ReservationPageSkeleton section="spaces" />,
    "reservation-list": <ReservationPageSkeleton section="list" />, "reservation-reports": <ReservationPageSkeleton section="reports" />,
    "reservation-settings": <ReservationPageSkeleton section="settings" />, "reservation-payments": <ReservationPageSkeleton section="payments" />,
    attendance: <AttendanceRecordsLoading canManage />, roster: <WeeklyRosterLoading />, dtr: <DtrLoading canManage />, "dtr-summary": <DtrLoading kind="summary" />,
    ob: <ObPageLoading />, "schedule-week": <EmployeeScheduleLoading />, "schedule-month": <EmployeeScheduleLoading period="month" />,
    inventory: <InventoryOverviewLoading />, "inventory-items": <InventoryItemsLoading />, tasks: <CollectionSkeleton />, "tasks-table": <CollectionSkeleton layout="table" />,
    "task-detail": <WorkDetailLoading kind="tasks" />, "incident-detail": <WorkDetailLoading kind="incidents" />,
  };
  const output = resolve("../../tmp/loading-review");
  mkdirSync(output, { recursive: true });
  for (const [name, view] of Object.entries(views)) {
    writeFileSync(resolve(output, `${name}.html`), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheet}\nbody{margin:0;padding:24px;font-family:Arial,sans-serif}#fixture{max-width:1300px;margin:auto;min-width:0} @media(max-width:600px){body{padding:12px}}</style></head><body><div id="fixture">${markup(view)}</div></body></html>`);
  }
  writeFileSync(resolve(output, "manifest.json"), JSON.stringify(Object.keys(views)));
  expect(Object.keys(views).length).toBeGreaterThan(30);
});
