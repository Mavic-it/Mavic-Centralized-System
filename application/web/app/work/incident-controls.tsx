import { incidentCategories, type IncidentSummary } from "./types";
import css from "./workspace.module.css";
type IncidentControlProps = {
  summary?: IncidentSummary;
  status: string;
  onStatus: (value: string) => void;
  queue: string;
  onQueue: (value: string) => void;
  from: string;
  to: string;
  onDates: (from: string, to: string) => void;
  category?: string;
  onCategory?: (value: string) => void;
};
export function IncidentControls({
  summary,
  status,
  onStatus,
}: Pick<IncidentControlProps, "summary" | "status" | "onStatus">) {
  return (
    <section
      className={css.incidentControls}
      aria-label="Authorized incident totals"
    >
      <div className={css.incidentSummary}>
        {(
          [
            { key: "total", title: "All reports", filter: "" },
            { key: "pending", title: "Submitted", filter: "SUBMITTED" },
            {
              key: "clarification",
              title: "Pending explanation",
              filter: "PENDING_EXPLANATION",
            },
            { key: "resolved", title: "Completed", filter: "finished" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={status === item.filter}
            onClick={() => onStatus(item.filter)}
          >
            <strong>{summary ? summary[item.key] : "…"}</strong>
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
export function IncidentQueueNavigation({
  queue,
  onQueue,
}: Pick<IncidentControlProps, "queue" | "onQueue">) {
  return (
    <div
      className={css.scopeTabs}
      role="group"
      aria-label="Incident or disciplinary records"
    >
      {[
        ["reports", "Reports"],
        ["active-cases", "Active cases"],
        ["case-history", "Case history"],
      ].map(([key, title]) => (
        <button
          key={key}
          type="button"
          aria-pressed={queue === key}
          onClick={() => onQueue(key)}
        >
          {title}
        </button>
      ))}
    </div>
  );
}
export function IncidentFilters({
  from,
  to,
  onDates,
  category = "",
  onCategory,
}: Pick<
  IncidentControlProps,
  "from" | "to" | "onDates" | "category" | "onCategory"
>) {
  return (
    <>
      {onCategory && (
        <label className={css.compactField}>
          <span>Violation category</span>
          <select value={category} onChange={(e) => onCategory(e.target.value)}>
            <option value="">All categories</option>
            {incidentCategories.map((item) => (
              <option key={item.value} value={item.value}>
                {item.title}
              </option>
            ))}
            <option value="TIMEKEEPING">Timekeeping (legacy)</option>
          </select>
        </label>
      )}
      <label className={css.compactField}>
        <span>Incident date from</span>
        <input
          aria-label="Incident date from"
          type="date"
          value={from}
          onChange={(e) => onDates(e.target.value, to)}
        />
      </label>
      <label className={css.compactField}>
        <span>Incident date to</span>
        <input
          aria-label="Incident date to"
          type="date"
          value={to}
          min={from || undefined}
          onChange={(e) => onDates(from, e.target.value)}
        />
      </label>
      {(from || to) && (
        <button type="button" onClick={() => onDates("", "")}>
          Clear dates
        </button>
      )}
    </>
  );
}
