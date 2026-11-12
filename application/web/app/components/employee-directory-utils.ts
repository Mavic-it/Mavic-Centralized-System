import type { WorkspaceEmployee } from "../data/people";

export type EmployeeDirectoryFilters = {
  query: string;
  branch: string;
  department: string;
  employment: string;
  status: string;
};

export function employeeBranchKey(employee: WorkspaceEmployee): string {
  return employee.branchId ? `id:${employee.branchId}` : `name:${employee.branch}`;
}

export function filterDirectoryEmployees(
  employees: WorkspaceEmployee[],
  filters: EmployeeDirectoryFilters,
): WorkspaceEmployee[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return employees.filter((employee) =>
    (!query || `${employee.name} ${employee.employeeNumber} ${employee.email} ${employee.department}`
      .toLocaleLowerCase().includes(query)) &&
    (!filters.branch || employeeBranchKey(employee) === filters.branch ||
      (filters.branch.startsWith("id:") && (employee.allWorkBranches || employee.workBranchIds?.includes(filters.branch.slice(3))))) &&
    (!filters.department || employee.department === filters.department) &&
    (!filters.employment || employee.employmentType === filters.employment) &&
    (filters.status === "ALL" || employee.status === filters.status),
  );
}

export type EmployeeNameParts = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
};

export function splitEmployeeName(name: string): EmployeeNameParts {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const suffixPattern = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
  const suffix =
    parts.length > 1 && suffixPattern.test(parts.at(-1) ?? "")
      ? (parts.pop() ?? "")
      : "";

  return {
    firstName: parts[0] ?? "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    lastName: parts.length > 1 ? (parts.at(-1) ?? "") : "",
    suffix,
  };
}

export type EmployeeCreatePayload = {
  workBranchIds?: string[];
  allWorkBranches?: boolean;
  name: string;
  email: string;
  branchId: string;
  position: string;
  department: string;
  employmentType: string;
  startDate: string;
  probationEndDate?: string;
  evaluationDueDate?: string;
  managerEmployeeId?: string;
  workSchedule?: {
    timeZone: string;
    workDays: number[];
    shiftStart: string;
    shiftEnd: string;
    breakMinutes: number;
    graceMinutes: number;
  };
  phone: string;
  status: string;
};

export function buildEmployeeCreatePayload(
  values: Record<string, FormDataEntryValue | FormDataEntryValue[]>,
): EmployeeCreatePayload {
  const text = (key: string) => String(values[key] ?? "").trim();
  const name = ["firstName", "middleName", "lastName", "suffix"]
    .map(text)
    .filter(Boolean)
    .join(" ");
  const managerEmployeeId = text("managerEmployeeId");
  const workSchedule =
    text("useCustomSchedule") === "on"
      ? {
          timeZone: text("timeZone"),
          workDays: (Array.isArray(values.workDays)
            ? values.workDays
            : values.workDays
              ? [values.workDays]
              : []
          ).map(Number),
          shiftStart: text("shiftStart"),
          shiftEnd: text("shiftEnd"),
          breakMinutes: Number(text("breakMinutes")),
          graceMinutes: Number(text("graceMinutes")),
        }
      : undefined;

  return {
    name,
    email: text("email"),
    branchId: text("branchId"),
    ...employeeWorkBranchPayload(values),
    position: text("position"),
    department: text("department"),
    employmentType: text("employmentType"),
    startDate: text("startDate"),
    ...(text("employmentType") === "PROBATIONARY"
      ? {
          probationEndDate: text("probationEndDate"),
          evaluationDueDate: text("evaluationDueDate"),
        }
      : {}),
    ...(managerEmployeeId ? { managerEmployeeId } : {}),
    ...(workSchedule ? { workSchedule } : {}),
    phone: text("phone"),
    status: text("status"),
  };
}

export function eligibleEmployeeManagers(
  employees: WorkspaceEmployee[],
): WorkspaceEmployee[] {
  return employees.filter((employee) => employee.status === "ACTIVE");
}

export function employeeWorkBranchPayload(values: Record<string, FormDataEntryValue | FormDataEntryValue[]>) {
  if (values.workBranchSelection === undefined) return {};
  const allWorkBranches = values.allWorkBranches === "on";
  const raw = values.workBranchIds;
  const workBranchIds = allWorkBranches ? [] : [...new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(String))];
  return { allWorkBranches, workBranchIds };
}
