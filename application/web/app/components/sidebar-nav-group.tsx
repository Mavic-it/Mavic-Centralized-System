"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { SidebarNavItem } from "./sidebar-nav-item";

type GroupLink = { label: string; icon: LucideIcon; href: string };

export function SidebarNavGroup({ label, icon: Icon, items, pathname, compact, onNavigate }: {
  label: string;
  icon: LucideIcon;
  items: GroupLink[];
  pathname: string;
  compact: boolean;
  onNavigate: () => void;
}) {
  const current = (href: string) => pathname === href;
  const active = (href: string) => current(href) || pathname.startsWith(`${href}/`);
  const links = <ul aria-label={label}>{items.map(item => <SidebarNavItem
    key={item.href} {...item} active={active(item.href) && !items.some(other => other.href !== item.href && other.href.startsWith(`${item.href}/`) && active(other.href))} current={current(item.href)}
    compact={compact} onNavigate={onNavigate}
  />)}</ul>;

  return <li className={`leave-nav-group${compact ? " leave-nav-compact" : ""}`}>
    {compact ? links : <details open={items.some(item => active(item.href))}>
      <summary className="leave-nav-heading"><Icon size={17} aria-hidden="true"/><span>{label}</span><ChevronDown className="leave-nav-chevron" size={15} aria-hidden="true"/></summary>
      {links}
    </details>}
  </li>;
}
