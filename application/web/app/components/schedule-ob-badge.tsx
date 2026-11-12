import Link from "next/link";
import css from "./schedule-ob-badge.module.css";
export type ScheduleOb = {
  id: string;
  status: string;
  destination: string;
  cancellationPending?: boolean;
};
export function ScheduleObBadge({ requests }: { requests?: ScheduleOb[] }) {
  if (!requests?.length) return null;
  return (
    <div className={css.badges}>
      {requests.map((r) => (
        <Link
          key={r.id}
          className={css.badge}
          data-approved={r.status === "APPROVED"}
          href={`/attendance/official-business?obId=${encodeURIComponent(r.id)}`}
          title={`${r.destination}: ${r.status}`}
        >
          <strong>OB {r.status === "APPROVED" ? "approved" : "pending"}</strong>
          <span>
            {r.destination}
            {r.cancellationPending ? " / Cancellation pending" : ""}
          </span>
        </Link>
      ))}
    </div>
  );
}
