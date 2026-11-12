"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
} from "lucide-react";
import { notificationDestination } from "../lib/notification-destination";
import { IconActionButton } from "./icon-action-button";
import styles from "./workspace-notifications.module.css";
import { workspaceRealtime } from "../lib/workspace-realtime";

export type NotificationAlert = {
  id: string;
  title: string;
  message: string;
  senderName?: string | null;
  createdAt: string;
  read: boolean;
  href?: string | null;
  type: "INFO" | "SUCCESS" | "WARNING" | "ERROR";
};
type Inbox = {
  items: NotificationAlert[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
};

export function notificationTime(createdAt: string, now = Date.now()) {
  const seconds = Math.max(
    0,
    Math.floor((now - new Date(createdAt).getTime()) / 1000),
  );
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function WorkspaceNotifications({
  canReviewResets,
}: {
  canReviewResets: boolean;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  const actionPending = useRef(false);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(68);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [page, setPage] = useState(1);
  const [inbox, setInbox] = useState<Inbox>({
    items: [],
    total: 0,
    unreadCount: 0,
    page: 1,
    pageSize: 30,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (actionPending.current) return;
      const version = ++generation.current;
      try {
        const response = await fetch(
          `/api/notifications/inbox?page=${page}&filter=${filter}`,
          { cache: "no-store", signal },
        );
        if (!response.ok) throw new Error("Unavailable");
        const data = (await response.json()) as Inbox;
        if (version !== generation.current || signal?.aborted) return;
        const last = Math.max(1, Math.ceil(data.total / data.pageSize));
        if (page > last) {
          setPage(last);
          return;
        }
        setInbox(data);
        setError(false);
      } catch {
        if (!signal?.aborted && version === generation.current) setError(true);
      } finally {
        if (!signal?.aborted && version === generation.current)
          setLoading(false);
      }
    },
    [filter, page],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialRefresh = window.setTimeout(
      () => void refresh(controller.signal),
      0,
    );
    const unsubscribe = workspaceRealtime.subscribe(() => void refresh(controller.signal));
    return () => {
      window.clearTimeout(initialRefresh);
      controller.abort();
      unsubscribe();
    };
  }, [refresh, open]);

  useEffect(() => {
    if (!open) return;
    const position = () =>
      setTop(
        Math.max(
          8,
          Math.min(
            (trigger.current?.getBoundingClientRect().bottom ?? 60) + 10,
            window.innerHeight - 180,
          ),
        ),
      );
    const frame = window.requestAnimationFrame(position);
    window.addEventListener("resize", position);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  async function act(path: string, method: "POST" | "DELETE", action: string) {
    if (actionPending.current) return;
    actionPending.current = true;
    ++generation.current;
    setBusy(action);
    setActionError("");
    try {
      const response = await fetch(`/api/notifications/${path}`, { method });
      if (!response.ok) throw new Error("Unavailable");
      setDeleting(null);
      actionPending.current = false;
      await refresh();
      if (method === "DELETE") heading.current?.focus();
    } catch {
      setActionError("Could not update this notification. Please try again.");
    } finally {
      actionPending.current = false;
      setBusy(null);
    }
  }
  function changeFilter(value: "all" | "unread") {
    setFilter(value);
    setPage(1);
    setDeleting(null);
    setLoading(true);
  }
  function changePage(value: number) {
    setPage(value);
    setDeleting(null);
    setLoading(true);
  }
  const totalPages = Math.max(1, Math.ceil(inbox.total / inbox.pageSize));

  return (
    <>
      <div className={styles.trigger}>
        <IconActionButton
          ref={trigger}
          className="notification-button icon-button"
          icon={Bell}
          label={
            error
              ? "Notifications unavailable"
              : `Notifications, ${inbox.unreadCount} unread`
          }
          tooltip="Notifications"
          aria-expanded={open}
          aria-controls={id}
          aria-haspopup="dialog"
          popoverTarget={id}
        />
        {inbox.unreadCount > 0 && (
          <span className={styles.badge} aria-hidden="true">
            {inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}
          </span>
        )}
      </div>
      <div
        id={id}
        ref={panel}
        popover="auto"
        role="dialog"
        aria-labelledby={`${id}-heading`}
        className={styles.panel}
        style={{ top, maxHeight: `calc(100dvh - ${top + 12}px)` }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            panel.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
        onToggle={(event) => {
          const visible = event.newState === "open";
          setOpen(visible);
          if (visible) heading.current?.focus();
          else setDeleting(null);
        }}
      >
        <header className={styles.heading}>
          <div>
            <h2 ref={heading} tabIndex={-1} id={`${id}-heading`}>
              Notifications
            </h2>
            <p>Your updates from the last 60 days</p>
          </div>
          <IconActionButton
            icon={X}
            label="Close notifications"
            onClick={() => {
              panel.current?.hidePopover();
              trigger.current?.focus();
            }}
          />
        </header>
        <div className={styles.toolbar}>
          <div
            className={styles.filters}
            role="group"
            aria-label="Filter notifications"
          >
            <button
              type="button"
              aria-pressed={filter === "all"}
              disabled={busy !== null}
              onClick={() => changeFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              aria-pressed={filter === "unread"}
              disabled={busy !== null}
              onClick={() => changeFilter("unread")}
            >
              Unread <span>{inbox.unreadCount}</span>
            </button>
          </div>
          <button
            type="button"
            className={styles.readAll}
            disabled={busy !== null || inbox.unreadCount === 0 || loading}
            onClick={() => void act("read-all", "POST", "all")}
          >
            <CheckCheck size={15} aria-hidden="true" /> Mark all read
          </button>
        </div>
        <div className={styles.content} aria-busy={loading || busy !== null}>
          {loading && (
            <p className={styles.state} role="status">
              Loading notifications...
            </p>
          )}
          {error && (
            <div className={styles.state} role="alert">
              Notifications could not be loaded.{" "}
              <button
                type="button"
                onClick={() => {
                  setLoading(true);
                  void refresh();
                }}
              >
                Try again
              </button>
            </div>
          )}
          {actionError && (
            <p className={styles.error} role="alert">
              {actionError}
            </p>
          )}
          {!loading && !error && inbox.items.length === 0 && (
            <div className={styles.empty}>
              <Bell size={30} aria-hidden="true" />
              <strong>
                {filter === "unread"
                  ? "You're all caught up"
                  : "No notifications yet"}
              </strong>
              <p>
                {filter === "unread"
                  ? "Read updates are still available in All."
                  : "New updates will appear here and stay for 60 days."}
              </p>
            </div>
          )}
          {!loading && (
            <ul className={styles.list}>
              {inbox.items.map((alert) => {
                const href = notificationDestination(alert, canReviewResets);
                const content = (
                  <>
                    <span
                      className={`${styles.avatar} ${styles[alert.type.toLowerCase()] ?? ""}`}
                    >
                      <Bell size={19} aria-hidden="true" />
                    </span>
                    <span className={styles.copy}>
                      <strong>{alert.title}</strong>
                      <span className={styles.message}>From: {alert.senderName?.trim() || "Not recorded"}</span>
                      <span className={styles.message}>{alert.message}</span>
                      <time
                        dateTime={alert.createdAt}
                        title={new Date(alert.createdAt).toLocaleString(
                          "en-PH",
                          { timeZone: "Asia/Manila" },
                        )}
                      >
                        {notificationTime(alert.createdAt)}
                      </time>
                    </span>
                    <span className={styles.srOnly}>
                      {alert.read ? "Read" : "Unread"}
                    </span>
                    {!alert.read && (
                      <span className={styles.dot} aria-hidden="true" />
                    )}
                  </>
                );
                return (
                  <li
                    key={alert.id}
                    className={`${styles.item} ${!alert.read ? styles.unread : ""}`}
                  >
                    {href ? (
                      <Link
                        className={styles.destination}
                        href={href}
                        prefetch={false}
                        onClick={() => {
                          panel.current?.hidePopover();
                          if (!alert.read)
                            void act(
                              `${encodeURIComponent(alert.id)}/read`,
                              "POST",
                              alert.id,
                            );
                        }}
                      >
                        {content}
                      </Link>
                    ) : (
                      <div className={styles.destination}>{content}</div>
                    )}
                    <div className={styles.actions}>
                      {!alert.read && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void act(
                              `${encodeURIComponent(alert.id)}/read`,
                              "POST",
                              alert.id,
                            )
                          }
                        >
                          <Check size={13} aria-hidden="true" />
                          Mark read
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy !== null}
                        aria-label={`Delete notification: ${alert.title}`}
                        onClick={() => setDeleting(alert.id)}
                      >
                        <Trash2 size={13} aria-hidden="true" />
                        Delete
                      </button>
                      {busy === alert.id && (
                        <span role="status">Saving...</span>
                      )}
                    </div>
                    {deleting === alert.id && (
                      <div className={styles.confirm}>
                        <p>Delete this notification for you?</p>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => setDeleting(null)}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          className={styles.deleteConfirm}
                          disabled={busy !== null}
                          onClick={() =>
                            void act(
                              encodeURIComponent(alert.id),
                              "DELETE",
                              alert.id,
                            )
                          }
                        >
                          Delete for me
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className={styles.footer}>
          <span>
            {inbox.total} {filter === "unread" ? "unread updates" : "updates"}
          </span>
          {totalPages > 1 && (
            <div className={styles.paging}>
              <button
                type="button"
                aria-label="Previous notifications"
                disabled={page <= 1 || loading || busy !== null}
                onClick={() => changePage(page - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Next notifications"
                disabled={page >= totalPages || loading || busy !== null}
                onClick={() => changePage(page + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </footer>
      </div>
    </>
  );
}
