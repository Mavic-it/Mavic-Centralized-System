import { LoadingFields, LoadingLines, LoadingList, LoadingRegion, LoadingTable } from "../components/content-loading";
import { Skeleton } from "../components/loading-ui";
import css from "./leave.module.css";
import type { Section } from "./types";

const requestHeaders = ["Leave type", "Dates", "Days", "Status", "Submitted", "Action"];
export function LeaveRequestsLoading({ own = false }: { own?: boolean }) {
  return <LoadingTable label="Loading leave requests" headers={own ? requestHeaders : ["Employee", "Branch", ...requestHeaders]} className={css.table} wrapClassName={css.scroll} />;
}
export function LeaveBalancesLoading() {
  return <LoadingTable label="Loading leave balances" headers={["Employee", "Available credits", "Pending days", "Action"]} className={`${css.table} ${css.balanceTable}`} wrapClassName={css.scroll} />;
}
export function LeaveCardsLoading() {
  return <LoadingRegion label="Loading leave credits"><div className={css.personalCards} aria-hidden="true">{[0, 1, 2].map(i => <article className={css.personalCard} key={i}><div className={css.cardTop}><Skeleton className="loading-icon" /><Skeleton className="loading-pill" /></div><Skeleton className="loading-section-title" /><div className={css.cardValue}><Skeleton className="loading-card-value" /></div><Skeleton className="loading-description" /><div className={css.cardStats}>{[0,1,2,3].map(j => <LoadingLines key={j} />)}</div><LoadingLines lines={1} /></article>)}</div></LoadingRegion>;
}
export function LeaveSettingsLoading() {
  return <section className={css.panel}><h2>Leave types &amp; policies</h2><LeaveTableLoading label="Loading leave policies" headers={["Leave type", "Annual days", "Eligibility", "Policy", "Status", "Action"]} /></section>;
}
export function LeaveTableLoading({ label, headers }: { label: string; headers: string[] }) {
  return <LoadingTable label={label} headers={headers} className={css.table} wrapClassName={css.scroll} />;
}
export function LeaveReportsLoading() {
  return <LoadingRegion label="Loading leave report"><div className={css.metrics} aria-hidden="true">{["Pending requests", "Approved requests", "Rejected requests", "Used paid leave days", "Available leave days"].map(label => <article className={css.metric} key={label}><span>{label}</span><Skeleton className="loading-card-value" /></article>)}</div><div className={css.reportCharts} aria-hidden="true">{["Requests by status", "Leave types"].map(title => <section className={css.chart} key={title}><h2>{title}</h2>{[0,1,2,3].map(i => <div className={css.barRow} key={i}><Skeleton className="loading-pill" /><Skeleton className="loading-description" /><Skeleton className="loading-count" /></div>)}</section>)}</div><section className={css.panel}><h2>Underlying requests</h2><LeaveTableLoading label="Loading report requests" headers={["Employee", "Branch", "Type", "Dates", "Days", "Status"]} /></section></LoadingRegion>;
}
export function LeaveDetailLoading() {
  return <div className={css.details}><LoadingLines /><LoadingFields label="Loading leave details" labels={["Employee", "Status", "Leave type", "Leave dates", "Submitted", "Reason"]} className={css.detailGrid} /><LoadingList label="Loading request history" items={2} /></div>;
}
export function LeaveFormLoading() {
  return <LoadingFields label="Loading leave request options" labels={["Leave type"]} input />;
}
export function LeaveContentLoading({ section }: { section: Section }) {
  if (section === "mine") return <><LeaveCardsLoading /><section className={css.panel}><LeaveRequestsLoading own /></section></>;
  if (section === "reports") return <LeaveReportsLoading />;
  if (section === "settings") return <LeaveSettingsLoading />;
  return <section className={css.panel}>{section === "balances" ? <LeaveBalancesLoading /> : <LeaveRequestsLoading />}</section>;
}
export function LeavePageLoading({ section }: { section: Section }) {
  const titles = { mine: "Leave", requests: "Requests & Approvals", balances: "Leave Balances", reports: "Reports & Analytics", settings: "Leave Settings" };
  return <main className={css.scope}><header className={css.header}><div><p className={css.eyebrow}>People · Leave</p><h1>{titles[section]}</h1><Skeleton className="loading-description" /></div></header><LeaveContentLoading section={section} /></main>;
}
