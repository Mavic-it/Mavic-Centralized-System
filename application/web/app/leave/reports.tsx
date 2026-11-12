"use client";
import { useState } from "react";
import { Download, SlidersHorizontal, RotateCcw } from "lucide-react";
import { Button } from "../components/ui/button";
import { TypeBreakdown } from "./type-breakdown";
import { useQuery } from "@tanstack/react-query";
import { api, currentYear } from "./api";
import {
  ErrorState,
  Loading,
  Empty,
  Filters,
  Metrics,
  Status,
  params,
} from "./ui";
import type { Context, LeaveType, Report } from "./types";
import css from "./leave.module.css";
export function Reports({
  context,
  types,
}: {
  context: Context;
  types: LeaveType[];
}) {
  const [filters, setFilters] = useState<Record<string, string>>({
    year: String(currentYear()),
  });
  const query = params(filters);
  const q = useQuery({
    queryKey: ["leave", "report", query],
    queryFn: () => api<Report>(`/reports/overview?${query}`),
  });
  const rows = q.data?.requests ?? [],
    balances = q.data?.balances ?? [];
  const filterTypes = [
    ...types,
    ...(q.data?.typeBreakdown ?? [])
      .filter((t) => !types.some((existing) => existing.id === t.typeId))
      .map((t) => ({ id: t.typeId, name: t.typeName })),
  ];
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const used = balances.reduce((n, b) => n + b.used - b.restored, 0),
    available = balances.reduce((n, b) => n + b.available, 0);
  const maxCount = Math.max(
    1,
    ...["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map(count),
  );
  return (
    <>
      <section className={`${css.panel} ${css.reportFilters}`}>
        <div className={css.toolbar}>
          <div>
            <p className={css.eyebrow}>Reporting workspace</p>
            <h2>
              <SlidersHorizontal size={18} aria-hidden="true" /> Refine your
              view
            </h2>
            <p className={css.muted}>
              Compare leave activity across your authorized teams.
            </p>
          </div>
          <div className={css.actions}>
            <Button
              variant="ghost"
              onClick={() => setFilters({ year: String(currentYear()) })}
            >
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </Button>
            <a
              className={css.exportButton}
              download
              href={`/api/leave/reports/export?${query}&format=csv`}
            >
              <Download size={14} aria-hidden="true" /> Export CSV
            </a>
            <a
              className={css.exportButton}
              download
              href={`/api/leave/reports/export?${query}&format=xlsx`}
            >
              <Download size={14} aria-hidden="true" /> Export Excel
            </a>
            <label>
              Year{" "}
              <input
                aria-label="Report year"
                type="number"
                min={2000}
                max={currentYear() + 1}
                value={filters.year}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    year: e.target.value,
                    from: "",
                    to: "",
                  })
                }
              />
            </label>
          </div>
        </div>
        <Filters
          context={context}
          types={filterTypes}
          values={filters}
          onChange={(k, v) =>
            setFilters({
              ...filters,
              [k]: v,
              ...(k === "branchId" ? { employeeId: "" } : {}),
            })
          }
        />
      </section>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          <p className={css.notice}>{q.data.basis}</p>
          <Metrics
            items={[
              { label: "Pending requests", value: count("PENDING") },
              { label: "Approved requests", value: count("APPROVED") },
              { label: "Rejected requests", value: count("REJECTED") },
              { label: "Used paid leave days", value: used },
              { label: "Available leave days", value: available },
            ]}
          />
          <div className={css.reportCharts}>
            <section className={css.chart} aria-label="Requests by status">
              <h2>Requests by status</h2>
              <p className={css.muted}>
                Select a status to inspect its requests.
              </p>
              {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
                <a
                  className={css.barRow}
                  key={s}
                  href={`/leave?${params({ ...filters, status: s })}`}
                >
                  <Status value={s} />
                  <span className={css.track} aria-hidden="true">
                    <span
                      className={css.bar}
                      style={{ width: `${(count(s) / maxCount) * 100}%` }}
                    />
                  </span>
                  <strong>{count(s)}</strong>
                </a>
              ))}
              {!rows.length && (
                <p className={css.muted}>No requests match these filters.</p>
              )}
            </section>
            <TypeBreakdown
              items={q.data.typeBreakdown ?? []}
              asOf={q.data.asOf}
              onSelect={(id) => setFilters({ ...filters, typeId: id })}
            />
          </div>
          <section className={css.panel}>
            <div className={css.toolbar}>
              <h2>Underlying requests</h2>
              <span className={css.muted}>{rows.length} requests</span>
            </div>
            {!rows.length ? (
              <Empty>No requests in the selected period.</Empty>
            ) : (
              <div
                className={css.scroll}
                role="region"
                aria-label="Report request records"
                tabIndex={0}
              >
                <table className={css.table}>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Branch</th>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <a
                            className={css.link}
                            href={`/leave?requestId=${r.id}`}
                          >
                            {r.employeeName}
                          </a>
                        </td>
                        <td>{r.branchName}</td>
                        <td>{r.typeName}</td>
                        <td>
                          {r.startDate} – {r.endDate}
                        </td>
                        <td>{r.days}</td>
                        <td>
                          <Status value={r.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
