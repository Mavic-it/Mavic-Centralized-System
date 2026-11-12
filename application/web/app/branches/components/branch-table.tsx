import { BranchCards } from "./branch-cards";
import { BranchActions } from "./branch-actions";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  MapPin,
  RefreshCw,
} from "lucide-react";
import { Skeleton } from "../../components/loading-ui";
import { IconActionButton } from "../../components/icon-action-button";
import type { Branch } from "../branch-types";

export type BranchTableProps = {
  view?: "cards" | "table";
  items: Branch[];
  canDelete: boolean;
  page: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  errorMessage?: string;
  statusPendingBranchId: string | null;
  onRetry: () => void;
  onView: (branch: Branch) => void;
  onEdit: (branch: Branch) => void;
  onToggleStatus: (branch: Branch) => void;
  onDelete: (branch: Branch) => void;
  onPageChange: (nextPage: number) => void;
};

export function BranchTable(props: BranchTableProps) {
  const {
    items,
    page,
    totalPages,
    isLoading,
    isError,
    isFetching,
    errorMessage,
    onRetry,
    onPageChange,
  } = props;
  return (
    <>
      {props.view === "cards" ? (
        <BranchCards {...props} />
      ) : (
        <div
          aria-busy={isFetching}
          className="branch-table-wrap"
          role="region"
          aria-label="Branches table"
          tabIndex={0}
        >
          <table className="branch-table">
            <caption className="visually-hidden">
              Branch locations, managers, operating status and available
              actions.
            </caption>
            <colgroup>
              <col className="branch-column" />
              <col className="location-column" />
              <col className="manager-column" />
              <col className="status-column" />
              <col className="actions-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">
                  <span className="branch-table-heading">Branch</span>
                </th>
                <th scope="col">
                  <span className="branch-table-heading">Location</span>
                </th>
                <th scope="col">
                  <span className="branch-table-heading">Manager</span>
                </th>
                <th scope="col">
                  <span className="branch-table-heading">Status</span>
                </th>
                <th scope="col">
                  <span className="branch-table-heading">Branch action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td className="branch-loading-cell" colSpan={5}>
                    <span className="visually-hidden">Loading branches</span>
                    <div aria-hidden="true" className="branch-loading-rows">
                      {Array.from({ length: 5 }, (_, index) => (
                        <div className="branch-loading-row" key={index}>
                          <Skeleton className="branch-skeleton-name" />
                          <Skeleton className="branch-skeleton-location" />
                          <Skeleton className="branch-skeleton-manager" />
                          <Skeleton className="branch-skeleton-status" />
                          <Skeleton className="branch-skeleton-action" />
                        </div>
                      ))}
                    </div>
                  </td>
                </tr>
              )}

              {isError && (
                <tr>
                  <td className="branch-empty branch-error" colSpan={5}>
                    <span role="alert">
                      {errorMessage || "Unable to load branches."}
                    </span>
                    <IconActionButton
                      className="branch-action-retry"
                      icon={RefreshCw}
                      label="Retry loading branches"
                      onClick={onRetry}
                    />
                  </td>
                </tr>
              )}

              {!isLoading &&
                !isError &&
                items.map((branch) => (
                  <tr className="branch-row" key={branch.id}>
                    <td>
                      <div className="branch-table-cell">
                        <div className="branch-name-cell">
                          <span className="branch-icon">
                            <Building2 size={17} />
                          </span>
                          <span>
                            <strong>{branch.name}</strong>
                            <small>{branch.code}</small>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="branch-table-cell">
                        <span className="branch-location">
                          <MapPin size={14} />
                          {[branch.city, branch.province]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="branch-table-cell">
                        {branch.managerName || "—"}
                      </div>
                    </td>
                    <td>
                      <div className="branch-table-cell">
                        <span
                          className={`branch-status ${branch.status.toLowerCase()}`}
                        >
                          {branch.status === "ACTIVE" ? "Active" : "Inactive"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="branch-table-cell branch-actions-cell">
                        <BranchActions branch={branch} {...props} />
                      </div>
                    </td>
                  </tr>
                ))}

              {!isLoading && !isError && items.length === 0 && (
                <tr>
                  <td className="branch-empty" colSpan={5}>
                    No branches match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="branch-pagination">
        <span>
          Page {page} of {totalPages}
        </span>
        <div>
          <IconActionButton
            className="branch-action-page"
            disabled={page <= 1}
            icon={ChevronLeft}
            label="Previous page"
            onClick={() => onPageChange(page - 1)}
          />
          <IconActionButton
            className="branch-action-page"
            disabled={page >= totalPages}
            icon={ChevronRight}
            label="Next page"
            onClick={() => onPageChange(page + 1)}
          />
        </div>
      </div>
    </>
  );
}
