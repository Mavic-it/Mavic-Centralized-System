import { LoadingRegion } from "../../../components/content-loading";
import { Skeleton } from "../../../components/loading-ui";
import { PageHeader, PageHeading } from "../../../components/page-heading";
import styles from "../../../change-password/account-security.module.css";

export default function AccountSecurityLoading() {
  return (
    <main className={styles.page}>
      <PageHeader className={styles.header}>
        <div>
          <p className={styles.eyebrow}>MY PORTAL · SECURITY</p>
          <PageHeading>Account Security</PageHeading>
          <p>Manage your password and protect access to your account.</p>
        </div>
        <Skeleton style={{ width: 40, height: 40, borderRadius: 9 }} />
      </PageHeader>
      <LoadingRegion label="Loading account security form" className={styles.grid}>
        <section className={styles.card} aria-hidden="true">
          <div className={styles.cardHeader}>
            <Skeleton style={{ width: 38, height: 38, borderRadius: 10 }} />
            <div>
              <h2>Change password</h2>
              <p>Enter your current password, then choose a new one.</p>
            </div>
          </div>
          <div className={styles.form}>
            {["Current or temporary password", "New password", "Confirm new password"].map((label) => (
              <div className={styles.field} key={label}>
                <span>{label}</span>
                <div className={styles.inputRow}>
                  <Skeleton style={{ flex: 1, minWidth: 0 }} />
                  <Skeleton style={{ width: 58 }} />
                </div>
                {label === "New password" && (
                  <div className={styles.checklist}>
                    <div className={styles.checklistHeader}>
                      <strong>Password requirements</strong>
                      <Skeleton style={{ width: 88, height: 10 }} />
                    </div>
                    <ul>
                      {[0, 1, 2, 3].map((item) => (
                        <li key={item}><Skeleton style={{ width: `${72 + item * 5}%`, height: 10 }} /></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
            <Skeleton style={{ width: 168, height: 42, borderRadius: 8 }} />
          </div>
        </section>
        <aside className={styles.side} aria-hidden="true">
          <section className={styles.guideCard}>
            <p className={styles.guideEyebrow}>SECURITY GUIDE</p>
            <h2>Keep your account protected</h2>
            <div className={styles.form}>
              {[0, 1, 2].map((item) => <Skeleton key={item} style={{ width: `${92 - item * 8}%`, height: 12 }} />)}
            </div>
          </section>
          <section className={styles.infoCard}>
            <h3>After you update</h3>
            <Skeleton style={{ width: "95%", height: 12 }} />
            <Skeleton style={{ width: "75%", height: 12, marginTop: 8 }} />
          </section>
        </aside>
      </LoadingRegion>
    </main>
  );
}
