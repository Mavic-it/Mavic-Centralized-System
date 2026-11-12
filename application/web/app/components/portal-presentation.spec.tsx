import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EmployeePortalContent,
  portalSectionFromSearchParam,
} from "./people-workspace";
import { PeopleWorkspaceLoading } from "./page-loading";
import { WorkspaceRoleProvider } from "./workspace-role-context";
import { DialogProvider } from "./ui/confirmation-provider";
import EmployeeDocumentsSection from "./employee-documents-section";
import EmployeeWorkScheduleCard from "./employee-work-schedule-card";
import type { WorkspaceEmployee, WorkspaceRole } from "../data/people";
import styles from "./people-workspace.module.css";
import theme from "./ui/workspace-theme.module.css";
import documentStyles from "./employee-documents-section.module.css";
import scheduleStyles from "./employee-work-schedule-card.module.css";
import employeeFactsStyles from "./employee-file-presentation.module.css";
import hrProfileStyles from "./employee-hr-profile-card.module.css";
import assignmentStyles from "./employee-assignment-history-card.module.css";

const portalSearch = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(portalSearch.value),
}));
const employee: WorkspaceEmployee = {
  id: "visual-portal-employee",
  employeeNumber: "TEST001",
  name: "Alex Santos",
  email: "alex@example.test",
  phone: "Not provided",
  branchId: "visual-branch",
  branch: "Test branch",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  hiredOn: "2026-01-01",
  position: "Operations associate",
  department: "Operations",
  manager: "Test manager",
  emergencyContact: {
    name: "Not provided",
    relationship: "Not provided",
    phone: "Not provided",
  },
  governmentIds: [],
  documents: [],
  attendance: [],
};
const noop = () => {};
function clientFor(role: WorkspaceRole = "EMPLOYEE", mode = "employee") {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  });
  if (role === "SUPER_ADMIN")
    client.setQueryData(["my-profile"], { mode, employeeId: employee.id });
  client.setQueryData(["employee", "me"], employee);
  client.setQueryData(["employee-hr-profile", employee.id], null);
  client.setQueryData(["employee-assignment-history", employee.id], []);
  client.setQueryData(["attendance", "me", employee.id], []);
  client.setQueryData(
    ["notifications"],
    Array.from({ length: 4 }, (_, i) => ({
      id: `test-${i}`,
      title: "Artificial notification",
      message: "Fixture only",
      type: "NOTICE",
      createdAt: "2026-10-18",
    })),
  );
  client.setQueryData(["employee-document-records", employee.id], []);
  client.setQueryData(["employee-work-schedule", employee.id], {
    current: {
      branchId: employee.branchId,
      timeZone: "Asia/Manila",
      workDays: [1, 2, 3, 4, 5],
      shiftStart: "08:00",
      shiftEnd: "17:00",
      breakMinutes: 60,
      graceMinutes: 0,
      effectiveDate: "2026-01-01",
    },
    history: [],
  });
  const dates = Array.from({ length: 7 }, (_, i) => `2026-10-${12 + i}`);
  client.setQueryDefaults(["employee-work-schedule-week", employee.id], {
    initialData: {
      branchName: "Test branch",
      weekStart: dates[0],
      dates,
      defaultLocation: null,
      employees: [
        {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          name: employee.name,
          days: dates.map((workDate, i) => ({
            workDate,
            dayType: i < 5 ? "WORK" : "REST_DAY",
            shiftStart: i < 5 ? "08:00" : null,
            shiftEnd: i < 5 ? "17:00" : null,
            assignmentLabel: null,
            hasSchedule: true,
          })),
        },
      ],
    },
  });
  return client;
}
function renderPortal(
  role: WorkspaceRole = "EMPLOYEE",
  client = clientFor(role),
) {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <WorkspaceRoleProvider role={role}>
        <DialogProvider>
          <EmployeePortalContent onNotice={noop} />
        </DialogProvider>
      </WorkspaceRoleProvider>
    </QueryClientProvider>,
  );
}

