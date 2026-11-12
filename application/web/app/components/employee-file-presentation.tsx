import {
  Building2,
  BriefcaseBusiness,
  CalendarDays,
  UserRound,
  FolderOpen,
  History,
  Phone,
  Clock3,
} from "lucide-react";
import type { WorkspaceEmployee } from "../data/people";
import { employmentTypeLabel } from "./employee-employment-options";
import styles from "./employee-file-presentation.module.css";
export const employeeFileSectionMeta = {
  "incident-history": {
    icon: History,
    description: "Incident reports and recorded offense levels",
  },
  "work-information": {
    icon: BriefcaseBusiness,
    description: "Employment and personal details",
  },
  "work-schedule": {
    icon: Clock3,
    description: "Assigned shifts and workdays",
  },
  "emergency-contact": {
    icon: Phone,
    description: "Who to contact in an emergency",
  },
  documents: {
    icon: FolderOpen,
    description: "Employee files and supporting records",
  },
  "assignment-history": {
    icon: History,
    description: "Recorded branch and role changes",
  },
};
export function employeeHireDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || "Not provided";
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : value;
}
export function EmployeeFileFacts({
  employee,
}: {
  employee: WorkspaceEmployee;
}) {
  const facts = [
    { label: "Work branches", value: employee.allWorkBranches ? "All active branches" : employee.workBranches?.map(branch => branch.name).join(", ") || employee.branch, icon: Building2 },
    {
      label: "Employment",
      value: employmentTypeLabel(employee.employmentType),
      icon: BriefcaseBusiness,
    },
    {
      label: "Date hired",
      value: employeeHireDate(employee.hiredOn),
      icon: CalendarDays,
    },
    { label: "Reports to", value: employee.manager, icon: UserRound },
  ];
  return (
    <dl className={styles.facts} aria-label="Employee employment summary">
      {facts.map(({ label, value, icon: Icon }) => (
        <div key={label}>
          <dt>
            <span className={styles.icon}>
              <Icon size={17} aria-hidden="true" />
            </span>
            {label}
          </dt>
          <dd>{value || "Not provided"}</dd>
        </div>
      ))}
    </dl>
  );
}
