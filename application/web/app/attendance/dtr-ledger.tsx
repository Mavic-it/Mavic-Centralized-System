"use client";
import { useMemo, useState } from "react";
import { ArrowUpDown, Search, X } from "lucide-react";
import { type Ledger, type RecordRow } from "./dtr-client";
import styles from "./dtr.module.css";
import { DtrOutputTable } from "./dtr-output-table";

export function DtrLedger({
  ledger,
  onReview,
  canManage,
  summaryOnly = false,
}: {
  ledger: Ledger;
  onReview: (row: RecordRow) => void;
  canManage: boolean;
  summaryOnly?: boolean;
}) {
  const [search, setSearch] = useState(""),
    [exceptionsOnly, setExceptionsOnly] = useState(false),
    [sort, setSort] = useState("employee");
  const rows = useMemo(
    () =>
      ledger.rows
        .filter(
          (r) =>
            (!exceptionsOnly || !r.data.calculation.payrollReady) &&
            `${r.employeeName} ${r.workDate} ${r.data.calculation.statuses.join(" ")}`
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "date"
            ? a.workDate.localeCompare(b.workDate) ||
              a.employeeName.localeCompare(b.employeeName)
            : sort === "late"
              ? b.data.calculation.lateMinutes - a.data.calculation.lateMinutes
              : a.employeeName.localeCompare(b.employeeName) ||
                a.workDate.localeCompare(b.workDate),
        ),
    [ledger.rows, search, exceptionsOnly, sort],
  );
  const groups = useMemo(
    () =>
      [
        ...new Map(
          ledger.rows.map((r) => [r.employeeId, r.employeeName]),
        ).entries(),
      ].map(([id, name]) => {
        const records = ledger.rows.filter((r) => r.employeeId === id);
        const ready = records.filter((r) => r.data.calculation.payrollReady);
        const sum = (
          field:
            | "lateMinutes"
            | "undertimeMinutes"
            | "potentialOtMinutes"
            | "approvedOtMinutes"
            | "absent",
        ) => ready.reduce((s, r) => s + r.data.calculation[field], 0);
        return {
          id,
          name,
          days: records.length,
          late: sum("lateMinutes"),
          ut: sum("undertimeMinutes"),
          ot: sum("potentialOtMinutes"),
          approved: sum("approvedOtMinutes"),
          absent: sum("absent"),
          excluded: records.length - ready.length,
        };
      }),
    [ledger.rows],
  );
  const labels: Record<string, string> = {
    employees: "Employees",
    employeeDays: "Employee-days",
    presentDays: "Present days",
    absenceDays: "Absence days",
    lateOccurrences: "Late occurrences",
    lateMinutes: "Late · minutes",
    undertimeMinutes: "Undertime · minutes",
    potentialOtMinutes: "Potential OT · minutes",
    approvedOtMinutes: "Approved OT · minutes",
    missingPunchDays: "Missing punch days",
    exceptionDays: "Needs review",
    unmatchedSourceRows: "Unmatched source rows",
  };
  const primaryMetrics = new Set([
    "employees",
    "presentDays",
    "absenceDays",
    "exceptionDays",
  ]);
  const metric = (key: string, label: string) =>
    key === "exceptionDays" && !summaryOnly ? (
      <button
        type="button"
        key={key}
        className={`${styles.metric} ${styles.reviewMetric}`}
        aria-pressed={exceptionsOnly}
        data-tone={(ledger.summary[key] ?? 0) > 0 ? "warning" : undefined}
        onClick={() => {
          setExceptionsOnly(!exceptionsOnly);
        }}
      >
        <span>{label}</span>
        <strong>{ledger.summary[key] ?? 0}</strong>
        <small>{exceptionsOnly ? "Show all records" : "Filter records"}</small>
      </button>
    ) : (
      <div
        className={styles.metric}
        key={key}
        data-tone={
          key === "exceptionDays" && (ledger.summary[key] ?? 0) > 0
            ? "warning"
            : key === "presentDays"
              ? "success"
              : undefined
        }
      >
        <span>{label}</span>
        <strong>{ledger.summary[key] ?? 0}</strong>
      </div>
    );
  return (
    <div className={styles.workspace}>
      <section className={styles.summaryPanel} aria-label="Attendance summary">
        <div className={styles.primaryMetrics}>
          {Object.entries(labels)
            .filter(([key]) => primaryMetrics.has(key))
            .map(([key, label]) => metric(key, label))}
        </div>
        <details className={styles.statsDetails}>
          <summary>More metrics & calculation basis</summary>
          <div className={styles.metrics}>
            {Object.entries(labels)
              .filter(([key]) => !primaryMetrics.has(key))
              .map(([key, label]) => metric(key, label))}
          </div>
          <p className={styles.calculationBasis}>
            Potential OT is separate from approved OT. Unresolved employee-days
            are excluded from minute/absence totals. Only imported employee-days
            are represented.
          </p>
        </details>
      </section>
      {(ledger.summary.excludedDays ?? 0) > 0 && (
        <p className={styles.notice} role="status">
          {ledger.summary.excludedDays} unresolved employee-days excluded from
          minute/absence totals. Review these records before approving the
          period.
        </p>
      )}
      {summaryOnly ? (
        <section className={styles.card}>
          <h3>Employee totals / export preview</h3>
          <div
            className={styles.scroll}
            role="region"
            aria-label="Employee DTR totals"
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption>
                Totals come from saved attendance records. Overtime, late arrival
                and early departure are shown in whole minutes.
              </caption>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Days</th>
                  <th>Potential OT</th>
                  <th>Approved OT</th>
                  <th>Late</th>
                  <th>Undertime</th>
                  <th>Absent days</th>
                  <th>Excluded days</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id}>
                    <th>{g.name} · TOTAL</th>
                    <td>{g.days}</td>
                    <td>{g.ot}</td>
                    <td>{g.approved}</td>
                    <td>{g.late}</td>
                    <td>{g.ut}</td>
                    <td>{g.absent}</td>
                    <td>{g.excluded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.recordsHeader}>
            <div>
              <h3>Attendance records</h3>
              <p>Saved daily attendance and schedule results.</p>
            </div>
            <span className={styles.recordsCount} aria-live="polite">
              {rows.length} <span>of {ledger.rows.length} records</span>
            </span>
          </div>
          <div className={styles.recordsToolbar}>
            <div className={styles.recordsSearch}>
              <Search size={16} aria-hidden="true" />
              <input
                value={search}
                aria-label="Search employee, date or status"
                placeholder="Search records"
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
              />
              {search && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                >
                  <X size={15} />
                </button>
              )}
            </div>
            <div
              className={styles.recordFilters}
              role="group"
              aria-label="Filter attendance records"
            >
              <button
                type="button"
                aria-pressed={!exceptionsOnly}
                onClick={() => setExceptionsOnly(false)}
              >
                All <span>{ledger.rows.length}</span>
              </button>
              <button
                type="button"
                aria-pressed={exceptionsOnly}
                onClick={() => setExceptionsOnly(true)}
              >
                Needs review <span>{ledger.summary.exceptionDays ?? 0}</span>
              </button>
            </div>
            <label className={styles.recordSort}>
              <ArrowUpDown size={14} aria-hidden="true" />
              <span className={styles.screenReaderOnly}>Sort records</span>
              <select
                value={sort}
                aria-label="Sort attendance records"
                onChange={(e) => {
                  setSort(e.target.value);
                }}
              >
                <option value="employee">Employee, then date</option>
                <option value="date">Date</option>
                <option value="late">Late minutes descending</option>
              </select>
            </label>
          </div>
          {rows.length ? (
            <DtrOutputTable
              key={`${search}:${exceptionsOnly}:${sort}`}
              rows={rows}
              onReview={canManage ? onReview : undefined}
              compact
            />
          ) : (
            <div className={styles.empty}>
              <strong>
                {ledger.rows.length
                  ? "No matching records"
                  : "No attendance in this period"}
              </strong>
              <span>
                {ledger.rows.length
                  ? "Try a different search or clear the exception filter."
                  : canManage
                    ? "Choose a saved cutoff or import attendance to get started."
                    : "Choose another date range to view attendance."}
              </span>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
