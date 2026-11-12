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
});
