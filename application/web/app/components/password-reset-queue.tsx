"use client";

import { PageHeading, PageHeader } from "./page-heading";
import { FieldLabel } from "./field-label";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "next/navigation";
import { Eye, KeyRound, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Modal } from "./ui/modal";
import { useConfirmation } from "./ui/confirmation-provider";
import { IconActionButton } from "./icon-action-button";
import { TablePagination, paginateTableRows } from "./table-pagination";
import { PasswordResetQueueLoading } from "./password-reset-queue-loading";
import styles from "./password-reset-queue.module.css";
import { workspaceRealtime } from "../lib/workspace-realtime";

export type ResetRequest = {
  id: string;
  userId: string;
  accountName: string;
  employeeId: string | null;
  email: string;
  branchName: string | null;
  reason: string | null;
  status: string;
  requestedAt: string;
  identityVerifiedAt: string | null;
  verifiedByName: string | null;
  approvedByName: string | null;
  fulfilledByName: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  fulfilledAt: string | null;
  rejectionReason: string | null;
  emailDispatchStatus: string;
  credentialExpiresAt: string | null;
};

const dateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString() : "Not recorded";
const label = (value: string) =>
  (value === "VERIFIED" ? "PENDING" : value)
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
const openStatuses = ["PENDING", "VERIFIED", "APPROVED"];

export function ResetStatusBadge({ status }: { status: string }) {
  const tone =
    status === "COMPLETED"
      ? styles.success
      : status === "REJECTED"
        ? styles.danger
        : status === "APPROVED" || status === "VERIFIED"
          ? styles.info
          : styles.pending;
  return <span className={`${styles.badge} ${tone}`}>{label(status)}</span>;
}

