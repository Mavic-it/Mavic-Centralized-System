"use client";

import { FieldLabel } from "./field-label";
import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceAccount } from "../data/people";
import { usersRequest } from "./people-workspace-services";
import { notifySuccess } from "../lib/notifications";
import styles from "./people-workspace.module.css";
import { Modal } from "./ui/modal";

export function AccountBranchDialog({
  account,
  onClose,
}: {
  account: WorkspaceAccount;
  onClose: () => void;
}) {
  const titleId = useId();
  const [branchId, setBranchId] = useState(account.branchId ?? "");
  const [department, setDepartment] = useState("");
  const client = useQueryClient();
  const branches = useQuery({
    queryKey: ["users", "branch-options"],
    queryFn: () =>
      usersRequest<Array<{ id: string; name: string }>>("/branch-options"),
  });
  const departments = useQuery({
    queryKey: ["users", "transfer-departments", branchId],
    queryFn: () =>
      usersRequest<Array<{ id: string; name: string }>>(
        `/branch-options/${encodeURIComponent(branchId)}/departments`,
      ),
    enabled: Boolean(branchId),
  });
  const save = useMutation({
    mutationFn: () =>
      usersRequest(`/${account.id}/branch`, {
        method: "PATCH",
        body: JSON.stringify({ branchId, department }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["users"] }),
        client.invalidateQueries({ queryKey: ["employees"] }),
        client.invalidateQueries({ queryKey: ["employee"] }),
        client.invalidateQueries({ queryKey: ["employee-assignment-history"] }),
        client.invalidateQueries({ queryKey: ["branches"] }),
      ]);
      notifySuccess(
        "Employee and account branch updated. The user must sign in again.",
      );
      onClose();
    },
  });
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!save.isPending) save.mutate();
  }
  return (
    <Modal
      className={`${styles.modal} ${styles.branchDialog}`}
      aria-labelledby={titleId}
      onClose={onClose}
      busy={save.isPending}
    >
      <div className={styles.modalHeader}>
        <h2 id={titleId}>Change employee branch</h2>
      </div>
      <form className={styles.accountForm} onSubmit={submit}>
        <p>
          {account.name} — {account.branch}
        </p>
        <p>
          This transfers the employee and updates their account to the same
          branch. Choose a department in the destination branch. Transfers clear
          the previous supervisor assignment.
        </p>
        {branches.isPending ? (
          <p role="status">Loading branches…</p>
        ) : branches.isError ? (
          <div role="alert">
            <p>Unable to load branches.</p>
            <button type="button" onClick={() => void branches.refetch()}>
              Retry
            </button>
          </div>
        ) : (
          <label>
            <FieldLabel required={true}>Branch</FieldLabel>
            <select
              required
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setDepartment("");
              }}
              disabled={save.isPending}
            >
              <option value="">Select active branch</option>
              {branches.data.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            {branches.data.length === 0 && (
              <p>No authorized active branches are available.</p>
            )}
          </label>
        )}
        {branchId &&
          (departments.isPending ? (
            <p role="status">Loading departments…</p>
          ) : departments.isError ? (
            <div role="alert">
              <p>Unable to load departments.</p>
              <button type="button" onClick={() => void departments.refetch()}>
                Retry
              </button>
            </div>
          ) : (
            <label>
              <FieldLabel required={true}>Destination department</FieldLabel>
              <select
                required
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                disabled={save.isPending}
              >
                <option value="">Select department</option>
                {departments.data.map((entry) => (
                  <option key={entry.id} value={entry.name}>
                    {entry.name}
                  </option>
                ))}
              </select>
              {departments.data.length === 0 && (
                <p>
                  Add a department to this branch before transferring the
                  employee.
                </p>
              )}
            </label>
          ))}
        {save.isError && (
          <p role="alert" className={styles.formError}>
            {save.error.message}
          </p>
        )}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={save.isPending}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={
              save.isPending ||
              !branches.data?.some((branch) => branch.id === branchId) ||
              !departments.data?.some((entry) => entry.name === department)
            }
          >
            {save.isPending ? "Saving…" : "Save branch"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
