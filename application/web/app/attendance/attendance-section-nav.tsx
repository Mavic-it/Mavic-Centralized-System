"use client";

import type { LucideIcon } from "lucide-react";
import { EmployeeProfileTabs } from "../components/employee-profile-tabs";

export type AttendanceNavItem<T extends string> = {
  id: T;
  label: string;
  description: string;
  icon: LucideIcon;
};
export function AttendanceSectionNav<T extends string>({
  items,
  activeId,
  onChange,
}: {
  items: ReadonlyArray<AttendanceNavItem<T>>;
  activeId: T;
  onChange: (id: T) => void;
}) {
  return (
    <EmployeeProfileTabs
      label="Attendance sections"
      panelId="attendance-section-content"
      tabs={[...items]}
      activeId={activeId}
      onSelect={(id) => onChange(id as T)}
    />
  );
}
