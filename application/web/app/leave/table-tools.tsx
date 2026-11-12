import { ArrowDownUp, Search, X } from "lucide-react";
import css from "./leave.module.css";

export function TableTools({
  search,
  onSearch,
  sort,
  onSort,
  sortOptions,
  count,
  label,
  pageOnly = false,
}: {
  search: string;
  onSearch: (value: string) => void;
  sort: string;
  onSort: (value: string) => void;
  sortOptions: { value: string; label: string }[];
  count: number;
  label: string;
  pageOnly?: boolean;
}) {
  return (
    <div className={css.tableTools}>
      <label className={css.tableSearch}>
        Search {pageOnly ? "this page" : label}
        <span className={css.tableInputWrap}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder={`Search ${label}`}
          />
        </span>
      </label>
      <label className={css.tableSort}>
        Sort by
        <span className={css.tableInputWrap}>
          <ArrowDownUp size={15} aria-hidden="true" />
          <select value={sort} onChange={(event) => onSort(event.target.value)}>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </span>
      </label>
      {search && (
        <button
          className={css.clearSearch}
          type="button"
          onClick={() => onSearch("")}
        >
          <X size={14} aria-hidden="true" /> Clear search
        </button>
      )}
      <span className={css.resultCount} role="status">
        {count} shown{pageOnly ? " on this page" : ""}
      </span>
    </div>
  );
}
