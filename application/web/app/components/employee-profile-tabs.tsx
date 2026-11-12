"use client";

import { useEffect, useRef, type ComponentType } from "react";
import styles from "./employee-profile-tabs.module.css";

type ProfileTab = {
  id: string;
  label: string;
  description: string;
  icon: ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
};

export function EmployeeProfileTabs({ tabs, activeId, onSelect, panelId, label }: {
  tabs: ProfileTab[];
  activeId: string;
  onSelect: (id: string) => void;
  panelId: string;
  label: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const rail = list.current;
    const active = rail?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!rail || !active) return;
    // Reveal the selected tab without moving the page vertically.
    const bounds = rail.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    const delta = item.left < bounds.left ? item.left - bounds.left - 8
      : item.right > bounds.right ? item.right - bounds.right + 8 : 0;
    if (delta) rail.scrollBy({ left: delta, behavior: "instant" });
  }, [activeId]);

  return <div className={styles.shell}>
    <div ref={list} className={styles.rail} role="tablist" aria-label={label}
      onKeyDown={event => {
        if (["Enter", " "].includes(event.key)) {
          const id = (event.target as HTMLElement).closest<HTMLButtonElement>('[role="tab"]')?.dataset.tabId;
          if (id) { event.preventDefault(); onSelect(id); }
          return;
        }
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
        const index = buttons.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
          : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus({ preventScroll: true });
        buttons[next]?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
      }}>
      {tabs.map(({ id, label: text, description, icon: Icon }) => <button
        key={id} data-tab-id={id} id={`${panelId}-tab-${id}`} role="tab" type="button"
        aria-selected={activeId === id} aria-controls={panelId}
        tabIndex={activeId === id ? 0 : -1}
        className={styles.tab} title={description} onClick={() => onSelect(id)}>
        <span className={styles.icon}><Icon size={17} aria-hidden={true} /></span>
        <span className={styles.text}>{text}</span>
        <span className={styles.indicator} aria-hidden="true" />
      </button>)}
    </div>
  </div>;
}
