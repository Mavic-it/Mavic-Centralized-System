import { Skeleton } from "../components/loading-ui";
import { LoadingFields, LoadingLines, LoadingList, LoadingRegion, LoadingTable } from "../components/content-loading";
import s from "./workspace.module.css";
import gallery from "./space-gallery.module.css";
import payment from "./payments.module.css";

type Section = "calendar" | "list" | "spaces" | "reports" | "settings" | "payments";
const titles = { calendar: "Booking calendar", list: "All reservations", spaces: "Spaces & availability", reports: "Reports", settings: "Settings", payments: "Payment Verification" };
export const paymentHeaders = ["Reservation", "Customer", "Branch / space", "Booking date", "Method", "Amount due", "Submitted", "Transaction reference", "Submitted at", "Status", "Actions"];

export function ReservationCalendarSkeleton({ view = "month" }: { view?: "month" | "week" | "day" }) {
  return <LoadingRegion label="Loading reservation calendar"><div className={`${s.calendar} ${view === "day" ? s.dayCalendar : ""}`}>
    {view !== "day" && <div className={s.weekdays}>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day}>{day}</span>)}</div>}
    <div className={s.days} aria-hidden="true">{Array.from({ length: view === "month" ? 42 : view === "week" ? 7 : 1 }, (_, i) => <section className={s.dayCell} key={i}><div className={s.dayHead}><Skeleton className="loading-count" /></div><LoadingLines lines={3} /></section>)}</div>
  </div></LoadingRegion>;
}
export function ReservationSpacesSkeleton() {
  return <LoadingRegion label="Loading spaces"><div className={gallery.gallery} aria-hidden="true"><div className={gallery.toolbar}><LoadingLines /><Skeleton className="loading-search" /></div><div className={gallery.filterRow}><Skeleton className="loading-action" /><Skeleton className="loading-filter" /></div><div className={gallery.grid}>{[0,1,2].map(i => <article className={gallery.card} key={i}><Skeleton className={gallery.visual} /><div className={gallery.body}><LoadingLines lines={3} /><div className={gallery.facts}><LoadingLines /></div><div className={gallery.actions}><Skeleton className="loading-action" /><Skeleton className="loading-action" /></div></div></article>)}</div></div></LoadingRegion>;
}
export function ReservationDetailSkeleton() {
  return <div className={s.detail}><section className={s.detailSummary}><LoadingLines lines={3} /></section><section className={s.detailSection}><h4>Booking details</h4><LoadingFields label="Loading booking details" labels={["Purpose", "Branch", "Space", "Starts", "Ends", "Guests"]} className={s.detailGrid} /></section><section className={s.detailSection}><h4>Customer details</h4><LoadingFields label="Loading customer details" labels={["Contact", "Email", "Company"]} className={s.detailGrid} /></section><section className={s.detailSection}><h4>Payment</h4><LoadingFields label="Loading booking payment" labels={["Status", "Total"]} className={s.detailGrid} /></section><LoadingList label="Loading booking history" items={2} /></div>;
}
export function ReservationSectionSkeleton({ section, view = "month" }: { section: Section; view?: "month" | "week" | "day" }) {
  if (section === "calendar") return <ReservationCalendarSkeleton view={view} />;
  if (section === "spaces") return <ReservationSpacesSkeleton />;
  if (section === "payments") return <div className={payment.panel}><LoadingTable label="Loading payment submissions" headers={paymentHeaders} wrapClassName={payment.tableWrap} /></div>;
  if (section === "settings") return <><div className={payment.panel}><h2>Payment accounts</h2><LoadingTable label="Loading payment accounts" headers={["Method", "Account", "Branch", "Status", "Actions"]} wrapClassName={payment.tableWrap} /></div><div className={s.settingsForm}><LoadingFields label="Loading booking policy" labels={["Opening time", "Closing time", "Minimum advance", "Maximum advance", "Allowed days"]} input className={s.formGrid} /></div></>;
  return <LoadingRegion label={section === "reports" ? "Loading reservation reports" : "Loading reservations"}><div className={section === "reports" ? s.reportList : s.list} aria-hidden="true">{Array.from({ length: 5 }, (_, i) => <div className={section === "reports" ? s.reportRow : s.bookingRow} key={i}>{[0,1,2,3,4].map(j => <LoadingLines key={j} lines={j < 3 ? 2 : 1} />)}</div>)}</div>{section === "list" && <div className={s.pagination} aria-hidden="true"><LoadingLines lines={1} /><Skeleton className="loading-action" /><Skeleton className="loading-action" /></div>}</LoadingRegion>;
}
export function ReservationPageSkeleton({ section = "calendar" }: { section?: Section }) {
  return <main className={s.workspace}><header className={s.top}><div className={s.heroCopy}><p className={s.eyebrow}>BUSINESS / RESERVATIONS</p><h1>Reservations</h1><p>Schedule customer visits and manage reservation requests.</p></div><Skeleton className="loading-action" /></header><div className={s.tabs} aria-hidden="true">{Object.keys(titles).map(key => <Skeleton key={key} className="loading-action" />)}</div>{section !== "settings" && section !== "payments" && <div className={s.metrics} aria-hidden="true">{["Today", "Upcoming", "Pending approval", "Available spaces", "Checked in", "Completed"].map(label => <div className={s.metric} key={label}><Skeleton className="loading-icon" /><span className={s.metricLabel}>{label}</span><Skeleton className="loading-card-value" /><LoadingLines lines={1} /></div>)}</div>}<section className={s.panel}><div className={s.panelHead}><h2>{titles[section]}</h2></div><div className={s.filters} aria-hidden="true"><Skeleton className="loading-filter" /><Skeleton className="loading-search" /></div>{section === "calendar" && <div className={s.calendarBar} aria-hidden="true"><Skeleton className="loading-action" /><Skeleton className="loading-action" /></div>}<ReservationSectionSkeleton section={section} /></section></main>;
}
