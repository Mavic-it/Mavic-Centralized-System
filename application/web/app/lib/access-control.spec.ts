import { describe, expect, it } from "vitest";
import {
  canAccessWorkspaceArea,
  destinationForRole,
  landingPageForRole,
  workspaceAreaForPath,
  permissionKeyForPath,
} from "./workspace-access";

describe("workspace access by role", () => {
  it("exposes Tasks and Incidents only to their operational roles", () => {
    for (const path of ["/tasks", "/incidents"]) {
      const area = workspaceAreaForPath(path)!;
      for (const role of ["SUPER_ADMIN", "HR_ADMIN", "BRANCH_MANAGER", "STAFF", "EMPLOYEE"] as const) expect(canAccessWorkspaceArea(role, area)).toBe(true);
      expect(canAccessWorkspaceArea("IT_ADMIN", area)).toBe(false);
    }
  });
  it("routes each role to its own workspace landing page", () => {
    expect(landingPageForRole("SUPER_ADMIN")).toBe("/");
    expect(landingPageForRole("HR_ADMIN")).toBe("/hr");
    expect(landingPageForRole("BRANCH_MANAGER")).toBe("/hr");
    expect(landingPageForRole("IT_ADMIN")).toBe("/system/users");
    expect(landingPageForRole("STAFF")).toBe("/me");
    expect(landingPageForRole("EMPLOYEE")).toBe("/me");
  });

  it("keeps restricted areas out of each role's navigation", () => {
    for (const role of ["HR_ADMIN", "BRANCH_MANAGER"] as const) {
      expect(canAccessWorkspaceArea(role, "overview")).toBe(true);
      expect(canAccessWorkspaceArea(role, "hr")).toBe(true);
      expect(canAccessWorkspaceArea(role, "users")).toBe(true);
    }

    expect(canAccessWorkspaceArea("IT_ADMIN", "users")).toBe(true);
    expect(canAccessWorkspaceArea("IT_ADMIN", "overview")).toBe(false);
    for (const role of ["STAFF", "EMPLOYEE"] as const) {
      expect(canAccessWorkspaceArea(role, "branches")).toBe(false);
      expect(canAccessWorkspaceArea(role, "users")).toBe(false);
      expect(canAccessWorkspaceArea(role, "portal")).toBe(true);
      expect(canAccessWorkspaceArea(role, "my-profile")).toBe(false);
    }
    expect(canAccessWorkspaceArea("SUPER_ADMIN", "my-profile")).toBe(true);
    for (const role of ["HR_ADMIN", "BRANCH_MANAGER", "IT_ADMIN"] as const) {
      expect(canAccessWorkspaceArea(role, "my-profile")).toBe(false);
    }
  });

  it("allows an explicit user grant to open an area outside its role defaults", () => {
    expect(canAccessWorkspaceArea('EMPLOYEE', 'employees')).toBe(false);
    expect(canAccessWorkspaceArea('EMPLOYEE', 'employees', ['hr.employees'])).toBe(true);
  });

  it("honors only return pages allowed for the signed-in role", () => {
    expect(destinationForRole("HR_ADMIN", "/leave")).toBe("/leave");
    expect(destinationForRole("STAFF", "/leave")).toBe("/me");
    expect(destinationForRole("EMPLOYEE", "/my-leave")).toBe("/my-leave");
    expect(destinationForRole("HR_ADMIN", "/my-leave")).toBe("/my-leave");
    expect(workspaceAreaForPath("/my-leave")).toBe("my-leave");
    expect(workspaceAreaForPath("/my-profile")).toBe("my-profile");
    expect(destinationForRole("SUPER_ADMIN", "/my-profile")).toBe(
      "/my-profile",
    );
    expect(workspaceAreaForPath("/leave")).toBe("leave-management");
    expect(destinationForRole("HR_ADMIN", "/system/users")).toBe("/system/users");
    expect(destinationForRole("STAFF", "/branches")).toBe("/me");
    expect(destinationForRole("IT_ADMIN", "/system/users")).toBe(
      "/system/users",
    );
    expect(destinationForRole("HR_ADMIN", "/")).toBe("/hr");
  });

  it("maps nested protected pages and module administration to stable permission keys",()=>{
    expect(permissionKeyForPath('/leave/reports','leave-management')).toBe('hr.leave.reports');
    expect(permissionKeyForPath('/system/module-access','users')).toBe('system.module-access');
  });
});