function PasswordResetQueueContent() {
  const loadGeneration = useRef(0);
  const requestedId = useSearchParams().get("requestId") ?? "";
  const confirm = useConfirmation();
  const [rows, setRows] = useState<ResetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [status, setStatus] = useState(requestedId ? "ALL" : "OPEN");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedId, setSelectedId] = useState(requestedId);
  const [handledTarget, setHandledTarget] = useState(requestedId);
  if (handledTarget !== requestedId) {
    setHandledTarget(requestedId);
    setSelectedId(requestedId);
    if (requestedId) setStatus("ALL");
  }
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      const version = ++loadGeneration.current;
      if (!background) setLoading(true);
      setLoadError("");
      try {
        const response = await fetch(
          `/api/admin/password-reset-requests?status=${encodeURIComponent(status)}`,
          { cache: "no-store", signal },
        );
        const data = (await response.json()) as
          ResetRequest[] | { message?: string };
        if (!response.ok || !Array.isArray(data))
          throw new Error(
            !Array.isArray(data)
              ? (data.message ?? "Could not load requests.")
              : "Could not load requests.",
          );
        if (!signal?.aborted && version === loadGeneration.current)
          setRows(data);
      } catch (reason) {
        if (!signal?.aborted && version === loadGeneration.current)
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Could not load requests.",
          );
      } finally {
        if (!signal?.aborted && version === loadGeneration.current)
          setLoading(false);
      }
    },
    [status],
  );

  useEffect(() => {
    const controller = new AbortController();
    // The async loader owns loading, success and failure state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const unsubscribe = workspaceRealtime.subscribe(
      () => void load(controller.signal, true),
    );
    return () => {
      unsubscribe();
      controller.abort();
    };
  }, [load]);

  const invalidRange = Boolean(fromDate && toDate && fromDate > toDate);
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        const term = search.trim().toLowerCase();
        const requested = new Date(row.requestedAt);
        const date = `${requested.getFullYear()}-${String(requested.getMonth() + 1).padStart(2, "0")}-${String(requested.getDate()).padStart(2, "0")}`;
        return (
          !invalidRange &&
          (!term ||
            `${row.accountName} ${row.email} ${row.branchName ?? ""}`
              .toLowerCase()
              .includes(term)) &&
          (!fromDate || date >= fromDate) &&
          (!toDate || date <= toDate)
        );
      }),
    [rows, search, fromDate, toDate, invalidRange],
  );
  const paginated = paginateTableRows(visibleRows, page);
  const selected = rows.find((row) => row.id === selectedId);
  const counts = [
    visibleRows.length,
    visibleRows.filter((row) => row.status === "PENDING").length,
    visibleRows.filter((row) => row.status === "APPROVED").length,
    visibleRows.filter(
      (row) =>
        row.status === "APPROVED" && row.emailDispatchStatus === "FAILED",
    ).length,
  ];

  function open(row: ResetRequest) {
    setSelectedId(row.id);
    setRejecting(false);
    setRejectReason("");
    setError("");
    setNotice("");
  }
  function clearFilters() {
    setSearch("");
    setFromDate("");
    setToDate("");
    setStatus("OPEN");
    setPage(1);
  }

  async function act(
    row: ResetRequest,
    action: "approve" | "reject" | "issue-temporary-password",
  ) {
    if (busy || loading || loadError) return;
    if (action === "reject" && !rejectReason.trim()) {
      setError("Add a reason before rejecting this request.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const accepted = await confirm({
        title:
          action === "approve"
            ? "Approve password reset?"
            : action === "reject"
              ? "Reject password reset?"
              : "Issue temporary password?",
        description:
          action === "issue-temporary-password"
            ? `Email a 24-hours temporary password to the registered address for ${row.accountName}. Existing sessions will be signed out after the provider accepts the email.`
            : `Confirm this decision for ${row.accountName}'s password reset request.`,
        confirmLabel:
          action === "approve"
            ? "Approve request"
            : action === "reject"
              ? "Reject request"
              : "Generate & email",
        tone: action === "reject" ? "danger" : "default",
      });
      if (!accepted) return;
      const response = await fetch(
        `/api/admin/password-reset-requests/${encodeURIComponent(row.id)}/${action}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          ...(action === "reject"
            ? { body: JSON.stringify({ reason: rejectReason.trim() }) }
            : {}),
        },
      );
      const result = (await response.json()) as {
        message?: string;
        email?: string;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ??
            result.message ??
            "Action could not be completed.",
        );
      setNotice(
        action === "issue-temporary-password"
          ? `Email accepted by the provider for ${result.email}. Inbox delivery is not confirmed.`
          : action === "approve"
            ? "Request approved. A temporary password can now be issued."
            : "Request rejected.",
      );
      setRejecting(false);
      setRejectReason("");
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Action could not be completed.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const feedback = (
    <>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  );

  return (
    <main className={styles.page}>
      {requestedId &&
        !loading &&
        !loadError &&
        !rows.some((row) => row.id === requestedId) && (
          <p role="status">
            This password reset request is unavailable or you no longer have
            access to it.
          </p>
        )}
      <PageHeader className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            SYSTEM ADMINISTRATION / ACCOUNT RECOVERY
          </p>
          <PageHeading>Password reset requests</PageHeading>
          <p>Review account recovery and restore access securely.</p>
        </div>
        <button
          className={styles.secondary}
          disabled={loading || busy}
          onClick={() => void load()}
        >
          <RefreshCw size={16} aria-hidden="true" />
          {loading ? "Refreshing…" : "Refresh requests"}
        </button>
      </PageHeader>
      <div className={styles.securityNote}>
        <ShieldCheck size={18} aria-hidden="true" />
        <span>
          Review the request before approval. Temporary passwords expire after
          one hour.
        </span>
      </div>
      <section
        className={styles.metrics}
        aria-label="Summary of filtered requests"
      >
        {[
          ["Matching requests", "In the current selection"],
          ["Awaiting verification", "Identity check required"],
          ["Ready to issue", "Verified and approved"],
          ["Email failures", "Available for retry"],
        ].map(([title, help], index) => (
          <article key={title}>
            <span>{title}</span>
            <strong>{loading ? "—" : counts[index]}</strong>
            <small>{help}</small>
          </article>
        ))}
      </section>
      <section
        className={styles.panel}
        aria-label="Password reset request queue"
      >
        <div className={styles.panelHeading}>
          <div>
            <h2>Recovery requests</h2>
            <p>Open a request to view its details and review history.</p>
          </div>
          <span className={styles.resultCount}>
            {loading ? "Loading" : `${visibleRows.length} requests`}
          </span>
        </div>
        <div className={styles.filters}>
          <label>
            Status
            <select
              value={status}
              disabled={busy}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
                setSelectedId("");
              }}
            >
              <option value="OPEN">Open requests</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="COMPLETED">Completed</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired credentials</option>
              <option value="ALL">All requests</option>
            </select>
          </label>
          <label className={styles.searchLabel}>
            Search
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Name, request ID, account or branch"
            />
          </label>
          <label>
            From
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <button
            className={styles.clear}
            disabled={busy}
            onClick={clearFilters}
          >
            Reset filters
          </button>
        </div>
        {invalidRange && (
          <p className={styles.error} role="alert">
            The end date must be on or after the start date.
          </p>
        )}
        {!selected && feedback}
        {loadError && (
          <div className={styles.error} role="alert">
            {loadError}{" "}
            <button className={styles.textButton} onClick={() => void load()}>
              Try again
            </button>
          </div>
        )}
        {loading ? (
          <PasswordResetQueueLoading contentOnly />
        ) : loadError ? null : visibleRows.length === 0 ? (
          <div className={styles.empty}>
            <KeyRound size={30} aria-hidden="true" />
            <h3>No requests found</h3>
            <p>No password reset requests match this selection.</p>
            <button className={styles.secondary} onClick={clearFilters}>
              Reset filters
            </button>
          </div>
        ) : (
          <>
            <div
              className={styles.scroll}
              role="region"
              aria-label="Recovery requests"
              tabIndex={0}
            >
              <table className={styles.table}>
                <thead>
                  <tr>
                    {[
                      "Account",
                      "Requested",
                      "Branch",
                      "Status",
                      "Email delivery",
                      "",
                    ].map((heading, i) => (
                      <th key={i} scope="col">
                        {heading || (
                          <span className={styles.srOnly}>Actions</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginated.items.map((row) => (
                    <tr
                      key={row.id}
                      className={
                        selectedId === row.id ? styles.selectedRow : undefined
                      }
                    >
                      <td>
                        <button
                          className={styles.nameButton}
                          onClick={() => open(row)}
                        >
                          {row.accountName}
                        </button>
                        <small>{row.email}</small>
                      </td>
                      <td>{dateTime(row.requestedAt)}</td>
                      <td>{row.branchName ?? "Company-wide"}</td>
                      <td>
                        <ResetStatusBadge status={row.status} />
                      </td>
                      <td>
                        <span
                          className={
                            row.emailDispatchStatus === "FAILED"
                              ? styles.failedText
                              : ""
                          }
                        >
                          {row.emailDispatchStatus === "ACCEPTED_BY_PROVIDER"
                            ? "Provider accepted"
                            : label(row.emailDispatchStatus)}
                        </span>
                      </td>
                      <td>
                        <button
                          className={styles.viewButton}
                          onClick={() => open(row)}
                          aria-label={`View details for ${row.accountName}`}
                        >
                          <Eye size={15} aria-hidden="true" />
                          View details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>
              {paginated.items.map((row) => (
                <article
                  key={row.id}
                  className={
                    selectedId === row.id ? styles.selectedRow : undefined
                  }
                >
                  <div>
                    <button
                      className={styles.nameButton}
                      onClick={() => open(row)}
                    >
                      {row.accountName}
                    </button>
                    <ResetStatusBadge status={row.status} />
                  </div>
                  <p>
                    {row.email} · {row.branchName ?? "Company-wide"}
                  </p>
                  <small>{dateTime(row.requestedAt)}</small>
                  <button
                    className={styles.viewButton}
                    onClick={() => open(row)}
                  >
                    View details
                  </button>
                </article>
              ))}
            </div>
            <TablePagination
              label="password reset requests"
              page={paginated.page}
              totalItems={visibleRows.length}
              onPageChange={setPage}
            />
          </>
        )}
        <p className={styles.footnote}>
          Showing up to 300 requests for the selected status. Search and dates
          filter this selection.
        </p>
      </section>
      {selected && (
        <Modal
          className={styles.drawer}
          aria-labelledby="reset-request-title"
          busy={busy}
          onClose={() => setSelectedId("")}
        >
          <header className={styles.drawerHeader}>
            <div>
              <p className={styles.eyebrow}>PASSWORD RESET REQUEST</p>
              <h2 id="reset-request-title">{selected.accountName}</h2>
            </div>
            <IconActionButton
              icon={X}
              label="Close request details"
              disabled={busy}
              onClick={() => setSelectedId("")}
            />
          </header>
          <div className={styles.drawerBody}>
            <div className={styles.drawerSummary}>
              <ResetStatusBadge status={selected.status} />
              <span>Requested {dateTime(selected.requestedAt)}</span>
            </div>
            {feedback}
            {loadError && (
              <div className={styles.error} role="alert">
                {loadError}{" "}
                <button
                  className={styles.textButton}
                  disabled={busy || loading}
                  onClick={() => void load()}
                >
                  Try again
                </button>
              </div>
            )}
            <section>
              <h3>Account information</h3>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>Registered email</dt>
                  <dd>{selected.email}</dd>
                </div>
                <div>
                  <dt>Branch</dt>
                  <dd>{selected.branchName ?? "Company-wide"}</dd>
                </div>
                <div>
                  <dt>Employee record</dt>
                  <dd>{selected.employeeId ? "Linked" : "No employee link"}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h3>Request message</h3>
              <p className={styles.message}>
                {selected.reason || "No message was provided."}
              </p>
            </section>
            <section>
              <h3>Review history</h3>
              <ol className={styles.timeline}>
                {[
                  {
                    title: "Request submitted",
                    name: selected.accountName,
                    time: selected.requestedAt,
                  },
                  {
                    title: "Request approved",
                    name: selected.approvedByName,
                    time: selected.approvedAt,
                  },
                  {
                    title: "Temporary password issued",
                    name: selected.fulfilledByName,
                    time: selected.fulfilledAt,
                  },
                ].map((stage) => (
                  <li
                    key={stage.title}
                    className={stage.time ? styles.stageComplete : ""}
                  >
                    <strong>{stage.title}</strong>
                    <p>
                      {stage.time
                        ? `${stage.name ?? "Administrator"} · ${dateTime(stage.time)}`
                        : "Not completed"}
                    </p>
                  </li>
                ))}
                {selected.status === "REJECTED" && (
                  <li className={styles.stageRejected}>
                    <strong>Request rejected</strong>
                    <p>{dateTime(selected.reviewedAt)}</p>
                    <p>
                      {selected.rejectionReason ||
                        "No rejection reason recorded."}
                    </p>
                  </li>
                )}
              </ol>
            </section>
            <section>
              <h3>Email & temporary access</h3>
              <dl className={styles.detailGrid}>
                <div>
                  <dt>Email status</dt>
                  <dd>{label(selected.emailDispatchStatus)}</dd>
                </div>
                <div>
                  <dt>Credential expires</dt>
                  <dd>{dateTime(selected.credentialExpiresAt)}</dd>
                </div>
              </dl>
              <p className={styles.deliveryNote}>
                Credentials are sent only to the registered address. Provider
                acceptance does not confirm inbox delivery.
              </p>
              {selected.emailDispatchStatus === "FAILED" && (
                <p className={styles.error}>
                  Email could not be accepted. Retry generates a new temporary
                  password.
                </p>
              )}
            </section>
            {rejecting && (
              <form
                className={styles.rejectForm}
                onSubmit={(event) => {
                  event.preventDefault();
                  void act(selected, "reject");
                }}
              >
                <label htmlFor="reset-rejection-reason">
                  <FieldLabel required={true}>Reason for rejection</FieldLabel>
                </label>
                <textarea
                  id="reset-rejection-reason"
                  autoFocus
                  required
                  maxLength={500}
                  rows={4}
                  value={rejectReason}
                  disabled={busy}
                  onChange={(event) => setRejectReason(event.target.value)}
                  placeholder="Explain why this request cannot be approved."
                />
                <div>
                  <button
                    className={styles.secondary}
                    type="button"
                    disabled={busy}
                    onClick={() => setRejecting(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.primary}
                    disabled={
                      busy ||
                      loading ||
                      Boolean(loadError) ||
                      !rejectReason.trim()
                    }
                  >
                    Confirm rejection
                  </button>
                </div>
              </form>
            )}
          </div>
          <footer className={styles.drawerFooter}>
            <button
              className={styles.secondary}
              disabled={busy}
              onClick={() => setSelectedId("")}
            >
              Close
            </button>
            {!rejecting && (
              <>
                {openStatuses.includes(selected.status) && (
                  <button
                    className={styles.reject}
                    disabled={busy || loading || Boolean(loadError)}
                    onClick={() => {
                      setRejecting(true);
                      setError("");
                    }}
                  >
                    Reject request
                  </button>
                )}
                {["PENDING", "VERIFIED"].includes(selected.status) && (
                  <button
                    className={styles.primary}
                    disabled={busy || loading || Boolean(loadError)}
                    onClick={() => void act(selected, "approve")}
                  >
                    Approve request
                  </button>
                )}
                {selected.status === "APPROVED" && (
                  <button
                    className={styles.primary}
                    disabled={busy || loading || Boolean(loadError)}
                    onClick={() =>
                      void act(selected, "issue-temporary-password")
                    }
                  >
                    {selected.emailDispatchStatus === "FAILED"
                      ? "Retry with new password"
                      : "Generate & email"}
                  </button>
                )}
              </>
            )}
            {busy && <span role="status">Processing…</span>}
          </footer>
        </Modal>
      )}
    </main>
  );
}

export default function PasswordResetQueue() {
  return (
    <Suspense fallback={<PasswordResetQueueLoading />}>
      <PasswordResetQueueContent />
    </Suspense>
  );
}
