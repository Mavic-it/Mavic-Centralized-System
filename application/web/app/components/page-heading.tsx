"use client";

import { Children, forwardRef, type ComponentPropsWithoutRef } from "react";
import { usePathname } from "next/navigation";
import { PageHelp } from "./page-help";
import styles from "./page-help.module.css";

/** Keep page guidance beside the module title, outside the heading text. */
export const PageHeading = forwardRef<
  HTMLHeadingElement,
  ComponentPropsWithoutRef<"h1">
>(function PageHeading({ children, ...props }, ref) {
  return (
    <h1 {...props} ref={ref}>
      {children}
    </h1>
  );
});

/** Module actions and help share one responsive row and vertical center. */
export function PageHeader({
  children,
  className = "",
  ...props
}: ComponentPropsWithoutRef<"header">) {
  const pathname = usePathname();
  const [identity, ...actions] = Children.toArray(children);
  return (
    <header {...props} className={`${className} ${styles.moduleHeader}`}>
      {identity}
      <div className={styles.actions}>
        {actions}
        <PageHelp key={pathname} pathname={pathname} />
      </div>
    </header>
  );
}
