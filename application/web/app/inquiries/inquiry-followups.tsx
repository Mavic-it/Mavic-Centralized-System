"use client";
import { useState } from "react";
import type { InquiryTask } from "./types";
import { label } from "./types";
import css from "./workspace.module.css";
export function InquiryFollowUps({
  tasks,
  userId,
  onOpen,
  queue,
  onQueue,
  total,
  page,
  onPage,
}: {
  tasks: InquiryTask[];
  userId: string;
  onOpen: (id: string) => void;
  queue: string;
  onQueue: (queue: string) => void;
  total: number;
  page: number;
  onPage: (page: number) => void;
}) {
  const [view, setView] = useState("list"),
    [date, setDate] = useState(() => new Date().toLocaleDateString("en-CA"));
  const now = new Date();
  const day = (s: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(
      new Date(s),
    );
  const visible = tasks.filter((t) =>
    queue === "cancelled"
      ? t.status === "CANCELLED"
      : queue === "completed"
        ? t.status === "COMPLETED"
        : t.status === "OPEN" &&
          (queue === "mine"
            ? t.assignedStaffId === userId
            : queue === "overdue"
              ? +new Date(t.dueAt) < +now
              : queue === "today"
                ? day(t.dueAt) === day(now.toISOString())
                : queue === "upcoming"
                  ? +new Date(t.dueAt) >= +now
                  : true),
  );
  const anchor = new Date(`${date}T12:00:00`),
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  start.setDate(start.getDate() - start.getDay());
  const days = Array.from(
    { length: view === "day" ? 1 : view === "week" ? 7 : 42 },
    (_, n) => {
      const d = new Date(view === "month" ? start : anchor);
      if (view === "week") d.setDate(d.getDate() - d.getDay());
      d.setDate(d.getDate() + n);
      return d;
    },
  );
  return (
    <>
      <div className={css.toolbar}>
        <label>
          Queue
          <select value={queue} onChange={(e) => onQueue(e.target.value)}>
            {["mine", "team", "today", "upcoming", "overdue", "completed"].map(
              (v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ),
            )}
          </select>
        </label>
        <label>
          View
          <select value={view} onChange={(e) => setView(e.target.value)}>
            {["list", "day", "week", "month"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        {view !== "list" && (
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
              }}
            />
          </label>
        )}
      </div>
      <p>
        Showing page {page} of {Math.max(1, Math.ceil(total / 20))} · {total}{" "}
        tasks in the selected inquiry cohort. Calendar views show this page of
        tasks. All times use your device display; queues use Philippine calendar
        dates.
      </p>
      {view === "list" ? (
        <div className={css.scroll}>
          <table className={css.table}>
            <thead>
              <tr>
                {["Inquiry", "Next action", "Due", "Assignee", "Status"].map(
                  (h) => (
                    <th key={h} scope="col">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => (
                <tr key={t.id}>
                  <td>
                    <button
                      className={css.link}
                      onClick={() => t.inquiryId && onOpen(t.inquiryId)}
                    >
                      {t.clientName}
                      <small>{t.reference}</small>
                    </button>
                  </td>
                  <td>{t.description}</td>
                  <td>{new Date(t.dueAt).toLocaleString()}</td>
                  <td>{t.assignedStaffName}</td>
                  <td>{label(t.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!visible.length && (
            <div className={css.empty}>No follow-ups in this queue.</div>
          )}
        </div>
      ) : (
        <div className={css.scroll}>
          <div
            className={css.calendar}
            style={
              view === "day"
                ? { gridTemplateColumns: "1fr", minWidth: 0 }
                : undefined
            }
          >
            {days.map((d) => (
              <section className={css.day} key={d.toISOString()}>
                <strong>
                  {d.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </strong>
                {visible
                  .filter((t) => day(t.dueAt) === d.toLocaleDateString("en-CA"))
                  .map((t) => (
                    <button
                      key={t.id}
                      onClick={() => t.inquiryId && onOpen(t.inquiryId)}
                    >
                      {t.clientName} · {t.description}
                    </button>
                  ))}
              </section>
            ))}
          </div>
        </div>
      )}
      <div className={css.actions}>
        <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button disabled={page * 20 >= total} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </>
  );
}
