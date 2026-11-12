"use client";

import { FieldLabel } from "../components/field-label";
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConfirmation } from "../components/ui/confirmation-provider";
import { notifySuccess } from "../lib/notifications";
import { request, label } from "./types";
import css from "./workspace.module.css";

type Account = { id: string; name: string; role: string; granted: boolean };

export function IncidentAuthority() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cache = useQueryClient();
  const confirm = useConfirmation();
  const accounts = useQuery({
    queryKey: ["work", "incidents", "authority"],
    queryFn: () => request<Account[]>("incidents", "/authority"),
    enabled: open,
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const userId = String(values.get("userId"));
    const account = accounts.data?.find((item) => item.id === userId);
    if (!account || busy) return;
    if (
      !(await confirm({
        title: account.granted
          ? "Revoke disciplinary authority"
          : "Grant disciplinary authority",
        description: `${account.name} will ${account.granted ? "lose" : "receive"} authority to issue notices and record disciplinary decisions on cases they can independently review. This change is audited.`,
        confirmLabel: account.granted ? "Revoke authority" : "Grant authority",
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request("incidents", "/authority", {
        method: "POST",
        body: JSON.stringify({
          userId,
          granted: !account.granted,
          reason: String(values.get("reason")),
        }),
      });
      form.reset();
      await cache.invalidateQueries({ queryKey: ["work", "incidents"] });
      notifySuccess("Disciplinary authority updated.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to update authority.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      className={css.incidentAuthority}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>Disciplinary authority</summary>
      <p className={css.muted}>
        Explicit grants are required for every role, including Super Admin. Case
        assignment, branch scope and no-self-review rules still apply.
      </p>
      {accounts.isPending && open && (
        <p role="status">Loading eligible accounts…</p>
      )}
      {accounts.isError && (
        <div role="alert">
          Unable to load authority.{" "}
          <button type="button" onClick={() => void accounts.refetch()}>
            Retry
          </button>
        </div>
      )}
      {accounts.data?.length === 0 && (
        <p>No eligible accounts in your branch scope.</p>
      )}
      {!!accounts.data?.length && (
        <form onSubmit={submit} className={css.form}>
          <fieldset disabled={busy}>
            <label>
              <FieldLabel required={true}>Account</FieldLabel>
              <select name="userId" required defaultValue="">
                <option value="" disabled>
                  Select an account
                </option>
                {accounts.data.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} / {label(account.role)} /{" "}
                    {account.granted
                      ? "Granted — revoke"
                      : "Not granted — grant"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel required={true}>Reason</FieldLabel>
              <textarea name="reason" required maxLength={2000} rows={2} />
            </label>
            {error && <p role="alert">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Update authority"}
            </button>
          </fieldset>
        </form>
      )}
    </details>
  );
}
