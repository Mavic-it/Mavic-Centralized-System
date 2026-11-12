"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudOff, RefreshCw, ShieldCheck } from "lucide-react";
import styles from "./workspace-access-error.module.css";

export function WorkspaceAccessError() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section className={styles.surface} aria-labelledby="workspace-access-title">
      <div className={styles.card} aria-busy={pending}>
        <span className={styles.icon}><CloudOff size={28} aria-hidden="true" /></span>
        <div role="alert">
          <p className={styles.eyebrow}>CONNECTION INTERRUPTED</p>
          <h1 id="workspace-access-title">Unable to connect to your workspace</h1>
          <p className={styles.description}>We couldn&apos;t verify your access right now. Check your connection, then try again.</p>
        </div>
        <button className={styles.retry} type="button" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
          <RefreshCw size={16} aria-hidden="true" />
          {pending ? "Checking access..." : "Try again"}
        </button>
        <p className={styles.status} role="status">{pending ? "Reconnecting to your workspace..." : "If this continues, contact your IT administrator."}</p>
        <div className={styles.footer}><ShieldCheck size={15} aria-hidden="true" /><span>Secure workspace access</span></div>
      </div>
    </section>
  );
}
