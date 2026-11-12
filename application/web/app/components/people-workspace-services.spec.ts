import { describe, expect, it } from "vitest";
import {
  mergeWorkspaceEmployee,
  toWorkspaceAccount,
  toWorkspaceEmployee,
} from "./people-workspace-services";
import type { EmployeeApiRecord } from "./people-workspace-types";

const employeeRecord: EmployeeApiRecord = {
  id: "employee-1",
  employeeNumber: "EMP-001",
  name: "Avery Santos",
  email: "avery@example.test",
  branchId: "branch-1",
  branchName: "Makati",
  position: "Coordinator",
  department: "Operations",
  status: "ACTIVE",
  phone: "09171234567",
  manager: "Jordan Lee",
  employment: { employeeType: "FULL_TIME", startDate: "2026-10-01" },
  emergencyContact: {
    name: "Alex Santos",
    relationship: "Sibling",
    phone: "09179876543",
  },
};

describe("account display data", () => {
  it("formats recorded sign-ins in Philippine time and handles missing history", () => {
    const user = {id:"user-1",name:"Account",email:"account@example.test",role:"EMPLOYEE" as const,status:"ACTIVE" as const};
    const account = toWorkspaceAccount({...user,lastLoginAt:"2026-11-06T18:30:00.000Z"});
    expect(account.lastSignIn).toContain("Nov 7, 2026");
    expect(account.lastSignIn).toContain("2:30 AM");
    expect(account.lastSignIn).toContain("PHT");
    expect(toWorkspaceAccount(user).lastSignIn).toBe("No sign-in recorded");
    expect(toWorkspaceAccount({...user,lastLoginAt:"invalid"}).lastSignIn).toBe("No sign-in recorded");
  });
  it("shows effective branch access separately from home branch assignment", () => {
    const manager = { id: "manager", name: "Manager", email: "manager@example.test", role: "BRANCH_MANAGER" as const, status: "ACTIVE" as const, branchId: null };
    expect(toWorkspaceAccount(manager).branch).toBe("No assigned branch");
    expect(toWorkspaceAccount({ ...manager, branchAccessMode: "ASSIGNED", accessibleBranches: [{ id: "a", name: "Makati" }, { id: "b", name: "Ortigas" }] }).branch).toBe("Makati, Ortigas");
    expect(toWorkspaceAccount({ ...manager, branchId: "a", branchName: "Makati", branchAccessMode: "ALL" }).branch).toBe("All branches");
    expect(toWorkspaceAccount({ ...manager, branchAccessMode: "SELECTED", accessibleBranches: [{ id: "b", name: "Ortigas" }] }).branch).toBe("Ortigas");
    expect(toWorkspaceAccount({ ...manager, branchAccessMode: "SELECTED", accessibleBranches: [] }).branch).toBe("No active access branches");
  });
  it("preserves the linked employee photo version for account avatars", () => {
    const account = toWorkspaceAccount({
      id: "user-1",
      employeeId: "employee-1",
      profilePictureUpdatedAt: "2026-10-30T10:00:00.000Z",
      name: "Avery Santos",
      email: "avery@example.test",
      role: "EMPLOYEE",
      branchId: "branch-1",
      branchName: "Makati",
      status: "ACTIVE",
    });

    expect(account.employeeId).toBe("employee-1");
    expect(account.profilePictureUpdatedAt).toBe("2026-10-30T10:00:00.000Z");
  });
});

describe("employee query record merging", () => {
  it("preserves employee account status from the API", () => {
    const employee = toWorkspaceEmployee({
      ...employeeRecord,
      hasUserAccount: true,
    });

    expect(employee.hasUserAccount).toBe(true);
  });

  it("preserves existing employee fields when a mutation returns only changed fields", () => {
    const current = toWorkspaceEmployee(employeeRecord);
    const updated = mergeWorkspaceEmployee(current, {
      id: current.id,
      emergencyContact: {
        name: "Taylor Santos",
        relationship: "Parent",
        phone: "09170001122",
      },
    });

    expect(updated.name).toBe("Avery Santos");
    expect(updated.employeeNumber).toBe("EMP-001");
    expect(updated.email).toBe("avery@example.test");
    expect(updated.emergencyContact).toEqual({
      name: "Taylor Santos",
      relationship: "Parent",
      phone: "09170001122",
    });
  });

  it("applies explicit cleared values without replacing unrelated fields", () => {
    const current = toWorkspaceEmployee(employeeRecord);
    const updated = mergeWorkspaceEmployee(current, {
      id: current.id,
      phone: null,
      manager: null,
    });

    expect(updated.phone).toBe("Not provided");
    expect(updated.manager).toBe("Not assigned");
    expect(updated.name).toBe("Avery Santos");
  });
});


describe("employee display identifiers", () => {
  it("uses a branch label when the branch name is missing, preserving internal keys", () => {
    const branchId = "12345678-1234-4234-8234-123456789abc";
    const employee = toWorkspaceEmployee({ ...employeeRecord, branchId, branchName: undefined });
    expect(employee.branch).toBe("Assigned branch");
    expect(employee.branchId).toBe(branchId);
    expect(employee.employeeNumber).toBe("EMP-001");
  });
  it("preserves the readable branch name", () => {
    expect(toWorkspaceEmployee(employeeRecord).branch).toBe("Makati");
  });
});
