import { LoadingRegion, LoadingTable } from "../components/content-loading";
import { Skeleton } from "../components/loading-ui";
import css from "./workspace.module.css";
import grid from "../components/schedule-grid.module.css";

export function AttendanceMetricsLoading() {
  return <LoadingRegion label="Loading attendance summary"><div className={css.metrics} aria-hidden="true">{["Employees with entries", "Attendance records", "Completed shifts", "Late minutes", "Overtime minutes", "Pending OT reviews"].map(label => <article className={css.metric} key={label}><span>{label}</span><Skeleton className="loading-card-value" /><Skeleton className="loading-caption-detail" /></article>)}</div></LoadingRegion>;
}
export function AttendanceRecordsLoading({ canManage }: { canManage: boolean }) {
  return <LoadingTable label="Loading attendance records" className={css.table} wrapClassName={css.tableWrap} headers={["Date", ...(canManage ? ["Employee"] : []), "Branch", "Time in", "Time out", "Worked", "Late", "Overtime", ...(canManage ? ["OT approval"] : []), "Source", ...(canManage ? ["Action"] : [])]} />;
}
export function WeeklyRosterLoading() {
  return <LoadingTable label="Loading branch employees and schedules" headers={["EMPLOYEE", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]} className={grid.table} wrapClassName={grid.wrap} />;
}
