import { Modal } from "../../components/ui/modal";
import { LoaderCircle, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { IconActionButton } from "../../components/icon-action-button";
import type { UseFormReturn } from "react-hook-form";
import type { UseMutationResult } from "@tanstack/react-query";
import type { SelectedBranchLocation } from "../openstreetmap-location-picker";
import { OpenStreetMapLocationPicker } from "../openstreetmap-location-picker";
import type { Branch, BranchForm } from "../branch-types";
import { fetchBranchManagerOptions } from "../services/branch-service";
import { LEGACY_BRANCH_MANAGER } from "../branch-payload";
import { Field } from "./branch-field";

type BranchFormDialogProps = {
  canAssignManager: boolean;
  canViewManagerOptions: boolean;
  editing: Branch | null;
  form: UseFormReturn<BranchForm>;
  save: UseMutationResult<Branch, Error, BranchForm>;
  onClose: () => void;
  onApplyLocation: (location: SelectedBranchLocation) => void;
  onClearMapCoordinates: () => void;
};

export function BranchFormDialog({
  canAssignManager,
  canViewManagerOptions,
  editing,
  form,
  save,
  onClose,
  onApplyLocation,
  onClearMapCoordinates,
}: BranchFormDialogProps) {
  const managers = useQuery({
    queryKey: ["branch-manager-options", editing?.id ?? "new"],
    queryFn: () => fetchBranchManagerOptions(editing?.id),
    enabled: canViewManagerOptions,
  });
  const selectedManager = form.watch("managerUserId");
  const legacyManagerName = form.watch("managerName");
  const managerOptions = (managers.data ?? []).filter(
    (manager) => manager.role === "BRANCH_MANAGER" || manager.role === "HR_ADMIN",
  );
  const availableManagers = managerOptions.filter(
    (manager) => manager.isAssignable,
  );
  const selectedManagerOption = managerOptions.find(
    (manager) => manager.id === selectedManager,
  );

  return (
    <Modal
        aria-busy={save.isPending}
        aria-labelledby="branch-form-title"
        className={editing ? "branch-modal branch-edit-modal" : "branch-modal"}
        onClose={onClose}
        busy={save.isPending}
      >
        <div className="branch-modal-heading">
          <div>
            <h2 id="branch-form-title">
              {editing ? "Edit branch" : "Add branch"}
            </h2>
          </div>
          <IconActionButton
            className="branch-close"
            disabled={save.isPending}
            icon={X}
            label="Close branch form"
            onClick={onClose}
          />
        </div>

        <form
          className="branch-form"
          noValidate
          onSubmit={form.handleSubmit((values) => save.mutate(values))}
        >
          <fieldset>
            <legend>Basic information</legend>
            <div className="branch-form-grid">
              <Field
                label="Branch code"
                required
                error={form.formState.errors.code?.message}
              >
                <input
                  disabled={Boolean(editing)}
                  maxLength={50}
                  required
                  {...form.register("code", { required: true })}
                />
              </Field>
              <Field
                label="Branch name"
                required
                error={form.formState.errors.name?.message}
              >
                <input required maxLength={200} {...form.register("name")} />
              </Field>
              <Field
                className="full"
                label="Description"
                error={form.formState.errors.description?.message}
              >
                <textarea rows={2} {...form.register("description")} />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend>Location</legend>
            <div className="branch-location-layout branch-location-panel-layout">
              <OpenStreetMapLocationPicker
                onSelect={onApplyLocation}
                value={{
                  address: form.watch("address"),
                  city: form.watch("city"),
                  province: form.watch("province"),
                  postalCode: form.watch("postalCode"),
                  latitude: form.watch("latitude"),
                  longitude: form.watch("longitude"),
                }}
              />
            <input
              type="hidden"
              {...form.register("latitude", {
                setValueAs: (value) => (value === "" ? null : Number(value)),
              })}
            />
            <input
              type="hidden"
              {...form.register("longitude", {
                setValueAs: (value) => (value === "" ? null : Number(value)),
              })}
            />
              <div className="branch-form-grid branch-address-grid">
                <Field
                  className="full"
                  label="Address"
                  required
                  error={form.formState.errors.address?.message}
                >
                  <input
                    maxLength={500}
                    required
                    {...form.register("address", {
                      onChange: onClearMapCoordinates,
                    })}
                  />
                </Field>
                <Field
                  label="City"
                  required
                  error={form.formState.errors.city?.message}
                >
                  <input
                    maxLength={120}
                    required
                    {...form.register("city", {
                      onChange: onClearMapCoordinates,
                    })}
                  />
                </Field>
                <Field
                  label="Province"
                  error={form.formState.errors.province?.message}
                >
                  <input
                    maxLength={120}
                    {...form.register("province", {
                      onChange: onClearMapCoordinates,
                    })}
                  />
                </Field>
                <Field
                  className="full"
                  label="Postal code"
                  error={form.formState.errors.postalCode?.message}
                >
                  <input
                    maxLength={20}
                    {...form.register("postalCode", {
                      onChange: onClearMapCoordinates,
                    })}
                  />
                </Field>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend>Contact and management</legend>
            <div className="branch-form-grid branch-contact-grid">
              <Field
                label="Branch manager"
                error={
                  canViewManagerOptions && managers.error instanceof Error
                    ? managers.error.message
                    : form.formState.errors.managerUserId?.message
                }
              >
                <select
                  aria-describedby="branch-manager-help"
                  aria-invalid={Boolean(form.formState.errors.managerUserId)}
                  aria-busy={managers.isFetching}
                  disabled={
                    !canViewManagerOptions ||
                    save.isPending ||
                    managers.isLoading ||
                    managers.isError
                  }
                  {...form.register("managerUserId", {
                    onChange: (event) => {
                      if (!canAssignManager) return;
                      const manager = availableManagers.find(
                        (option) => option.id === event.target.value,
                      );
                      if (!manager) return;

                      form.setValue("phone", manager.phone ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                      form.setValue("email", manager.email, {
                        shouldDirty: true,
                        shouldValidate: true,
                      });
                    },
                  })}
                >
                  <option value="" disabled={!canAssignManager}>
                    {managers.isLoading && canViewManagerOptions
                      ? "Loading managers…"
                      : "No manager assigned"}
                  </option>
                  {editing?.managerUserId &&
                    !managerOptions.some(
                      (manager) => manager.id === editing.managerUserId,
                    ) && (
                      <option value={editing.managerUserId} hidden disabled>
                        {editing.managerName || "Current branch manager"}
                      </option>
                    )}
                  {selectedManager === LEGACY_BRANCH_MANAGER && (
                    <option value={LEGACY_BRANCH_MANAGER} hidden disabled>
                      Keep current manager · {legacyManagerName}
                    </option>
                  )}
                  {managerOptions.map((manager) => (
                    <option
                      key={manager.id}
                      value={manager.id}
                      disabled={!canAssignManager || !manager.isAssignable}
                      title={manager.unavailableReason ?? undefined}
                    >
                      {manager.name} · {manager.role === "HR_ADMIN" ? "HR Admin" : "Branch Manager"} · {manager.email}
                      {manager.managedBranches?.length ? ` (${manager.managedBranches.length} assigned branches)` : ""}
                      {manager.unavailableReason ? ` — ${manager.unavailableReason}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Phone"
                error={form.formState.errors.phone?.message}
              >
                <input
                  type="tel"
                  placeholder="Phone number"
                  maxLength={30}
                  {...form.register("phone")}
                />
              </Field>
              <Field
                label="Email"
                error={form.formState.errors.email?.message}
              >
                <input
                  type="email"
                  placeholder="Email address"
                  maxLength={320}
                  {...form.register("email")}
                />
              </Field>
              <div className="branch-manager-guidance" id="branch-manager-help">
                <p>
                  {!canViewManagerOptions
                    ? "Manager assignment is managed by Super Admin or HR Admin."
                    : managers.isError
                    ? "Manager accounts could not be loaded. Try again to select a manager."
                    : managers.isLoading
                    ? "Loading HR Admin and Branch Manager accounts…"
                    : !canAssignManager
                    ? availableManagers.length === 0
                      ? "No active HR Admin or Branch Manager accounts are listed for your branch. Assignments are managed by Super Admin or HR Admin."
                      : "View HR Admin and Branch Manager accounts for your branch. Assignments are managed by Super Admin or HR Admin."
                    : managerOptions.length === 0
                    ? "No saved HR Admin or Branch Manager accounts were found. Save an account with either role in User Access."
                    : availableManagers.length === 0
                    ? "Accounts are listed with the reason they are unavailable. Check their employee link and branch assignment in User Access before selecting."
                    : "Choose an HR Admin or Branch Manager to fill Phone and Email automatically. The same person can manage multiple branches."}
                </p>
                {selectedManagerOption?.managedBranches?.length ? (
                  <p>
                    Currently managing: {selectedManagerOption.managedBranches
                      .map((branch) => branch.name)
                      .join(", ")}
                  </p>
                ) : null}
                {canViewManagerOptions && managers.isError && (
                  <button
                    className="branch-secondary"
                    disabled={managers.isFetching}
                    onClick={() => void managers.refetch()}
                    type="button"
                  >
                    {managers.isFetching ? "Retrying…" : "Retry"}
                  </button>
                )}
              </div>
            </div>
          </fieldset>

          <div className="branch-form-actions">
            <button
              className="branch-secondary"
              disabled={save.isPending}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              aria-busy={save.isPending}
              className="branch-primary"
              disabled={save.isPending}
              type="submit"
            >
              {save.isPending ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="loading-spinner"
                    size={15}
                  />
                  Saving…
                </>
              ) : editing ? (
                "Save changes"
              ) : (
                "Save branch"
              )}
            </button>
          </div>
        </form>
    </Modal>
  );
}
