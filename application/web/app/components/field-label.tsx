import type { ComponentPropsWithoutRef } from "react";
import { RequiredMark } from "./required-mark";

type FieldLabelProps = ComponentPropsWithoutRef<"span"> & {
  required?: boolean;
};

export function FieldLabel({
  required = false,
  children,
  className = "",
  ...props
}: FieldLabelProps) {
  return (
    <span {...props} className={`form-field-label ${className}`.trim()}>
      {children}
      {required && <RequiredMark />}
    </span>
  );
}
