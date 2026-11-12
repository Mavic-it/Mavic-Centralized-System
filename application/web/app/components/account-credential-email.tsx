"use client";

import type { FormEvent } from "react";
import type { WorkspaceAccount } from "../data/people";
import { Modal } from "./ui/modal";
import styles from "./people-workspace.module.css";

export function AccountCredentialNotice() {
  return (
    <p className={styles.fieldHint}>
      A secure temporary password is generated automatically and emailed to the
      registered address. The user must change it on first sign-in. If email
      delivery fails, use Regenerate & email from the account actions.
    </p>
  );
}

export function AccountCredentialStatus({
  account,
}: {
  account: WorkspaceAccount;
}) {
  if (
    !account.credentialEmailStatus ||
    account.credentialEmailStatus === "NOT_REQUIRED"
  )
    return null;
  const status = account.credentialEmailStatus;
  const text =
    status === "ACCEPTED_BY_PROVIDER"
      ? "Credential email accepted"
      : status === "FAILED"
        ? "Credential email failed"
        : status === "PROCESSING"
          ? "Credential email processing"
          : "Credential email pending";
  return (
    <div className={styles.fieldHint}>
      <span className={styles.cellSecondary}>{text}</span>
      {account.mustChangePassword && (
        <span className={styles.cellSecondary}>Password change required</span>
      )}
      {account.temporaryPasswordExpiresAt && account.mustChangePassword && (
        <span className={styles.cellSecondary}>
          Expires{" "}
          {new Date(account.temporaryPasswordExpiresAt).toLocaleString()}
        </span>
      )}
    </div>
  );
}

export function CredentialRegenerationDialog({
  account,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  account: WorkspaceAccount;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      className={styles.modal}
      aria-labelledby="credential-email-title"
      onClose={onClose}
      busy={pending}
    >
      <div className={styles.modalHeader}>
        <h2 id="credential-email-title">Regenerate & email credentials</h2>
      </div>
      <p className={styles.modalCopy}>
        Generate a new temporary password for {account.name} and email it to{" "}
        <strong>{account.email}</strong>. The previous temporary password will
        stop working and existing sessions will be signed out.
      </p>
      <p className={styles.fieldHint}>
        The user must change the password on first sign-in. Provider acceptance
        does not confirm inbox delivery. Allow 30 seconds between attempts; an
        interrupted send can be retried after two minutes.
      </p>
      <form onSubmit={onSubmit} className={styles.accountForm}>
        {error && (
          <p className={styles.formError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.modalActions}>
          <button
            className={styles.secondaryButton}
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className={styles.primaryButton}
            disabled={pending}
            type="submit"
          >
            {pending ? "Sending credential email…" : "Regenerate & email"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
