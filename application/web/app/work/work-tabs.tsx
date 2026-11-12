import { useRef, type KeyboardEvent } from "react";
import css from "./workspace.module.css";
export function WorkTabs({
  id,
  value,
  onChange,
  items,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: { id: string; label: string; count?: number; disabled?: boolean }[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function keydown(e: KeyboardEvent, index: number) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const enabled = items
        .map((item, i) => (!item.disabled ? i : -1))
        .filter((i) => i >= 0),
      position = enabled.indexOf(index);
    const next =
      e.key === "Home"
        ? enabled[0]
        : e.key === "End"
          ? enabled.at(-1)!
          : enabled[
              (position + (e.key === "ArrowRight" ? 1 : -1) + enabled.length) %
                enabled.length
            ];
    onChange(items[next].id);
    refs.current[next]?.focus();
  }
  return (
    <div className={css.detailTabs} role="tablist" aria-label="Record sections">
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => {
            refs.current[index] = el;
          }}
          role="tab"
          type="button"
          id={`${id}-${item.id}-tab`}
          aria-controls={`${id}-${item.id}-panel`}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          disabled={item.disabled}
          onKeyDown={(e) => keydown(e, index)}
          onClick={() => {
            onChange(item.id);
            refs.current[index]?.focus();
          }}
        >
          {item.label}
          {item.count !== undefined && <span>{item.count}</span>}
        </button>
      ))}
    </div>
  );
}
