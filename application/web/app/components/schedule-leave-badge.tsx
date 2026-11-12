import styles from "./schedule-leave-badge.module.css";

export type ScheduleLeave = { units: number; codes: string[] } | null;

export function ScheduleLeaveBadge({ leave }: { leave?: ScheduleLeave }) {
  if (!leave || leave.units <= 0) return null;
  return <span className={styles.badge}>
    {leave.units < 1 ? "Approved half-day leave" : "Approved leave"}
    {leave.codes.length > 0 && <small>{leave.codes.join(" / ")}</small>}
  </span>;
}
