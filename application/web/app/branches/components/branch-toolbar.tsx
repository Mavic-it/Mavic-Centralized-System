import { LoaderCircle, Search, LayoutGrid, List } from "lucide-react";

import directory from "../../components/admin-directory.module.css";

type BranchToolbarProps = {
  view?: "cards" | "table";
  onViewChange?: (view: "cards" | "table") => void;
  search: string;
  status: string;
  branchesCount: number;
  isFetching: boolean;
  onSearchChange: (nextValue: string) => void;
  onStatusChange: (nextValue: string) => void;
  onClearFilters?: () => void;
};

export function BranchToolbar({
  view,
  onViewChange,
  search,
  status,
  branchesCount,
  isFetching,
  onSearchChange,
  onStatusChange,
  onClearFilters,
}: BranchToolbarProps) {
  return (
    <div className="branch-toolbar">
      {onViewChange && (
        <div
          className={directory.viewSwitch}
          role="group"
          aria-label="Branch display"
        >
          <button
            type="button"
            aria-pressed={view === "cards"}
            onClick={() => onViewChange("cards")}
          >
            <LayoutGrid size={15} aria-hidden="true" />
            Cards
          </button>
          <button
            type="button"
            aria-pressed={view === "table"}
            onClick={() => onViewChange("table")}
          >
            <List size={15} aria-hidden="true" />
            Table
          </button>
        </div>
      )}
      <label className="branch-search">
        <Search size={16} aria-hidden="true" />
        <input
          aria-label="Search branches"
          placeholder="Search code, branch, city, or manager"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <label className="branch-filter">
        Status
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </label>

      {(search || status !== "ALL") && onClearFilters && (
        <button
          className="branch-secondary"
          type="button"
          onClick={onClearFilters}
        >
          Clear filters
        </button>
      )}
      <span className="branch-count" aria-live="polite">
        {isFetching ? (
          <>
            <LoaderCircle
              aria-hidden="true"
              className="loading-spinner"
              size={12}
            />
            Updating list
          </>
        ) : (
          `${branchesCount} ${search || status !== "ALL" ? "matching branches" : "branches"}`
        )}
      </span>
    </div>
  );
}
