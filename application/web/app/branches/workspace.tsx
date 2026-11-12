"use client";
import { PageHeading, PageHeader } from "../components/page-heading";
import { RealtimeQueryProvider } from "../components/realtime-query-provider";

import { QueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconActionButton } from "../components/icon-action-button";
import { useConfirmation } from "../components/ui/confirmation-provider";
import { useWorkspaceRole } from "../components/workspace-role-context";
import { CARD_TABLE_VIEWS, useRememberedView } from "../lib/use-remembered-view";
import { BranchDeleteDialog } from "./components/branch-delete-dialog";
import { BranchDetailPanel } from "./components/branch-detail-panel";
import { BranchFormDialog } from "./components/branch-form-dialog";
import { BranchTable } from "./components/branch-table";
import { BranchToolbar } from "./components/branch-toolbar";
import { useBranchesPage } from "./hooks/use-branches";
import theme from "../components/ui/workspace-theme.module.css";
import styles from "./workspace.module.css";

export default function BranchesWorkspace() {
  const [client] = useState(() => new QueryClient());

  return (
    <RealtimeQueryProvider client={client}>
      <BranchesContent />
    </RealtimeQueryProvider>
  );
}

function BranchesContent() {
  const [view, setView] = useRememberedView("branches", "cards", CARD_TABLE_VIEWS);
  const confirm = useConfirmation();
  const role = useWorkspaceRole();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasVisitedDetail = useRef(false);
  const {
    applyLocation,
    branches,
    changeStatus,
    clearMapCoordinates,
    closeForm,
    deletePassword,
    deleting,
    editing,
    form,
    handleDeleteSubmit,
    openCreate,
    openDelete,
    openEdit,
    page,
    remove,
    save,
    search,
    setDeletePassword,
    setDeleting,
    setPage,
    setSearch,
    setStatus,
    setViewing,
    showForm,
    status,
    statusPendingBranchId,
    totalPages,
    viewing,
  } = useBranchesPage();
  const viewingId = viewing?.id;

  useEffect(() => {
    if (viewingId) hasVisitedDetail.current = true;
    if (hasVisitedDetail.current) headingRef.current?.focus();
  }, [viewingId]);

  return (
    <section className={`branch-page ${theme.scope} ${styles.scope}`}>
      <PageHeader className="branch-heading">
        <div>
          <p className={styles.eyebrow}>ORGANIZATION / {viewing ? "BRANCH DETAILS" : "BRANCHES"}</p>
          <PageHeading ref={headingRef} tabIndex={-1}>
            {viewing?.name ?? "Branches"}
          </PageHeading>
          <p className="page-description">
            {viewing
              ? "Branch details, departments, and related records."
              : "Manage branch locations and operating status."}
          </p>
        </div>
        {viewing ? (
          <IconActionButton
            className="branch-action-button"
            icon={ArrowLeft}
            label="Back to branches"
            onClick={() => setViewing(null)}
          />
        ) : role === "SUPER_ADMIN" ? (
          <button className="branch-primary" onClick={openCreate} type="button">
            <Plus size={16} aria-hidden="true" /> Add branch
          </button>
        ) : null}
      </PageHeader>

      {viewing ? (
        <BranchDetailPanel
          branch={viewing}
          onEdit={(branch) => {
            setViewing(null);
            openEdit(branch);
          }}
        />
      ) : (
        <>
          <div className="branch-list">
            <BranchToolbar
              view={view}
              onViewChange={setView}
              branchesCount={branches.data?.total ?? 0}
              isFetching={branches.isFetching}
              onSearchChange={setSearch}
              onStatusChange={setStatus}
              search={search}
              status={status}
              onClearFilters={() => { setSearch(""); setStatus("ALL"); setPage(1); }}
            />

            <BranchTable
              view={view}
              canDelete={branches.data?.canDelete ?? false}
              errorMessage={
                branches.error instanceof Error
                  ? branches.error.message
                  : undefined
              }
              isError={branches.isError}
              isFetching={branches.isFetching}
              isLoading={branches.isLoading}
              items={branches.data?.items ?? []}
              onDelete={openDelete}
              onEdit={openEdit}
              onPageChange={(nextPage) => setPage(nextPage)}
              onRetry={() => void branches.refetch()}
              onToggleStatus={async (branch) => {
                const next = branch.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                if (
                  next === "INACTIVE" &&
                  !(await confirm({
                    title: `Deactivate ${branch.name}?`,
                    description: "Existing records will be preserved. This branch will no longer be available for new transactions.",
                    confirmLabel: "Deactivate branch",
                    tone: "danger",
                  }))
                ) {
                  return;
                }

                changeStatus.mutate({ branch, next });
              }}
              onView={setViewing}
              page={page}
              statusPendingBranchId={statusPendingBranchId}
              totalPages={totalPages}
            />
          </div>
        </>
      )}

      {showForm && (
        <BranchFormDialog
          canAssignManager={role === "SUPER_ADMIN" || role === "HR_ADMIN"}
          canViewManagerOptions={
            role === "SUPER_ADMIN" || role === "HR_ADMIN" || role === "BRANCH_MANAGER"
          }
          editing={editing}
          form={form}
          onApplyLocation={applyLocation}
          onClearMapCoordinates={clearMapCoordinates}
          onClose={closeForm}
          save={save}
        />
      )}

      {deleting && (
        <BranchDeleteDialog
          branchName={deleting.name}
          isPending={remove.isPending}
          onClose={() => setDeleting(null)}
          onPasswordChange={setDeletePassword}
          onSubmit={handleDeleteSubmit}
          password={deletePassword}
        />
      )}
    </section>
  );
}
