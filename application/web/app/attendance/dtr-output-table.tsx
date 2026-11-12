"use client";

import { useMemo, useState } from "react";
import { displayTime, type RecordRow } from "./dtr-client";
import styles from "./dtr.module.css";

export function DtrOutputTable({
  rows,
  onReview,
  preview = false,
  compact = false,
}: {
  rows: RecordRow[];
  onReview?: (row: RecordRow) => void;
  preview?: boolean;
  compact?: boolean;
}) {
  const [page, setPage] = useState(1);
  const groups = useMemo(() => {
    const grouped = new Map<string, RecordRow[]>();
    for (const row of rows)
      grouped.set(row.employeeId, [
        ...(grouped.get(row.employeeId) ?? []),
        row,
      ]);
    return [...grouped.values()]
      .map((group) =>
        [...group].sort((a, b) => a.workDate.localeCompare(b.workDate)),
      )
      .sort((a, b) =>
        a[0].employeeName.localeCompare(b[0].employeeName, undefined, {
          sensitivity: "base",
        }),
      );
  }, [rows]);
  const maxPage = Math.max(1, groups.length);
  const current = Math.min(page, maxPage);
  const formatWorkDate = (workDate: string) => {
    const date = new Date(`${workDate}T00:00:00Z`);
    return new Intl.DateTimeFormat("en-GB", {
      ...(preview ? { weekday: "short" as const } : {}),
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  };
  return (
    <>
      <div
        className={`${styles.scroll} ${preview ? styles.previewScroll : ""}`}
        role="region"
        aria-label={
          preview ? "Calculated import output" : "Attendance ledger table"
        }
        tabIndex={0}
      >
        <table
          className={`${styles.table} ${styles.outputTable}`}
          data-compact={compact || undefined}
        >
          <caption>
            {preview
              ? "Calculation preview — nothing saved yet. "
              : "Saved attendance. "}
            OT, late and early out/undertime are minutes. Totals exclude rows
            needing review.
          </caption>
          {compact ? (
            <thead>
              <tr>
                <th scope="col">Employee</th>
                <th scope="col">Date</th>
                <th scope="col">IN</th>
                <th scope="col">OUT</th>
                <th scope="col">Schedule</th>
                <th scope="col">Late</th>
                <th scope="col">Early out</th>
                <th scope="col">Absent</th>
                <th scope="col">Potential OT</th>
                <th scope="col">Status</th>
                {onReview && <th scope="col">Action</th>}
              </tr>
            </thead>
          ) : (
            <thead>
              <tr>
                <th rowSpan={2} scope="col">
                  Name
                </th>
                <th rowSpan={2} scope="col">
                  Date
                </th>
                <th colSpan={2} scope="colgroup">
                  Actual
                </th>
                <th colSpan={2} scope="colgroup">
                  Employee schedule
                </th>
                <th rowSpan={2} scope="col">
                  Potential OT
                  <br />
                  (min)
                </th>
                <th rowSpan={2} scope="col">
                  Approved OT
                  <br />
                  (min)
                </th>
                <th rowSpan={2} scope="col">
                  Late
                  <br />
                  (min)
                </th>
                <th rowSpan={2} scope="col">
                  Early out / UT
                  <br />
                  (min)
                </th>
                <th rowSpan={2} scope="col">
                  Absent
                  <br />
                  (days)
                </th>
                <th rowSpan={2} scope="col">
                  Rest day /<br />
                  Special holiday
                </th>
                <th rowSpan={2} scope="col">
                  Holiday
                </th>
                <th rowSpan={2} scope="col">
                  Remarks / where
                </th>
                <th rowSpan={2} scope="col">
                  Status / notes
                </th>
                {onReview && (
                  <th rowSpan={2} scope="col">
                    Review
                  </th>
                )}
              </tr>
              <tr>
                <th scope="col">IN</th>
                <th scope="col">OUT</th>
                <th scope="col">IN</th>
                <th scope="col">OUT</th>
              </tr>
            </thead>
          )}
          {groups.slice(current - 1, current).map((group) => {
            const ready = group.filter(
              (row) => row.data.calculation.payrollReady,
            );
            const total = (
              key:
                | "potentialOtMinutes"
                | "approvedOtMinutes"
                | "lateMinutes"
                | "undertimeMinutes"
                | "absent",
            ) => ready.reduce((sum, row) => sum + row.data.calculation[key], 0);
            return (
              <tbody key={group[0].employeeId}>
                {group.map((row) => {
                  const c = row.data.calculation;
                  const actual = (value: string | null) =>
                    value
                      ? displayTime(value, c.timeZone)
                      : c.restDay
                        ? "RD"
                        : "Missing";
                  if (compact)
                    return (
                      <tr key={row.id} className={styles.compactRecordRow}>
                        <th scope="row">
                          <strong>{row.employeeName}</strong>
                          <small>{row.branchName}</small>
                        </th>
                        <td>{formatWorkDate(row.workDate)}</td>
                        <td>{actual(c.actualIn)}</td>
                        <td>{actual(c.actualOut)}</td>
                        <td>
                          {c.restDay
                            ? "RD"
                            : c.schedule
                              ? `${c.schedule.shiftStart}–${c.schedule.shiftEnd}`
                              : "Missing"}
                        </td>
                        <td data-alert={c.lateMinutes > 0 || undefined}>
                          {c.lateMinutes}
                        </td>
                        <td data-alert={c.undertimeMinutes > 0 || undefined}>
                          {c.undertimeMinutes}
                        </td>
                        <td>{c.absent}</td>
                        <td>{c.potentialOtMinutes}</td>
                        <td>
                          <div className={styles.recordStatus}>
                            <span
                              className={styles.statusPill}
                              data-warning={!c.payrollReady}
                            >
                              {c.payrollReady ? "Ready" : "Review"}
                            </span>
                            <small>
                              {c.statuses.length
                                ? c.statuses.join(", ")
                                : "No exceptions"}
                            </small>
                            <details className={styles.recordDetails}>
                              <summary>Details</summary>
                              <div className={styles.recordDetailPanel}>
                                <span>
                                  <strong>Worked</strong>
                                  {Math.floor(c.workedMinutes / 60)}h{" "}
                                  {c.workedMinutes % 60}m
                                </span>
                                {!!c.officialBusiness?.length&&<span><strong>OB / office punches / attested office</strong>{c.obCreditedMinutes??0} / {c.actualWorkedMinutes??0} / {c.attestedOfficeMinutes??0} min (overlap counted once)</span>}
                                <span>
                                  <strong>Approved OT</strong>
                                  {c.approvedOtMinutes} min
                                </span>
                                <span>
                                  <strong>Holiday / rest day</strong>
                                  {c.restDay
                                    ? "Rest day"
                                    : (c.holiday ?? "None")}
                                </span>
                                {c.remarks && (
                                  <span>
                                    <strong>Remarks</strong>
                                    {c.remarks}
                                  </span>
                                )}
                                {c.exceptions.map((exception) => (
                                  <span
                                    className={styles.recordException}
                                    key={exception}
                                  >
                                    {exception}
                                  </span>
                                ))}
                              </div>
                            </details>
                          </div>
                        </td>
                        {onReview && (
                          <td>
                            <button
                              type="button"
                              className={`${styles.button} ${styles.recordAction}`}
                              aria-label={`Review attendance for ${row.employeeName} on ${row.workDate}`}
                              onClick={() => onReview(row)}
                            >
                              Review
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  return (
                    <tr key={row.id}>
                      <th scope="row">
                        <strong>{row.employeeName}</strong>
                        <small>{row.branchName}</small>
                      </th>
                      <td>{formatWorkDate(row.workDate)}</td>
                      <td>{actual(c.actualIn)}</td>
                      <td>{actual(c.actualOut)}</td>
                      <td>
                        {c.restDay
                          ? "RD"
                          : (c.schedule?.shiftStart ?? "Missing")}
                      </td>
                      <td>
                        {c.restDay ? "RD" : (c.schedule?.shiftEnd ?? "Missing")}
                      </td>
                      <td>{c.potentialOtMinutes}</td>
                      <td>{c.approvedOtMinutes}</td>
                      <td>{c.lateMinutes}</td>
                      <td>{c.undertimeMinutes}</td>
                      <td>{c.absent}</td>
                      <td>
                        {c.restDay
                          ? "RD"
                          : c.holiday === "Special Non-working Day"
                            ? c.holiday
                            : "—"}
                      </td>
                      <td>{c.holiday ?? "—"}</td>
                      <td>{c.remarks || "-"}</td>
                      <td>
                        <span
                          className={styles.statusPill}
                          data-warning={!c.payrollReady}
                        >
                          {c.statuses.join(", ")}
                        </span>
                        <small>
                          {preview
                            ? "Preview"
                            : `${row.data.approval} · v${row.data.revision}`}
                        </small>
                        {c.exceptions.length > 0 && (
                          <div className={styles.error}>
                            {c.exceptions.join("; ")}
                          </div>
                        )}
                      </td>
                      {onReview && (
                        <td>
                          <button
                            type="button"
                            className={styles.button}
                            aria-label={`DTR review for ${row.employeeName} on ${row.workDate}`}
                            onClick={() => onReview(row)}
                          >
                            {preview ? "Change day / remarks" : "Review / edit"}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className={styles.outputTotal}>
                  {compact ? (
                    <>
                      <th scope="row" colSpan={5}>
                        {group[0].employeeName} · TOTAL ({group.length} days)
                      </th>
                      <td>{total("lateMinutes")}</td>
                      <td>{total("undertimeMinutes")}</td>
                      <td>{total("absent")}</td>
                      <td>{total("potentialOtMinutes")}</td>
                      <td colSpan={onReview ? 2 : 1}>
                        {group.length - ready.length} days need review
                      </td>
                    </>
                  ) : (
                    <>
                      <th scope="row" colSpan={6}>
                        {group[0].employeeName} · TOTAL ({group.length} days)
                      </th>
                      <td>{total("potentialOtMinutes")}</td>
                      <td>{total("approvedOtMinutes")}</td>
                      <td>{total("lateMinutes")}</td>
                      <td>{total("undertimeMinutes")}</td>
                      <td>{total("absent")}</td>
                      <td colSpan={onReview ? 5 : 4}>
                        {group.length - ready.length} days need review
                      </td>
                    </>
                  )}
                </tr>
              </tbody>
            );
          })}
        </table>
      </div>
      {groups.length > 1 && (
        <div className={styles.header}>
          <button
            type="button"
            className={styles.button}
            disabled={current <= 1}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </button>
          <span aria-live="polite">
            {groups[current - 1]?.[0]?.employeeName} · employee {current} of{" "}
            {maxPage}
          </span>
          <button
            type="button"
            className={styles.button}
            disabled={current >= maxPage}
            onClick={() => setPage(current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
