import { FieldLabel } from "../components/field-label";
import { useId } from "react";
import css from "./workspace.module.css";
export function ProgressEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className={css.progressEditor}>
      <label htmlFor={id}>
        <FieldLabel required={true}>Progress (%)</FieldLabel>
      </label>
      <div>
        <input
          id={id}
          type="number"
          name="progress"
          min={0}
          max={100}
          required
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="range"
          aria-label="Progress slider"
          min={0}
          max={100}
          step={1}
          value={Math.max(0, Math.min(100, Number(value) || 0))}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}
