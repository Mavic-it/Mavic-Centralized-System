"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { usePortalTooltip } from "./icon-action-button";

type SidebarNavItemProps = {
  label: string;
  icon: LucideIcon;
  href?: string;
  active: boolean;
  current: boolean;
  compact: boolean;
  onNavigate: () => void;
};

export function SidebarNavItem({
  label,
  icon: Icon,
  href,
  active,
  current,
  compact,
  onNavigate,
}: SidebarNavItemProps) {
  const { setTriggerRef, ...tooltip } = usePortalTooltip<HTMLLIElement>(
    compact ? `${label}${href ? "" : " · Coming soon"}` : "",
    "right",
  );

  return (
    <li
      ref={setTriggerRef}
      onMouseEnter={tooltip.show}
      onMouseLeave={tooltip.hide}
      onFocusCapture={tooltip.show}
      onBlurCapture={tooltip.hide}
    >
      {href ? (
        <Link
          aria-current={current ? "page" : undefined}
          aria-label={label}
          className={`nav-item${active ? " nav-item-active" : ""}`}
          href={href}
          onClick={onNavigate}
        >
          <Icon aria-hidden="true" size={18} />
          <span className="nav-item-label">{label}</span>
        </Link>
      ) : (
        <button
          aria-label={`${label}, coming soon`}
          className="nav-item nav-item-disabled"
          disabled
          title={compact ? undefined : "This section is not available yet"}
          type="button"
        >
          <Icon aria-hidden="true" size={18} />
          <span className="nav-item-label">{label}</span>
          <span className="nav-coming-soon">Soon</span>
        </button>
      )}
      {tooltip.tooltip}
    </li>
  );
}
