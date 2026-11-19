import { describe, expect, it } from "vitest";
import { canAccessWorkspaceArea, permissionKeyForPath, workspaceAreaForPath } from "./workspace-access";

describe("module access route mapping", () => {
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

  it("shows inventory only through its registered module permission", () => {
    expect(workspaceAreaForPath("/inventory")).toBe("inventory");
    expect(permissionKeyForPath("/inventory", "inventory")).toBe("inventory");
    expect(canAccessWorkspaceArea("STAFF", "inventory")).toBe(true);
    expect(canAccessWorkspaceArea("EMPLOYEE", "inventory")).toBe(false);
    expect(canAccessWorkspaceArea("EMPLOYEE", "inventory", ["inventory"])).toBe(true);
  });
});
