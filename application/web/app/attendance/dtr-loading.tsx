import styles from "./dtr.module.css";

export function DtrLoading({
  kind = "ledger",
}: {
  kind?: "ledger" | "import";
}) {
  return (
    <section
      role="status"
      aria-label={
        kind === "import" ? "Loading import setup" : "Loading saved attendance"
      }
      aria-busy="true"
      className={styles.workspace}
    >
      {kind === "import" ? (
        <div className={styles.grid} aria-hidden="true">
          {[0, 1].map((i) => (
            <div className={styles.card} key={i}>
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonValue} />
              <div className={styles.drop}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonLine} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div
            className={`${styles.summaryPanel} ${styles.primaryMetrics}`}
            aria-hidden="true"
          >
            {Array.from({ length: 4 }, (_, i) => (
              <div className={styles.metric} key={i}>
                <span className={styles.skeletonLine} />
                <span className={styles.skeletonValue} />
              </div>
            ))}
          </div>
          <div className={styles.card} aria-hidden="true">
            <span className={styles.skeletonLine} />
            <div className={styles.skeletonTable}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={styles.skeletonRow}>
                  {Array.from({ length: 5 }, (_, c) => (
                    <span className={styles.skeletonLine} key={c} />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
