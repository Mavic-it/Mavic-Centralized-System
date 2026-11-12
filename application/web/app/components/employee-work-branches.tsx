"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { loadActiveBranches } from "../lib/branch-access";
import { useWorkspaceRole } from "./workspace-role-context";
import styles from "./employee-work-branches.module.css";

export function EmployeeWorkBranches({
  primaryBranchId,
  initialBranchIds,
  initialAll = false,
}: {
  primaryBranchId: string;
  initialBranchIds?: string[];
  initialAll?: boolean;
}) {
  const role = useWorkspaceRole();
  const [all, setAll] = useState(initialAll);
  const [selected, setSelected] = useState(initialBranchIds ?? []);
  const branches = useQuery({
    queryKey: ["branches", "active"],
    queryFn: loadActiveBranches,
  });
  const ids = [...new Set([primaryBranchId, ...selected].filter(Boolean))];
  const readOnly =
    role !== "SUPER_ADMIN" ||
    Boolean(
      branches.data &&
      initialBranchIds?.some(
        (id) => !branches.data.some((branch) => branch.id === id),
      ),
    );
  return (
    <fieldset className={styles.fieldset}>
      <legend>Work branches</legend>
      <p>
        Select one or more work locations. The primary branch determines the
        department and attendance schedule. These same branches are used in User
        Access, directory filters and manager branch access. Existing role
        permissions still apply.
      </p>
      {branches.isPending && <p role="status">Loading work branches...</p>}
      {branches.isError && (
        <p role="alert">
          Unable to load work branches.{" "}
          <button type="button" onClick={() => void branches.refetch()}>
            Retry
          </button>
        </p>
      )}
      {readOnly ? (
        <>
          <p>
            {initialAll
              ? "All current and future active branches. A Super Admin can change this shared assignment."
              : "A Super Admin can edit shared work branches. If any branches are outside the current workspace selection, select all authorized branches first."}
          </p>
          <p>
            {!initialAll &&
              branches.data
                ?.filter((branch) => ids.includes(branch.id))
                .map((branch) => branch.name)
                .join(", ")}
          </p>
        </>
      ) : (
        branches.data && (
          <>
            <input type="hidden" name="workBranchSelection" value="selected" />
            {role === "SUPER_ADMIN" && (
              <label className={styles.choice}>
                <input
                  type="checkbox"
                  name="allWorkBranches"
                  checked={all}
                  onChange={(event) => setAll(event.target.checked)}
                />
                All current and future active branches
              </label>
            )}
            {!all && (
              <>
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() =>
                      setSelected(
                        (branches.data ?? []).map((branch) => branch.id),
                      )
                    }
                  >
                    Select all available branches
                  </button>
                  <button type="button" onClick={() => setSelected([])}>
                    Primary branch only
                  </button>
                </div>
                <div className={styles.options}>
                  {ids.map((id) => (
                    <input
                      key={id}
                      type="hidden"
                      name="workBranchIds"
                      value={id}
                    />
                  ))}
                  {branches.data.map((branch) => (
                    <label key={branch.id} className={styles.choice}>
                      <input
                        type="checkbox"
                        checked={ids.includes(branch.id)}
                        disabled={branch.id === primaryBranchId}
                        onChange={(event) =>
                          setSelected(
                            event.target.checked
                              ? [...selected, branch.id]
                              : selected.filter((id) => id !== branch.id),
                          )
                        }
                      />
                      {branch.name}
                      {branch.id === primaryBranchId ? " (primary)" : ""}
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )
      )}
    </fieldset>
  );
}
