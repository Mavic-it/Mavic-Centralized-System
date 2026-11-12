import { ChevronLeft, ChevronRight } from "lucide-react";
import styles from "./table-pagination.module.css";

export const TABLE_PAGE_SIZE = 10;

export function paginateTableRows<T>(
  rows: readonly T[],
  requestedPage: number,
): { items: T[]; page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / TABLE_PAGE_SIZE));
  const page = Math.max(1, Math.min(Math.floor(requestedPage), totalPages));
  const startIndex = (page - 1) * TABLE_PAGE_SIZE;

  return {
    items: rows.slice(startIndex, startIndex + TABLE_PAGE_SIZE),
    page,
    totalPages,
  };
}

export function TablePagination({
  label,
  onPageChange,
  page,
  totalItems,
}: {
  label: string;
  onPageChange: (page: number) => void;
  page: number;
  totalItems: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / TABLE_PAGE_SIZE));
  const currentPage = Math.max(1, Math.min(Math.floor(page), totalPages));
  const firstItem = totalItems === 0 ? 0 : (currentPage - 1) * TABLE_PAGE_SIZE + 1;
  const lastItem = Math.min(currentPage * TABLE_PAGE_SIZE, totalItems);

  return (
    <nav aria-label={`${label} pagination`} className={styles.pagination}>
      <span aria-live="polite">
        Page {currentPage} of {totalPages} · Showing {firstItem}–{lastItem} of{" "}
        {totalItems}
      </span>
      <div className={styles.controls}>
        <button
          aria-label={`Previous ${label} page`}
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          type="button"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <button
          aria-label={`Next ${label} page`}
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          type="button"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
    </nav>
  );
}
