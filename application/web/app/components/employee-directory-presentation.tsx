import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { WorkspaceEmployee } from "../data/people";
import { Skeleton } from "./loading-ui";
import { employmentTypeLabel } from "./employee-employment-options";
import styles from "./people-workspace.module.css";

export function EmployeeDirectorySummary({
  employees,
  loading = false,
}: {
  employees: WorkspaceEmployee[];
  loading?: boolean;
}) {
  const metrics = [
    ["Employees", employees.length, "Records within your access"],
    [
      "Active employees",
      employees.filter((e) => e.status === "ACTIVE").length,
      "Currently active",
    ],
    [
      "Inactive employees",
      employees.filter((e) => e.status === "INACTIVE").length,
      "Currently inactive",
    ],
    [
      "Branches represented",
      new Set(employees.flatMap(e => e.workBranches?.map(branch => branch.id) ?? e.workBranchIds ?? [e.branchId || e.branch]).filter(Boolean))
        .size,
      "Across accessible records",
    ],
  ] as const;
  return (
    <section
      className={styles.employeeSummary}
      aria-label="Employee directory summary"
      aria-busy={loading}
    >
      {metrics.map(([label, value, description]) => (
        <article className={styles.employeeSummaryCard} key={label}>
          <span>{label}</span>
          {loading ? (
            <Skeleton className={styles.employeeSkeletonValue} />
          ) : (
            <strong>{value}</strong>
          )}
          <small>{description}</small>
        </article>
      ))}
    </section>
  );
}

export function EmployeeDirectoryTable({
  employees,
  renderAvatar,
  renderStatus,
}: {
  employees: WorkspaceEmployee[];
  renderAvatar: (employee: WorkspaceEmployee) => ReactNode;
  renderStatus: (employee: WorkspaceEmployee) => ReactNode;
}) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Employee directory table"
      tabIndex={0}
    >
      <table className={styles.dataTable}>
        <caption className={styles.screenReaderOnly}>
          Employees within your authorized access, filtered by the selected
          search, branch, department, employment and status.
        </caption>
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Role &amp; department</th>
            <th scope="col">Work branches</th>
            <th scope="col">Employment</th>
            <th scope="col">Status</th>
            <th scope="col">
              <span className={styles.screenReaderOnly}>Open profile</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => {
            const href = `/employees/${encodeURIComponent(employee.id)}`;
            return (
              <tr key={employee.id}>
                <td>
                  <Link className={styles.personLink} href={href}>
                    {renderAvatar(employee)}
                    <span>
                      <strong>{employee.name}</strong>
                      <small>
                        {employee.employeeNumber} · {employee.email}
                      </small>
                    </span>
                  </Link>
                </td>
                <td>
                  <strong className={styles.cellPrimary}>
                    {employee.position}
                  </strong>
                  <small className={styles.cellSecondary}>
                    {employee.department}
                  </small>
                </td>
                <td>{employee.allWorkBranches ? "All active branches" : employee.workBranches?.map(branch => branch.name).join(", ") || employee.branch}</td>
                <td>{employmentTypeLabel(employee.employmentType)}</td>
                <td>{renderStatus(employee)}</td>
                <td>
                  <Link
                    className={styles.rowAction}
                    aria-label={`Open ${employee.name} profile`}
                    href={href}
                  >
                    <ChevronRight size={18} aria-hidden="true" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmployeeDirectoryTableSkeleton() {
  return (
    <div
      className={styles.tableWrap}
      role="status"
      aria-label="Loading employee directory"
      aria-busy="true"
    >
      <table className={styles.dataTable} aria-hidden="true">
        <thead>
          <tr>
            {Array.from({ length: 6 }, (_, i) => (
              <th key={i}>
                <Skeleton className={styles.employeeSkeletonLine} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: 6 }, (_, column) => (
                <td key={column}>
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
