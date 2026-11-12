import { handleApiUnauthorized } from "../lib/handle-api-unauthorized";
import type {
  EmployeeApiRecord,
  PeopleWorkspaceMode,
  UserApiRecord,
} from "./people-workspace-types";
import {
  roleLabel,
  type WorkspaceAccount,
  type WorkspaceEmployee,
} from "../data/people";

export const peoplePageCopy: Record<
  PeopleWorkspaceMode,
  { title: string; description: string }
> = {
  hr: {
    title: "HR & manager portal",
    description:
      "Team overview, attendance, and decisions waiting on your review.",
  },
  employees: {
    title: "Employee directory",
    description: "Find a team member and review their employment record.",
  },
  "employee-profile": {
    title: "Employee 201 file",
    description:
      "Employment details and supporting records for one team member.",
  },
  me: {
    title: "My profile",
    description: "Your profile, attendance, payroll documents, and updates.",
  },
  users: {
    title: "User access",
    description: "Manage accounts, role assignments and branch access.",
  },
};

export function toWorkspaceAccount(user: UserApiRecord): WorkspaceAccount {
  const lastLogin = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
  const allBranches =
    user.branchAccessMode === "ALL" ||
    ["SUPER_ADMIN", "IT_ADMIN"].includes(user.role) ||
    (user.role === "HR_ADMIN" && !user.branchId && !user.branchAccessMode);
  const branchNames = user.accessibleBranches?.map((branch) => branch.name);
  return {
    id: user.id,
    employeeId: user.employeeId,
    profilePictureUpdatedAt: user.profilePictureUpdatedAt,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    branchAccessMode: allBranches ? "ALL" : user.branchAccessMode,
    accessibleBranches: user.accessibleBranches,
    branch: allBranches
      ? "All branches"
      : branchNames
        ? branchNames.join(", ") || "No active access branches"
        : (user.branchName ??
          (user.branchId ? "Assigned branch" : "No assigned branch")),
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    temporaryPasswordExpiresAt: user.temporaryPasswordExpiresAt,
    credentialEmailStatus: user.credentialEmailStatus,
    credentialEmailSentAt: user.credentialEmailSentAt,
    mfa: "NOT_CONFIGURED",
    activeSessions: 0,
    lastSignIn:
      lastLogin && Number.isFinite(lastLogin.getTime())
        ? `${new Intl.DateTimeFormat("en-PH", {
            timeZone: "Asia/Manila",
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }).format(lastLogin)} PHT`
        : "No sign-in recorded",
  };
}

export async function usersRequest<T>(
  path = "",
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/users${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  handleApiUnauthorized(response.status);
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(". ")
      : payload.message;
    throw new Error(message ?? "The user request could not be completed.");
  }
  return payload;
}

export function toWorkspaceEmployee(
  employee: EmployeeApiRecord,
): WorkspaceEmployee {
  return {
    id: employee.id,
    employeeNumber: employee.employeeNumber,
    name: employee.name ?? "Unnamed employee",
    email: employee.email,
    hasUserAccount: employee.hasUserAccount,
    branchId: employee.branchId,
    profilePictureUpdatedAt: employee.profilePictureUpdatedAt,
    phone: employee.phone ?? "Not provided",
    position: employee.position,
    department: employee.department,
    branch: employee.branchName ?? "Assigned branch",
    status: employee.status,
    workBranches: employee.workBranches,
    workBranchIds: employee.employment?.workBranchIds,
    allWorkBranches: employee.employment?.allWorkBranches,
    employmentType: employee.employment?.employeeType ?? "FULL_TIME",
    probationEndDate: employee.employment?.probationEndDate ?? null,
    evaluationDueDate: employee.employment?.evaluationDueDate ?? null,
    hiredOn: employee.employment?.startDate ?? "Not provided",
    manager: employee.manager ?? "Not assigned",
    managerEmployeeId: employee.managerEmployeeId ?? null,
    emergencyContact: employee.emergencyContact ?? {
      name: "Not provided",
      relationship: "Not provided",
      phone: "Not provided",
    },
    governmentIds: (employee.governmentIds ?? []).map((item) =>
      typeof item === "string"
        ? { label: "ID", maskedNumber: item }
        : {
            label: item.label ?? "ID",
            maskedNumber: item.maskedNumber ?? "Masked",
          },
    ),
    documents: (employee.documents ?? []).map((item) =>
      typeof item === "string"
        ? { label: item, kind: "Document", updated: "Not provided" }
        : {
            label: item.label ?? "Document",
            kind: item.kind ?? "Document",
            updated: item.updated ?? "Not provided",
          },
    ),
    attendance: employee.attendance ?? [],
  };
}