describe("My Portal presentation", () => {
  it("accepts only known portal section URLs", () => {
    expect(portalSectionFromSearchParam("documents")).toBe("documents");
    expect(portalSectionFromSearchParam("work-schedule")).toBe("work-schedule");
    expect(portalSectionFromSearchParam("assignment-history")).toBe(
      "assignment-history",
    );
    expect(portalSectionFromSearchParam("payslips")).toBe("payslips");
    expect(portalSectionFromSearchParam("emergency-contact")).toBe("profile");
    expect(portalSectionFromSearchParam("unknown")).toBe("profile");
    expect(portalSectionFromSearchParam(null)).toBe("profile");
    expect(portalSectionFromSearchParam("documents")).toBe("documents");
  });
  it("opens the documents panel from a shared URL", () => {
    portalSearch.value = "section=documents";
    try {
      const html = renderPortal("EMPLOYEE");
      expect(html).toContain('id="my-documents"');
      expect(html).not.toContain('id="my-profile"');
    } finally {
      portalSearch.value = "";
    }
  });
  it("opens the work schedule in the profile without a separate file page", () => {
    portalSearch.value = "section=work-schedule";
    try {
      const html = renderPortal("EMPLOYEE");
      expect(html).toContain('aria-label="Weekly work schedule"');
      expect(html).toContain('aria-label="Schedule period"');
      expect(html).toContain(">Month</button>");
      expect(html).not.toContain("Open my 201 file");
      expect(html).not.toContain("View 201 file");
      expect(html).not.toContain('aria-label="Change schedule"');
    } finally {
      portalSearch.value = "";
    }
  });
  it("keeps photo and emergency contact actions in the personal profile", () => {
    const profile = renderPortal("EMPLOYEE");
    expect(profile).toContain('aria-label="Upload profile picture"');
    portalSearch.value = "section=emergency-contact";
    try {
      expect(renderPortal("EMPLOYEE")).toContain(
        'aria-label="Edit emergency contact"',
      );
      expect(renderPortal("IT_ADMIN")).toContain(
        'aria-label="Edit emergency contact"',
      );
    } finally {
      portalSearch.value = "";
    }
  });
  it.each([
    ["emergency-contact", "my-emergency-contact"],
    ["assignment-history", "assignment-history-title"],
    ["incident-history", "incident-history"],
    ["payslips", "my-payslips"],
  ])("opens the %s section in My Profile", (section, marker) => {
    portalSearch.value = `section=${section}`;
    try {
      expect(renderPortal("EMPLOYEE")).toContain(`id="${marker}"`);
    } finally {
      portalSearch.value = "";
    }
  });
  it("shows the same own-profile sections to IT Admin as other linked users", () => {
    portalSearch.value = "section=documents";
    try {
      const html = renderPortal("IT_ADMIN");
      expect(html).toContain('id="my-documents"');
      expect(html.match(/aria-controls="my-portal-content"/g)).toHaveLength(6);
    } finally {
      portalSearch.value = "";
    }
  });
  it.each<WorkspaceRole>([
    "EMPLOYEE",
    "STAFF",
    "HR_ADMIN",
    "BRANCH_MANAGER",
    "IT_ADMIN",
    "SUPER_ADMIN",
  ])(
    "renders the linked own employee for %s without account-administration actions",
    (role) => {
      const html = renderPortal(role);
      expect(html).toContain("Alex Santos");
      expect(html).toContain("alex@example.test");
      expect(html).toContain('aria-label="Employee employment summary"');
      expect(html).toContain('aria-label="My profile sections"');
      expect(html.match(/aria-controls="my-portal-content"/g)).toHaveLength(6);
      expect(html).not.toContain("Open my 201 file");
      expect(html).not.toContain("View 201 file");
      expect(html).not.toContain("Schedule &amp; attendance");
      expect(html).not.toContain(">Recent attendance</button>");
      expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
      expect(html).toContain('id="my-portal-content"');
      expect(html).not.toContain("My requests");
      expect(html).not.toContain("Announcements &amp; notifications");
      expect(html).not.toContain("Create account");
      expect(html).not.toContain("Edit role");
      expect(html).not.toContain("Good morning");
    },
  );
  it("omits the removed leave summary", () => {
    const html = renderPortal("EMPLOYEE");
    expect(html).not.toContain("Vacation leave");
    expect(html).not.toContain("My portal summary");
  });
  it("does not expose seeded employee data on the independent admin redirect path", () => {
    const html = renderPortal(
      "SUPER_ADMIN",
      clientFor("SUPER_ADMIN", "independent"),
    );
    expect(html).toContain("Opening your personal profile");
    expect(html).not.toContain(employee.email);
    expect(html).not.toContain("My portal summary");
  });
  it("keeps recovery available for failed employee and admin identity checks", () => {
    const client = clientFor();
    client
      .getQueryCache()
      .find({ queryKey: ["employee", "me"], exact: true })!
      .setState({
        status: "error",
        error: new Error("Artificial employee error"),
        fetchStatus: "idle",
        data: undefined,
      });
    const html = renderPortal("EMPLOYEE", client);
    expect(html).toContain("Retry loading my record");
    expect(html).not.toContain("My portal summary");
    const admin = clientFor("SUPER_ADMIN");
    admin
      .getQueryCache()
      .find({ queryKey: ["my-profile"], exact: true })!
      .setState({
        status: "error",
        error: new Error("Artificial error"),
        fetchStatus: "idle",
        data: undefined,
      });
    expect(renderPortal("SUPER_ADMIN", admin)).toContain(
      "Unable to verify your employee profile",
    );
  });
  it("keeps self-service documents read-only for employee and admin portal usage", () => {
    for (const role of ["EMPLOYEE", "HR_ADMIN", "SUPER_ADMIN"] as const) {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={clientFor(role)}>
          <DialogProvider>
            <EmployeeDocumentsSection
              employee={employee}
              role={role}
              canManageDocuments={false}
              onNotice={noop}
            />
          </DialogProvider>
        </QueryClientProvider>,
      );
      expect(html).not.toContain('aria-label="Upload document"');
      expect(html).not.toContain("<form");
    }
  });
  it("keeps work schedule editing limited to its existing admin roles", () => {
    for (const role of [
      "EMPLOYEE",
      "STAFF",
      "IT_ADMIN",
      "HR_ADMIN",
      "BRANCH_MANAGER",
      "SUPER_ADMIN",
    ] as const) {
      const html = renderToStaticMarkup(
        <QueryClientProvider client={clientFor(role)}>
          <EmployeeWorkScheduleCard employeeId={employee.id} role={role} />
        </QueryClientProvider>,
      );
      expect(html.includes('aria-label="Change schedule"')).toBe(
        ["HR_ADMIN", "BRANCH_MANAGER", "SUPER_ADMIN"].includes(role),
      );
      expect(html).toContain('aria-label="Weekly work schedule"');
    }
  });
  it("renders isolated actual-component fixtures for user/admin portals and shared panels", () => {
    if (process.env.PORTAL_VISUAL_FIXTURE !== "true") return;
    const wrap = (html: string) =>
      `<main class="${theme.scope} ${styles.page} ${styles.employeeWorkspace} ${styles.portalPage} ${styles.employeeFilePage}"><header class="${styles.pageHeader}"><div><p class="${styles.employeeEyebrow}">MY ACCOUNT / MY PORTAL</p><h1>My Profile</h1><p class="${styles.description}">Artificial visual fixtures only</p></div></header>${html}</main>`;
    const client = clientFor();
    const panels = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DialogProvider>
          <EmployeeDocumentsSection
            employee={employee}
            role="EMPLOYEE"
            canManageDocuments={false}
            onNotice={noop}
          />
          <EmployeeWorkScheduleCard employeeId={employee.id} role="EMPLOYEE" />
        </DialogProvider>
      </QueryClientProvider>,
    );
    const states = {
      user: wrap(renderPortal()),
      admin: wrap(renderPortal("SUPER_ADMIN")),
      loading: renderToStaticMarkup(<PeopleWorkspaceLoading variant="me" />),
      panels: wrap(panels),
    };
    const css = (path: string, mapping: Record<string, string>) => {
      const globals: string[] = [];
      return readFileSync(resolve(path), "utf8")
        .replace(
          /:global\(([^)]+)\)/g,
          (_, sel: string) => `GLOBAL_SELECTOR_${globals.push(sel) - 1}_END`,
        )
        .replace(/\.([a-zA-Z_][\w-]*)/g, (match, key: string) =>
          mapping[key] ? `.${mapping[key]}` : match,
        )
        .replace(
          /GLOBAL_SELECTOR_(\d+)_END/g,
          (_, i: string) => globals[Number(i)],
        );
    };
    const sheet =
      readFileSync(resolve("app/globals.css"), "utf8").replace(
        /^@import.*$/gm,
        "",
      ) +
      css("app/components/ui/workspace-theme.module.css", theme) +
      css("app/components/people-workspace.module.css", styles) +
      css(
        "app/components/employee-file-presentation.module.css",
        employeeFactsStyles,
      ) +
      css(
        "app/components/employee-hr-profile-card.module.css",
        hrProfileStyles,
      ) +
      css(
        "app/components/employee-assignment-history-card.module.css",
        assignmentStyles,
      ) +
      css(
        "app/components/employee-documents-section.module.css",
        documentStyles,
      ) +
      css(
        "app/components/employee-work-schedule-card.module.css",
        scheduleStyles,
      );
    const root = resolve("../../tmp/my-portal-visual");
    mkdirSync(root, { recursive: true });
    for (const [state, html] of Object.entries(states))
      writeFileSync(
        resolve(root, `${state}.html`),
        `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheet}*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7f9;font-family:Arial,sans-serif}button,input,select{font-family:inherit}</style></head><body>${html}</body></html>`,
      );
    expect(states.user).toContain("Alex Santos");
  });
});
