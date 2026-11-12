import type { CSSProperties } from "react";
import { Skeleton as ShadcnSkeleton } from "./ui/skeleton";

export function Skeleton({
  className = "",
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <ShadcnSkeleton
      aria-hidden="true"
      className={`loading-skeleton ${className}`}
      style={style}
    />
  );
}
