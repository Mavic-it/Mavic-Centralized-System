import { Skeleton } from "./loading-ui";
import tabs from "./employee-profile-tabs.module.css";
import styles from "./people-workspace.module.css";

export function PortalSectionLoading({
  label = "Loading records",
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className={styles.portalListLoading}
    >
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} aria-hidden="true">
          <Skeleton className={styles.employeeSkeletonLine} />
          <Skeleton className={styles.employeeSkeletonLine} />
        </div>
      ))}
    </div>
  );
}

export function PortalLoading() {
  return (
    <div
      role="status"
      aria-label="Loading your portal"
      aria-busy="true"
      className={styles.employeeLoading}
    >
      <section aria-hidden="true" className={styles.profileHero}>
        <Skeleton className="loading-profile-avatar" />
        <div className={styles.profileIdentity}>
          <Skeleton className="loading-caption" />
          <Skeleton className="loading-section-title" />
          <Skeleton className="loading-description" />
        </div>
      </section>
      <div className={styles.profileFactsLoading} aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <Skeleton className="loading-caption" />
            <Skeleton className="loading-description" />
          </div>
        ))}
      </div>
      <div className={styles.sectionSwitcherLayout} aria-hidden="true">
        <nav className={`${tabs.shell} ${tabs.loadingRail}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton className="loading-action" key={i} />
          ))}
        </nav>
        <div className={styles.sectionSwitcherContent}>
          <section className={styles.panel}>
            <Skeleton className="loading-section-title" />
            <div className={styles.detailGrid}>
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i}>
                  <Skeleton className="loading-caption" />
                  <Skeleton className="loading-description" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
