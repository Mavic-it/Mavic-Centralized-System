export const EMPLOYMENT_OPTIONS = [
  { value: "PROBATIONARY", label: "Provisionary" },
  { value: "REGULAR", label: "Regular" },
  { value: "PROJECT_BASED", label: "Project based" },
  { value: "CONTRACTUAL", label: "Contractual" },
] as const;

export const EMPLOYEE_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "RESIGNED", label: "Resigned" },
  { value: "RETIRED", label: "Retired" },
  { value: "TERMINATED", label: "Terminated" },
] as const;

export const JOB_LEVEL_OPTIONS = [
  { value: "RANK_AND_FILE", label: "Rank and file" },
  { value: "SUPERVISORY", label: "Supervisory" },
  { value: "MANAGERIAL", label: "Managerial" },
] as const;

export function employmentTypeLabel(value: string) {
  return (
    [
      ...EMPLOYMENT_OPTIONS,
      { value: "FULL_TIME", label: "Full time" },
      { value: "PART_TIME", label: "Part time" },
      { value: "CONTRACT", label: "Contract" },
    ].find((option) => option.value === value)?.label ?? value
  );
}

export function jobLevelLabel(value: string | null | undefined) {
  return (
    JOB_LEVEL_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}
