import { useState } from "react";
import Link from "next/link";
import type { Analytics, Metadata } from "./types";
import { label } from "./types";
import css from "./workspace.module.css";
export function InquiryAnalytics({
  data,
  report,
  search,
  meta,
}: {
  data: Analytics;
  report: boolean;
  search: string;
  meta?: Metadata;
}) {
  const t = data.totals;
  const rates = {
    conversionRate: t.eligible
      ? Math.round((t.converted / t.eligible) * 1000) / 10
      : 0,
    noResponseRate: t.total
      ? Math.round((t.noResponse / t.total) * 1000) / 10
      : 0,
  };
  const cards = {
    total: t.total,
    new: t.new,
    active: t.active,
    noResponse: t.noResponse,
    followUpsToday: data.followups.today,
    overdueFollowUps: data.followups.overdue,
    pendingReservations: t.pendingReservations,
    reserved: t.reserved,
    converted: t.converted,
    lost: t.lost,
    ...rates,
    legacyReserved: t.legacyReserved,
  };
  const primaryCards = [
    "total",
    "active",
    "followUpsToday",
    "conversionRate",
  ];
  const cardLabels: Record<string, string> = {
    total: "Total inquiries",
    new: "New inquiries",
    active: "Active inquiries",
    noResponse: "No response",
    followUpsToday: "Follow-ups due today",
    overdueFollowUps: "Overdue follow-ups",
    pendingReservations: "Pending reservations",
    reserved: "Reserved",
    converted: "Converted",
    lost: "Lost",
    conversionRate: "Conversion rate",
    noResponseRate: "No-response rate",
    legacyReserved: "Legacy reserved",
  };
  const dimensions = Object.keys(data.groups);
  const initialDimension =
    dimensions.includes("status") && data.groups.status.length
      ? "status"
      : (dimensions.find((key) => data.groups[key].length) ??
        dimensions[0] ??
        "");
  const [selectedDimension, setSelectedDimension] = useState(() =>
    initialDimension,
  );
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const dimension = data.groups[selectedDimension]
    ? selectedDimension
    : (dimensions[0] ?? "");
  const rows = dimension ? data.groups[dimension] ?? [] : [];
  const maxCount = Math.max(1, ...rows.map((row) => row.count));
  const pointHref = (
    dimension: string,
    row: { label: string; staffId?: string | null; branchId?: string },
  ) => {
    const q = new URLSearchParams(search);
    q.delete("metric");
    q.delete("page");
    let target = "/inquiries/list";
    const period = (value: string, task = false) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
      const start = new Date(`${value}T00:00:00Z`),
        end = new Date(start);
      const grouping = q.get("grouping") || "month";
      if (grouping === "day") end.setUTCDate(end.getUTCDate() + 1);
      else if (grouping === "week") end.setUTCDate(end.getUTCDate() + 7);
      else if (grouping === "year")
        end.setUTCFullYear(end.getUTCFullYear() + 1);
      else
        end.setUTCMonth(end.getUTCMonth() + (grouping === "quarter" ? 3 : 1));
      end.setUTCDate(end.getUTCDate() - 1);
      const last = end.toISOString().slice(0, 10);
      if (task) {
        q.set("followUpFrom", value);
        q.set("followUpTo", last);
      } else {
        const from = q.get("from")?.slice(0, 10),
          to = q.get("to")?.slice(0, 10);
        q.set("from", from && from > value ? from : value);
        q.set("to", to && to < last ? to : last);
      }
      return true;
    };
    if (dimension === "status") q.set("status", row.label);
    else if (dimension === "branch" && row.branchId)
      q.set("branchId", row.branchId);
    else if (dimension === "staff" && row.staffId)
      q.set("assignedStaffId", row.staffId);
    else if (
      ["source", "channel", "service", "serviceStatus"].includes(dimension)
    ) {
      const parts = row.label.split(" / "),
        status = dimension === "serviceStatus" ? parts.pop() : undefined,
        name = parts.join(" / ");
      const kind =
        dimension === "serviceStatus" ? "SERVICE" : dimension.toUpperCase();
      const lookup = meta?.lookups.find(
        (l) => l.kind === kind && l.label === name,
      );
      if (!lookup) return null;
      q.set(
        dimension === "serviceStatus" ? "serviceId" : `${dimension}Id`,
        lookup.id,
      );
      if (status) q.set("status", status);
    } else if (dimension === "period") {
      if (!period(row.label)) return null;
    } else if (dimension === "lostReason") {
      q.set("status", "LOST");
      q.set("lostReason", row.label);
    } else if (dimension === "followUpCompletion") {
      const [date, status] = row.label.split(" / ");
      if (!period(date, true)) return null;
      target = "/inquiries/followups";
      q.set(
        "followUpQueue",
        status === "COMPLETED"
          ? "completed"
          : status === "CANCELLED"
            ? "cancelled"
            : "team",
      );
    } else return null;
    return `${target}?${q}`;
  };
  return (
    <div className={css.analytics}>
      <section className={css.summarySection} aria-labelledby="inquiry-summary-title">
        <div className={css.summaryHeader}>
          <div>
            <h2 id="inquiry-summary-title">At a glance</h2>
            <p>Key activity for the filters you selected.</p>
          </div>
          <button
            type="button"
            className={css.secondary}
            aria-expanded={showAllMetrics}
            aria-controls="inquiry-metric-cards"
            onClick={() => setShowAllMetrics((expanded) => !expanded)}
          >
            {showAllMetrics ? "Show fewer metrics" : "Show all metrics"}
          </button>
        </div>
        <div id="inquiry-metric-cards" className={css.stats}>
          {Object.entries(cards)
            .filter(([key]) => showAllMetrics || primaryCards.includes(key))
            .map(([key, value]) => (
              <Link
                href={(() => {
                  const q = new URLSearchParams(search);
                  q.delete("status");
                  q.delete("page");
                  if (
                    [
                      "active",
                      "noResponse",
                      "new",
                      "pendingReservations",
                      "reserved",
                      "converted",
                      "lost",
                      "legacyReserved",
                      "followUpsToday",
                      "overdueFollowUps",
                    ].includes(key)
                  )
                    q.set("metric", key);
                  else q.delete("metric");
                  return `/inquiries/list?${q}`;
                })()}
                className={`${css.card} ${css.stat}`}
                key={key}
              >
                <span>{cardLabels[key] ?? label(key)}</span>
                <strong>
                  {value ?? 0}
                  {key.endsWith("Rate") ? "%" : ""}
                </strong>
              </Link>
            ))}
        </div>
      </section>
      <section
        className={`${css.panel} ${css.breakdownPanel}`}
        aria-labelledby="inquiry-breakdown-title"
      >
        <div className={css.breakdownHeader}>
          <div>
            <h2 id="inquiry-breakdown-title">
              {report ? "Detailed report" : "Inquiry breakdown"}
            </h2>
            <p>Choose a view, then select a value to see matching inquiries.</p>
          </div>
          {dimensions.length > 0 && (
            <label className={css.dimensionSelect}>
              Breakdown by
              <select
                value={dimension}
                onChange={(event) => setSelectedDimension(event.target.value)}
              >
                {dimensions.map((key) => (
                  <option key={key} value={key}>
                    {label(key)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <p className={css.reportNote}>
          Based on inquiry date. Verified conversions exclude imported legacy
          outcomes; service totals may overlap.
        </p>
        {!dimension ? (
          <div className={css.empty}>
            <strong>No breakdowns available yet</strong>
            <p>Try another date range or branch.</p>
          </div>
        ) : !rows.length ? (
          <div className={css.empty}>
            <strong>No {label(dimension).toLowerCase()} results</strong>
            <p>Try adjusting the filters to see more activity.</p>
          </div>
        ) : report ? (
          <div className={css.scroll}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">{label(dimension)}</th>
                  <th scope="col">
                    {dimension === "followUpCompletion" ? "Tasks" : "Inquiries"}
                  </th>
                  <th scope="col">
                    {dimension === "followUpCompletion" ? "Completed" : "Converted"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const href = pointHref(dimension, row);
                  const rowKey =
                    dimension === "staff"
                      ? (row.staffId ?? row.label)
                      : dimension === "branch"
                        ? (row.branchId ?? row.label)
                        : row.label;
                  return (
                    <tr key={rowKey}>
                      <td>
                        {href ? (
                          <Link href={href} className={css.breakdownLink}>
                            {dimension === "status" ? label(row.label) : row.label}
                          </Link>
                        ) : (
                          row.label
                        )}
                      </td>
                      <td>{row.count}</td>
                      <td>{row.converted}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          rows.map((row) => {
            const href = pointHref(dimension, row);
            const rowKey =
              dimension === "staff"
                ? (row.staffId ?? row.label)
                : dimension === "branch"
                  ? (row.branchId ?? row.label)
                  : row.label;
            return (
              <div className={css.bar} key={rowKey}>
                <span>
                  {href ? (
                    <Link href={href} className={css.breakdownLink}>
                      {dimension === "status" ? label(row.label) : row.label}
                    </Link>
                  ) : (
                    row.label
                  )}
                </span>
                <div className={css.track} aria-hidden="true">
                  <div
                    className={css.fill}
                    style={{ width: `${Math.max(1, (row.count / maxCount) * 100)}%` }}
                  />
                </div>
                <strong>{row.count}</strong>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
