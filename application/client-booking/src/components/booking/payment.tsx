"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { copyText } from "@/lib/clipboard";
import { Copy, RefreshCw } from "lucide-react";
import { downloadReceipt } from "@/lib/receipt-pdf";
import { useBooking } from "./provider";
import { dateLabel, time, duration } from "@/lib/date-time";
import {
  money,
  paymentApi,
  fileBase64,
  type PaymentAccess,
  type PaymentAccount,
  type PaymentInfo,
} from "@/lib/payment-api";
import { Field, Steps } from "../ui";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <span className="payment-copy">
      <button
        type="button"
        className="copy-reference"
        aria-label={label}
        onClick={async () => {
          try {
            await copyText(value);
            setMessage("Copied");
          } catch {
            setMessage("Select and copy the value above.");
          }
        }}
      >
        <Copy size={16} />
      </button>
      <small role="status">{message}</small>
    </span>
  );
}
function ReservationSummary({ info }: { info: PaymentInfo }) {
  return (
    <section className="panel">
      <h2>Your reservation</h2>
      <dl className="review-details">
        {[
          ["Reference", info.reference],
          ["Customer", info.customerName],
          ["Branch", info.branchName],
          ["Space", info.spaceName],
          ["Date", dateLabel(info.startAt)],
          [
            "Time",
            `${time(info.startAt)} – ${time(info.endAt)} (Philippine Time)`,
          ],
          ["Duration", `${duration(info.startAt, info.endAt)} hours`],
          ["Reservation status", info.reservationStatus.replaceAll("_", " ")],
          ["Payment status", info.paymentStatus.replaceAll("_", " ")],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="payment-total">
        Total <strong>{money(info.amount)}</strong>
      </p>
      <p>
        Verified payments: {money(info.paidAmount)}
        <br />
        Required to confirm: {money(info.requiredAmount)}
      </p>
    </section>
  );
}
function AccountInstructions({
  account,
  amount,
}: {
  account: PaymentAccount;
  amount: number;
}) {
  return (
    <div className="payment-instructions">
      <h3>{account.paymentMethod === "GCASH" ? "GCash" : account.bankName}</h3>
      <dl className="review-details">
        <div>
          <dt>Account name</dt>
          <dd>{account.accountName}</dd>
        </div>
        <div>
          <dt>
            {account.paymentMethod === "GCASH"
              ? "GCash number"
              : "Account number"}
          </dt>
          <dd>
            {account.accountNumber}{" "}
            <CopyButton
              value={account.accountNumber}
              label="Copy account number"
            />
          </dd>
        </div>
        <div>
          <dt>Amount due</dt>
          <dd>
            {money(amount)}{" "}
            <CopyButton value={amount.toFixed(2)} label="Copy amount" />
          </dd>
        </div>
      </dl>
      {account.qrCodeData && account.qrCodeData.startsWith("data:image/") && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="payment-qr"
          src={account.qrCodeData}
          alt="Official receiving account QR code"
        />
      )}
      {account.instructions && (
        <p className="payment-account-note">{account.instructions}</p>
      )}
    </div>
  );
}
function ProofForm({
  access,
  info,
  account,
  onSubmitted,
}: {
  access: PaymentAccess;
  info: PaymentInfo;
  account: PaymentAccount;
  onSubmitted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      if (!file) throw new Error("Select proof of payment.");
      if (file.size > info.maxProofBytes)
        throw new Error(
          `File must be at most ${info.maxProofBytes / 1024 / 1024} MB.`,
        );
      await paymentApi.submit(access, {
        paymentAccountId: account.id,
        transactionReference: String(data.get("reference")),
        amount: Number(data.get("amount")),
        paymentDateTime: new Date(`${data.get("date")}+08:00`).toISOString(),
        mime: file.type,
        fileName: file.name,
        proofBase64: await fileBase64(file),
        notes: String(data.get("notes") || ""),
      });
      form.reset();
      setFile(null);
      setPreview("");
      await onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to submit proof.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="payment-proof-form">
      <h3>Submit proof of payment</h3>
      <fieldset disabled={busy}>
        <div className="form-grid">
          <Field label="Payment method" required wide>
            <input
              readOnly
              value={`${account.paymentMethod === "GCASH" ? "GCash" : "Bank Transfer"} · ${account.accountName}`}
            />
          </Field>
          <Field label="Transaction reference" required wide>
            <input name="reference" required minLength={3} maxLength={120} />
          </Field>
          <Field label="Amount sent (PHP)" required>
            <input
              name="amount"
              type="number"
              min="0.01"
              step="0.01"
              required
              defaultValue={Math.max(0, info.amount - info.paidAmount).toFixed(
                2,
              )}
            />
          </Field>
          <Field label="Payment date and time (Philippine Time)" required>
            <input name="date" type="datetime-local" required />
          </Field>
          <Field
            label={`Proof of payment (JPG, PNG or PDF, up to ${info.maxProofBytes / 1024 / 1024} MB)`}
            required
            wide
          >
            <input
              name="proof"
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              required
              onChange={(e) => {
                setError("");
                const selected = e.target.files?.[0];
                if (
                  selected &&
                  (!["image/jpeg", "image/png", "application/pdf"].includes(
                    selected.type,
                  ) ||
                    selected.size > info.maxProofBytes)
                ) {
                  setError("Choose a supported file within the size limit.");
                  e.target.value = "";
                  setFile(null);
                  setPreview("");
                } else {
                  setFile(selected ?? null);
                  setPreview(
                    selected?.type.startsWith("image/")
                      ? URL.createObjectURL(selected)
                      : "",
                  );
                }
              }}
            />
          </Field>
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className="payment-preview"
              src={preview}
              alt="Selected payment proof preview"
            />
          )}
          <Field label="Notes" wide>
            <textarea name="notes" maxLength={2000} rows={3} />
          </Field>
        </div>
      </fieldset>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Uploading proof…" : "Submit payment proof"}
      </button>
    </form>
  );
}
export function PaymentWorkspace() {
  const {
    receipt,
    paymentAccess: access,
    rememberPaymentAccess,
  } = useBooking();
  const [info, setInfo] = useState<PaymentInfo | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [selected, setSelected] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const reference = hash.get("reference"),
        token = hash.get("token");
      if (reference && token) {
        rememberPaymentAccess({ reference, token });
        window.history.replaceState(null, "", window.location.pathname);
      } else if (!access) setLoading(false);
    }, 0);
    return () => clearTimeout(timer);
  }, [access, rememberPaymentAccess]);
  const refresh = useCallback(async () => {
    if (!access) return;
    setLoading(true);
    setError("");
    try {
      const data = await paymentApi.load(access);
      setInfo(data);
      setSelected((current) =>
        data.accounts.some((a) => a.id === current)
          ? current
          : (data.accounts[0]?.id ?? ""),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load payment.");
    } finally {
      setLoading(false);
    }
  }, [access]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const id = setInterval(() => {
      void refresh();
    }, 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [refresh, access]);
  const account = info?.accounts.find((a) => a.id === selected);
  const awaiting = info?.submissions.some(
    (s) => s.status === "AWAITING_VERIFICATION",
  );
  const canSubmit =
    info?.required &&
    !info.expired &&
    ["PENDING", "CONFIRMED"].includes(info.reservationStatus) &&
    info.paidAmount < info.amount &&
    !awaiting;
  return (
    <section className="section booking-page">
      <Steps current={3} />
      <div className="page-heading">
        <p className="eyebrow">OFFICIAL MSPACES PAYMENTS</p>
        <h1>Payment & verification</h1>
        <p>
          Pay by Bank Transfer or GCash. Staff independently verifies every
          payment.
        </p>
      </div>
      {!access && (
        <div className="notice">
          <p>
            Open the private payment link in your booking email, or continue
            from your booking receipt. A reference number alone cannot open
            payment details.
          </p>
          <Link className="text-link" href="/">
            Browse spaces
          </Link>
        </div>
      )}
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {access && (
        <button
          type="button"
          className="copy-reference"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={16} /> {loading ? "Refreshing…" : "Refresh status"}
        </button>
      )}
      {loading && !info && access && (
        <p role="status">Loading secure payment details…</p>
      )}
      {info && receipt && receipt.reference === info.reference && (
        <div className="receipt-actions">
          <button
            type="button"
            className="copy-reference"
            onClick={() => downloadReceipt(receipt)}
          >
            Download booking receipt PDF
          </button>
        </div>
      )}
      {info && (
        <div className="booking-grid payment-grid">
          <div>
            <section className="panel">
              <h2>
                {info.reservationStatus === "CONFIRMED"
                  ? "Your booking is confirmed"
                  : info.expired
                    ? "Booking hold expired"
                    : awaiting
                      ? "Payment Submitted — Awaiting Verification"
                      : "Complete your payment"}
              </h2>
              {info.holdUntil && (
                <p className="payment-deadline">
                  {awaiting ? "Staff review hold ends" : "Payment deadline"}:{" "}
                  <strong>
                    {dateLabel(
                      awaiting
                        ? info.holdUntil
                        : (info.paymentDeadline ?? info.holdUntil),
                    )}{" "}
                    ·{" "}
                    {time(
                      awaiting
                        ? info.holdUntil
                        : (info.paymentDeadline ?? info.holdUntil),
                    )}{" "}
                    (Philippine Time)
                  </strong>
                </p>
              )}
              {info.expired ? (
                <p className="notice">
                  The hold has expired. Do not send further payment. Contact the
                  branch to reconcile any payment already sent; staff must
                  arrange and confirm any refund independently.
                </p>
              ) : awaiting ? (
                <p className="notice">
                  Thank you! Your payment details have been submitted. Our staff
                  will verify the transaction using our official bank or GCash
                  records. You will receive a notification once verification is
                  complete.
                </p>
              ) : null}
              {canSubmit && (
                <>
                  <p>
                    Please send your payment to the official Mspaces account
                    shown below.
                  </p>
                  <p>
                    Your reservation will only be confirmed after our staff
                    verifies that payment was received.
                  </p>
                  <p>
                    <strong>
                      Do not share your OTP, PIN, password, or banking
                      credentials.
                    </strong>
                  </p>
                  {!info.accounts.length ? (
                    <p className="notice">
                      No active receiving account is available. Contact the
                      branch before sending money.
                    </p>
                  ) : (
                    <>
                      <Field label="Select official payment account" required>
                        <select
                          value={selected}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          {info.accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.paymentMethod === "GCASH"
                                ? "GCash"
                                : a.bankName}{" "}
                              — {a.accountName}
                              {a.isDefault ? " (Default)" : ""}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {account && (
                        <>
                          <AccountInstructions
                            account={account}
                            amount={Math.max(0, info.amount - info.paidAmount)}
                          />
                          <ProofForm
                            key={account.id}
                            access={access!}
                            info={info}
                            account={account}
                            onSubmitted={async () => {
                              setMessage(
                                "Payment submitted — awaiting verification.",
                              );
                              await refresh();
                            }}
                          />
                        </>
                      )}
                    </>
                  )}
                </>
              )}
              <p role="status">{message}</p>
            </section>
            <section className="panel">
              <h2>Payment history</h2>
              {!info.submissions.length ? (
                <p>No proof submitted yet.</p>
              ) : (
                info.submissions.map((s) => (
                  <article className="payment-history" key={s.id}>
                    <strong>{s.status.replaceAll("_", " ")}</strong>
                    <p>
                      {money(s.submittedAmount)} · {s.transactionReference}
                    </p>
                    {s.rejectionReason && (
                      <p className="notice">
                        {s.rejectionReason} You may submit corrected proof while
                        the hold remains active.
                      </p>
                    )}
                  </article>
                ))
              )}
            </section>
          </div>
          <aside>
            <ReservationSummary info={info} />
          </aside>
        </div>
      )}
    </section>
  );
}
