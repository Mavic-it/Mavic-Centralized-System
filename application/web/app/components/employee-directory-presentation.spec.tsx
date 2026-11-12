import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider } from "./ui/confirmation-provider";
import {
  EmployeeDirectorySummary,
  EmployeeDirectoryTable,
  EmployeeDirectoryTableSkeleton,
} from "./employee-directory-presentation";
import EmployeeHrProfileCard from "./employee-hr-profile-card";
import EmployeeDocumentsSection from "./employee-documents-section";
import type { WorkspaceEmployee } from "../data/people";
import styles from "./people-workspace.module.css";
import theme from "./ui/workspace-theme.module.css";
import hrStyles from "./employee-hr-profile-card.module.css";
import documentStyles from "./employee-documents-section.module.css";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const employee: WorkspaceEmployee = {
  id: "visual-employee",
  employeeNumber: "TEST001",
  name: "Alex Santos",
  email: "alex@example.test",
  branchId: "visual-branch",
  branch: "Test branch",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  hiredOn: "2026-01-01",
  position: "Operations associate",
  department: "Operations",
  phone: "Not provided",
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
const rows = [
  employee,
  {
    ...employee,
    id: "visual-2",
    employeeNumber: "TEST002",
    name: "Bea Cruz",
    status: "INACTIVE" as const,
    branch: "Other branch",
    branchId: "visual-other-branch",
  },
  {
    ...employee,
    id: "visual-3",
    employeeNumber: "TEST003",
    name: "Casey Reyes",
    status: "RESIGNED" as const,
  },
];
const avatar = (record: WorkspaceEmployee) => (
  <span className={styles.avatar} aria-hidden="true">
    {record.name.slice(0, 2).toUpperCase()}
  </span>
);
const status = (record: WorkspaceEmployee) => (
  <span className={styles.statusPill}>{record.status}</span>
);

describe("employee directory presentation", () => {
  it("summarizes only the supplied authorized records and distinguishes statuses", () => {
    const html = renderToStaticMarkup(
      <EmployeeDirectorySummary employees={rows} />,
    );
    expect(html).toContain("Records within your access");
    expect(html).toMatch(/Employees<\/span><strong>3<\/strong>/);
    expect(html).toMatch(/Active employees<\/span><strong>1<\/strong>/);
    expect(html).toMatch(/Inactive employees<\/span><strong>1<\/strong>/);
    expect(html).toMatch(/Branches represented<\/span><strong>2<\/strong>/);
  });
  it("does not show invented zero counts while loading", () => {
    const html = renderToStaticMarkup(
      <EmployeeDirectorySummary employees={[]} loading />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<strong>0</strong>");
  });
  it("keeps profile links, row actions and a keyboard-accessible named scroll region", () => {
    const html = renderToStaticMarkup(
      <EmployeeDirectoryTable
        employees={[{ ...employee, id: "employee/1" }]}
        renderAvatar={avatar}
        renderStatus={status}
      />,
    );
    expect(html).toContain('href="/employees/employee%2F1"');
    expect(html).toContain('aria-label="Open Alex Santos profile"');
    expect(html).toContain('aria-label="Employee directory table"');
    expect(html).toContain('tabindex="0"');
    expect(html.match(/scope="col"/g)).toHaveLength(6);
  });
  it("escapes employee text and renders no extra private fields from passed objects", () => {
    const privateEmployee = {
      ...employee,
      name: "<script>alert(1)</script>",
      salary: 123456789,
    };
    const html = renderToStaticMarkup(
      <EmployeeDirectoryTable
        employees={[privateEmployee]}
        renderAvatar={avatar}
        renderStatus={status}
      />,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("123456789");
  });
  it("matches the six-column directory with silent structural placeholders", () => {
    const html = renderToStaticMarkup(<EmployeeDirectoryTableSkeleton />);
    expect(html).toContain('aria-label="Loading employee directory"');
    expect(html).toContain('aria-hidden="true"');
    expect(html.match(/<th>/g)).toHaveLength(6);
  });
  it("can render isolated visual fixtures from the actual employee components", () => {
    if (process.env.EMPLOYEE_VISUAL_FIXTURE !== "true") return;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(["employee-hr-profile", employee.id], null);
    client.setQueryData(["employee-document-records", employee.id], []);
    const content = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DialogProvider>
          <main
            className={`${theme.scope} ${styles.page} ${styles.employeeWorkspace} ${styles.employeeFilePage}`}
          >
            <header className={styles.pageHeader}>
              <div>
                <p className={styles.employeeEyebrow}>
                  PEOPLE / EMPLOYEE DIRECTORY
                </p>
                <h1>Employee directory</h1>
                <p className={styles.description}>
                  Visual test fixture · artificial records only
                </p>
              </div>
            </header>
            <section id="directory">
              <EmployeeDirectorySummary employees={rows} />
              <section className={styles.panel}>
                <div className={styles.tableToolbar}>
                  <label className={styles.searchBox}>
                    <span className={styles.screenReaderOnly}>
                      Search employees
                    </span>
                    <input placeholder="Search name, ID, department" />
                  </label>
                  <label className={styles.filterLabel}>
                    Branch
                    <select>
                      <option>All branches</option>
                    </select>
                  </label>
                  <label className={styles.filterLabel}>
                    Status
                    <select>
                      <option>All statuses</option>
                    </select>
                  </label>
                  <button className={styles.primaryButton}>
                    Create employee
                  </button>
                </div>
                <EmployeeDirectoryTable
                  employees={rows}
                  renderAvatar={avatar}
                  renderStatus={status}
                />
              </section>
            </section>
            <section id="profile">
              <section className={styles.profileHero}>
                <span className={styles.profileAvatar}>AS</span>
                <div className={styles.profileIdentity}>
                  <p>TEST001 · Test branch</p>
                  <h2>Alex Santos</h2>
                  <span>Operations associate · Operations</span>
                </div>
                <span className={styles.statusPill}>Active</span>
              </section>
              <div className={styles.sectionSwitcherLayout}>
                <nav
                  className={styles.sectionSwitcherNav}
                  aria-label="Employee file sections"
                >
                  {[
                    "Employment & HR Profile",
                    "Work schedule",
                    "Emergency contact",
                    "Documents",
                    "Assignment history",
                  ].map((label, i) => (
                    <button
                      className={styles.sectionSwitcherButton}
                      type="button"
                      key={label}
                      aria-pressed={i === 0}
                    >
                      {label}
                    </button>
                  ))}
                </nav>
                <div className={styles.sectionSwitcherContent}>
                  <section className={styles.panel}>
                    <EmployeeHrProfileCard
                      embedded
                      employee={employee}
                      employeeId={employee.id}
                      role="SUPER_ADMIN"
                      onNotice={() => {}}
                    />
                  </section>
                </div>
              </div>
            </section>
            <section id="documents">
              <EmployeeDocumentsSection
                employee={employee}
                role="SUPER_ADMIN"
                canManageDocuments
                onNotice={() => {}}
              />
            </section>
            <section id="editor" className={styles.panel}>
              <EmployeeHrProfileCard
                editorMode
                employee={employee}
                employeeId={employee.id}
                role="SUPER_ADMIN"
                onNotice={() => {}}
              />
            </section>
          </main>
        </DialogProvider>
      </QueryClientProvider>,
    );
    const css = (path: string, mapping: Record<string, string>) =>
      readFileSync(resolve(path), "utf8")
        .replace(/:global\(([^)]+)\)/g, "$1")
        .replace(/\.([a-zA-Z_][\w-]*)/g, (match, key: string) =>
          mapping[key] ? `.${mapping[key]}` : match,
        );
    const sheet =
      css("app/components/ui/workspace-theme.module.css", theme) +
      css("app/components/people-workspace.module.css", styles) +
      css("app/components/employee-hr-profile-card.module.css", hrStyles) +
      css(
        "app/components/employee-documents-section.module.css",
        documentStyles,
      );
    const output = resolve("../../tmp/employee-visual");
    mkdirSync(output, { recursive: true });
    writeFileSync(
      resolve(output, "index.html"),
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7f9;font-family:Arial,sans-serif}button,input,select,textarea{font-family:inherit}section[id]{scroll-margin-top:20px} #directory,#profile{display:grid;gap:20px}${sheet}</style></head><body>${content}</body></html>`,
    );
    expect(content).toContain("Employee directory");
  });
});

describe("shared work branches in directory", () => {
  it("shows both assignments in one employee row", () => {
    const html = renderToStaticMarkup(<EmployeeDirectoryTable employees={[{ ...employee, workBranches: [{ id: "makati", name: "Makati" }, { id: "ortigas", name: "Ortigas" }] }]} renderAvatar={avatar} renderStatus={record => record.status} />);
    expect(html).toContain("Makati, Ortigas");
    expect(html.match(/Open Alex Santos profile/g)).toHaveLength(1);
  });
});
