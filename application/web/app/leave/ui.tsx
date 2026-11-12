"use client";
import type { ReactNode } from "react";
import { Button } from "../components/ui/button";
import { Skeleton } from "../components/ui/skeleton";
import type { Context, LeaveType } from "./types";
import css from "./leave.module.css";
export function Loading() {
  return (
    <section
      className={css.loading}
      role="status"
      aria-busy="true"
      aria-label="Loading leave records"
    >
      <Skeleton className={css.skeleton} />
      <Skeleton className={css.skeleton} />
      <Skeleton className={css.skeleton} />
    </section>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div role="alert" className={css.error}>
      <span>{error.message}</span>
      {retry && (
        <Button type="button" variant="outline" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className={css.empty} role="status">
      {children}
    </div>
  );
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`${css.status} ${css[value.toLowerCase()]}`}>
      {value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}
export function Metrics({
  items,
}: {
  items: Array<{ label: string; value: number | string; detail?: string }>;
}) {
  return (
    <section className={css.metrics} aria-label="Leave summary">
      {items.map((item) => (
        <article className={css.metric} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.detail && <small>{item.detail}</small>}
        </article>
      ))}
    </section>
  );
}
export function Pagination({
  page,
  total,
  limit = 20,
  recordLabel = "records",
  onChange,
}: {
  page: number;
  total: number;
  limit?: number;
  recordLabel?: string;
  onChange: (page: number) => void;
}) {
  return (
    <nav aria-label="Leave record pages" className={css.pagination}>
      <span>
        {total} {recordLabel} · Page {page} of{" "}
        {Math.max(1, Math.ceil(total / limit))}
      </span>
      <Button
        variant="outline"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous
      </Button>
      <Button
        variant="outline"
        disabled={page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        Next
      </Button>
    </nav>
  );
}
export function Filters({
  context,
  types,
  values,
  onChange,
  status = true,
  dates = true,
}: {
  context: Context;
  types: Array<Pick<LeaveType, "id" | "name">>;
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  status?: boolean;
  dates?: boolean;
}) {
  return (
    <div className={css.filters} role="group" aria-label="Filter leave records">
      <label>
        Employee
        <select
          value={values.employeeId ?? ""}
          onChange={(e) => onChange("employeeId", e.target.value)}
        >
          <option value="">All employees</option>
          {context.employees
            .filter((e) => !values.branchId || e.branchId === values.branchId)
            .map((e) => (
              <option value={e.id} key={e.id}>
                {e.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Leave type
        <select
          value={values.typeId ?? ""}
          onChange={(e) => onChange("typeId", e.target.value)}
        >
          <option value="">All leave types</option>
          {types.map((t) => (
            <option value={t.id} key={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      {status && (
        <label>
          Status
          <select
            value={values.status ?? ""}
            onChange={(e) => onChange("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
        </label>
      )}
      {dates && (
        <>
          <label>
            From
            <input
              type="date"
              value={values.from ?? ""}
              onChange={(e) => onChange("from", e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              min={values.from || undefined}
              value={values.to ?? ""}
              onChange={(e) => onChange("to", e.target.value)}
            />
          </label>
        </>
      )}
    </div>
  );
}
export const params = (values: Record<string, string>) =>
  new URLSearchParams(Object.entries(values).filter(([, v]) => v)).toString();
