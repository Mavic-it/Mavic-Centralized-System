"use client";
import type { Collection, Inquiry, Metadata } from "./types";
import { label, statuses } from "./types";
import css from "./workspace.module.css";
export function InquiryList({
  data,
  meta,
  view,
  onOpen,
  selected,
  onSelect,
  page,
  onPage,
}: {
  data: Collection;
  meta: Metadata;
  view: string;
  onOpen: (id: string) => void;
  selected: string[];
  onSelect: (ids: string[]) => void;
  page: number;
  onPage: (p: number) => void;
}) {
  const services = (r: Inquiry) =>
    r.serviceIds
      .map(
        (id) =>
          meta.lookups.find((l) => l.id === id)?.label ?? "Historical service",
      )
      .join(", ");
  if (!data.items.length)
    return <div className={css.empty}>No inquiries match these filters.</div>;
  return (
    <>
      <p className={css.muted}>
        {data.total.toLocaleString()} inquiries · Page {page} of{" "}
        {Math.max(1, Math.ceil(data.total / data.pageSize))}
        {view === "kanban" ? " · Board shows this page of results" : ""}
      </p>
      {view === "kanban" ? (
        <div className={css.board}>
          {statuses
            .filter((s) => data.items.some((i) => i.status === s))
            .map((status) => (
              <section className={css.column} key={status}>
                <h2>
                  {label(status)} ·{" "}
                  {data.items.filter((i) => i.status === status).length}
                </h2>
                {data.items
                  .filter((i) => i.status === status)
                  .map((i) => (
                    <button key={i.id} onClick={() => onOpen(i.id)}>
                      <small>{i.reference}</small>
                      <strong>{i.clientName}</strong>
                      <span>{services(i)}</span>
                      <small>
                        {i.branchName} · {i.assignedStaffName ?? "Unassigned"}
                      </small>
                    </button>
                  ))}
              </section>
            ))}
        </div>
      ) : (
        <div className={css.scroll}>
          <table className={css.table}>
            <caption className="visually-hidden">Inquiry records</caption>
            <thead>
              <tr>
                <th scope="col">
                  {meta.permissions.archive && (
                    <input
                      aria-label="Select this page"
                      type="checkbox"
                      checked={data.items.every((i) => selected.includes(i.id))}
                      onChange={(e) =>
                        onSelect(
                          e.target.checked ? data.items.map((i) => i.id) : [],
                        )
                      }
                    />
                  )}
                </th>
                {[
                  "Reference / Client",
                  "Inquiry date",
                  "Handling branch",
                  "Services",
                  "Status",
                  "Assigned staff",
                ].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    {meta.permissions.archive && (
                      <input
                        aria-label={`Select ${i.reference}`}
                        type="checkbox"
                        checked={selected.includes(i.id)}
                        onChange={(e) =>
                          onSelect(
                            e.target.checked
                              ? [...selected, i.id]
                              : selected.filter((id) => id !== i.id),
                          )
                        }
                      />
                    )}
                  </td>
                  <td>
                    <button className={css.link} onClick={() => onOpen(i.id)}>
                      {i.clientName}
                    </button>
                    <small>{i.reference}</small>
                  </td>
                  <td>{i.inquiryDate ?? "Needs review"}</td>
                  <td>{i.branchName}</td>
                  <td>{services(i) || "Unclassified"}</td>
                  <td>
                    <span className={css.badge} data-status={i.status}>
                      {label(i.status)}
                    </span>
                    {i.legacyOutcome && (
                      <small>Legacy {label(i.legacyOutcome)}</small>
                    )}
                  </td>
                  <td>
                    {i.assignedStaffName ?? "Unassigned"}
                    <small>{label(i.priority)} priority</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className={css.actions}>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button
          disabled={page * data.pageSize >= data.total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </>
  );
}
