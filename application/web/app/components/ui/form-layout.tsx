"use client";

import type { ComponentPropsWithRef } from "react";
import styles from "./form-layout.module.css";

type FormLayoutProps = ComponentPropsWithRef<"form"> & {
  density?: "standard" | "compact";
  frame?: "standard" | "flush";
};

/** Shared structure for data-entry forms; form state stays with the module. */
export function FormLayout({
  className = "",
  density = "standard",
  frame = "standard",
  ...props
}: FormLayoutProps) {
  return (
    <form
      {...props}
      data-form-layout="standard"
      data-form-density={density}
      data-form-frame={frame}
      className={`${styles.formLayout} ${className}`.trim()}
    />
  );
}
