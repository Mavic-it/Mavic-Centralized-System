import type { EmployeeHrProfileApiRecord } from "./people-workspace-types";
import type { WorkspaceEmployee } from "../data/people";
import { splitEmployeeName } from "./employee-directory-utils";
import {
  EMPLOYMENT_OPTIONS,
  employmentTypeLabel,
  jobLevelLabel,
} from "./employee-employment-options";

export type EmployeeHrProfileDisplaySection = {
  title: string;
  fields: { label: string; value: string }[];
};

type EmployeeHrProfileDisplayOptions = {
  canManageEmployees: boolean;
  canViewCompensation: boolean;
};

export function employeeHrProfileDisplaySections(
  profile: EmployeeHrProfileApiRecord | null | undefined,
  employee: WorkspaceEmployee,
  options: EmployeeHrProfileDisplayOptions,
): EmployeeHrProfileDisplaySection[] {
  const nameParts = splitEmployeeName(employee.name);
  const toFields = (
    entries: [string, string | number | boolean | null | undefined][],
  ) =>
    entries.flatMap(([label, value]) => {
      if (value === null || value === undefined) return [];
      const formatted =
        typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : String(value).trim();
      return formatted ? [{ label, value: formatted }] : [];
    });

  const sections = [
    {
      title: "Work information",
      fields: toFields([
        ["Employee ID", employee.employeeNumber],
        ["Employment type", employmentTypeLabel(employee.employmentType)],
        [
          "End of provisionary date",
          employee.employmentType === "PROBATIONARY"
            ? employee.probationEndDate
            : null,
        ],
        [
          "Evaluation due date",
          employee.employmentType === "PROBATIONARY"
            ? employee.evaluationDueDate
            : null,
        ],
        [
          "Evaluation",
          employee.employmentType === "PROBATIONARY" &&
          employee.status === "ACTIVE" &&
          employee.evaluationDueDate
            ? employee.evaluationDueDate <=
              new Intl.DateTimeFormat("en-CA", {
                timeZone: "Asia/Manila",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              }).format(new Date())
              ? "Due for evaluation"
              : "Scheduled"
            : null,
        ],
        ["Position", employee.position],
        ["Department", employee.department],
        ["Primary branch", employee.branch],
        ["Work branches", employee.allWorkBranches ? "All current and future active branches" : employee.workBranches?.map(branch => branch.name).join(", ") || employee.branch],
        ["Date hired", employee.hiredOn],
        ["Reports to", employee.manager],
        ["Work email", employee.email],
        ["Phone", employee.phone],
        ["Status", employee.status],
      ]),
    },
    {
      title: "Personal details",
      fields: toFields([
        [
          "First name",
          options.canManageEmployees
            ? nameParts.firstName
            : (profile?.firstName ?? nameParts.firstName),
        ],
        [
          "Middle name",
          options.canManageEmployees
            ? nameParts.middleName
            : (profile?.middleName ?? nameParts.middleName),
        ],
        [
          "Last name",
          options.canManageEmployees
            ? nameParts.lastName
            : (profile?.lastName ?? nameParts.lastName),
        ],
        [
          "Name suffix",
          options.canManageEmployees
            ? nameParts.suffix
            : (profile?.suffix ?? nameParts.suffix),
        ],
        ["Preferred name", profile?.preferredName],
        ["Date of birth", profile?.dateOfBirth],
        ["Gender", profile?.gender],
        ["Civil status", profile?.civilStatus],
        ["Nationality", profile?.nationality],
        ["Personal email", profile?.personalEmail],
        ["Current address", profile?.currentAddress],
        ["Permanent address", profile?.permanentAddress],
      ]),
    },
    ...(options.canManageEmployees
      ? [
          {
            title: "Employment details",
            fields: toFields([
              ["Job level", jobLevelLabel(profile?.jobLevel)],
              [
                "Probationary",
                EMPLOYMENT_OPTIONS.some(
                  (option) => option.value === employee.employmentType,
                )
                  ? employee.employmentType === "PROBATIONARY"
                  : profile?.probationary,
              ],
              ["Regularization date", profile?.regularizationDate],
              ["Separation date", profile?.separationDate],
              ["Separation reason", profile?.separationReason],
            ]),
          },
        ]
      : []),
    ...(options.canViewCompensation
      ? [
          {
            title: "Compensation",
            fields: toFields([
              ["Salary grade", profile?.salaryGrade],
              [
                "Base salary",
                profile?.basicSalary == null
                  ? null
                  : profile.basicSalary.toFixed(2),
              ],
            ]),
          },
        ]
      : []),
  ];

  return sections.filter((section) => section.fields.length > 0);
}
