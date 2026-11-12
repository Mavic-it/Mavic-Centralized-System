"use client";

import { FieldLabel } from "../components/field-label";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import styles from "./account-security.module.css";

export default function ChangePasswordForm() {
  const router = useRouter();
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const requirements = [
    {
      label: "12 to 128 characters",
      met: password.length >= 12 && password.length <= 128,
    },
    {
      label: "Uppercase and lowercase letters",
      met: /[a-z]/.test(password) && /[A-Z]/.test(password),
    },
    { label: "At least one number", met: /\d/.test(password) },
    { label: "At least one symbol", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const strength = requirements.filter((item) => item.met).length;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess(false);
    if (password !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    if (strength !== requirements.length) {
      setError("Choose a new password that meets all requirements.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword: password,
          confirmPassword: confirm,
        }),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? "Password could not be changed.",
        );
      setSuccess(true);
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login?passwordChanged=1");
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Password could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.field}>
        <label htmlFor="current-password">
          <FieldLabel required={true}>Current or temporary password</FieldLabel>
        </label>
        <div className={styles.inputRow}>
          <input
            id="current-password"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrent(event.target.value)}
          />
          <button
            type="button"
            aria-label={
              showCurrent ? "Hide current password" : "Show current password"
            }
            aria-pressed={showCurrent}
            onClick={() => setShowCurrent((value) => !value)}
          >
            {showCurrent ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="new-password">
          <FieldLabel required={true}>New password</FieldLabel>
        </label>
        <div className={styles.inputRow}>
          <input
            id="new-password"
            type={showNew ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            aria-label={showNew ? "Hide new password" : "Show new password"}
            aria-pressed={showNew}
            onClick={() => setShowNew((value) => !value)}
          >
            {showNew ? "Hide" : "Show"}
          </button>
        </div>
        <div className={styles.checklist} aria-label="Password requirements">
          <div className={styles.checklistHeader}>
            <strong>Password requirements</strong>
            <span aria-live="polite">
              {password ? `${strength} of 4 met` : "Start typing to check"}
            </span>
          </div>
          <ul>
            {requirements.map((item) => (
              <li className={item.met ? styles.met : ""} key={item.label}>
                <span aria-hidden="true">{item.met ? "✓" : "○"}</span>{" "}
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.field}>
        <label htmlFor="confirm-password">
          <FieldLabel required={true}>Confirm new password</FieldLabel>
        </label>
        <div className={styles.inputRow}>
          <input
            id="confirm-password"
            type={showConfirm ? "text" : "password"}
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
          <button
            type="button"
            aria-label={
              showConfirm
                ? "Hide confirmation password"
                : "Show confirmation password"
            }
            aria-pressed={showConfirm}
            onClick={() => setShowConfirm((value) => !value)}
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
        {confirm && password !== confirm && (
          <small className={styles.error} role="status">
            Passwords do not match.
          </small>
        )}
        {confirm && password === confirm && (
          <small className={styles.match} role="status">
            Passwords match.
          </small>
        )}
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className={styles.match} role="status">
          Password changed. Sign in with your new password.
        </p>
      )}
      <button className={styles.submit} disabled={busy}>
        {busy ? "Updating password…" : "Update password"}
      </button>
    </form>
  );
}
