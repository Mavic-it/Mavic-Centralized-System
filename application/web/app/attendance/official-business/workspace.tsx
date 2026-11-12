"use client";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, Clock3, MapPin, Plus, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "../../components/ui/button";
import { notifySuccess } from "../../lib/notifications";
import { obApi, obDate, obTime } from "./api";
import type { ObContext, ObRequest } from "./types";
import { ObRequestForm } from "./request-form";
import { ObRequestDrawer } from "./request-drawer";
import css from "./ob.module.css";
export function OfficialBusinessWorkspace({
  branchId,
  initialId,
  showHeading = true,
}: {
  branchId: string;
  initialId?: string | null;
  showHeading?: boolean;
}) {
  const cache = useQueryClient();
  const [view, setView] = useState("mine"),
    [status, setStatus] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    [employeeId, setEmployeeId] = useState("");
  const [filing, setFiling] = useState(false),
    [selected, setSelected] = useState<string | null>(initialId ?? null);
  const context = useQuery({
    queryKey: ["official-business", "context"],
    queryFn: () => obApi<ObContext>("/context"),
  });
  const listView =
    context.data?.canFile === false && context.data.canReview ? "review" : view;
  const hasFilters = Boolean(status || from || to || employeeId);
  const params = new URLSearchParams({
    view: listView,
    status,
    from,
    to,
    page: String(page),
    ...(listView === "review" && branchId ? { branchId } : {}),
    ...(employeeId ? { employeeId } : {}),
  });
  for (const [key, value] of [...params]) if (!value) params.delete(key);
  const list = useQuery({
    queryKey: ["official-business", "list", params.toString()],
    queryFn: () =>
      obApi<{ items: ObRequest[]; hasNext: boolean; page: number }>(
        `/requests?${params}`,
      ),
    enabled: !!context.data,
    refetchInterval: 30000,
  });
  async function saved(id?: string) {
    await cache.invalidateQueries({
      predicate: (q) =>
        /attendance|dtr|schedule|official-business|notification/i.test(
          JSON.stringify(q.queryKey),
        ),
    });
    notifySuccess("Official Business request updated.");
    setFiling(false);
    if (id) setSelected(id);
  }
  if (context.isPending)
    return (
      <section className={css.panel} aria-busy="true">
        <div className={css.skeleton} />
        <div className={css.skeleton} />
        <p role="status">Loading Official Business...</p>
      </section>
    );
  if (context.isError)
    return (
      <section className={css.panel}>
        <p role="alert">{context.error.message}</p>
        <Button onClick={() => void context.refetch()}>Retry</Button>
      </section>
    );
  return (
    <section className={css.panel}>
      {showHeading && (
        <header className={css.toolbar}>
          {showHeading && (
            <div>
              <p className={css.eyebrow}>Work away from the office</p>
              <h2>
                <BriefcaseBusiness size={22} aria-hidden="true" /> Official
                Business
              </h2>
              <p>
                File field or branch assignments and explain missing biometric
                punches.
              </p>
            </div>
          )}
        </header>
      )}
      {!context.data.ownEmployee && (
        <p className={css.notice}>
          Your account has no linked employee.{" "}
          {!context.data.canFile && context.data.canReview
            ? "Your account can review Official Business requests."
            : context.data.canReview
              ? "You may file on behalf of an authorized employee."
              : "Link your employee record before filing."}
        </p>
      )}
      <div className={css.listToolbar}>
        <div className={css.filters}>
          {context.data.canReview && (
            <label>
              Requests
              <select
                value={listView}
                onChange={(e) => {
                  setView(e.target.value);
                  setEmployeeId("");
                  setPage(1);
                }}
              >
                {context.data.canFile && (
                  <option value="mine">My filings</option>
                )}
                <option value="review">Authorized requests</option>
              </select>
            </label>
          )}
          {listView === "review" && (
            <label>
              Employee
              <select
                value={employeeId}
                onChange={(e) => {
                  setEmployeeId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All employees</option>
                {context.data.employees
                  .filter((e) => !branchId || e.branchId === branchId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label>
            Status
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["PENDING", "APPROVED", "REJECTED", "CANCELLED"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className={css.actions}>
          {hasFilters && (
            <Button
              variant="outline"
              onClick={() => {
                setStatus("");
                setFrom("");
                setTo("");
                setEmployeeId("");
                setPage(1);
              }}
            >
              <RotateCcw size={15} aria-hidden="true" /> Clear filters
            </Button>
          )}
          <Button
            variant="outline"
            aria-label="Refresh OB requests"
            onClick={() => void list.refetch()}
            disabled={list.isFetching}
          >
            <RefreshCw size={16} />
          </Button>
          {context.data.canFile && (
            <Button onClick={() => setFiling(true)}>
              <Plus size={16} /> File OB
            </Button>
          )}
        </div>
      </div>
      <div className={css.results}>
        {!list.isPending && !list.isError && (
          <div className={css.resultsHeading} aria-live="polite">
            <div>
              <h3>{listView === "review" ? "Requests to review" : "My requests"}</h3>
              <p>{list.data?.items.length ?? 0} shown on this page{hasFilters ? " · Filters applied" : ""}</p>
            </div>
          </div>
        )}
        {list.isPending ? (
          <p role="status">Loading requests...</p>
        ) : list.isError ? (
          <div>
            <p className={css.error} role="alert">
              {list.error.message}
            </p>
            <Button onClick={() => void list.refetch()}>Retry</Button>
          </div>
        ) : !list.data.items.length ? (
          <div className={css.empty}>
            <BriefcaseBusiness size={30} />
            <h3>No OB filings in this view</h3>
            <p>{hasFilters ? "Try clearing the filters to see more requests." : "Requests will appear here when filed."}</p>
          </div>
        ) : (
          <>
            <div className={css.cards}>
              {list.data.items.map((r) => (
                <article key={r.id} className={css.card}>
                  <button
                    type="button"
                    className={css.cardHitArea}
                    aria-label={`Open ${r.employeeName}'s Official Business request for ${obDate(r.workDate)}`}
                    onClick={() => setSelected(r.id)}
                  />
                  <div className={css.cardTop}>
                    <span className={css.cardDate}><CalendarDays size={15} aria-hidden="true" /> {obDate(r.workDate)}</span>
                    <span className={css.badge} data-status={r.status}>
                      {r.status}
                    </span>
                  </div>
                  <h3>{r.employeeName}</h3>
                  <p className={css.cardFact}>
                    <Clock3 size={15} aria-hidden="true" />
                    {obTime(r.startsAt, r.timeZone)} -{" "}
                    {obTime(r.endsAt, r.timeZone)}
                  </p>
                  <p className={css.cardFact}><MapPin size={15} aria-hidden="true" /> {r.destination}</p>
                  <small>{r.branchName}</small>
                  {r.cancellationPending && <span className={css.cardAlert}>Cancellation needs review</span>}
                  <span className={css.cardAction} aria-hidden="true">
                    View request <ArrowUpRight size={16} />
                  </span>
                </article>
              ))}
            </div>
            <div className={css.footer}>
              <span>Page {page}</span>
              <div className={css.actions}>
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  disabled={!list.data.hasNext}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
      {filing && context.data.canFile && (
        <ObRequestForm
          context={context.data}
          onClose={() => setFiling(false)}
          onSaved={(id) => void saved(id)}
        />
      )}
      {selected && (
        <ObRequestDrawer
          key={selected}
          id={selected}
          onClose={() => setSelected(null)}
          onSaved={() => void saved()}
        />
      )}
    </section>
  );
}
