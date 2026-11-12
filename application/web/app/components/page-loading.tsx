import { BranchDirectorySkeleton } from "../branches/components/branch-cards";
import { AccountDirectorySkeleton } from "./account-directory";
import { PortalLoading } from "./portal-presentation";
import profileTabs from "./employee-profile-tabs.module.css";
import styles from "./people-workspace.module.css";
import branchStyles from "../branches/workspace.module.css";
import { AccountAccessSummary } from "./account-access-presentation";
import attendanceStyles from "../attendance/workspace.module.css";
import attendanceTheme from './ui/workspace-theme.module.css';
import { EmployeeDirectorySummary,EmployeeDirectoryTableSkeleton } from './employee-directory-presentation';
import type { ReactNode } from "react";
import { Skeleton } from "./loading-ui";

function LoadingStatus({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <section aria-busy="true" aria-label={label} className={className} role="status">
      <span className="visually-hidden">{label}</span>
      {children}
    </section>
  );
}

export function OverviewLoading() {
  return (
    <LoadingStatus label="Loading operations overview" className="dashboard-page">
      <section aria-hidden="true" className="page-heading">
        <div>
          <Skeleton className="loading-eyebrow" />
          <Skeleton className="loading-heading" />
          <Skeleton className="loading-description" />
        </div>
        <Skeleton className="loading-badge" />
      </section>

      <section aria-hidden="true" className="metric-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="metric-card" key={index}>
            <div className="metric-topline">
              <Skeleton className="loading-icon" />
              <Skeleton className="loading-meta" />
            </div>
            <Skeleton className="loading-card-value" />
            <div className="metric-caption">
              <Skeleton className="loading-caption" />
              <Skeleton className="loading-caption-detail" />
            </div>
          </article>
        ))}
      </section>

      <section aria-hidden="true" className="dashboard-grid">
        <article className="panel room-panel loading-panel">
          <div className="panel-heading">
            <div>
              <Skeleton className="loading-eyebrow" />
              <Skeleton className="loading-section-title" />
            </div>
            <Skeleton className="loading-meta" />
          </div>
          <Skeleton className="loading-room-meter" />
          <div className="loading-room-legend">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton className="loading-caption" key={index} />
            ))}
          </div>
        </article>

        <article className="panel attention-panel loading-panel">
          <div className="panel-heading">
            <div>
              <Skeleton className="loading-eyebrow" />
              <Skeleton className="loading-section-title" />
            </div>
            <Skeleton className="loading-count" />
          </div>
          <div className="loading-attention-list">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="loading-attention-row" key={index}>
                <Skeleton className="loading-icon" />
                <div>
                  <Skeleton className="loading-caption" />
                  <Skeleton className="loading-caption-detail" />
                </div>
                <Skeleton className="loading-count" />
              </div>
            ))}
          </div>
        </article>
      </section>

      <section aria-hidden="true" className="panel reservation-panel loading-panel">
        <div className="panel-heading reservation-heading">
          <div>
            <Skeleton className="loading-eyebrow" />
            <Skeleton className="loading-section-title" />
          </div>
          <Skeleton className="loading-meta" />
        </div>
        <div className="reservation-table-wrap loading-table-wrap">
          {Array.from({ length: 5 }, (_, row) => (
            <div className="loading-table-row" key={row}>
              {Array.from({ length: 5 }, (_, cell) => (
                <Skeleton
                  className="loading-table-cell"
                  key={cell}
                  style={{ width: `${48 + ((row + cell) % 4) * 10}%` }}
                />
              ))}
            </div>
          ))}
        </div>
      </section>
    </LoadingStatus>
  );
}

export function AttendanceLoading() {
  return (
    <LoadingStatus
      label="Loading attendance"
      className={`${attendanceTheme.scope} ${attendanceStyles.page}`}
    >
      <header aria-hidden="true" className={attendanceStyles.header}>
        <div>
          <Skeleton className="loading-heading" />
          <Skeleton className="loading-description" />
        </div>
        <Skeleton className="loading-filter" />
      </header>
      <div className={attendanceStyles.sectionSwitcherLayout}>
        <nav
          aria-hidden="true"
          className={`${profileTabs.shell} ${profileTabs.loadingRail}`}
        >
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="loading-action" key={index} />
          ))}
        </nav>
        <div className={attendanceStyles.sectionSwitcherContent}>
          <section aria-hidden="true" className={attendanceStyles.todayPanel}>
            <div className={attendanceStyles.todayCopy}>
              <Skeleton className="loading-eyebrow" />
              <Skeleton className="loading-section-title" />
              <Skeleton className="loading-description" />
            </div>
            <div className={attendanceStyles.clockActions}>
              <Skeleton className="loading-action" />
              <Skeleton className="loading-action" />
            </div>
          </section>
          <section aria-hidden="true" className={attendanceStyles.metrics}>
            {Array.from({ length: 4 }, (_, index) => (
              <article className={attendanceStyles.metric} key={index}>
                <Skeleton className="loading-caption" />
                <Skeleton className="loading-card-value" />
                <Skeleton className="loading-caption-detail" />
              </article>
            ))}
          </section>
        </div>
      </div>
    </LoadingStatus>
  );
}

