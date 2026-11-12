"use client";
import { PageHeading, PageHeader } from "../components/page-heading";
import { RealtimeQueryProvider } from "../components/realtime-query-provider";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { QueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { api, currentYear, dateLabel } from "./api";
import {
  Empty,
  ErrorState,
  Filters,
  Loading,
  Pagination,
  Status,
  params,
} from "./ui";
import { useWorkspaceRole } from "../components/workspace-role-context";
import { PersonalLeave, PersonalAccountInfo } from "./personal-overview";
import { RequestForm } from "./request-form";
import { RequestDrawer } from "./request-drawer";
import { Balances } from "./balances";
import { Settings } from "./settings";
import { Reports } from "./reports";
import { TableTools } from "./table-tools";
import type { Context, LeaveType, Page, Section } from "./types";
import css from "./leave.module.css";
const titles: Record<Section, [string, string]> = {
  mine: ["Leave", "Your credits, requests, and decisions in one place."],
  requests: [
    "Requests & Approvals",
    "Review team requests with one clear approval step.",
  ],
  balances: [
    "Leave Balances",
    "Trace every credit, adjustment, reservation, and approved day.",
  ],
  settings: [
    "Leave Settings",
    "Configure approved policies and employee eligibility.",
  ],
  reports: [
    "Reports & Analytics",
    "Review leave activity and balances for your team.",
  ],
};
export default function LeaveWorkspace({ section }: { section: Section }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
        },
      }),
  );
  return (
    <RealtimeQueryProvider client={client}>
      <Suspense fallback={<Loading />}>
        <Workspace section={section} />
      </Suspense>
    </RealtimeQueryProvider>
  );
}
export function Workspace({ section }: { section: Section }) {
  const role = useWorkspaceRole();
  const context = useQuery({
    queryKey: ["leave", "context", section],
    queryFn: () =>
      api<Context>(section === "mine" ? "/me/context" : "/context"),
  });
  const types = useQuery({
    queryKey: ["leave", "types", section === "mine"],
    queryFn: () =>
      api<LeaveType[]>(section === "mine" ? "/me/types" : "/types"),
    enabled:
      !!context.data && (section !== "mine" || !!context.data.ownEmployee),
  });
  const [requesting, setRequesting] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const [leaveYear, setLeaveYear] = useState(String(currentYear()));
  const search = useSearchParams();
  const deepLink = search.get("requestId");
  const [dismissed, setDismissed] = useState<string | null>(null);
  const detail = selected ?? (deepLink !== dismissed ? deepLink : null);
  const c = context.data;
  const [title, description] = titles[section];
  return (
    <main className={css.scope}>
      <PageHeader className={css.header}>
        <div>
          <p className={css.eyebrow}>People · Leave</p>
          <PageHeading>{title}</PageHeading>
          <p>{description}</p>
        </div>
        {section === "mine" && c?.ownEmployee && (
          <div className={css.headerActions}>
            <Button onClick={() => setRequesting(true)}>Request Leave</Button>
            <label className={css.yearSelect}>
              Credit year
              <select
                value={leaveYear}
                onChange={(event) => setLeaveYear(event.target.value)}
              >
                {Array.from(
                  { length: Math.max(2, currentYear() - 1998) },
                  (_, index) => currentYear() + 1 - index,
                ).map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </select>
            </label>
          </div>
        )}
      </PageHeader>
      {context.isPending ? (
        <Loading />
      ) : context.isError ? (
        <ErrorState
          error={context.error}
          retry={() => void context.refetch()}
        />
      ) : (
        c && (
          <>
            {section === "mine" && !c.ownEmployee ? (
              <PersonalAccountInfo context={c} role={role} />
            ) : types.isPending ? (
              <Loading />
            ) : types.isError ? (
              <ErrorState
                error={types.error}
                retry={() => void types.refetch()}
              />
            ) : (
              <>
                {section === "mine" && (
                  <>
                    <PersonalAccountInfo context={c} role={role} />
                    <PersonalLeave
                      year={leaveYear}
                      renderHistory={(year) => (
                        <Requests own year={year} onSelect={setSelected} />
                      )}
                    />
                  </>
                )}{" "}
                {section === "requests" && c.canReview && (
                  <Requests
                    context={c}
                    types={types.data ?? []}
                    onSelect={setSelected}
                  />
                )}{" "}
                {section === "balances" && c.canReview && (
                  <Balances context={c} types={types.data ?? []} />
                )}{" "}
                {section === "settings" && c.canConfigure && (
                  <Settings context={c} types={types.data ?? []} />
                )}{" "}
                {section === "reports" && c.canReview && (
                  <Reports context={c} types={types.data ?? []} />
                )}
              </>
            )}
            {requesting && <RequestForm onClose={() => setRequesting(false)} />}{" "}
            {detail && /^[\da-f-]{36}$/i.test(detail) && (
              <RequestDrawer
                id={detail}
                context={c}
                onClose={() => {
                  setSelected(null);
                  setDismissed(deepLink);
                }}
              />
            )}
          </>
        )
      )}
    </main>
  );
}
function Requests({
  context,
  types = [],
  own = false,
  year,
  onSelect,
}: {
  context?: Context;
  types?: LeaveType[];
  own?: boolean;
  year?: string;
  onSelect: (id: string) => void;
}) {
  const search = useSearchParams();
  const [filters, setFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      ["employeeId", "typeId", "status", "from", "to", "year"].map((k) => [
        k,
        search.get(k) ?? "",
      ]),
    ),
  );
  const [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState("");
  const [tableSort, setTableSort] = useState("submitted-desc");
  const query = params({
    ...filters,
    ...(own ? { year: year ?? "", branchId: "", employeeId: "" } : {}),
    page: String(page),
    limit: "20",
  });
  const q = useQuery({
    queryKey: ["leave", own ? "my-requests" : "requests", query],
    queryFn: () => api<Page>(`${own ? "/me" : ""}/requests?${query}`),
  });
  const visible = (q.data?.items ?? [])
    .filter((request) =>
      [
        request.employeeName,
        request.branchName,
        request.typeName,
        request.status,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(tableSearch.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => {
      if (tableSort === "submitted-asc")
        return a.submittedAt.localeCompare(b.submittedAt);
      if (tableSort === "type") return a.typeName.localeCompare(b.typeName);
      if (tableSort === "employee")
        return a.employeeName.localeCompare(b.employeeName);
      return b.submittedAt.localeCompare(a.submittedAt);
    });
  return (
    <section className={css.panel}>
      <div className={css.toolbar}>
        <div>
          <h2>{own ? "Request history" : "Request queue"}</h2>
          <p className={css.muted}>
            {own
              ? "Select a request to view its timeline or cancel when permitted."
              : "Open a request to review the dates, reason and next action."}
          </p>
        </div>
        {own && (
          <label>
            Status{" "}
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters({ ...filters, status: e.target.value });
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      {context && (
        <Filters
          context={context}
          types={types}
          values={filters}
          onChange={(k, v) => {
            setFilters({
              ...filters,
              [k]: v,
              ...(k === "branchId" ? { employeeId: "" } : {}),
            });
            setPage(1);
          }}
        />
      )}
      {!q.isPending && !q.isError && (
        <TableTools
          search={tableSearch}
          onSearch={setTableSearch}
          sort={tableSort}
          onSort={setTableSort}
          sortOptions={[
            { value: "submitted-desc", label: "Newest submitted" },
            { value: "submitted-asc", label: "Oldest submitted" },
            { value: "type", label: "Leave type A–Z" },
            ...(!own ? [{ value: "employee", label: "Employee A–Z" }] : []),
          ]}
          count={visible.length}
          label="requests"
          pageOnly
        />
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        <>
          {!visible.length ? (
            <Empty>
              {tableSearch
                ? "No requests match your search on this page."
                : "No leave requests match these filters."}
            </Empty>
          ) : (
            <div
              className={css.scroll}
              role="region"
              aria-label="Leave requests"
              tabIndex={0}
            >
              <table className={css.table}>
                <thead>
                  <tr>
                    {!own && (
                      <>
                        <th>Employee</th>
                        <th>Branch</th>
                      </>
                    )}
                    <th>Leave type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Status</th>
                    <th>Submitted</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id}>
                      {!own && (
                        <>
                          <th scope="row" className={css.rowTitle}>
                            {r.employeeName}
                          </th>
                          <td>{r.branchName}</td>
                        </>
                      )}
                      <td>
                        <strong>{r.typeName}</strong>
                        <small>{r.policy.paid ? "Paid" : "Unpaid"}</small>
                      </td>
                      <td>
                        {dateLabel(r.startDate)} – {dateLabel(r.endDate)}
                        {r.halfDay && <small>Half day</small>}
                      </td>
                      <td>{r.days}</td>
                      <td>
                        <Status value={r.status} />
                        {r.cancellationReviewStatus && (
                          <small>
                            {r.cancellationReviewStatus === "AWAITING_EMPLOYEE"
                              ? own
                                ? "Your response needed"
                                : "Employee response needed"
                              : own
                                ? "Reviewer decision pending"
                                : "Review cancellation"}
                          </small>
                        )}
                      </td>
                      <td>{dateLabel(r.submittedAt)}</td>
                      <td>
                        <Button
                          variant="outline"
                          aria-label={`View ${r.typeName} request details${own ? "" : ` for ${r.employeeName}`}`}
                          onClick={() => onSelect(r.id)}
                        >
                          View details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} total={q.data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}
