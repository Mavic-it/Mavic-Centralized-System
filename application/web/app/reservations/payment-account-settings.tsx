"use client";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Modal } from "../components/ui/modal";
import { reservationRequest, qs, type Branch } from "./types";
import type {
  PaymentAccount,
  PaymentPolicy,
  PaymentCapabilities,
} from "./payment-types";
import s from "./payments.module.css";

export function PaymentAccountSettings({
  branchId,
  branches,
}: {
  branchId: string;
  branches: Branch[];
}) {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]),
    [policy, setPolicy] = useState<PaymentPolicy | null>(null),
    [caps, setCaps] = useState<PaymentCapabilities | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<PaymentAccount | null | undefined>(
      undefined,
    ),
    [qr, setQr] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, access] = await Promise.all([
        reservationRequest<PaymentAccount[]>(
          `/payment-accounts${qs({ branchId })}`,
        ),
        reservationRequest<PaymentCapabilities>("/payment-accounts/access"),
      ]);
      setAccounts(rows);
      setCaps(access);
      if (branchId)
        setPolicy(
          await reservationRequest<PaymentPolicy>(
            `/payment-policy${qs({ branchId })}`,
          ),
        );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to load payment settings.",
      );
    } finally {
      setLoading(false);
    }
  }, [branchId]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      await reservationRequest(
        `/payment-accounts${editing ? `/${editing.id}` : ""}`,
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify({
            branchId: String(data.get("branch")) || undefined,
            paymentMethod: String(data.get("method")),
            bankName: String(data.get("bank")),
            accountName: String(data.get("name")),
            accountNumber: String(data.get("number")),
            instructions: String(data.get("instructions")),
            qrCodeData: qr,
            isActive: data.get("active") === "on",
            isDefault: data.get("default") === "on",
          }),
        },
      );
      setEditing(undefined);
      setMessage("Official payment account saved. Changes are audited.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save account.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={s.panel}>
      <div className={s.heading}>
        <div>
          <h2>Payment Account Settings</h2>
          <p>
            Official Bank Transfer and GCash accounts shown to customers. All
            changes are audited.
          </p>
        </div>
        {caps?.canEdit && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setQr("");
            }}
          >
            Add payment account
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      {loading ? (
        <p role="status">Loading payment settings…</p>
      ) : (
        <>
          <div className={s.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Method</th>
                  <th>Account</th>
                  <th>Branch</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.paymentMethod.replaceAll("_", " ")}
                      <br />
                      {a.bankName}
                    </td>
                    <td>
                      {a.accountName}
                      <br />
                      {a.accountNumber}
                      {a.isDefault && <span className={s.badge}>Default</span>}
                      <p>{a.instructions}</p>
                    </td>
                    <td>
                      {a.branchId
                        ? (branches.find((b) => b.id === a.branchId)?.name ??
                          a.branchId)
                        : "Global company account"}
                    </td>
                    <td>{a.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      {caps?.canEdit && (a.branchId || caps.canGlobal) && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing(a);
                            setQr(a.qrCodeData ?? "");
                          }}
                        >
                          View / edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!accounts.length && (
            <p>
              No official accounts configured. Paid public bookings require an
              active receiving account.
            </p>
          )}
          {branchId && policy && (
            <form
              className={s.policy}
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await reservationRequest(
                    `/payment-policy${qs({ branchId })}`,
                    { method: "PATCH", body: JSON.stringify(policy) },
                  );
                  setMessage("Payment hold policy saved for new bookings.");
                } catch (err) {
                  setError(
                    err instanceof Error
                      ? err.message
                      : "Unable to save policy.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h3>Payment hold policy</h3>
              <div className={s.grid}>
                {(
                  [
                    [
                      "holdMinutes",
                      "Payment deadline / hold (minutes)",
                      5,
                      1440,
                    ],
                    [
                      "reviewMinutes",
                      "Additional review window (minutes)",
                      5,
                      10080,
                    ],
                    [
                      "reminderMinutes",
                      "Reminder before deadline (minutes; 0 disables)",
                      0,
                      1440,
                    ],
                    [
                      "depositPercent",
                      "Deposit required to confirm (%)",
                      1,
                      100,
                    ],
                  ] as const
                ).map(([key, label, min, max]) => (
                  <label key={key}>
                    {label} <span className={s.required}>*</span>
                    <input
                      required
                      type="number"
                      min={min}
                      max={max}
                      value={policy[key]}
                      disabled={!caps?.canEdit || busy}
                      onChange={(e) =>
                        setPolicy({ ...policy, [key]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <p>
                The review window is anchored to the original deadline and never
                extended by repeated uploads. Holds cannot extend past the
                booking start.
              </p>
              {caps?.canEdit && (
                <button disabled={busy}>
                  {busy ? "Saving…" : "Save payment policy"}
                </button>
              )}
            </form>
          )}
        </>
      )}
      {editing !== undefined && (
        <Modal
          aria-labelledby="payment-account-title"
          onClose={() => setEditing(undefined)}
          busy={busy}
          presentation="center"
          className={s.dialog}
        >
          <form onSubmit={save}>
            <h2 id="payment-account-title">
              {editing ? "Edit" : "Add"} official payment account
            </h2>
            <p>
              Confirm these receiving details are authorized by Mspaces before
              saving.
            </p>
            <fieldset disabled={busy}>
              <div className={s.grid}>
                <label>
                  Branch <span className={s.required}>*</span>
                  <select
                    name="branch"
                    defaultValue={editing?.branchId ?? branchId}
                    required={!caps?.canGlobal}
                  >
                    {caps?.canGlobal && (
                      <option value="">Global company account</option>
                    )}
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Method <span className={s.required}>*</span>
                  <select
                    name="method"
                    defaultValue={editing?.paymentMethod ?? "BANK_TRANSFER"}
                  >
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="GCASH">GCash</option>
                  </select>
                </label>
                <label>
                  Bank name (required for Bank Transfer)
                  <input
                    name="bank"
                    maxLength={150}
                    defaultValue={editing?.bankName ?? ""}
                  />
                </label>
                <label>
                  Account name <span className={s.required}>*</span>
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={200}
                    defaultValue={editing?.accountName}
                  />
                </label>
                <label>
                  Account number / GCash mobile{" "}
                  <span className={s.required}>*</span>
                  <input
                    name="number"
                    required
                    minLength={5}
                    maxLength={100}
                    defaultValue={editing?.accountNumber}
                  />
                </label>
                <label>
                  Optional QR image (JPG/PNG up to 1 MB)
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        !["image/jpeg", "image/png"].includes(file.type) ||
                        file.size > 1024 * 1024
                      ) {
                        setError("QR must be JPG or PNG up to 1 MB.");
                        e.target.value = "";
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setQr(String(reader.result));
                      reader.onerror = () =>
                        setError("Unable to read QR image.");
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </div>
              {qr && (
                <>
                  <Image
                    unoptimized
                    width={180}
                    height={180}
                    className={s.qr}
                    src={qr}
                    alt="Configured official payment QR"
                  />
                  <button type="button" onClick={() => setQr("")}>
                    Remove QR
                  </button>
                </>
              )}
              <label>
                Payment instructions
                <textarea
                  name="instructions"
                  maxLength={2000}
                  rows={3}
                  defaultValue={editing?.instructions ?? ""}
                />
              </label>
              <label className={s.check}>
                <input
                  name="active"
                  type="checkbox"
                  defaultChecked={editing?.isActive ?? true}
                />
                Active
              </label>
              <label className={s.check}>
                <input
                  name="default"
                  type="checkbox"
                  defaultChecked={editing?.isDefault ?? false}
                />
                Default for this method and branch
              </label>
            </fieldset>
            {error && (
              <p role="alert" className={s.error}>
                {error}
              </p>
            )}
            <div className={s.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing(undefined)}
              >
                Cancel
              </button>
              <button disabled={busy}>
                {busy ? "Saving…" : "Save official account"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
