"use client";

import { FieldLabel } from "./field-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Asterisk,
  Archive,
  Link2,
  RefreshCw,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { WorkspaceRole } from "../data/people";
import { hrRequest } from "./people-workspace-services";
import { IconActionButton } from "./icon-action-button";
import { RequiredMark } from "./required-mark";
import { notifyError, notifySuccess } from "../lib/notifications";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Input } from "./ui/input";
import type { EmployeeDocumentApiRecord } from "./people-workspace-types";
import styles from "./employee-document-checklist.module.css";

type Category = EmployeeDocumentApiRecord["category"];
type Requirement = {
  id: string;
  branchId: string;
  name: string;
  category: Category;
  isRequired: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};
type ChecklistItem = {
  id: string;
  name: string;
  category: Category;
  isRequired: boolean;
  isComplete: boolean;
  documentId: string | null;
  fileName: string | null;
  expirationDate: string | null;
  documentStatus: EmployeeDocumentApiRecord["status"] | null;
  version: number | null;
};
type Checklist = {
  employeeId: string;
  branchId: string;
  status: "NOT_CONFIGURED" | "INCOMPLETE" | "COMPLETE";
  requiredCount: number;
  completedRequiredCount: number;
  requirements: ChecklistItem[];
};

const managerRoles = ["SUPER_ADMIN", "HR_ADMIN", "BRANCH_MANAGER"];
const categories: Array<{ value: Category; label: string }> = [
  { value: "GOVERNMENT_ID", label: "Government ID" },
  { value: "CONTRACT_RECORD", label: "Contract or record" },
];

