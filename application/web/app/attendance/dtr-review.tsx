"use client";
import { RequiredMark } from "../components/required-mark";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Modal } from "../components/ui/modal";
import {
  dtrRequest,
  jsonBody,
  type Override,
  type RecordRow,
} from "./dtr-client";
import styles from "./dtr.module.css";
import theme from "../components/ui/workspace-theme.module.css";
export function DtrReview({
  row,
  onClose,
  onSaved,
}: {
  row: RecordRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = row.data.calculation;
  const [actualIn, setIn] = useState(c.actualIn?.slice(0, 16) ?? ""),
    [actualOut, setOut] = useState(c.actualOut?.slice(0, 16) ?? "");
  const [shiftStart, setStart] = useState(c.schedule?.shiftStart ?? ""),
    [shiftEnd, setEnd] = useState(c.schedule?.shiftEnd ?? "");
  const [arrangement, setArrangement] = useState<Override["arrangement"]>(
      row.data.override.arrangement ?? "NORMAL",
    ),
    [remarks, setRemarks] = useState(c.remarks),
    [noOt, setNoOt] = useState(row.data.override.noOt ?? false),
    [approvedOt, setOt] = useState(String(c.approvedOtMinutes)),
    [reason, setReason] = useState(""),
    [resolved, setResolved] = useState<string[]>(
      row.data.override.resolvedExceptions ?? [],
    );
  const detail = useQuery({
    queryKey: ["dtr-detail", row.id, row.data.revision],
    queryFn: () =>
      dtrRequest<{ audit: unknown[] }>(
        `records/${encodeURIComponent(row.id)}?branchId=${encodeURIComponent(row.branchId)}`,
      ),
  });
  const save = useMutation({
    mutationFn: () =>
      dtrRequest(
        `records/${encodeURIComponent(row.id)}`,
        jsonBody(
          {
            branchId: row.branchId,
            revision: row.data.revision,
            reason,
            override: {
              ...(actualIn !== (c.actualIn?.slice(0, 16) ?? "")
                ? { actualIn: actualIn ? `${actualIn}:00.000Z` : null }
                : {}),
              ...(actualOut !== (c.actualOut?.slice(0, 16) ?? "")
                ? { actualOut: actualOut ? `${actualOut}:00.000Z` : null }
                : {}),
              ...(shiftStart &&
              shiftEnd &&
              (shiftStart !== c.schedule?.shiftStart ||
                shiftEnd !== c.schedule?.shiftEnd)
                ? { shiftStart, shiftEnd }
                : {}),
              arrangement,
              remarks,
              noOt,
              approvedOtMinutes: Number(approvedOt),
              resolvedExceptions: resolved,
            },
          },
          "PATCH",
        ),
      ),
    onSuccess: () => {
      onSaved();
      onClose();
    },
  });
  const resolvable = [
    "Suspicious punch sequence",
    "Missing OUT",
    "Repeated IN/OUT: incomplete punch",
    "Imported shift differs from approved schedule",
    "Source status disagrees with calculated attendance",
  ];
  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate();
  }
  return (
    <Modal
      className={`${theme.scope} ${styles.modal}`}
      aria-labelledby="dtr-review-title"
      busy={save.isPending}
      onClose={onClose}
    >
      <div className={styles.card}>
        <div className={styles.header}>
          <h2 id="dtr-review-title">
            {row.employeeName} · {row.workDate}
          </h2>
          <button
            className={styles.button}
            onClick={onClose}
            disabled={save.isPending}
          >
            Close
          </button>
        </div>
        <p className={styles.notice}>
          Actual timestamps below use UTC explicitly. Branch display timezone:{" "}
          {c.timeZone}. Corrections require a reason and return the row to
          draft. Free-text remarks do not grant paid time.
        </p>
        {!!c.officialBusiness?.length&&<div className={styles.notice}><strong>Approved Official Business: {c.obCreditedMinutes??0} credited minutes.</strong>{c.officialBusiness.map(ob=><p key={ob.id}>{ob.destination} / {ob.id}</p>)}<p>Original punches stay separate. Cancel the OB request through its review workflow to remove this credit.</p></div>}
        <form onSubmit={submit}>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Actual IN · UTC</span>
              <input
                type="datetime-local"
                value={actualIn}
                onChange={(e) => setIn(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Actual OUT · UTC</span>
              <input
                type="datetime-local"
                value={actualOut}
                onChange={(e) => setOut(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Approved shift IN · branch local</span>
              <input
                type="time"
                value={shiftStart}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Approved shift OUT · branch local</span>
              <input
                type="time"
                value={shiftEnd}
                onChange={(e) => setEnd(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>
                Authorized arrangement
                <RequiredMark />
              </span>
              <select
                required
                value={arrangement}
                onChange={(e) =>
                  setArrangement(e.target.value as Override["arrangement"])
                }
              >
                <option value="NORMAL">Normal</option>
                <option value="WFH">Work From Home (WFH)</option>
                <option value="OB">Official Business (OB)</option>
                <option value="RD">Rest day (RD)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Approved OT · minutes (maximum potential {c.potentialOtMinutes})
                <RequiredMark />
              </span>
              <input
                type="number"
                min="0"
                max="2160"
                value={approvedOt}
                onChange={(e) => setOt(e.target.value)}
                required
              />
            </label>
          </div>
          <label>
            <input
              type="checkbox"
              checked={noOt}
              onChange={(e) => setNoOt(e.target.checked)}
            />{" "}
            No OT
          </label>
          <label className={styles.field}>
            <span>Remarks / custom note</span>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              maxLength={1000}
            />
          </label>
          {c.exceptions
            .filter((e) => resolvable.includes(e))
            .map((e) => (
              <label key={e} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={resolved.includes(e)}
                  onChange={(event) =>
                    setResolved(
                      event.target.checked
                        ? [...resolved, e]
                        : resolved.filter((v) => v !== e),
                    )
                  }
                />{" "}
                I reviewed and reconciled: {e}
              </label>
            ))}
          <label className={styles.field}>
            <span>
              Correction / approval reason
              <RequiredMark />
            </span>
            <textarea
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {save.error && (
            <p role="alert" className={styles.error}>
              {save.error.message}
            </p>
          )}
          <button
            className={`${styles.button} ${styles.primary}`}
            disabled={save.isPending || reason.trim().length < 3}
          >
            {save.isPending ? "Saving…" : "Save audited correction"}
          </button>
        </form>
        <details>
          <summary>Original punches / source status / reconciliation</summary>
          <pre className={styles.audit}>
            {JSON.stringify(
              {
                source: row.data.source,
                sourceStatus: c.sourceStatus,
                decisions: c.decisions,
              },
              null,
              2,
            )}
          </pre>
        </details>
        <details>
          <summary>Audit trail</summary>
          {detail.isPending ? (
            <p role="status">Loading audit…</p>
          ) : detail.error ? (
            <p role="alert">{detail.error.message}</p>
          ) : (
            <pre className={styles.audit}>
              {JSON.stringify(detail.data?.audit, null, 2)}
            </pre>
          )}
        </details>
      </div>
    </Modal>
  );
}
