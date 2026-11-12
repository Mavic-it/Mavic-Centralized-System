import type { WorkspaceRole } from "../data/people";

export type OwnProfileLink =
  | { mode: "employee"; employeeId: string }
  | { mode: "independent" };

export function shouldLoadOwnEmployee(
  role: WorkspaceRole | null,
  profileMode?: OwnProfileLink["mode"],
): boolean {
  return role !== null && (role !== "SUPER_ADMIN" || profileMode === "employee");
}