export function mergeWorkspaceEmployee(
  current: WorkspaceEmployee,
  update: Partial<EmployeeApiRecord>,
): WorkspaceEmployee {
  const merged = { ...current };

  if (update.employeeNumber !== undefined) {
    merged.employeeNumber = update.employeeNumber;
  }
  if (update.name !== undefined) merged.name = update.name;
  if (update.email !== undefined) merged.email = update.email;
  if (update.branchId !== undefined) merged.branchId = update.branchId;
  if (update.branchName) merged.branch = update.branchName;
  else if (update.branchId !== undefined) merged.branch = update.branchId;
  if (update.position !== undefined) merged.position = update.position;
  if (update.department !== undefined) merged.department = update.department;
  if (update.status !== undefined) merged.status = update.status;
  if (update.phone !== undefined) {
    merged.phone = update.phone ?? "Not provided";
  }
  if (update.manager !== undefined) {
    merged.manager = update.manager ?? "Not assigned";
  }
  if (update.managerEmployeeId !== undefined) {
    merged.managerEmployeeId = update.managerEmployeeId;
  }
  if (update.workBranches !== undefined) merged.workBranches = update.workBranches;
  if (update.employment?.workBranchIds !== undefined) merged.workBranchIds = update.employment.workBranchIds;
  if (update.employment?.allWorkBranches !== undefined) merged.allWorkBranches = update.employment.allWorkBranches;
  if (update.employment?.employeeType !== undefined) {
    merged.employmentType = update.employment.employeeType;
  }
  if (update.employment?.startDate !== undefined) {
    merged.hiredOn = update.employment.startDate;
  }
  if (update.employment?.probationEndDate !== undefined)
    merged.probationEndDate = update.employment.probationEndDate;
  if (update.employment?.evaluationDueDate !== undefined)
    merged.evaluationDueDate = update.employment.evaluationDueDate;
  if (update.emergencyContact !== undefined) {
    merged.emergencyContact = update.emergencyContact ?? {
      name: "Not provided",
      relationship: "Not provided",
      phone: "Not provided",
    };
  }

  return merged;
}

export async function hrRequest<T>(
  resource: "leave" | "employees" | "notifications" | "attendance" | "users",
  path = "",
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (
    !(typeof FormData !== "undefined" && init?.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`/api/${resource}${path}`, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers,
  });
  handleApiUnauthorized(response.status);
  const payload = (await response.json().catch(() => ({}))) as T & {
    message?: string | string[];
  };
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(". ")
      : payload.message;
    throw new Error(message ?? `Unable to load ${resource}.`);
  }
  return payload;
}

export async function uploadEmployeeProfilePicture(
  employeeId: string,
  file: File,
): Promise<{ profilePictureUpdatedAt: string }> {
  const body = new FormData();
  body.set("file", file, file.name);
  return hrRequest(
    "employees",
    `/${encodeURIComponent(employeeId)}/profile-picture`,
    {
      method: "POST",
      body,
    },
  );
}

export function getRoleDisplay(value: WorkspaceAccount["role"]) {
  return roleLabel(value);
}
