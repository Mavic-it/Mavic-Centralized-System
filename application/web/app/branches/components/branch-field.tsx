import type { ReactNode } from "react";
import { RequiredMark } from "../../components/required-mark";

export function Field({
  label,
  error,
  required = false,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`branch-field ${className}`}>
      <span className="branch-field-label form-field-label">
        {label}
        {required && <RequiredMark />}
      </span>
      {children}
      {error && <small role="alert">{error}</small>}
    </label>
  );
}
