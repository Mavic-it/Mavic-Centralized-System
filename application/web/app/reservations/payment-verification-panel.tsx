"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Modal } from "../components/ui/modal";
import { reservationRequest, qs } from "./types";
import {
  paymentDate,
  paymentMoney,
  type PaymentQueueRow,
  type PaymentDetail,
  type PaymentCapabilities,
} from "./payment-types";
import s from "./payments.module.css";
const label = (value: string) => value.replaceAll("_", " ");
const checks = [
  "Correct official receiving account",
  "Actual funds received in the company account",
  "Correct amount received",
  "Matching transaction reference",
  "Correct transaction date",
  "Transaction not allocated to another reservation",
];
export function PaymentVerificationPanel({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<PaymentQueueRow[]>([]),
    [caps, setCaps] = useState<PaymentCapabilities | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [status, setStatus] = useState("AWAITING_VERIFICATION"),
    [method, setMethod] = useState(""),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1);
  const [detail, setDetail] = useState<PaymentDetail | null>(null),
    [action, setAction] = useState(""),
    [checked, setChecked] = useState<boolean[]>(checks.map(() => false));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [data, access] = await Promise.all([
        reservationRequest<PaymentQueueRow[]>(
          `/payment-verifications${qs({ branchId, status, method, search: query, page, from: from ? `${from}T00:00:00+08:00` : undefined, to: to ? `${to}T23:59:59.999+08:00` : undefined })}`,
        ),
        reservationRequest<PaymentCapabilities>(
          "/payment-verifications/access",
        ),
      ]);
      setRows(data);
      setCaps(access);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load payment queue.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId, status, method, query, page, from, to]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [load]);
  async function open(id: string) {
    setBusy(true);
    setError("");
    try {
      setDetail(
        await reservationRequest<PaymentDetail>(`/payment-verifications/${id}`),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load submission.");
    } finally {
      setBusy(false);
    }
  }
  async function decide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!detail) return;
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await reservationRequest(
        `/payment-verifications/${detail.id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            notes: String(data.get("notes")),
            refundReference:
              action === "confirm-refund"
                ? String(data.get("refundReference"))
                : undefined,
            verifiedAmount:
              action === "verify" ? Number(data.get("amount")) : undefined,
            independentlyChecked: ["verify", "confirm-refund"].includes(action)
              ? checked.every(Boolean)
              : undefined,
          }),
        },
      );
      setMessage(`Payment decision saved: ${action}.`);
      setAction("");
      await open(detail.id);
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to save payment decision.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <h2>Payment Verification</h2>
          <p>
            Check the actual Bank / GCash transaction history before verifying a
            payment.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => void load()}
        >
          Refresh queue
        </button>
      </div>
      <form
        className={s.filters}
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search);
          setPage(1);
        }}
      >
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {[
              "AWAITING_VERIFICATION",
              "VERIFIED",
              "REJECTED",
              "RESUBMISSION_REQUESTED",
              "REFUNDED",
            ].map((v) => (
              <option key={v} value={v}>
                {label(v)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Method
          <select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All methods</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="GCASH">GCash</option>
          </select>
        </label>
        <label>
          Submitted from
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Submitted through
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          Customer / reservation
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={200}
          />
        </label>
        <button>Search</button>
      </form>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Refreshing payment submissions…</p>}
      <p>
        {status === "AWAITING_VERIFICATION"
          ? "Awaiting verification"
          : "Matching payments"}
        : <strong>{rows[0]?.total ?? 0}</strong>
      </p>
      <div className={s.tableWrap}>
        <table>
          <thead>
            <tr>
              {[
                "Reservation",
                "Customer",
                "Branch / space",
                "Booking date",
                "Method",
                "Amount due",
                "Submitted",
                "Transaction reference",
                "Submitted at",
                "Status",
                "Actions",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.reference}</td>
                <td>{row.customerName}</td>
                <td>
                  {row.branchName}
                  <br />
                  {row.spaceName}
                </td>
                <td>{paymentDate(row.startAt)}</td>
                <td>{label(row.paymentMethod)}</td>
                <td>{paymentMoney(row.totalAmount)}</td>
                <td>{paymentMoney(row.submittedAmount)}</td>
                <td>{row.transactionReference}</td>
                <td>{paymentDate(row.submittedAt)}</td>
                <td>
                  <span className={s.badge}>{label(row.status)}</span>
                  {row.needsReconciliation && (
                    <p className={s.error}>Hold expired — reconcile funds</p>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void open(row.id)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !rows.length && <p>No matching payment submissions.</p>}
      <div className={s.actions}>
        <button
          type="button"
          disabled={page === 1 || loading}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          type="button"
          disabled={rows.length < 50 || loading}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
      {detail && (
        <Modal
          aria-labelledby="payment-review-title"
          className={s.dialog}
          onClose={() => {
            setDetail(null);
            setAction("");
          }}
          busy={busy}
        >
          <div className={s.heading}>
            <h2 id="payment-review-title">
              Payment review · {detail.reference}
            </h2>
            <button
              type="button"
              disabled={busy}
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
          <div className={s.grid}>
            <section>
              <h3>Reservation</h3>
              <p>
                {detail.customerName}
                <br />
                {detail.customerEmail}
                <br />
                {detail.customerPhone}
              </p>
              <p>
                {detail.branchName} · {detail.spaceName}
                <br />
                {paymentDate(detail.startAt)} – {paymentDate(detail.endAt)}
              </p>
              <p>
                Total due: <strong>{paymentMoney(detail.totalAmount)}</strong>
                <br />
                Booking: {detail.reservationStatus}
              </p>
              <Link
                href={`/reservations/list?record=${encodeURIComponent(detail.reservationId)}`}
              >
                View reservation
              </Link>
            </section>
            <section>
              <h3>Submitted transaction</h3>
              <p>
                {label(detail.paymentMethod)} · {detail.account.bankName}
                <br />
                {detail.account.accountName}
                <br />
                {detail.account.accountNumber}
              </p>
              <p>
                Reference: {detail.transactionReference}
                <br />
                Submitted amount: {paymentMoney(detail.submittedAmount)}
                <br />
                Payment date: {paymentDate(detail.paymentDateTime)}
                <br />
                Submitted: {paymentDate(detail.submittedAt)}
              </p>
              <p>{detail.notes}</p>
            </section>
          </div>
          <h3>Private proof of payment</h3>
          <p>
            A screenshot is supporting evidence. Independently check actual
            funds received.
          </p>
          <a
            href={`/api/reservations/payment-verifications/${detail.id}/proof`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open private proof
          </a>
          <iframe
            className={s.proof}
            title="Private payment proof preview"
            sandbox="allow-same-origin"
            src={`/api/reservations/payment-verifications/${detail.id}/proof`}
          />
          {(detail.needsReconciliation || detail.expiredAt || detail.reservationStatus === "CANCELLED") && (
            <p className={s.error}>
              This booking has expired or was cancelled. Verifying received
              money records it for reconciliation; it will not restore or
              confirm the booking. Arrange any refund separately and record it
              only after independent confirmation.
            </p>
          )}
          <h3>Verification history</h3>
          {detail.history.map((h, i) => (
            <p key={i}>
              {paymentDate(h.createdAt)} ·{" "}
              {h.performedBy ?? "Customer / System"} · {label(h.action)}
              <br />
              {h.notes}
            </p>
          ))}
          {detail.rejectionReason && (
            <p className={s.error}>{detail.rejectionReason}</p>
          )}
          {caps?.canEdit && detail.status === "AWAITING_VERIFICATION" && (
            <div className={s.actions}>
              {[
                ["verify", "Verify payment"],
                ["reject", "Reject payment"],
                ["request-resubmission", "Request resubmission"],
              ].map(([value, text]) => (
                <button
                  type="button"
                  key={value}
                  disabled={busy}
                  onClick={() => {
                    setChecked(checks.map(() => false));
                    setAction(value);
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          )}
          {caps?.canEdit &&
            detail.status === "VERIFIED" &&
            ["CANCELLED", "REJECTED"].includes(detail.reservationStatus) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setChecked(checks.map(() => false));
                  setAction("confirm-refund");
                }}
              >
                Record independently confirmed refund
              </button>
            )}
          {!caps?.canEdit && (
            <p>
              View-only access. An authorized payment reviewer must record the
              decision.
            </p>
          )}
        </Modal>
      )}
      {action && detail && (
        <Modal
          aria-labelledby="payment-decision-title"
          onClose={() => setAction("")}
          busy={busy}
          presentation="center"
          className={s.dialog}
        >
          <form onSubmit={decide}>
            <h2 id="payment-decision-title">{label(action)} payment</h2>
            {["verify", "confirm-refund"].includes(action) && (
              <>
                <p>
                  Check the actual company Bank / GCash transaction history
                  outside this application. These checkboxes do not prove funds
                  were received.
                </p>
                {(action === "confirm-refund"
                  ? [
                      "Correct customer refund destination",
                      "Actual refund completed in company records",
                      "Full verified transaction amount refunded",
                      "Matching refund transaction reference",
                      "Correct refund transaction date",
                      "Refund not previously recorded",
                    ]
                  : checks
                ).map((text, i) => (
                  <label className={s.check} key={text}>
                    <input
                      type="checkbox"
                      required
                      checked={checked[i]}
                      disabled={busy}
                      onChange={(e) =>
                        setChecked((values) =>
                          values.map((v, index) =>
                            index === i ? e.target.checked : v,
                          ),
                        )
                      }
                    />
                    {text}
                  </label>
                ))}
                {action === "confirm-refund" ? (
                  <label>
                    Refund transaction reference{" "}
                    <span className={s.required}>*</span>
                    <input
                      name="refundReference"
                      required
                      minLength={3}
                      maxLength={120}
                      disabled={busy}
                    />
                  </label>
                ) : (
                  <label>
                    Amount independently received (PHP){" "}
                    <span className={s.required}>*</span>
                    <input
                      type="number"
                      name="amount"
                      required
                      min="0.01"
                      step="0.01"
                      defaultValue={detail.submittedAmount}
                      disabled={busy}
                    />
                  </label>
                )}
              </>
            )}
            <label>
              {action === "verify"
                ? "Verification notes"
                : "Reason / instructions for customer"}{" "}
              <span className={s.required}>*</span>
              <textarea
                name="notes"
                required
                minLength={3}
                maxLength={2000}
                rows={4}
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setAction("")}
              >
                Back
              </button>
              <button
                disabled={
                  busy ||
                  (["verify", "confirm-refund"].includes(action) &&
                    !checked.every(Boolean))
                }
              >
                {busy ? "Saving…" : "Confirm decision"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
