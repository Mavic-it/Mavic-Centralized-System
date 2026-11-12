"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ShieldCheck,
  UserRound,
  Wallet,
} from "lucide-react";
import type { WorkspaceRole } from "../data/people";
import { api } from "./api";
import { Empty, ErrorState, Loading } from "./ui";
import type { Context, PersonalOverview } from "./types";
import css from "./leave.module.css";

export function PersonalAccountInfo({
  context,
  role,
}: {
  context: Context;
  role: WorkspaceRole | null;
}) {
  const superAdmin = role === "SUPER_ADMIN";
  if (context.ownEmployee)
    return superAdmin ? (
      <aside
        className={css.adminNotice}
        aria-label="Super Admin personal leave"
      >
        <span className={css.accountIcon}>
          <ShieldCheck aria-hidden="true" size={23} />
        </span>
        <div>
          <strong>Your personal leave, with the same approval rules</strong>
          <p>
            You are viewing {context.ownEmployee.name}&apos;s employee record.
            You may approve your own requests within your authorized scope.
            Self-approval is clearly recorded with your name, role and time.
          </p>
        </div>
        <Link href="/leave">
          Manage team leave <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </aside>
    ) : null;
  const Icon = superAdmin ? ShieldCheck : UserRound;
  return (
    <section className={css.accountPanel} aria-labelledby="leave-account-title">
      <div className={css.accountIntro}>
        <span className={css.accountIcon}>
          <Icon size={28} aria-hidden="true" />
        </span>
        <span className={css.accountBadge}>
          {superAdmin ? "Super Admin account" : "Personal leave access"}
        </span>
        <h2 id="leave-account-title">
          {superAdmin
            ? "Your workspace is ready. Connect your employee profile."
            : "Connect your employee profile to get started."}
        </h2>
        <p>
          This account is not linked to an employee profile.{" "}
          {superAdmin
            ? "You can manage leave, policies, and reports. A linked employee record is required for your own credits and requests."
            : "Ask HR to link your profile before requesting leave or receiving credits."}
        </p>
        <div className={css.accountActions}>
          {superAdmin ? (
            <>
              <Link className={css.accountPrimary} href="/leave">
                Open Leave Management{" "}
                <ArrowUpRight size={16} aria-hidden="true" />
              </Link>
              <Link className={css.accountSecondary} href="/system/users">
                Review account linking
              </Link>
            </>
          ) : (
            <Link className={css.accountSecondary} href="/me">
              View my profile <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <div className={css.accountSteps}>
        <p className={css.eyebrow}>Getting your personal leave ready</p>
        <ol>
          <li>
            <span>01</span>
            <div>
              <strong>Link the right employee record</strong>
              <p>
                Have an authorized administrator connect your account to your
                employee profile.
              </p>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>Confirm eligible leave policies</strong>
              <p>
                HR reviews your policy eligibility and allocates applicable
                credits.
              </p>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>Track every request in one place</strong>
              <p>
                View paid credits, monitor unpaid leave, and follow request
                decisions here.
              </p>
            </div>
          </li>
        </ol>
        <p className={css.accountFootnote}>
          <ShieldCheck size={15} aria-hidden="true" />
          Personal leave follows employee eligibility and approval rules for
          every role.
        </p>
      </div>
    </section>
  );
}

export function PersonalLeave({
  renderHistory,
  year,
}: {
  renderHistory: (year: string) => ReactNode;
  year: string;
}) {
  const q = useQuery({
    queryKey: ["leave", "personal-overview", year],
    queryFn: () => api<PersonalOverview>(`/me/overview?year=${year}`),
  });
  const data = q.data;
  return (
    <>
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : (
        data && (
          <div className={css.personalCards} aria-label="Your leave types">
            {data.balances.map((b) => (
              <article className={css.personalCard} key={`paid-${b.typeId}`}>
                <div className={css.cardTop}>
                  <span className={css.typeIcon}>
                    <Wallet size={20} aria-hidden="true" />
                  </span>
                  <span className={css.paidBadge}>Paid leave</span>
                </div>
                <h3>{b.typeName}</h3>
                <p className={css.typeCode}>{b.code} · Credit balance</p>
                <div className={css.cardValue}>
                  <strong>{b.available}</strong>
                  <span>days available</span>
                </div>
                <div className={css.creditMeter} aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.min(100, Math.max(0, (b.available / Math.max(1, b.allocated + b.adjustments)) * 100))}%`,
                    }}
                  />
                </div>
                <dl className={css.cardStats}>
                  <div>
                    <dt>Allocated</dt>
                    <dd>{b.allocated}</dd>
                  </div>
                  <div>
                    <dt>Used</dt>
                    <dd>{b.used - b.restored}</dd>
                  </div>
                  <div>
                    <dt>Pending</dt>
                    <dd>{b.reserved}</dd>
                  </div>
                  <div>
                    <dt>Adjusted</dt>
                    <dd>
                      {b.adjustments > 0 ? "+" : ""}
                      {b.adjustments}
                    </dd>
                  </div>
                </dl>
                <p className={css.cardFootnote}>
                  <Check size={14} aria-hidden="true" />
                  Pending days are already reserved.
                </p>
              </article>
            ))}
            {data.unpaid.map((t) => (
              <article
                className={`${css.personalCard} ${css.unpaidCard}`}
                key={`unpaid-${t.typeId}`}
              >
                <div className={css.cardTop}>
                  <span className={css.typeIcon}>
                    <CalendarDays size={20} aria-hidden="true" />
                  </span>
                  <span className={css.unpaidBadge}>Unpaid leave</span>
                </div>
                <h3>{t.typeName}</h3>
                <p className={css.typeCode}>{t.code} · Usage monitoring</p>
                <div className={css.cardValue}>
                  <strong>{t.approvedDays}</strong>
                  <span>days approved</span>
                </div>
                <p className={css.creditFree}>No credit allocation required</p>
                <dl className={css.cardStats}>
                  <div>
                    <dt>Approved requests</dt>
                    <dd>{t.approvedRequests}</dd>
                  </div>
                  <div>
                    <dt>Pending days</dt>
                    <dd>{t.pendingDays}</dd>
                  </div>
                  <div>
                    <dt>Pending requests</dt>
                    <dd>{t.pendingRequests}</dd>
                  </div>
                </dl>
                <p className={css.cardFootnote}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  Tracked without deducting paid credits.
                </p>
              </article>
            ))}
            {!data.balances.length && !data.unpaid.length && (
              <Empty>
                No eligible leave types or leave activity for this year. HR must
                configure your policies and eligibility before you can request
                leave.
              </Empty>
            )}
          </div>
        )
      )}
      {renderHistory(year)}
    </>
  );
}
