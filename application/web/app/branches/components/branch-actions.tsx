import { Eye, Pencil, Power, Trash2 } from "lucide-react";
import {
  AccountManagementAction,
  AccountManagementActions,
} from "../../components/account-directory";
import type { Branch } from "../branch-types";
import type { BranchTableProps } from "./branch-table";

export function BranchActions({
  branch,
  canDelete,
  statusPendingBranchId,
  onView,
  onEdit,
  onToggleStatus,
  onDelete,
}: Pick<
  BranchTableProps,
  | "canDelete"
  | "statusPendingBranchId"
  | "onView"
  | "onEdit"
  | "onToggleStatus"
  | "onDelete"
> & { branch: Branch }) {
  const pending = statusPendingBranchId === branch.id;
  return (
    <AccountManagementActions name={branch.name} entity="branch">
      <AccountManagementAction
        icon={Eye}
        label={`View ${branch.name}`}
        shortLabel="View branch"
        onClick={() => onView(branch)}
      />
      <AccountManagementAction
        icon={Pencil}
        label={`Edit ${branch.name}`}
        shortLabel="Edit branch"
        onClick={() => onEdit(branch)}
      />
      <AccountManagementAction
        icon={Power}
        label={
          pending
            ? `Updating status for ${branch.name}`
            : `${branch.status === "ACTIVE" ? "Deactivate" : "Activate"} ${branch.name}`
        }
        shortLabel={
          pending
            ? "Updating status"
            : branch.status === "ACTIVE"
              ? "Deactivate"
              : "Activate"
        }
        aria-busy={pending}
        disabled={pending}
        variant={branch.status === "ACTIVE" ? "danger" : "default"}
        onClick={() => onToggleStatus(branch)}
      />
      {canDelete && (
        <AccountManagementAction
          icon={Trash2}
          label={`Delete ${branch.name}`}
          shortLabel="Delete branch"
          variant="danger"
          onClick={() => onDelete(branch)}
        />
      )}
    </AccountManagementActions>
  );
}
