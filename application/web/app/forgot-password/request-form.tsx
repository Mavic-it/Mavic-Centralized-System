"use client";

import { FieldLabel } from "../components/field-label";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ForgotPasswordForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(10);

  useEffect(() => {
    if (!message) return;
    const countdown = window.setInterval(
      () => setSecondsRemaining((seconds) => Math.max(0, seconds - 1)),
      1000,
    );
    const redirect = window.setTimeout(() => router.replace("/login"), 10_000);
    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(redirect);
    };
  }, [message, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || message) return;
    if (!identifier.trim()) {
      setError("Enter your registered email or employee/account ID.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/password-reset-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, reason }),
      });
      if (!response.ok)
        throw new Error(
          "Your request could not be submitted. Please try again.",
        );
      setIdentifier("");
      setReason("");
      setSecondsRemaining(10);
      setMessage(
        "Request submitted successfully. If the details match an account, Admin will review your request.",
      );
    } catch {
      setError(
        "Your request could not be submitted. Please check your connection and try again.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <form
      className="login-form forgot-password-form"
      onSubmit={submit}
      aria-busy={loading}
    >
      <div className="login-field">
        <label htmlFor="recovery-identifier">
          <FieldLabel required={true}>
            Registered email or employee/account ID
          </FieldLabel>
        </label>
        <input
          id="recovery-identifier"
          autoComplete="username"
          required
          maxLength={254}
          placeholder="e.g. name@company.com or your employee ID"
          aria-describedby="recovery-identifier-help"
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
        />
        <small id="recovery-identifier-help">
          Use the email or ID registered to your Mavic account.
        </small>
      </div>
      <div className="login-field">
        <label htmlFor="recovery-reason">Message </label>
        <textarea
          id="recovery-reason"
          maxLength={500}
          rows={4}
          placeholder="e.g. I forgot my password and cannot sign in. Please help reset my account access."
          aria-describedby="recovery-reason-help"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <small id="recovery-reason-help">
          Briefly describe the issue. Do not include passwords. Maximum 500
          characters.
        </small>
      </div>
      {message && (
        <p className="password-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button className="login-submit" disabled={loading || Boolean(message)}>
        {message
          ? "Request submitted"
          : loading
            ? "Sending request…"
            : "Request password reset"}
      </button>
      {message && (
        <p className="password-back-link">
          Returning to login in {secondsRemaining} seconds.
        </p>
      )}
      <p className="password-back-link">
        Remembered your password? <Link href="/login">Sign in</Link>
      </p>
    </form>
  );
}
