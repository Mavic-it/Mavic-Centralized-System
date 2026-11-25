import { describe, expect, it } from "vitest";
import { canAccessWorkspaceArea, permissionKeyForPath, workspaceAreaForPath } from "./workspace-access";

describe("module access route mapping", () => {
  it("removes the duplicate central Reports area while retaining module reports", () => {
    expect(workspaceAreaForPath("/reports?category=attendance")).toBeUndefined();
    expect(workspaceAreaForPath("/reservations/reports")).toBe("reservations");
    expect(workspaceAreaForPath("/leave/reports")).toBe("leave-management");
  });
  it("accepts server-granted role defaults for personal pages and overview", () => {
    expect(canAccessWorkspaceArea("EMPLOYEE", "overview", ["workspace.overview"])).toBe(true);
    expect(canAccessWorkspaceArea("EMPLOYEE", "my-profile", ["people.my-profile"])).toBe(true);
    expect(canAccessWorkspaceArea("EMPLOYEE", "users", [])).toBe(false);
  });

  it("maps nested protected pages to their own stable keys", () => {
    expect(permissionKeyForPath("/reservations/reports", "reservations")).toBe("operations.reservations.reports");
    expect(permissionKeyForPath("/system/module-access", "users")).toBe("system.module-access");
    expect(workspaceAreaForPath("/my-leave")).toBe("my-leave");
  });

  it("makes personal appearance settings available to every signed-in role without a module grant", () => {
    expect(workspaceAreaForPath("/system/appearance")).toBe("appearance");
    for (const role of ["SUPER_ADMIN", "IT_ADMIN", "HR_ADMIN", "BRANCH_MANAGER", "STAFF", "EMPLOYEE"] as const) {
      expect(canAccessWorkspaceArea(role, "appearance")).toBe(true);
    }
  });

  it("shows inventory only through its registered module permission", () => {
    expect(workspaceAreaForPath("/inventory")).toBe("inventory");
    expect(permissionKeyForPath("/inventory", "inventory")).toBe("inventory");
    expect(canAccessWorkspaceArea("STAFF", "inventory")).toBe(true);
    expect(canAccessWorkspaceArea("EMPLOYEE", "inventory")).toBe(false);
    expect(canAccessWorkspaceArea("EMPLOYEE", "inventory", ["inventory"])).toBe(true);
  });
});
