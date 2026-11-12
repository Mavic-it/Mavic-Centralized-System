import styles from "./my-profile-workspace.module.css";
import theme from "./ui/workspace-theme.module.css";

export function MyProfileLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your profile"
      role="status"
      className={`${theme.scope} ${styles.page}`}
    >
      <div aria-hidden="true" className={styles.loadingContent}>
        <header className={styles.pageHeader}>
          <div className={styles.skeletonTitle} />
          <div className={styles.skeletonAction} />
        </header>
        <section className={`${styles.panel} ${styles.profilePanel}`}>
          <div className={styles.profileHeader}>
            <div className={styles.skeletonAvatar} />
            <div className={styles.skeletonIdentity}>
              <div className={styles.skeletonLine} />
              <div className={styles.skeletonLineShort} />
            </div>
          </div>
          <div className={styles.skeletonSection} />
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 8 }, (_, i) => (
              <div className={styles.skeletonField} key={i} />
            ))}
          </div>
          <div className={styles.skeletonSection} />
          <div className={styles.skeletonGrid}>
            {Array.from({ length: 3 }, (_, i) => (
              <div className={styles.skeletonField} key={i} />
            ))}
          </div>
        </section>
        <section className={styles.panel}>
          <div className={styles.skeletonSection} />
          <div className={styles.accountGrid}>
            {Array.from({ length: 4 }, (_, i) => (
              <div className={styles.skeletonField} key={i} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
