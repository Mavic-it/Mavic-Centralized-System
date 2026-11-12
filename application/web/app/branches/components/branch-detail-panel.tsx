import { RequiredMark } from "../../components/required-mark";
import { Pencil, RefreshCw, Trash2, Phone, Mail, Search } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { IconActionButton } from "../../components/icon-action-button";
import { useConfirmation } from "../../components/ui/confirmation-provider";
import { notifyError, notifySuccess } from "../../lib/notifications";
import type { Branch, Department } from "../branch-types";
import {
  createBranchDepartment,
  deleteBranchDepartment,
  fetchBranchDepartments,
  fetchBranch,
  updateBranchDepartment,
} from "../services/branch-service";

type BranchDetailPanelProps = {
  branch: Branch;
  onEdit: (branch: Branch) => void;
};

export function BranchDetailPanel({
  branch: selectedBranch,
  onEdit,
}: BranchDetailPanelProps) {
  const liveBranch = useQuery({
    queryKey: ["branches", "detail", selectedBranch.id],
    queryFn: () => fetchBranch(selectedBranch.id),
    initialData: selectedBranch,
  });
  const branch = liveBranch.data;
  const confirm = useConfirmation();
  const queryClient = useQueryClient();
  const [departmentQuery, setDepartmentQuery] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(
    null,
  );
  const [editedDepartmentName, setEditedDepartmentName] = useState("");
  const departments = useQuery({
    queryKey: ["branches", branch.id, "departments"],
    queryFn: () => fetchBranchDepartments(branch.id),
  });
  const addDepartment = useMutation({
    mutationFn: (name: string) => createBranchDepartment(branch.id, name),
    onSuccess: async () => {
      setDepartmentName("");
      await queryClient.invalidateQueries({
        queryKey: ["branches", branch.id, "departments"],
      });
      notifySuccess("Department added.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const saveDepartment = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      updateBranchDepartment(branch.id, id, name),
    onSuccess: async () => {
      setEditingDepartment(null);
      setEditedDepartmentName("");
      await queryClient.invalidateQueries({
        queryKey: ["branches", branch.id, "departments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      notifySuccess("Department updated.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const removeDepartment = useMutation({
    mutationFn: (departmentId: string) =>
      deleteBranchDepartment(branch.id, departmentId),
    onSuccess: async () => {
      setEditingDepartment(null);
      setEditedDepartmentName("");
      await queryClient.invalidateQueries({
        queryKey: ["branches", branch.id, "departments"],
      });
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      notifySuccess("Department removed.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  if (liveBranch.isError)
    return (
      <div className="branch-info-card" role="alert">
        <p>Branch details could not be refreshed. Access may have changed.</p>
        <button type="button" onClick={() => void liveBranch.refetch()}>
          Try again
        </button>
      </div>
    );

  return (
    <section className="branch-detail-panel">
      <section
        aria-labelledby="branch-related-title"
        className="branch-related-card"
      >
        <h2 id="branch-related-title">Related records</h2>
        <div className="branch-stats">
          {[
            ["Employees", branch.employeeCount],
            ["Rooms", branch.roomCount],
            ["Reservations", branch.reservationCount],
            ["Inquiries", branch.inquiryCount],
            ["Inventory items", branch.inventoryItemCount],
          ].map(([label, count]) => (
            <div key={label}>
              <strong>{count}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="branch-view-title" className="branch-info-card">
        <div className="branch-modal-heading">
          <h2 id="branch-view-title">Branch information</h2>
          <IconActionButton
            icon={Pencil}
            label={`Edit ${branch.name}`}
            onClick={() => onEdit(branch)}
          />
        </div>

        <div className="branch-detail-body">
          <div className="branch-contact-actions">
            {branch.phone && (
              <a
                className="branch-secondary"
                href={`tel:${branch.phone.replace(/[^0-9+]/g, "")}`}
              >
                <Phone size={15} aria-hidden="true" />
                Call branch
              </a>
            )}
            {branch.email && (
              <a className="branch-secondary" href={`mailto:${branch.email}`}>
                <Mail size={15} aria-hidden="true" />
                Email branch
              </a>
            )}
          </div>
          <span className={`branch-status ${branch.status.toLowerCase()}`}>
            {branch.status}
          </span>
          <dl className="branch-details">
            {(
              [
                ["Branch code", branch.code],
                [
                  "Address",
                  [
                    branch.address,
                    branch.city,
                    branch.province,
                    branch.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", "),
                ],
                ["Phone", branch.phone],
                ["Email", branch.email],
                ["Branch manager", branch.managerName],
                ["Description", branch.description],
                ["Created", new Date(branch.createdAt).toLocaleDateString()],
                [
                  "Last updated",
                  new Date(branch.updatedAt).toLocaleDateString(),
                ],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>

          <section
            aria-labelledby="branch-departments-title"
            className="branch-departments"
          >
            <h3 id="branch-departments-title">Departments</h3>
            <label className="branch-department-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="Search departments"
                placeholder="Find a department"
                value={departmentQuery}
                onChange={(e) => setDepartmentQuery(e.target.value)}
              />
            </label>
            {departments.isLoading && <p role="status">Loading departments…</p>}
            {departments.isError && (
              <p className="branch-form-error" role="alert">
                {departments.error instanceof Error
                  ? departments.error.message
                  : "Unable to load departments."}
                <IconActionButton
                  icon={RefreshCw}
                  label="Retry loading departments"
                  onClick={() => void departments.refetch()}
                />
              </p>
            )}
            {!departments.isLoading &&
              !departments.isError &&
              (departments.data?.length ? (
                <ul>
                  {departments.data
                    .filter((department) =>
                      department.name
                        .toLowerCase()
                        .includes(departmentQuery.trim().toLowerCase()),
                    )
                    .map((department) => (
                      <li key={department.id}>
                        <span>{department.name}</span>
                        <div className="branch-department-actions">
                          <IconActionButton
                            icon={Pencil}
                            label={`Edit ${department.name} department`}
                            onClick={() => {
                              saveDepartment.reset();
                              setEditingDepartment(department);
                              setEditedDepartmentName(department.name);
                            }}
                          />
                          <IconActionButton
                            disabled={removeDepartment.isPending}
                            variant="danger"
                            icon={Trash2}
                            label={`Delete ${department.name} department`}
                            onClick={async () => {
                              if (
                                !(await confirm({
                                  title: `Delete ${department.name}?`,
                                  description:
                                    "This permanently removes the department from this branch.",
                                  confirmLabel: "Delete department",
                                  tone: "danger",
                                }))
                              ) {
                                return;
                              }
                              removeDepartment.reset();
                              removeDepartment.mutate(department.id);
                            }}
                          />
                        </div>
                      </li>
                    ))}
                </ul>
              ) : (
                <p>No departments yet.</p>
              ))}
            {!departments.isLoading &&
              !departments.isError &&
              Boolean(departments.data?.length) &&
              !departments.data?.some((department) =>
                department.name
                  .toLowerCase()
                  .includes(departmentQuery.trim().toLowerCase()),
              ) && <p>No departments match your search.</p>}
            {editingDepartment && (
              <form
                aria-label={`Edit ${editingDepartment.name} department`}
                className="branch-department-edit-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = editedDepartmentName.trim();
                  if (name) {
                    saveDepartment.mutate({
                      id: editingDepartment.id,
                      name,
                    });
                  }
                }}
              >
                <label className="branch-field">
                  <span>
                    Department name
                    <RequiredMark />
                  </span>
                  <input
                    autoFocus
                    maxLength={150}
                    onChange={(event) =>
                      setEditedDepartmentName(event.target.value)
                    }
                    required
                    value={editedDepartmentName}
                  />
                </label>
                <div className="branch-department-edit-actions">
                  <button
                    className="branch-secondary"
                    disabled={saveDepartment.isPending}
                    onClick={() => {
                      setEditingDepartment(null);
                      setEditedDepartmentName("");
                      saveDepartment.reset();
                    }}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className="branch-primary"
                    disabled={
                      saveDepartment.isPending ||
                      !editedDepartmentName.trim() ||
                      editedDepartmentName.trim() === editingDepartment.name
                    }
                    type="submit"
                  >
                    {saveDepartment.isPending ? "Saving…" : "Save department"}
                  </button>
                </div>
              </form>
            )}
            <form
              aria-label={`Add a department to ${branch.name}`}
              className="branch-department-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = departmentName.trim();
                if (name) addDepartment.mutate(name);
              }}
            >
              <label className="branch-field">
                <span>
                  New department
                  <RequiredMark />
                </span>
                <input
                  maxLength={150}
                  onChange={(event) => setDepartmentName(event.target.value)}
                  required
                  value={departmentName}
                />
              </label>
              <button
                className="branch-primary"
                disabled={!departmentName.trim() || addDepartment.isPending}
                type="submit"
              >
                {addDepartment.isPending ? "Adding…" : "Add department"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </section>
  );
}
