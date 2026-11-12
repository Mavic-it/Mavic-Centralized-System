import { PageHeading, PageHeader } from "../../../components/page-heading";
import AuthorizedWorkspacePage from "../../../components/authorized-workspace-page";
import ChangePasswordForm from "../../../change-password/security-form";
import styles from "../../../change-password/account-security.module.css";

export default function AccountSecurityPage() {
  return (
    <AuthorizedWorkspacePage access="security" returnPath="/me/security">
      <main className={styles.page}>
        <PageHeader className={styles.header}>
          <div>
          <p className={styles.eyebrow}>MY PORTAL · SECURITY</p>
          <PageHeading>Account Security</PageHeading>
          <p>Manage your password and protect access to your account.</p>
          </div>
        </PageHeader>
        <div className={styles.grid}>
          <section
            className={styles.card}
            aria-labelledby="change-password-heading"
          >
            <div className={styles.cardHeader}>
              <span className={styles.icon} aria-hidden="true">
                ✦
              </span>
              <div>
                <h2 id="change-password-heading">Change password</h2>
                <p>Enter your current password, then choose a new one.</p>
              </div>
            </div>
            <ChangePasswordForm />
          </section>
          <aside
            className={styles.side}
            aria-labelledby="security-guide-heading"
          >
            <div className={styles.guideCard}>
              <p className={styles.guideEyebrow}>SECURITY GUIDE</p>
              <h2 id="security-guide-heading">Keep your account protected</h2>
              <ul>
                <li>Use a password unique to this account.</li>
                <li>Never share your password or temporary credentials.</li>
                <li>Sign out when using a shared device.</li>
              </ul>
            </div>
            <div className={styles.infoCard}>
              <h3>After you update</h3>
              <p>
                Your sessions will end. Sign in again with your new password to
                continue.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </AuthorizedWorkspacePage>
  );
}
