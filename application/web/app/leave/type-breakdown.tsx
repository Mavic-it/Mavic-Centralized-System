"use client";
import { ArrowUpRight, CalendarDays, Wallet } from "lucide-react";
import type { TypeBreakdown as Breakdown } from "./types";
import { Empty } from "./ui";
import css from "./leave.module.css";
export function TypeBreakdown({
  items,
  asOf,
  onSelect,
}: {
  items: Breakdown[];
  asOf: string;
  onSelect: (id: string) => void;
}) {
  const max = Math.max(
    1,
    ...items.map(
      (t) =>
        Math.max(0, t.used) +
        Math.max(0, t.available) +
        Math.max(0, t.reserved) +
        t.approvedUnpaidDays +
        t.pendingUnpaidDays,
    ),
  );
  return (
    <section
      className={`${css.chart} ${css.typeBreakdown}`}
      aria-label="Leave credits by type"
    >
      <header className={css.breakdownHeader}>
        <div>
          <p className={css.eyebrow}>Credits & activity</p>
          <h2>Leave credits by type</h2>
          <p className={css.muted}>
            Every configured type, including unpaid leave and new policies.
          </p>
        </div>
        <span className={css.typeCount}>{items.length} types</span>
      </header>
      <div className={css.chartLegend}>
        <span>
          <i className={css.used} />
          Used credits
        </span>
        <span>
          <i className={css.remaining} />
          Available credits
        </span>
        <span>
          <i className={css.unpaidFill} />
          Approved unpaid
        </span>
        <span>
          <i className={css.pendingFill} />
          Pending
        </span>
      </div>
      {!items.length ? (
        <Empty>No leave types match your authorized scope and filters.</Empty>
      ) : (
        <div className={css.typeRows}>
          {items.map((t) => {
            const unpaid =
              !t.paid || t.approvedUnpaidDays > 0 || t.pendingUnpaidDays > 0;
            const credits = t.paid || !!(t.used || t.available || t.reserved);
            const Icon = t.paid ? Wallet : CalendarDays;
            return (
              <button
                type="button"
                className={css.typeRow}
                key={t.typeId}
                onClick={() => onSelect(t.typeId)}
                aria-label={`Filter report by ${t.typeName}`}
              >
                <div className={css.typeRowTitle}>
                  <span className={css.typeIcon}>
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{t.typeName}</strong>
                    <div className={css.typeMeta}>
                      <span>{t.code}</span>
                      <span>{t.paid ? "Paid" : "Unpaid"}</span>
                      {!t.active && (
                        <span className={css.policyBadge}>Inactive</span>
                      )}
                      {t.effectiveFrom > asOf && (
                        <span className={css.policyBadge}>
                          Effective {t.effectiveFrom}
                        </span>
                      )}
                    </div>
                  </div>
                  <ArrowUpRight size={16} aria-hidden="true" />
                </div>
                <div className={css.track} aria-hidden="true">
                  {credits && (
                    <>
                      <span
                        className={css.used}
                        style={{
                          width: `${(Math.max(0, t.used) / max) * 100}%`,
                        }}
                      />
                      <span
                        className={css.remaining}
                        style={{
                          width: `${(Math.max(0, t.available) / max) * 100}%`,
                        }}
                      />
                      <span
                        className={css.pendingFill}
                        style={{
                          width: `${(Math.max(0, t.reserved) / max) * 100}%`,
                        }}
                      />
                    </>
                  )}
                  {unpaid && (
                    <>
                      <span
                        className={css.unpaidFill}
                        style={{
                          width: `${(t.approvedUnpaidDays / max) * 100}%`,
                        }}
                      />
                      <span
                        className={css.pendingFill}
                        style={{
                          width: `${(t.pendingUnpaidDays / max) * 100}%`,
                        }}
                      />
                    </>
                  )}
                </div>
                <div className={css.typeFigures}>
                  {credits && (
                    <>
                      <span>
                        <b>{t.used}</b> used
                      </span>
                      <span>
                        <b>{t.available}</b> available
                      </span>
                      <span>
                        <b>{t.reserved}</b> reserved
                      </span>
                    </>
                  )}
                  {unpaid && (
                    <>
                      <span>
                        <b>{t.approvedUnpaidDays}</b> unpaid days approved
                      </span>
                      <span>
                        <b>{t.pendingUnpaidDays}</b> unpaid days pending
                      </span>
                    </>
                  )}
                </div>
                {!t.paid && (
                  <p className={css.typeHint}>
                    Unpaid usage is monitored without a credit allocation.
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
      <p className={css.chartFootnote}>
        Paid credits cover the selected year. Unpaid activity follows request
        filters. Select any type to inspect its records.
      </p>
    </section>
  );
}
