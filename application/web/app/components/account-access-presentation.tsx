import { ChevronRight } from "lucide-react";
import directory from "./admin-directory.module.css";
import type { WorkspaceAccount } from "../data/people";
import type { ReactNode } from "react";
import { Skeleton } from "./loading-ui";
import styles from "./people-workspace.module.css";

export function AccountAccessSummary({
  accounts,
  loading = false,
  onSelect,
  activeFilter,
}: {
  accounts: WorkspaceAccount[];
  loading?: boolean;
  onSelect?: (filter: "CURRENT" | "ACTIVE" | "REVIEW" | "ARCHIVED") => void;
  activeFilter?: "CURRENT" | "ACTIVE" | "REVIEW" | "ARCHIVED";
}) {
  const metrics = [
    [
      "Current accounts",
      accounts.filter((a) => a.status !== "ARCHIVED").length,
      "Within your authorized access",
    ],
    [
      "Active accounts",
      accounts.filter((a) => a.status === "ACTIVE").length,
      "Enabled accounts",
    ],
    [
      "Inactive & pending",
      accounts.filter((a) => a.status === "INACTIVE" || a.status === "PENDING")
        .length,
      "Review account status",
    ],
    [
      "Archived accounts",
      accounts.filter((a) => a.status === "ARCHIVED").length,
      "Retained account records",
    ],
  ] as const;
  return (
    <section
      className={styles.employeeSummary}
      aria-label="Account access summary"
      aria-busy={loading}
    >
      {metrics.map(([label, value, detail], index) => {
        const filter = (["CURRENT", "ACTIVE", "REVIEW", "ARCHIVED"] as const)[
          index
        ];
        const content = (
          <>
            <span>{label}</span>
            {loading ? (
              <Skeleton className={styles.employeeSkeletonValue} />
            ) : (
              <strong>{value}</strong>
            )}
            <small>
              {detail}
              {onSelect && <ChevronRight size={14} aria-hidden="true" />}
            </small>
          </>
        );
        return onSelect ? (
          <button
            type="button"
            disabled={loading}
            className={`${styles.employeeSummaryCard} ${directory.summaryButton}`}
            key={label}
            aria-pressed={activeFilter === filter}
            onClick={() => onSelect(filter)}
          >
            {content}
          </button>
        ) : (
          <article className={styles.employeeSummaryCard} key={label}>
            {content}
          </article>
        );
      })}
    </section>
  );
}

export function AccountTableSkeleton() {
  return (
    <div
      className={styles.tableWrap}
      role="status"
      aria-label="Loading user accounts"
      aria-busy="true"
    >
      <table className={styles.dataTable} aria-hidden="true">
        <thead>
          <tr>
            {["Account", "Role & branch", "Status", "Account action"].map(
              (label) => (
                <th key={label}>{label}</th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: 4 }, (_, col) => (
                <td key={col}>
                  <Skeleton className={styles.employeeSkeletonLine} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountAccessTable({ children }: { children: ReactNode }) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="User accounts table"
      tabIndex={0}
    >
      <table className={styles.dataTable}>
        <caption className={styles.screenReaderOnly}>
          Accounts within your authorized access, filtered by account view,
          search and role.
        </caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Role &amp; branch</th>
            <th scope="col">Status</th>
            <th scope="col" className={styles.accountActionHeader}>
              Account action
            </th>
          </tr>
        </thead>
        {children}
      </table>
    </div>
  );
}
