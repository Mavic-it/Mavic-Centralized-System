import type { WorkspaceRole } from "../data/people";

export const workspaceRoles = [
  "SUPER_ADMIN",
  "IT_ADMIN",
  "HR_ADMIN",
  "BRANCH_MANAGER",
  "STAFF",
  "EMPLOYEE",
] as const satisfies readonly WorkspaceRole[];

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" && workspaceRoles.some((role) => role === value)
  );
}

export type WorkspaceArea =
  | "tasks"
  | "incidents"
  | "overview"
  | "hr"
  | "branches"
  | "users"
  | "employees"
  | "employee-profile"
  | "my-profile"
  | "attendance"
  | "portal"
  | "security"
  | "my-leave"
  | "leave-management"
  | "leave-settings"
  | "reservations";

const accessByRole: Record<WorkspaceRole, readonly WorkspaceArea[]> = {
  SUPER_ADMIN: ["reservations", "tasks", "incidents", "my-leave", "leave-management", "leave-settings",
    "overview",
    "hr",
    "branches",
    "users",
    "employees",
    "employee-profile",
    "my-profile",
    "attendance",
    "portal",
    "security",
  ],
  HR_ADMIN: ["reservations", "tasks", "incidents", "my-leave", "leave-management", "leave-settings",
    "users",
    "overview",
    "hr",
    "branches",
    "employees",
    "employee-profile",
    "attendance",
    "portal",
    "security",
  ],
  BRANCH_MANAGER: ["reservations", "tasks", "incidents", "my-leave", "leave-management",
    "users",
    "overview",
    "hr",
    "branches",
    "employees",
    "employee-profile",
    "attendance",
    "portal",
    "security",
  ],
  IT_ADMIN: [
    "branches",
    "users",
    "employee-profile",
    "portal",
    "security",
  ],
  STAFF: ["reservations", "tasks", "incidents", "my-leave","employee-profile", "attendance", "portal", "security"],
  EMPLOYEE: ["tasks", "incidents", "my-leave","employee-profile", "attendance", "portal", "security"],
};

export function canAccessWorkspaceArea(
  role: WorkspaceRole,
  area: WorkspaceArea,
  grantedPermissionKeys: readonly string[] = [],
): boolean {
  const permissionKey = permissionKeyForArea(area);
  return accessByRole[role].includes(area) || Boolean(permissionKey && grantedPermissionKeys.includes(permissionKey));
}

export function workspaceAreaForPath(path: string): WorkspaceArea | undefined {
  const pathname = path.split(/[?#]/, 1)[0];
  if (pathname === '/attendance/official-business') return 'portal';
  if (pathname === "/reservations" || pathname.startsWith("/reservations/")) return "reservations";
  if (pathname === "/tasks") return "tasks";
  if (pathname === "/incidents") return "incidents";
  if (pathname === "/my-leave") return "my-leave";
  if (pathname === "/system/module-access" || pathname.startsWith("/system/module-access/")) return "users";
  if (pathname === "/leave/settings" || pathname.startsWith("/leave/settings/")) return "leave-settings";
  if (pathname === "/leave" || pathname.startsWith("/leave/")) return "leave-management";
  if (pathname === "/") return "overview";
  if (pathname === "/hr" || pathname.startsWith("/hr/")) return "hr";
  if (pathname === "/branches" || pathname.startsWith("/branches/")) {
    return "branches";
  }
  if (pathname === "/system/users" || pathname.startsWith("/system/users/")) {
    return "users";
  }
  if (pathname.startsWith("/system/password-reset-requests")) return "users";
  if (pathname === "/employees") return "employees";
  if (pathname.startsWith("/employees/")) return "employee-profile";
  if (pathname === "/my-profile" || pathname.startsWith("/my-profile/")) {
    return "my-profile";
  }
  if (pathname === "/attendance" || pathname.startsWith("/attendance/")) {
    return "attendance";
  }
  if (pathname === "/me" || pathname.startsWith("/me/")) return "portal";
  if (pathname === "/change-password") return "security";
  return undefined;
}

export function permissionKeyForArea(area: WorkspaceArea): string | undefined {
  const keys: Partial<Record<WorkspaceArea,string>> = {
    overview:"workspace.overview",hr:"hr.dashboard",employees:"hr.employees","employee-profile":"hr.employee-profile",attendance:"hr.attendance","leave-management":"hr.leave","leave-settings":"hr.leave.settings",tasks:"work.tasks",incidents:"work.incidents",reservations:"operations.reservations",users:"system.users","my-profile":"people.my-profile",portal:"people.my-portal","my-leave":"people.my-leave",
  };
  return keys[area];
}

export function permissionKeyForPath(path: string, area: WorkspaceArea): string | undefined {
  const pathname=path.split(/[?#]/,1)[0];
  if(pathname==='/attendance/official-business')return 'people.my-portal';
  const exact:Record<string,string>={"/leave/balances":"hr.leave.balances","/leave/reports":"hr.leave.reports","/leave/settings":"hr.leave.settings","/system/password-reset-requests":"system.password-resets","/system/module-access":"system.module-access","/reservations/list":"operations.reservations.list","/reservations/payments":"operations.reservations.list","/reservations/spaces":"operations.reservations.spaces","/reservations/reports":"operations.reservations.reports","/reservations/settings":"operations.reservations.settings"};
  return exact[pathname]??permissionKeyForArea(area);
}

export function landingPageForRole(role: WorkspaceRole): string {
  switch (role) {
    case "SUPER_ADMIN":
      return "/";
    case "HR_ADMIN":
    case "BRANCH_MANAGER":
      return "/hr";
    case "IT_ADMIN":
      return "/system/users";
    case "STAFF":
    case "EMPLOYEE":
      return "/me";
  }
}

export function destinationForRole(
  role: WorkspaceRole,
  returnPath?: string | null,
): string {
  if (!returnPath) return landingPageForRole(role);
  if (returnPath === "/" && role !== "SUPER_ADMIN") {
    return landingPageForRole(role);
  }
  const area = workspaceAreaForPath(returnPath);
  return area && canAccessWorkspaceArea(role, area)
    ? returnPath
    : landingPageForRole(role);
}
