import { Modal } from "../../components/ui/modal";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { IconActionButton } from "../../components/icon-action-button";
import { Field } from "./branch-field";

type BranchDeleteDialogProps = {
  branchName: string;
  password: string;
  isPending: boolean;
  onPasswordChange: (nextValue: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function BranchDeleteDialog({
  branchName,
  password,
  isPending,
  onPasswordChange,
  onClose,
  onSubmit,
}: BranchDeleteDialogProps) {
  return (
    <Modal
      aria-labelledby="branch-delete-title"
      className="branch-modal branch-delete-modal"
      onClose={onClose}
      busy={isPending}
    >
      <div className="branch-modal-heading">
        <div>
          <h2 id="branch-delete-title">Delete {branchName}?</h2>
        </div>
        <IconActionButton
          className="branch-close"
          disabled={isPending}
          icon={X}
          label="Close delete confirmation"
          onClick={onClose}
        />
      </div>

      <form className="branch-form" onSubmit={onSubmit}>
        <p className="branch-delete-warning">
          This permanently deletes the branch. Branches with employees, rooms,
          reservations, or other linked records cannot be deleted; deactivate
          those branches instead.
        </p>

        <fieldset>
          <legend>Admin confirmation</legend>
          <div className="branch-form-grid">
            <Field
              className="full"
              label="Current Super Admin password"
              required
            >
              <input
                autoComplete="current-password"
                onChange={(event) => onPasswordChange(event.target.value)}
                required
                type="password"
                value={password}
              />
            </Field>
          </div>
        </fieldset>

        <div className="branch-form-actions">
          <button
            className="branch-secondary"
            disabled={isPending}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            aria-busy={isPending}
            className="branch-primary branch-delete-button"
            disabled={isPending || !password}
            type="submit"
          >
            {isPending ? (
              <>
                <LoaderCircle
                  aria-hidden="true"
                  className="loading-spinner"
                  size={15}
                />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 size={15} />
                Delete branch
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