export default function EmployeeDocumentChecklist({
  employeeId,
  branchId,
  role,
}: {
  employeeId: string;
  branchId: string;
  role: WorkspaceRole | null;
}) {
  const queryClient = useQueryClient();
  const canUpload = managerRoles.includes(role ?? "");
  const canManageRequirements = ["SUPER_ADMIN", "HR_ADMIN"].includes(
    role ?? "",
  );
  const [showRequirementForm, setShowRequirementForm] = useState(false);
  const checklistKey = ["employee-document-checklist", employeeId] as const;
  const requirementsKey = ["employee-document-requirements", branchId] as const;
  const docsKey = ["employee-document-records", employeeId] as const;
  const checklistQuery = useQuery({
    queryKey: checklistKey,
    queryFn: () =>
      hrRequest<Checklist>(
        "employees",
        `/${encodeURIComponent(employeeId)}/workflow/document-checklist`,
      ),
  });
  const documentsQuery = useQuery({
    queryKey: docsKey,
    queryFn: () =>
      hrRequest<EmployeeDocumentApiRecord[]>(
        "employees",
        `/${encodeURIComponent(employeeId)}/document-records`,
      ),
  });
  const requirementsQuery = useQuery({
    queryKey: requirementsKey,
    queryFn: () =>
      hrRequest<Requirement[]>(
        "employees",
        `/document-requirements/${encodeURIComponent(branchId)}${canManageRequirements ? "?includeInactive=true" : ""}`,
      ),
    enabled: Boolean(
      branchId && (canManageRequirements || role === "BRANCH_MANAGER"),
    ),
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: checklistKey }),
      queryClient.invalidateQueries({ queryKey: docsKey }),
      queryClient.invalidateQueries({ queryKey: requirementsKey }),
    ]);
  };
  const attachMutation = useMutation({
    mutationFn: ({
      documentId,
      requirementId,
    }: {
      documentId: string;
      requirementId: string;
    }) =>
      hrRequest<EmployeeDocumentApiRecord>(
        "employees",
        `/${encodeURIComponent(employeeId)}/document-records/${encodeURIComponent(documentId)}/requirement`,
        { method: "PATCH", body: JSON.stringify({ requirementId }) },
      ),
    onSuccess: async () => {
      await refresh();
      notifySuccess("Existing document attached.");
    },
    onError: (reason: Error) => notifyError(reason.message),
  });
  const createRequirementMutation = useMutation({
    mutationFn: (input: {
      name: string;
      category: Category;
      isRequired: boolean;
    }) =>
      hrRequest<Requirement>(
        "employees",
        `/document-requirements/${encodeURIComponent(branchId)}`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await refresh();
      setShowRequirementForm(false);
      notifySuccess("Document requirement added.");
    },
    onError: (reason: Error) => notifyError(reason.message),
  });
  const updateRequirementMutation = useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      isActive?: boolean;
      isRequired?: boolean;
    }) =>
      hrRequest<Requirement>(
        "employees",
        `/document-requirements/${encodeURIComponent(branchId)}/${encodeURIComponent(id)}`,
        { method: "PATCH", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await refresh();
      notifySuccess("Document requirement updated.");
    },
    onError: (reason: Error) => notifyError(reason.message),
  });

  function createRequirement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createRequirementMutation.mutate({
      name: String(form.get("name") ?? "").trim(),
      category: String(form.get("category") ?? "CONTRACT_RECORD") as Category,
      isRequired: form.get("isRequired") === "on",
    });
  }

  const checklist = checklistQuery.data;
  const requirements = checklist?.requirements ?? [];
  const availableDocuments = (documentsQuery.data ?? []).filter(
    (document) =>
      document.hasFile &&
      document.status === "ACTIVE" &&
      !document.requirementId,
  );
  const statusLabel =
    checklist?.status === "COMPLETE"
      ? "Complete"
      : checklist?.status === "INCOMPLETE"
        ? "Incomplete"
        : "Not configured";

  return (
    <Card
      aria-busy={checklistQuery.isLoading}
      aria-labelledby="employee-document-checklist-title"
      className={styles.card}
      role="region"
    >
      <div className={styles.header}>
        <div>
          <h3 id="employee-document-checklist-title">Required documents</h3>
          {canUpload && (
            <p className={styles.uploadNote}>
              Upload or replace files from the Documents panel above, or attach
              an existing file below.
            </p>
          )}
        </div>
        {canManageRequirements && (
          <IconActionButton
            icon={showRequirementForm ? X : Settings}
            label={
              showRequirementForm
                ? "Close document requirements"
                : "Manage document requirements"
            }
            onClick={() => setShowRequirementForm((value) => !value)}
          />
        )}
      </div>

      {checklist && checklist.status !== "NOT_CONFIGURED" && (
        <div
          className={`${styles.status} ${checklist.status === "COMPLETE" ? styles.complete : styles.incomplete}`}
        >
          <strong>{statusLabel}</strong>
          <span>
            {checklist.completedRequiredCount} of {checklist.requiredCount}{" "}
            required items complete
          </span>
        </div>
      )}
      {checklistQuery.isLoading && (
        <div className={styles.loadingItem} role="status">
          <span className={styles.srOnly}>Loading document checklist</span>
          <Skeleton className={styles.loadingLine} />
          <Skeleton className={styles.loadingLineSecondary} />
        </div>
      )}
      {(checklistQuery.isError || requirementsQuery.isError) && (
        <div className={styles.errorBox} role="alert">
          <span>
            {checklistQuery.error?.message ?? requirementsQuery.error?.message}
          </span>
          <IconActionButton
            icon={RefreshCw}
            label="Retry loading document checklist"
            onClick={() => {
              void checklistQuery.refetch();
              void requirementsQuery.refetch();
            }}
          />
        </div>
      )}
      {!checklistQuery.isLoading &&
        !checklistQuery.isError &&
        checklist?.status === "NOT_CONFIGURED" && (
          <p className={styles.emptyState}>
            This branch has no document checklist yet. HR can add the required
            201-file items for its policy.
          </p>
        )}

      {!!requirements.length && (
        <ul className={styles.list}>
          {requirements.map((item) => {
            const attachable = availableDocuments.filter(
              (document) => document.category === item.category,
            );
            const isPending = attachMutation.isPending;
            return (
              <li className={styles.item} key={item.id}>
                <div className={styles.itemHeading}>
                  <div>
                    <strong>{item.name}</strong>
                    <small>
                      {item.category === "GOVERNMENT_ID"
                        ? "Government ID"
                        : "Contract or record"}{" "}
                      {item.isRequired && <RequiredMark />}
                    </small>
                  </div>
                  <Badge
                    className={styles.itemStatus}
                    variant={
                      item.isComplete
                        ? "success"
                        : item.documentStatus === "EXPIRED"
                          ? "warning"
                          : "secondary"
                    }
                  >
                    {item.isComplete
                      ? "Complete"
                      : item.documentStatus === "EXPIRED"
                        ? "Expired"
                        : "Missing"}
                  </Badge>
                </div>
                {item.fileName && (
                  <p className={styles.fileInfo}>
                    {item.fileName}
                    {item.version ? ` · Version ${item.version}` : ""}
                    {item.expirationDate
                      ? ` · Expires ${item.expirationDate}`
                      : ""}
                  </p>
                )}
                {canUpload && (
                  <div className={styles.requirementActions}>
                    {!item.isComplete && attachable.length > 0 && (
                      <form
                        className={styles.attachForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const documentId = String(
                            new FormData(event.currentTarget).get(
                              "existingDocument",
                            ) ?? "",
                          );
                          if (documentId)
                            attachMutation.mutate({
                              documentId,
                              requirementId: item.id,
                            });
                        }}
                      >
                        <label>
                          <span>
                            Existing{" "}
                            {item.category === "GOVERNMENT_ID"
                              ? "ID"
                              : "record"}
                            <RequiredMark />
                          </span>
                          <select
                            name="existingDocument"
                            required
                            defaultValue=""
                          >
                            <option value="">Choose uploaded file</option>
                            {attachable.map((document) => (
                              <option key={document.id} value={document.id}>
                                {document.fileName} · v{document.version}
                              </option>
                            ))}
                          </select>
                        </label>
                        <IconActionButton
                          icon={Link2}
                          label={`Attach ${item.category === "GOVERNMENT_ID" ? "government ID" : "record"} to ${item.name}`}
                          disabled={isPending}
                          type="submit"
                        />
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {showRequirementForm && canManageRequirements && (
        <div className={styles.configPanel}>
          <h4>Branch requirements</h4>
          <form className={styles.configForm} onSubmit={createRequirement}>
            <label>
              <span>
                Requirement name <RequiredMark />
              </span>
              <Input
                maxLength={150}
                name="name"
                placeholder="Enter the required document name"
                required
              />
            </label>
            <label>
              <FieldLabel required={true}>Document category</FieldLabel>
              <select required defaultValue="CONTRACT_RECORD" name="category">
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.checkboxLabel}>
              <input defaultChecked name="isRequired" type="checkbox" />
              Required for a complete 201 file
            </label>
            <Button
              disabled={createRequirementMutation.isPending}
              size="sm"
              type="submit"
              variant="default"
            >
              {createRequirementMutation.isPending
                ? "Adding…"
                : "Add requirement"}
            </Button>
          </form>
          <ul className={styles.requirementSettings}>
            {(requirementsQuery.data ?? []).map((requirement) => (
              <li key={requirement.id}>
                <span>
                  <strong>{requirement.name}</strong>
                  <small>
                    {requirement.isActive ? "Active" : "Archived"}
                    {requirement.isRequired && <RequiredMark />}
                  </small>
                </span>
                {requirement.isActive && (
                  <IconActionButton
                    icon={Asterisk}
                    label={`Mark ${requirement.isRequired ? "optional" : "required"}: ${requirement.name}`}
                    disabled={updateRequirementMutation.isPending}
                    onClick={() =>
                      updateRequirementMutation.mutate({
                        id: requirement.id,
                        isRequired: !requirement.isRequired,
                      })
                    }
                    type="button"
                  />
                )}
                <IconActionButton
                  icon={requirement.isActive ? Archive : RotateCcw}
                  label={`${requirement.isActive ? "Archive" : "Reactivate"} ${requirement.name}`}
                  disabled={updateRequirementMutation.isPending}
                  onClick={() =>
                    updateRequirementMutation.mutate({
                      id: requirement.id,
                      isActive: !requirement.isActive,
                    })
                  }
                  type="button"
                />
              </li>
            ))}
          </ul>
          {!requirementsQuery.isLoading &&
            requirementsQuery.data?.length === 0 && (
              <p className={styles.muted}>
                No document requirements have been defined for this branch.
              </p>
            )}
        </div>
      )}
    </Card>
  );
}
