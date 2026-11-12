"use client";
import { RequiredMark } from "../components/required-mark";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmation } from "../components/ui/confirmation-provider";
import { DtrImport } from "./dtr-import";
import { DtrLedger } from "./dtr-ledger";
import { DtrSettings } from "./dtr-settings";
import { DtrReview } from "./dtr-review";
import {
  dtrRequest,
  jsonBody,
  type Configuration,
  type History,
  type Ledger,
  type RecordRow,
} from "./dtr-client";
import styles from "./dtr.module.css";
import { DtrLoading } from "./dtr-loading";
import {
  RefreshCw,
  ListChecks,
  Upload,
  Download,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { IconActionButton } from "../components/icon-action-button";
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function DtrWorkspace({
  branchId,
  canManage,
  active = true,
  initialFrom,
  initialTo,
}: {
  branchId: string;
  canManage: boolean;
  active?: boolean;
  initialFrom?: string;
  initialTo?: string;
}) {
  const client = useQueryClient(),
    confirm = useConfirmation();
  const [tab, setTab] = useState("ledger"),
    [from, setFrom] = useState(initialFrom ?? today),
    [to, setTo] = useState(initialTo ?? today),
    [employeeId, setEmployee] = useState(""),
    [review, setReview] = useState<RecordRow | null>(null),
    [reason, setReason] = useState(""),
    [periodAction, setPeriodAction] = useState("SAVE"),
    [exportFormat, setExportFormat] = useState("xlsx");
  const params = new URLSearchParams({
    branchId,
    from,
    to,
    ...(employeeId ? { employeeId } : {}),
  });
  const config = useQuery({
    queryKey: ["dtr-configuration", branchId],
    queryFn: () =>
      dtrRequest<Configuration>(
        `configuration?branchId=${encodeURIComponent(branchId)}`,
      ),
    enabled: Boolean(branchId) && canManage && active,
  });
  const ledger = useQuery({
    queryKey: ["dtr-ledger", branchId, from, to, employeeId],
    queryFn: () => dtrRequest<Ledger>(`ledger?${params}`),
    enabled: Boolean(branchId) && Boolean(from) && Boolean(to) && active,
  });
  const history = useQuery({
    queryKey: ["dtr-history", branchId],
    queryFn: () =>
      dtrRequest<History>(`history?branchId=${encodeURIComponent(branchId)}`),
    enabled: Boolean(branchId) && canManage && active,
  });
  function refresh() {
    void client.invalidateQueries({
      predicate: (q) =>
        String(q.queryKey[0]).startsWith("dtr-") ||
        String(q.queryKey[0]).startsWith("attendance-"),
    });
  }
  const period = useMutation({
    mutationFn: async (action: string) => {
      if (
        action === "REOPEN" &&
        !(await confirm({
          title: "Reopen attendance period?",
          description:
            "Approval will be invalidated. Earlier exports remain in history; notify payroll if a prior export was already used.",
          confirmLabel: "Reopen period",
          tone: "danger",
        }))
      )
        return null;
      return dtrRequest(
        "period",
        jsonBody({ branchId, from, to, action, reason }),
      );
    },
    onSuccess: refresh,
  });
  const download = useMutation({
    mutationFn: async (format: string) => {
      if (
        !(await confirm({
          title: "Export and lock period?",
          description:
            "This export uses the saved approved ledger and locks the complete branch period. Changes will require a reasoned reopening.",
          confirmLabel: "Export and lock",
        }))
      )
        return;
      const response = await fetch("/api/attendance/dtr/export", {
        ...jsonBody({
          branchId,
          from,
          to,
          ...(employeeId ? { employeeId } : {}),
          format: format === "summary" ? "csv" : format,
          report: format === "summary" ? "SUMMARY" : "DTR",
        }),
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message ?? "Export failed.");
      }
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] ??
        `DTR_${from}_to_${to}.${format}`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onSuccess: refresh,
  });
  if (!branchId)
    return (
      <p className={styles.notice}>
        Select an authorized branch to open Attendance & DTR.
      </p>
    );
  return (
    <div className={styles.workspace}>
      <section
        className={`${styles.card} ${styles.workflowToolbar}`}
        aria-label="Attendance workflow and filters"
      >
        <div className={styles.workflowHeader}>
          <nav className={styles.workflowNav} aria-label="DTR workflow">
            {[
              { id: "ledger", label: "Records", icon: ListChecks },
              ...(canManage
                ? [{ id: "import", label: "Import", icon: Upload }]
                : []),
              {
                id: "summary",
                label: canManage ? "Summary & export" : "Summary",
                icon: Download,
              },
            ].map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </nav>
          <div className={styles.workflowTools}>
            {canManage && (
              <details
                className={styles.toolsMenu}
                onBlur={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget))
                    event.currentTarget.removeAttribute("open");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.currentTarget.removeAttribute("open");
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
              >
                <summary data-active={tab === "settings" || tab === "history"}>
                  <SlidersHorizontal size={15} aria-hidden="true" />
                  {tab === "settings"
                    ? "Calculation settings"
                    : tab === "history"
                      ? "Import history"
                      : "Tools"}
                  <ChevronDown size={13} aria-hidden="true" />
                </summary>
                <div className={styles.toolsOptions}>
                  {[
                    ["settings", "Calculation settings"],
                    ["history", "Import / export history"],
                  ].map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      aria-pressed={tab === id}
                      onClick={(event) => {
                        setTab(id);
                        const menu = event.currentTarget.closest("details");
                        menu?.removeAttribute("open");
                        menu?.querySelector("summary")?.focus();
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </details>
            )}
            <IconActionButton
              icon={RefreshCw}
              label="Refresh attendance data"
              disabled={
                ledger.isFetching || config.isFetching || history.isFetching
              }
              onClick={refresh}
            />
          </div>
        </div>
        {(tab === "ledger" || tab === "summary") && (
          <div className={styles.periodFilters}>
            {canManage && (
              <label className={styles.field}>
                <span>Saved period</span>
                <select
                  value={
                    history.data?.periods.find(
                      (p) => p.from === from && p.to === to,
                    )?.id ?? ""
                  }
                  onChange={(e) => {
                    const selected = history.data?.periods.find(
                      (p) => p.id === e.target.value,
                    );
                    if (selected) {
                      setFrom(selected.from);
                      setTo(selected.to);
                    }
                  }}
                >
                  <option value="">Custom date range</option>
                  {history.data?.periods.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.from} – {p.to} · {p.state}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={styles.field}>
              <span>From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            {canManage && (
              <label className={styles.field}>
                <span>Employee</span>
                <select
                  value={employeeId}
                  onChange={(e) => setEmployee(e.target.value)}
                >
                  <option value="">All branch employees</option>
                  {config.data?.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
      </section>
      {config.error && (
        <p className={styles.error} role="alert">
          {config.error.message}
        </p>
      )}
      {canManage &&
        tab === "import" &&
        (config.data ? (
          <DtrImport
            key={branchId}
            branchId={branchId}
            configuration={config.data}
            onSaved={(cutoff) => {
              if (cutoff) {
                setFrom(cutoff.from);
                setTo(cutoff.to);
              }
              setEmployee("");
              setTab("ledger");
              refresh();
            }}
          />
        ) : config.isPending ? (
          <DtrLoading kind="import" />
        ) : null)}
      {(tab === "ledger" || tab === "summary") &&
        (ledger.isPending ? (
          <DtrLoading />
        ) : ledger.error ? (
          <p className={styles.error} role="alert">
            {ledger.error.message}{" "}
            <button
              className={styles.button}
              onClick={() => void ledger.refetch()}
            >
              Try again
            </button>
          </p>
        ) : ledger.data ? (
          <DtrLedger
            ledger={ledger.data}
            onReview={setReview}
            canManage={canManage}
            summaryOnly={tab === "summary"}
          />
        ) : null)}
      {tab === "summary" && canManage && (
        <section className={styles.card}>
          <div className={styles.reviewExportGrid}>
            <div className={styles.actionGroup}>
              <h3>Review period</h3>
              <p className={styles.muted}>
                Actions apply to the full branch period. Resolve exceptions
                before approval.
              </p>
              <label className={styles.field}>
                <span>Period action</span>
                <select
                  value={periodAction}
                  onChange={(e) => setPeriodAction(e.target.value)}
                >
                  <option value="SAVE">Save cutoff</option>
                  <option value="RECALCULATE">Recalculate inputs</option>
                  <option value="APPROVE">Approve period</option>
                  <option value="REOPEN">Reopen period</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>
                  Reason
                  <RequiredMark />
                </span>
                <input
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  placeholder="Explain this period action"
                />
              </label>
              <button
                className={styles.button}
                disabled={
                  reason.trim().length < 3 ||
                  period.isPending ||
                  download.isPending
                }
                onClick={() => period.mutate(periodAction)}
              >
                {period.isPending ? "Applying..." : "Apply period action"}
              </button>
            </div>
            <div className={styles.actionGroup}>
              <h3>Export approved records</h3>
              <p className={styles.muted}>
                Uses the saved approved ledger and locks the full period. The
                selected employee filter is retained.
              </p>
              <label className={styles.field}>
                <span>Export format</span>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                >
                  <option value="xlsx">Formatted DTR - Excel (.xlsx)</option>
                  <option value="csv">DTR records - CSV</option>
                  <option value="summary">Employee summary - CSV</option>
                </select>
              </label>
              <button
                className={`${styles.button} ${styles.primary}`}
                disabled={download.isPending || period.isPending}
                onClick={() => download.mutate(exportFormat)}
              >
                <Download size={15} aria-hidden="true" />
                {download.isPending ? "Exporting..." : "Export and lock"}
              </button>
            </div>
          </div>
          {period.error && (
            <p role="alert" className={styles.error}>
              {period.error.message}
            </p>
          )}
          {download.error && (
            <p role="alert" className={styles.error}>
              {download.error.message}
            </p>
          )}
          {period.isSuccess && period.data !== null && (
            <p role="status">Period action completed.</p>
          )}
        </section>
      )}
      {canManage && tab === "settings" && config.data && (
        <DtrSettings
          key={JSON.stringify(config.data.settings)}
          branchId={branchId}
          configuration={config.data}
          onSaved={refresh}
        />
      )}
      {canManage && tab === "history" && (
        <section className={styles.card}>
          <h3>Stored import history</h3>
          {history.isPending ? (
            <p role="status">Loading history…</p>
          ) : history.error ? (
            <p role="alert" className={styles.error}>
              {history.error.message}
            </p>
          ) : (
            <>
              <div className={styles.scroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>File</th>
                      <th>Status</th>
                      <th>Coverage</th>
                      <th>Source rows</th>
                      <th>Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data?.batches.map((b) => (
                      <tr key={b.id}>
                        <td>{b.filename}</td>
                        <td>{b.status}</td>
                        <td>
                          {b.dates[0]} – {b.dates.at(-1)}
                        </td>
                        <td>{b.sourceCount}</td>
                        <td>{new Date(b.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3>Period states</h3>
              {history.data?.periods.map((p) => (
                <p key={p.id}>
                  {p.from} – {p.to} · {p.state} · revision {p.revision}
                </p>
              ))}
              <h3>Export history</h3>
              {history.data?.exports.map((e) => (
                <p key={e.id}>
                  {e.format.toUpperCase()} · revision {e.revision} · actor{" "}
                  {e.generatedBy} · {new Date(e.generatedAt).toLocaleString()}
                </p>
              ))}
              {!history.data?.batches.length && (
                <p>No stored imports for this branch.</p>
              )}
            </>
          )}
        </section>
      )}
      {review && (
        <DtrReview
          key={review.id}
          row={review}
          onClose={() => setReview(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
