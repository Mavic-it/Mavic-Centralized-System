import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AccountAccessSummary,
  AccountAccessTable,
  AccountTableSkeleton,
} from "./account-access-presentation";
import { BranchTable } from "../branches/components/branch-table";
import { BranchToolbar } from "../branches/components/branch-toolbar";
import { BranchDetailPanel } from "../branches/components/branch-detail-panel";
import { BranchDeleteDialog } from "../branches/components/branch-delete-dialog";
import { DialogProvider } from "./ui/confirmation-provider";
import { BranchesLoading, PeopleWorkspaceLoading } from "./page-loading";
import type { WorkspaceAccount } from "../data/people";
import type { Branch } from "../branches/branch-types";
import styles from "./people-workspace.module.css";
import branchStyles from "../branches/workspace.module.css";
import theme from "./ui/workspace-theme.module.css";

const accounts: WorkspaceAccount[] = [
  "ACTIVE",
  "INACTIVE",
  "PENDING",
  "ARCHIVED",
].map((status, i) => ({
  id: `test-${i}`,
  name: "Test account",
  email: "test@example.test",
  role: "EMPLOYEE",
  branch: "Test branch",
  status: status as WorkspaceAccount["status"],
  mfa: "NOT_CONFIGURED",
  activeSessions: 999,
  lastSignIn: "Unknown",
}));
const branch: Branch = {
  id: "visual-branch",
  name: "Test branch",
  code: "TEST",
  address: "Test address",
  city: "Test city",
  province: null,
  postalCode: null,
  phone: null,
  email: "branch@example.test",
  description: "Artificial fixture only",
  managerName: "Test manager",
  managerUserId: null,
  status: "ACTIVE",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  latitude: null,
  longitude: null,
  employeeCount: 2,
  roomCount: 0,
  reservationCount: 0,
  inquiryCount: 0,
  inventoryItemCount: 0,
};
const noop = () => {};
const tableProps = {
  items: [branch],
  canDelete: false,
  page: 1,
  totalPages: 1,
  isLoading: false,
  isError: false,
  isFetching: false,
  statusPendingBranchId: null,
  onRetry: noop,
  onView: noop,
  onEdit: noop,
  onDelete: noop,
  onToggleStatus: noop,
  onPageChange: noop,
};

