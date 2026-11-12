"use client";
import { FieldLabel } from "./field-label";
import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceAccount } from "../data/people";
import { usersRequest } from "./people-workspace-services";
import { notifySuccess } from "../lib/notifications";
import { Modal } from "./ui/modal";
import styles from "./people-workspace.module.css";
import choiceStyles from "./branch-selection.module.css";

type Access = { mode: "ASSIGNED" | "SELECTED" | "ALL"; branchIds: string[] };
export function AdminBranchAccessDialog({
  account,
  onClose,
}: {
  account: WorkspaceAccount;
  onClose: () => void;
}) {
  const id = useId(),
    client = useQueryClient();
  const [draft, setDraft] = useState<Access | null>(null);
  const current = useQuery({
    queryKey: ["users", "branch-access", account.id],
    queryFn: () => usersRequest<Access>(`/${account.id}/branch-access`),
  });
  const branches = useQuery({
    queryKey: ["users", "branch-options"],
    queryFn: () =>
      usersRequest<{ id: string; name: string }[]>("/branch-options"),
  });
  const value = draft ?? current.data;
  const save = useMutation({
    mutationFn: () =>
      usersRequest(`/${account.id}/branch-access`, {
        method: "PATCH",
        body: JSON.stringify({ mode: value?.mode, branchIds: value?.branchIds }),
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["users"] }),
        client.invalidateQueries({ queryKey: ["employees"] }),
        client.invalidateQueries({ queryKey: ["employee"] }),
        client.invalidateQueries({ queryKey: ["employee-assignment-history"] }),
      ]);
      notifySuccess(
        "Shared work branches saved. The administrator must sign in again.",
      );
      onClose();
    },
  });
  return (
    <Modal
      className={`${styles.modal} ${styles.branchDialog}`}
      aria-labelledby={id}
      busy={save.isPending}
      onClose={onClose}
    >
      <div className={styles.modalHeader}>
        <h2 id={id}>Edit shared work branches</h2>
      </div>
      <form
        className={`${styles.accountForm} ${choiceStyles.accessForm}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (value && !save.isPending) save.mutate();
        }}
      >
        <p>{account.name}</p>
        <p>
          These are the same work branches shown in the employee record. Saving
          here updates the shared assignment used by directory filters and manager
          branch access. Existing role permissions still apply.
        </p>
        {(current.isPending || branches.isPending) && (
          <p role="status">Loading branch access...</p>
        )}
        {(current.isError || branches.isError) && (
          <div role="alert">
            <p>Unable to load branch access.</p>
            <button
              type="button"
              onClick={() => {
                void current.refetch();
                void branches.refetch();
              }}
            >
              Retry
            </button>
          </div>
        )}
        {value && branches.data && (
          <>
            <label>
              <FieldLabel required={true}>Work branch scope</FieldLabel>
              <select
                required
                disabled={save.isPending}
                value={value.mode}
                onChange={(event) =>
                  setDraft({
                    mode: event.target.value as Access["mode"],
                    branchIds: event.target.value === "SELECTED" && account.branchId ? [account.branchId] : [],
                  })
                }
              >
                <option value="ASSIGNED">
                  Primary branch only
                </option>
                <option value="SELECTED">Selected branches</option>
                <option value="ALL">All branches</option>
              </select>
            </label>
            {value.mode === "ALL" && (
              <p>
                Includes all current and future active branches. Existing role
                permissions still apply.
              </p>
            )}
            {value.mode === "SELECTED" && (
              <fieldset>
                <legend>Work branches</legend>
                {branches.data.map((branch) => (
                  <label className={choiceStyles.choice} key={branch.id}>
                    <input
                      type="checkbox"
                      disabled={save.isPending || (branch.id === account.branchId && value.branchIds.includes(branch.id))}
                      checked={value.branchIds.includes(branch.id)}
                      onChange={(event) =>
                        setDraft({
                          ...value,
                          branchIds: event.target.checked
                            ? [...value.branchIds, branch.id]
                            : value.branchIds.filter((id) => id !== branch.id),
                        })
                      }
                    />
                    {branch.name}
                  </label>
                ))}
                {!value.branchIds.length && <p>Select at least one branch.</p>}
              </fieldset>
            )}
          </>
        )}
        {save.error && (
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
              !value ||
              branches.isError ||
              branches.isPending ||
              current.isError ||
              (value.mode === "SELECTED" && !value.branchIds.length)
            }
          >
            {save.isPending ? "Saving..." : "Save work branches"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
