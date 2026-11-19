import { LoadingCalendar, LoadingFields, LoadingLines, LoadingRegion, LoadingTable } from "./content-loading";
import { Skeleton } from "./loading-ui";
import schedule from "./employee-work-schedule-card.module.css";
import grid from "./schedule-grid.module.css";
import profile from "./employee-hr-profile-card.module.css";

export function EmployeeHrProfileLoading() {
  return <div className={profile.profileSections}>{["Work information", "Personal details"].map(title => <section className={profile.collapsibleSection} key={title}><h3>{title}</h3><LoadingFields label={`Loading ${title.toLowerCase()}`} className={profile.detailGrid} labels={title === "Work information" ? ["Employee ID", "Employment type", "Position", "Department", "Primary branch", "Date hired"] : ["First name", "Middle name", "Last name", "Name suffix"]} /></section>)}</div>;
}
export function CurrentScheduleLoading() {
  return <LoadingRegion label="Loading schedule"><div className={schedule.currentSchedule}><Skeleton className="loading-section-title" /><LoadingLines /></div></LoadingRegion>;
}
export function EmployeeScheduleLoading({ period = "week", view = "cards" }: { period?: "week" | "month"; view?: "cards" | "table" }) {
  if (period === "month") return <div className={schedule.monthCalendar}><LoadingCalendar label="Loading monthly schedule" className={schedule.monthDays} cellClassName={schedule.monthDay} /></div>;
  if (view === "table") return <LoadingTable label="Loading weekly schedule" headers={["Employee", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]} rows={1} className={grid.table} wrapClassName={grid.wrap} />;
  return <LoadingRegion label="Loading weekly schedule"><div className={schedule.dayCards} aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <article className={schedule.dayCard} key={day}><div className={schedule.dayTop}>{day}</div><Skeleton className="loading-caption" /><div className={schedule.dayBody}><LoadingLines lines={3} /></div></article>)}</div></LoadingRegion>;
}
