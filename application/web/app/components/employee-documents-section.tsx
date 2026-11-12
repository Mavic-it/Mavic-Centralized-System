"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  LayoutGrid,
  List,
  Eye,
  FileText,
  LockKeyhole,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import type { WorkspaceEmployee, WorkspaceRole } from "../data/people";
import { IconActionButton } from "./icon-action-button";
import { RequiredMark } from "./required-mark";
import { Modal } from "./ui/modal";
import { notifyError } from "../lib/notifications";
import { GRID_LIST_VIEWS, useRememberedView } from "../lib/use-remembered-view";
import { hrRequest } from "./people-workspace-services";
import { Badge } from "./ui/badge";
import { useConfirmation } from "./ui/confirmation-provider";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Skeleton } from "./ui/skeleton";
import { Input } from "./ui/input";
import type {
  EmployeeDocumentApiRecord,
  EmployeeDocumentCategory,
} from "./people-workspace-types";
import styles from "./employee-documents-section.module.css";

/* eslint-disable @next/next/no-img-element -- Document preview must use the authenticated same-origin endpoint directly. */
type DocumentFilter = "ALL" | EmployeeDocumentCategory;

const categories: Array<{ value: EmployeeDocumentCategory; label: string }> = [
  { value: "GOVERNMENT_ID", label: "Government IDs" },
  { value: "CONTRACT_RECORD", label: "Contracts & records" },
];

