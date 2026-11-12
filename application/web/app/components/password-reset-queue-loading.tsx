import { Skeleton } from "./loading-ui";
import styles from "./password-reset-queue.module.css";

export function PasswordResetQueueLoading({
  contentOnly = false,
}: {
  contentOnly?: boolean;
}) {
  const content = (
    <div
      className={styles.loadingRows}
      role="status"
      aria-label="Loading password reset requests"
      aria-busy="true"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className={styles.loadingRow}>
          {Array.from({ length: 4 }, (_, column) => (
            <Skeleton key={column} className={styles.loadingBar} />
          ))}
        </div>
      ))}
    </div>
  );
  if (contentOnly) return content;
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            SYSTEM ADMINISTRATION / ACCOUNT RECOVERY
          </p>
          <h1>Password reset requests</h1>
          <p>
            Review account recovery and restore access
            securely.
          </p>
        </div>
      </header>
      <div className={styles.securityNote}>
        <Skeleton className={styles.loadingBar} />
      </div>
      <div className={styles.metrics}>
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index}>
            <Skeleton className={styles.loadingBar} />
            <Skeleton className={styles.loadingMetric} />
            <Skeleton className={styles.loadingBar} />
          </article>
        ))}
      </div>
      <section className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2>Recovery requests</h2>
        </div>
        <div className={styles.filters}>
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={styles.loadingBar} />
          ))}
        </div>
        {content}
      </section>
    </main>
  );
}
