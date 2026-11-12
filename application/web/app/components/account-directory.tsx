"use client";
import {
  Clock3,
  MapPin,
  ShieldCheck,
  Settings2,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  Children,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { createFrameScheduler } from "../lib/frame-scheduler";
import { roleLabel, type WorkspaceAccount } from "../data/people";
import { Skeleton } from "./loading-ui";
import { PersonAvatar } from "./person-avatar";
import s from "./admin-directory.module.css";

export function AccountManagementAction({
  icon: Icon,
  label,
  shortLabel,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: LucideIcon;
  label: string;
  shortLabel?: string;
  variant?: "danger" | "default";
}) {
  const labels = [
    ["Manage branch access", "Branch access"],
    ["Change employee branch", "Employee branch"],
    ["Edit role", "Edit role"],
    ["Regenerate & email credentials", "Email credentials"],
    ["Reset password", "Reset password"],
    ["Deactivate", "Deactivate"],
    ["Activate", "Activate"],
    ["Archive", "Archive"],
    ["Delete", "Delete permanently"],
  ];
  const text =
    shortLabel ??
    labels.find(([prefix]) => label.startsWith(prefix))?.[1] ??
    label;
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      className={`${s.action} ${variant === "danger" ? s.danger : ""}`}
    >
      <Icon size={15} aria-hidden="true" />
      <span>{text}</span>
    </button>
  );
}

export function AccountManagementActions({
  name,
  children,
  entity = "account",
}: {
  name: string;
  children: ReactNode;
  entity?: "account" | "branch";
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const button = trigger.current;
      const panel = menu.current;
      if (!button || !panel) return;
      const rect = button.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const below = window.innerHeight - rect.bottom >= height + 12;
      const nextPosition = {
        top: below ? rect.bottom + 6 : Math.max(8, rect.top - height - 6),
        left: Math.max(
          8,
          Math.min(rect.right - width, window.innerWidth - width - 8),
        ),
      };
      setPosition(previous => previous?.left === nextPosition.left && previous.top === nextPosition.top ? previous : nextPosition);
    };
    const scheduler = createFrameScheduler(place);
    const closeOnOutside = (event: PointerEvent) => {
      if (
        !trigger.current?.contains(event.target as Node) &&
        !menu.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const onScroll = (event: Event) => {
      // A long action menu must remain usable while its own list scrolls.
      if (menu.current?.contains(event.target as Node)) return;
      scheduler.schedule();
    };
    place();
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", scheduler.schedule);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      scheduler.dispose();
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", scheduler.schedule);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  if (Children.toArray(children).length === 0) return null;

  return (
    <div className={s.management}>
      <button
        ref={trigger}
        type="button"
        className={s.managementTrigger}
        aria-label={`Manage ${entity} for ${name}`}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            requestAnimationFrame(() =>
              menu.current?.querySelector<HTMLButtonElement>("button")?.focus(),
            );
          }
        }}
      >
        <Settings2 size={15} aria-hidden="true" />
        <span>Actions</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            className={s.actionList}
            role="group"
            aria-label={`${entity === "account" ? "Account" : "Branch"} actions for ${name}`}
            style={
              position
                ? { top: position.top, left: position.left }
                : { visibility: "hidden" }
            }
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("button"))
                setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function AccountDirectoryCards({
  accounts,
  renderActions,
  renderStatus,
  showEmployeePhotos = true,
}: {
  accounts: WorkspaceAccount[];
  renderActions: (account: WorkspaceAccount) => ReactNode;
  renderStatus: (account: WorkspaceAccount) => ReactNode;
  showEmployeePhotos?: boolean;
}) {
  return (
    <div className={s.grid} aria-label="User account cards">
      {accounts.map((account) => (
        <article className={s.card} key={account.id}>
          <div className={s.cardHeader}>
            <PersonAvatar
              className={s.avatar}
              employeeId={showEmployeePhotos ? account.employeeId : null}
              name={account.name}
              profilePictureUpdatedAt={account.profilePictureUpdatedAt}
              size={46}
            />
            <div className={s.identity}>
              <h3>{account.name}</h3>
              <p>{account.email}</p>
            </div>
          </div>
          <div className={s.badges}>
            <span className={s.pill}>
              <ShieldCheck size={13} aria-hidden="true" />
              {roleLabel(account.role)}
            </span>
            {renderStatus(account)}
          </div>
          <p className={s.meta}>
            <MapPin size={14} aria-hidden="true" />
            {account.branch}
          </p>
          <p className={s.meta}>
            <Clock3 size={14} aria-hidden="true" />
            Last sign-in: {account.lastSignIn}
          </p>
          <div className={s.cardFooter}>{renderActions(account)}</div>
        </article>
      ))}
    </div>
  );
}

export function AccountDirectorySkeleton() {
  return (
    <div
      className={s.grid}
      role="status"
      aria-label="Loading user accounts"
      aria-busy="true"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={`${s.card} ${s.loadingCard}`}
          aria-hidden="true"
        >
          <Skeleton className="loading-section-title" />
          <Skeleton className="loading-description" />
          <Skeleton className="loading-action" />
        </div>
      ))}
    </div>
  );
}