describe("administration presentation", () => {
  it("counts only provided account records without unsupported session statistics", () => {
    const html = renderToStaticMarkup(
      <AccountAccessSummary accounts={accounts} />,
    );
    expect(html).toMatch(/Current accounts<\/span><strong>3/);
    expect(html).toMatch(/Active accounts<\/span><strong>1/);
    expect(html).toMatch(/Inactive &amp; pending<\/span><strong>2/);
    expect(html).toMatch(/Archived accounts<\/span><strong>1/);
    expect(html).not.toContain("999");
    expect(html).not.toContain("sessions");
  });
  it("uses loading placeholders rather than invented zero totals", () => {
    const html = renderToStaticMarkup(
      <AccountAccessSummary accounts={[]} loading />,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<strong>0");
    const table = renderToStaticMarkup(<AccountTableSkeleton />);
    expect(table).toContain('aria-label="Loading user accounts"');
    expect(table.match(/<th>/g)).toHaveLength(4);
  });
  it("provides a named keyboard scroll region and preserves account action slots", () => {
    const html = renderToStaticMarkup(
      <AccountAccessTable>
        <tbody>
          <tr>
            <td colSpan={4}>
              <button>Reset password for Test account</button>
            </td>
          </tr>
        </tbody>
      </AccountAccessTable>,
    );
    expect(html).toContain('aria-label="User accounts table"');
    expect(html).toContain('tabindex="0"');
    expect(html.match(/scope="col"/g)).toHaveLength(4);
    expect(html).toContain("Reset password for Test account");
  });
  it("keeps compact branch table actions and page boundaries", () => {
    const restricted = renderToStaticMarkup(
      <BranchTable {...tableProps} statusPendingBranchId={branch.id} />,
    );
    expect(restricted).toContain('aria-label="Manage branch for Test branch"');
    expect(restricted).not.toContain('aria-label="Delete Test branch"');
    expect(restricted.match(/disabled=""/g)).toHaveLength(2);
    const permitted = renderToStaticMarkup(
      <BranchTable {...tableProps} canDelete />,
    );
    expect(permitted).toContain('aria-label="Manage branch for Test branch"');
    expect(permitted).toContain('aria-label="Branches table"');
    expect(permitted.match(/scope="col"/g)).toHaveLength(5);
  });
  it("keeps branch card actions and loading state", () => {
    const restricted = renderToStaticMarkup(
      <BranchTable
        {...tableProps}
        view="cards"
        statusPendingBranchId={branch.id}
      />,
    );
    expect(restricted).toContain('aria-label="Branch cards"');
    expect(restricted).toContain('aria-label="View Test branch"');
    expect(restricted).not.toContain('aria-label="Delete Test branch"');
    expect(restricted).toContain('aria-label="Manage branch for Test branch"');
    const permitted = renderToStaticMarkup(
      <BranchTable {...tableProps} view="cards" canDelete />,
    );
    expect(permitted).toContain('aria-label="Manage branch for Test branch"');
    const loading = renderToStaticMarkup(
      <BranchTable {...tableProps} view="cards" items={[]} isLoading />,
    );
    expect(loading).toContain('aria-label="Loading branches"');
    expect(loading).not.toContain("No branches match");
  });
  it("distinguishes branch errors/loading/empty and labels filtered result totals", () => {
    const failed = renderToStaticMarkup(
      <BranchTable {...tableProps} items={[]} isError />,
    );
    expect(failed).toContain('role="alert"');
    expect(failed).toContain("Unable to load branches.");
    expect(failed).not.toContain("No branches match");
    const loading = renderToStaticMarkup(
      <BranchTable {...tableProps} items={[]} isLoading />,
    );
    expect(loading).toContain("Loading branches");
    expect(loading).not.toContain("No branches match");
    const filtered = renderToStaticMarkup(
      <BranchToolbar
        search="test"
        status="ALL"
        branchesCount={1}
        isFetching={false}
        onSearchChange={noop}
        onStatusChange={noop}
        onClearFilters={noop}
      />,
    );
    expect(filtered).toContain("1 matching branches");
    expect(filtered).toContain("Clear filters");
  });
  it("retains branch deletion password reconfirmation and pending dismissal guards", () => {
    const html = renderToStaticMarkup(
      <BranchDeleteDialog
        branchName="Test branch"
        password=""
        isPending
        onPasswordChange={noop}
        onClose={noop}
        onSubmit={noop}
      />,
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('required=""');
    expect(html).toContain("other linked records cannot be deleted");
    expect(html.match(/disabled=""/g)).toHaveLength(3);
  });
  it("renders isolated artificial fixtures for responsive review", () => {
    if (process.env.ADMIN_VISUAL_FIXTURE !== "true") return;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(
      ["branches", branch.id, "departments"],
      [
        {
          id: "test-department",
          branchId: branch.id,
          name: "Test department",
          createdAt: "2026-01-01",
        },
      ],
    );
    const content = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DialogProvider>
          <section
            id="accounts"
            className={`${theme.scope} ${styles.page} ${styles.employeeWorkspace} ${styles.userWorkspace}`}
          >
            <header className={styles.pageHeader}>
              <div>
                <p className={styles.employeeEyebrow}>
                  ADMINISTRATION / USER ACCESS
                </p>
                <h1>User access</h1>
                <p>Artificial visual fixtures only</p>
              </div>
            </header>
            <AccountAccessSummary accounts={accounts} />
            <section className={styles.panel}>
              <div className={styles.tableToolbar}>
                <div className={styles.filterTabs}>
                  <button className={styles.filterTabActive} aria-pressed>
                    Current accounts
                  </button>
                  <button className={styles.filterTab}>
                    Archived accounts
                  </button>
                </div>
                <label className={styles.searchBox}>
                  <input
                    aria-label="Search accounts"
                    placeholder="Search name or email"
                  />
                </label>
                <label className={styles.filterLabel}>
                  Role
                  <select>
                    <option>All roles</option>
                  </select>
                </label>
                <button className={styles.primaryButton}>Create account</button>
              </div>
              <AccountAccessTable>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td>
                        <strong className={styles.cellPrimary}>
                          {account.name}
                        </strong>
                        <small className={styles.cellSecondary}>
                          {account.email} · Last sign-in: Unknown
                        </small>
                      </td>
                      <td>
                        <strong className={styles.cellPrimary}>Employee</strong>
                        <small className={styles.cellSecondary}>
                          {account.branch}
                        </small>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusPill} ${styles[`status-${account.status.toLowerCase()}`]}`}
                        >
                          {account.status}
                        </span>
                      </td>
                      <td>
                        <div className={styles.accountActions}>
                          <button aria-label="Edit role">Edit</button>
                          <button aria-label="Reset password">Reset</button>
                          <button aria-label="Deactivate account">
                            Deactivate
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AccountAccessTable>
            </section>
          </section>
          <section
            id="branches"
            className={`branch-page ${theme.scope} ${branchStyles.scope}`}
          >
            <header className="branch-heading">
              <div>
                <p className={branchStyles.eyebrow}>ORGANIZATION / BRANCHES</p>
                <h1>Branches</h1>
                <p className="page-description">
                  Manage branch locations and operating status.
                </p>
              </div>
              <button className="branch-primary">Add branch</button>
            </header>
            <div className="branch-list">
              <BranchToolbar
                search=""
                status="ALL"
                branchesCount={1}
                isFetching={false}
                onSearchChange={noop}
                onStatusChange={noop}
              />
              <BranchTable {...tableProps} canDelete />
            </div>
          </section>
          <section
            id="details"
            className={`branch-page ${theme.scope} ${branchStyles.scope}`}
          >
            <BranchDetailPanel branch={branch} onEdit={noop} />
          </section>
          <section id="loading">
            <PeopleWorkspaceLoading variant="users" />
            <BranchesLoading />
          </section>
          <section
            id="delete"
            className={`branch-page ${theme.scope} ${branchStyles.scope}`}
          >
            <BranchDeleteDialog
              branchName="Test branch"
              password=""
              isPending={false}
              onPasswordChange={noop}
              onClose={noop}
              onSubmit={noop}
            />
          </section>
        </DialogProvider>
      </QueryClientProvider>,
    );
    const css = (path: string, mapping: Record<string, string>) => {
      const globals: string[] = [];
      return readFileSync(resolve(path), "utf8")
        .replace(
          /:global\(([^)]+)\)/g,
          (_, selector: string) =>
            `GLOBAL_SELECTOR_${globals.push(selector) - 1}_END`,
        )
        .replace(/\.([a-zA-Z_][\w-]*)/g, (match, key: string) =>
          mapping[key] ? `.${mapping[key]}` : match,
        )
        .replace(
          /GLOBAL_SELECTOR_(\d+)_END/g,
          (_, index: string) => globals[Number(index)],
        );
    };
    const sheet =
      readFileSync(resolve("app/globals.css"), "utf8").replace(
        /^@import.*$/gm,
        "",
      ) +
      css("app/components/ui/workspace-theme.module.css", theme) +
      css("app/components/people-workspace.module.css", styles) +
      css("app/branches/workspace.module.css", branchStyles);
    const output = resolve("../../tmp/administration-visual");
    mkdirSync(output, { recursive: true });
    writeFileSync(
      resolve(output, "index.html"),
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${sheet}*{box-sizing:border-box}body{margin:0;padding:24px;background:#f5f7f9;font-family:Arial,sans-serif}body>section{margin-bottom:36px}section[id]{scroll-margin-top:20px}button,input,select{font-family:inherit}#delete dialog{position:static;display:block;max-height:none;margin:0 auto}</style></head><body>${content}</body></html>`,
    );
    expect(content).toContain("User access");
  });
});