export function BranchesLoading() {
  return (
    <LoadingStatus label="Loading branches" className={`branch-page ${attendanceTheme.scope} ${branchStyles.scope}`}>
      <header aria-hidden="true" className="branch-heading">
        <div>
          <Skeleton className="loading-heading" />
          <Skeleton className="loading-description" />
        </div>
        <Skeleton className="loading-action" />
      </header>
      <div className="branch-list">
        <div aria-hidden="true" className="branch-toolbar">
          <Skeleton className="loading-search" />
          <Skeleton className="loading-filter" />
          <Skeleton className="loading-meta" />
        </div>
        <div aria-hidden="true"><BranchDirectorySkeleton /></div>
      </div>
    </LoadingStatus>
  );
}

type PeopleLoadingVariant =
  | "hr"
  | "employees"
  | "employee-profile"
  | "me"
  | "users";

export function PeopleWorkspaceLoading({
  variant,
}: {
  variant: PeopleLoadingVariant;
}) {
  const title = {
    hr: "HR workspace",
    employees: "employees",
    "employee-profile": "employee profile",
    me: "your portal",
    users: "user access",
  }[variant];

  return (
    <LoadingStatus
      label={`Loading ${title}`}
      className={[styles.page,...(variant==='employees'||variant==='employee-profile'||variant==='users'||variant==='me'?[attendanceTheme.scope,styles.employeeWorkspace]:[]),variant==='employee-profile'||variant==='me'?styles.employeeFilePage:'',variant==='users'?styles.userWorkspace:'',variant==='me'?styles.portalPage:''].filter(Boolean).join(' ')}
    >
      <header aria-hidden="true" className={styles.pageHeader}>
        <div>
          <Skeleton className="loading-heading" />
          <Skeleton className="loading-description" />
        </div>
        <Skeleton className="loading-badge" />
      </header>
      {variant === "hr" && <HrOverviewLoading />}
      {variant === "employees" && <><EmployeeDirectorySummary employees={[]} loading/><section className={styles.panel}><div className={styles.tableToolbar} aria-hidden="true"><Skeleton className="loading-search"/><Skeleton className="loading-filter"/><Skeleton className="loading-filter"/><Skeleton className="loading-action"/></div><EmployeeDirectoryTableSkeleton/></section></>}
      {variant === "employee-profile" && <EmployeeProfileLoading />}
      {variant === "me" && <PortalLoading />}
      {variant === "users" && <><AccountAccessSummary accounts={[]} loading/><section className={styles.panel}><div className={styles.tableToolbar} aria-hidden="true"><div className={styles.filterTabs}><Skeleton className="loading-action"/><Skeleton className="loading-action"/></div><Skeleton className="loading-search"/><Skeleton className="loading-filter"/><Skeleton className="loading-action"/></div><div aria-hidden="true"><AccountDirectorySkeleton/></div></section></>}
    </LoadingStatus>
  );
}

function PeopleMetricsLoading({ count = 4 }: { count?: number }) {
  return (
    <section aria-hidden="true" className={styles.metricGrid}>
      {Array.from({ length: count }, (_, index) => (
        <article className={styles.metric} key={index}>
          <Skeleton className="loading-caption" />
          <Skeleton className="loading-card-value" />
          <Skeleton className="loading-caption-detail" />
        </article>
      ))}
    </section>
  );
}

function HrOverviewLoading() {
  return (
    <>
      <PeopleMetricsLoading count={2} />
      <div aria-hidden="true" className={styles.contentGrid}>
        {[0].map((panel) => (
          <section className={styles.panel} key={panel}>
            <div className={styles.sectionTitle}>
              <div>
                <Skeleton className="loading-section-title" />
              </div>
              <Skeleton className="loading-meta" />
            </div>
            <div className="loading-list">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="loading-list-row" key={index}>
                  <Skeleton className="loading-avatar" />
                  <div>
                    <Skeleton className="loading-caption" />
                    <Skeleton className="loading-caption-detail" />
                  </div>
                  <Skeleton className="loading-pill" />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

export function EmployeeProfileLoading() {
  return (
    <>
      <section aria-hidden="true" className={styles.profileHero}>
        <Skeleton className="loading-profile-avatar" />
        <div className={styles.profileIdentity}>
          <Skeleton className="loading-caption" />
          <Skeleton className="loading-section-title" />
          <Skeleton className="loading-description" />
        </div>
        <Skeleton className="loading-action" />
      </section>
      <div aria-hidden="true" className={styles.sectionSwitcherLayout}>
        <div className={styles.sectionSwitcherContent}>
          <section className={styles.panel}>
            <div className={styles.sectionTitle}>
              <div>
                <Skeleton className="loading-section-title" />
              </div>
            </div>
            <div className="loading-detail-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index}>
                  <Skeleton className="loading-caption" />
                  <Skeleton className="loading-description" />
                </div>
              ))}
            </div>
          </section>
        </div>
        <nav className={styles.sectionSwitcherNav}>
          <Skeleton className="loading-eyebrow" />
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton className="loading-nav-row" key={index} />
          ))}
        </nav>
      </div>
    </>
  );
}