export default function EmployeeDocumentsSection({
  employee,
  canManageDocuments,
  onNotice,
}: {
  employee: WorkspaceEmployee;
  role: WorkspaceRole | null;
  canManageDocuments: boolean;
  onNotice: (message: string) => void;
}) {
  const confirm = useConfirmation();
  const queryClient = useQueryClient();
  const [view, setView] = useRememberedView(
    "employee-documents",
    "grid",
    GRID_LIST_VIEWS,
  );
  const [filter, setFilter] = useState<DocumentFilter>("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [previewDocument, setPreviewDocument] =
    useState<EmployeeDocumentApiRecord | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const documentKey = ["employee-document-records", employee.id] as const;
  const checklistKey = ["employee-document-checklist", employee.id] as const;
  const documentsQuery = useQuery({
    queryKey: documentKey,
    queryFn: () =>
      hrRequest<EmployeeDocumentApiRecord[]>(
        "employees",
        `/${encodeURIComponent(employee.id)}/document-records`,
      ),
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      file,
      category,
      expirationDate,
    }: {
      file: File;
      category: EmployeeDocumentCategory;
      expirationDate: string;
    }) => {
      const formData = new FormData();
      formData.set("category", category);
      formData.set("file", file, file.name);
      if (expirationDate) formData.set("expirationDate", expirationDate);
      return hrRequest<EmployeeDocumentApiRecord>(
        "employees",
        `/${encodeURIComponent(employee.id)}/document-records`,
        { method: "POST", body: formData },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKey }),
        queryClient.invalidateQueries({ queryKey: checklistKey }),
      ]);
      setIsUploadOpen(false);
      setFilter("ALL");
      setSearch("");
      setShowArchived(false);
      setFeedbackError(null);
      onNotice("Document uploaded successfully.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (documentId: string) =>
      hrRequest<EmployeeDocumentApiRecord>(
        "employees",
        `/${encodeURIComponent(employee.id)}/document-records/${encodeURIComponent(documentId)}/archive`,
        { method: "PATCH" },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKey }),
        queryClient.invalidateQueries({ queryKey: checklistKey }),
      ]);
      setFeedbackError(null);
      onNotice(
        "Document removed from the active file. You can restore it from Archived documents.",
      );
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (documentId: string) =>
      hrRequest<EmployeeDocumentApiRecord>(
        "employees",
        `/${encodeURIComponent(employee.id)}/document-records/${encodeURIComponent(documentId)}/restore`,
        { method: "PATCH" },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKey }),
        queryClient.invalidateQueries({ queryKey: checklistKey }),
      ]);
      setFeedbackError(null);
      onNotice("Document restored to the active file.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const removeLegacyDocumentMutation = useMutation({
    mutationFn: (documentIndex: number) =>
      hrRequest<unknown>(
        "employees",
        `/${encodeURIComponent(employee.id)}/documents/${documentIndex}`,
        { method: "DELETE" },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: documentKey }),
        queryClient.invalidateQueries({ queryKey: ["employee", employee.id] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
      ]);
      setFeedbackError(null);
      onNotice("Other record removed from the employee file.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const records = documentsQuery.data ?? [];
  const visibleRecords = records.filter(
    (document) =>
      (document.status === "ARCHIVED") === showArchived &&
      (filter === "ALL" || document.category === filter) &&
      matchesDocumentSearch(
        search,
        document.fileName,
        categoryLabel(document.category),
      ),
  );
  const archivedCount = records.filter(
    (document) => document.status === "ARCHIVED",
  ).length;
  const recordNames = new Set(
    records.map((document) => normalizeFileName(document.fileName)),
  );
  const legacyReferences = employee.documents.flatMap((document, index) =>
    recordNames.has(normalizeFileName(document.label)) ||
    !matchesDocumentSearch(search, document.label, document.kind)
      ? []
      : [{ document, index }],
  );
  const governmentIdDetails =
    !showArchived && (filter === "ALL" || filter === "GOVERNMENT_ID")
      ? employee.governmentIds.filter((item) =>
          matchesDocumentSearch(search, item.label),
        )
      : [];
  const showLegacyReferences = filter === "ALL" || filter === "CONTRACT_RECORD";
  const isMutating =
    uploadMutation.isPending ||
    archiveMutation.isPending ||
    restoreMutation.isPending ||
    removeLegacyDocumentMutation.isPending;
  const hasVisibleRows =
    visibleRecords.length > 0 ||
    governmentIdDetails.length > 0 ||
    (!showArchived && showLegacyReferences && legacyReferences.length > 0);

  function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageDocuments || uploadMutation.isPending) return;
    const form = new FormData(event.currentTarget);
    const category = form.get("category");
    if (category !== "GOVERNMENT_ID" && category !== "CONTRACT_RECORD") {
      setFeedbackError("Choose a document type.");
      return;
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setFeedbackError("Choose a file to upload.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFeedbackError("Choose a file up to 10 MB.");
      return;
    }
    setFeedbackError(null);
    uploadMutation.mutate({
      file,
      category,
      expirationDate: String(form.get("expirationDate") ?? ""),
    });
  }

  async function archiveDocument(document: EmployeeDocumentApiRecord) {
    const confirmed = await confirm({
      title: "Archive document?",
      description: `Remove “${document.fileName}” from the active employee file? It will remain in Archived documents and can be restored later.`,
      confirmLabel: "Archive document",
      tone: "danger",
    });
    if (!confirmed) return;
    setFeedbackError(null);
    archiveMutation.mutate(document.id);
  }

  return (
    <Card
      aria-busy={documentsQuery.isLoading}
      aria-labelledby="employee-documents-title"
      data-employee-panel
      className={styles.card}
      role="region"
    >
      <header className={styles.header}>
        <div>
          <h2 id="employee-documents-title">Documents</h2>
          <p>Secure supporting records, IDs and contracts.</p>
        </div>
        {canManageDocuments && (
          <Button
            type="button"
            disabled={uploadMutation.isPending}
            onClick={() => {
              setFeedbackError(null);
              setIsUploadOpen(true);
            }}
          >
            <Upload size={15} aria-hidden="true" /> Upload document
          </Button>
        )}
      </header>

      {isUploadOpen && canManageDocuments && (
        <Modal
          className={styles.uploadDrawer}
          aria-labelledby="employee-document-upload-title"
          busy={uploadMutation.isPending}
          onClose={() => {
            setIsUploadOpen(false);
            setFeedbackError(null);
          }}
        >
          <header className={styles.drawerHeader}>
            <div>
              <span>EMPLOYEE 201 FILE</span>
              <h2 id="employee-document-upload-title">Upload document</h2>
              <p>{employee.name}</p>
            </div>
            <IconActionButton
              icon={X}
              label="Close document upload"
              disabled={uploadMutation.isPending}
              onClick={() => {
                setIsUploadOpen(false);
                setFeedbackError(null);
              }}
            />
          </header>
          <form className={styles.uploadForm} onSubmit={uploadDocument}>
            <label>
              <span>
                Document type <RequiredMark />
              </span>
              <select
                defaultValue={filter === "ALL" ? "" : filter}
                disabled={uploadMutation.isPending}
                name="category"
                required
              >
                <option disabled value="">
                  Choose document type
                </option>
                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                Choose file <RequiredMark />
              </span>
              <Input
                accept=".png,.jpg,.jpeg,.gif,.webp,.pdf,.docx,image/png,image/jpeg,image/gif,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                name="file"
                disabled={uploadMutation.isPending}
                required
                type="file"
              />
            </label>
            <label>
              Expires on
              <Input
                disabled={uploadMutation.isPending}
                name="expirationDate"
                type="date"
              />
            </label>
            <p className={styles.uploadHint}>
              PDF, DOCX, or image up to 10 MB. Expiration date is optional.
            </p>
            {feedbackError && (
              <p className={styles.error} role="alert">
                {feedbackError}
              </p>
            )}
            <div className={styles.formActions}>
              <Button
                className="h-10"
                disabled={uploadMutation.isPending}
                onClick={() => {
                  setIsUploadOpen(false);
                  setFeedbackError(null);
                }}
                size="default"
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="h-10"
                disabled={uploadMutation.isPending}
                size="default"
                type="submit"
                variant="default"
              >
                {uploadMutation.isPending ? "Uploading…" : "Upload file"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      <div className={styles.documentSearchRow}>
        <label>
          Search files
          <Input
            type="search"
            placeholder="File name or document type"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!documentsQuery.isLoading && !documentsQuery.isError && (
          <span>
            {records.filter((d) => d.status !== "ARCHIVED").length} current
            files / {records.filter((d) => d.status === "EXPIRED").length}{" "}
            expired
          </span>
        )}
      </div>
      <div className={styles.documentToolbar}>
        <div
          className={styles.viewSwitch}
          role="group"
          aria-label="Document view"
        >
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
          >
            <LayoutGrid size={15} />
            Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            <List size={15} />
            List
          </button>
        </div>
        <div
          aria-label="Filter documents"
          className={styles.filters}
          role="group"
        >
          <button
            aria-pressed={filter === "ALL"}
            className={filter === "ALL" ? styles.filterActive : styles.filter}
            onClick={() => setFilter("ALL")}
            type="button"
          >
            All
          </button>
          {categories.map((category) => (
            <button
              aria-pressed={filter === category.value}
              className={
                filter === category.value ? styles.filterActive : styles.filter
              }
              key={category.value}
              onClick={() => setFilter(category.value)}
              type="button"
            >
              {category.label}
            </button>
          ))}
        </div>
        <div className={styles.archiveControl}>
          <IconActionButton
            aria-pressed={showArchived}
            icon={showArchived ? RotateCcw : Archive}
            label={
              showArchived ? "Show active documents" : "Show archived documents"
            }
            onClick={() => setShowArchived((value) => !value)}
          />
          <span>{archivedCount} archived</span>
        </div>
      </div>

      {documentsQuery.isLoading && (
        <div className={styles.loadingRows} role="status">
          <span className={styles.srOnly}>Loading employee documents</span>
          {[0, 1].map((item) => (
            <div aria-hidden="true" className={styles.loadingRow} key={item}>
              <Skeleton className={styles.loadingIcon} />
              <span className={styles.loadingDetails}>
                <Skeleton className={styles.loadingLine} />
                <Skeleton className={styles.loadingLineSecondary} />
              </span>
            </div>
          ))}
        </div>
      )}
      {documentsQuery.isError && (
        <div className={styles.errorRow} role="alert">
          <p>{documentsQuery.error.message}</p>
          <IconActionButton
            icon={RotateCcw}
            label="Retry loading employee documents"
            onClick={() => void documentsQuery.refetch()}
          />
        </div>
      )}
      {feedbackError && !isUploadOpen && (
        <p className={styles.error} role="alert">
          {feedbackError}
        </p>
      )}
      {!documentsQuery.isLoading && !documentsQuery.isError && (
        <>
          {governmentIdDetails.length > 0 && (
            <section
              aria-label="Government ID details"
              className={styles.idDetails}
            >
              <h3>Government ID details</h3>
              <ul>
                {governmentIdDetails.map((item) => (
                  <li key={item.label}>
                    <LockKeyhole aria-hidden="true" size={17} />
                    <span>{item.label}</span>
                    <strong>{item.maskedNumber}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {visibleRecords.length > 0 && (
            <ul
              aria-label={
                showArchived ? "Archived documents" : "Employee documents"
              }
              className={`${styles.list} ${view === "grid" ? styles.gridView : ""}`}
            >
              {visibleRecords.map((document) => (
                <li className={styles.row} key={document.id}>
                  <span className={styles.fileIcon}>
                    <FileText aria-hidden="true" size={18} />
                  </span>
                  <span className={styles.fileDetails}>
                    <strong>{document.fileName}</strong>
                    <small>
                      {categoryLabel(document.category)} · Version{" "}
                      {document.version}
                      {document.createdAt
                        ? ` · Uploaded ${formatDate(document.createdAt)}`
                        : ""}
                      {document.expirationDate
                        ? ` · Expires ${formatDate(document.expirationDate)}`
                        : ""}
                    </small>
                  </span>
                  <span className={styles.rowStatus}>
                    <Badge
                      className={styles.status}
                      variant={
                        document.status === "ACTIVE"
                          ? "success"
                          : document.status === "EXPIRED"
                            ? "warning"
                            : "archived"
                      }
                    >
                      {document.status === "ACTIVE"
                        ? "Active"
                        : document.status === "EXPIRED"
                          ? "Expired"
                          : "Archived"}
                    </Badge>
                  </span>
                  <span className={styles.actions}>
                    {document.hasFile && (
                      <IconActionButton
                        icon={Eye}
                        label={`View ${document.fileName}`}
                        onClick={() => setPreviewDocument(document)}
                      />
                    )}
                    {!document.hasFile && (
                      <span className={styles.referenceOnly}>
                        No file attached
                      </span>
                    )}
                    {canManageDocuments &&
                      (showArchived ? (
                        <IconActionButton
                          disabled={isMutating}
                          icon={RotateCcw}
                          label={`Restore ${document.fileName}`}
                          onClick={() => {
                            setFeedbackError(null);
                            restoreMutation.mutate(document.id);
                          }}
                        />
                      ) : (
                        <IconActionButton
                          disabled={isMutating}
                          icon={Trash2}
                          label={`Remove ${document.fileName} from active file`}
                          onClick={() => archiveDocument(document)}
                          variant="danger"
                        />
                      ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {showLegacyReferences &&
            legacyReferences.length > 0 &&
            !showArchived && (
              <section
                aria-label="Other records without uploaded files"
                className={styles.legacySection}
              >
                <h3>Other records</h3>
                <ul className={styles.list}>
                  {legacyReferences.map(({ document, index }) => (
                    <li
                      className={styles.row}
                      key={`${document.label}-${document.kind}-${document.updated}-${index}`}
                    >
                      <span className={styles.fileIcon}>
                        <FileText aria-hidden="true" size={18} />
                      </span>
                      <span className={styles.fileDetails}>
                        <strong>{document.label}</strong>
                        <small>
                          {document.kind} · {document.updated}
                        </small>
                      </span>
                      <span className={styles.actions}>
                        <span className={styles.referenceOnly}>
                          No file attached
                        </span>
                        {canManageDocuments && (
                          <IconActionButton
                            disabled={isMutating}
                            icon={Trash2}
                            label={`Remove ${document.label} from employee file`}
                            onClick={async () => {
                              const confirmed = await confirm({
                                title: "Remove record?",
                                description: `Remove “${document.label}” from the active employee file?`,
                                confirmLabel: "Remove record",
                                tone: "danger",
                              });
                              if (!confirmed) return;
                              setFeedbackError(null);
                              removeLegacyDocumentMutation.mutate(index);
                            }}
                            variant="danger"
                          />
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          {!hasVisibleRows && (
            <p className={styles.empty} role="status">
              {search.trim()
                ? "No files match your search. Try another name or document type."
                : showArchived
                  ? "No archived documents."
                  : filter === "ALL"
                    ? "No documents have been added yet."
                    : `No ${filter === "GOVERNMENT_ID" ? "government IDs" : "contracts or records"} found.`}
            </p>
          )}
        </>
      )}
      {previewDocument && (
        <Modal
          aria-labelledby="employee-document-preview-title"
          className={styles.previewModal}
          onClose={() => setPreviewDocument(null)}
          presentation="center"
        >
          <div className={styles.previewHeader}>
            <div>
              <h2 id="employee-document-preview-title">
                {previewDocument.fileName}
              </h2>
              <p>
                {categoryLabel(previewDocument.category)} · Secure document
                preview
              </p>
            </div>
            <IconActionButton
              className="app-modal-close"
              icon={X}
              label="Close document preview"
              onClick={() => setPreviewDocument(null)}
            />
          </div>
          {previewDocument.mimeType?.startsWith("image/") ? (
            <img
              alt={previewDocument.fileName}
              className={styles.previewImage}
              src={`/api/employees/${encodeURIComponent(employee.id)}/document-records/${encodeURIComponent(previewDocument.id)}/file`}
            />
          ) : (
            <iframe
              className={styles.previewFrame}
              title={`Preview of ${previewDocument.fileName}`}
              src={`/api/employees/${encodeURIComponent(employee.id)}/document-records/${encodeURIComponent(previewDocument.id)}/file#view=Fit`}
            />
          )}
        </Modal>
      )}
    </Card>
  );
}
/* eslint-enable @next/next/no-img-element */

function normalizeFileName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function categoryLabel(category: EmployeeDocumentCategory): string {
  return category === "GOVERNMENT_ID" ? "Government ID" : "Contract or record";
}

function formatDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Asia/Manila",
  }).format(date);
}

export function matchesDocumentSearch(
  search: string,
  ...values: string[]
): boolean {
  return values
    .join(" ")
    .toLocaleLowerCase()
    .includes(search.trim().toLocaleLowerCase());
}
