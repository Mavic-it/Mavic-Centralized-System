import { describe, expect, it } from "vitest";
import type { WorkspaceEmployee } from "../data/people";
import {
  buildEmployeeCreatePayload,
  eligibleEmployeeManagers,
  employeeWorkBranchPayload,
  filterDirectoryEmployees,
  splitEmployeeName,
} from "./employee-directory-utils";

const employee = (
  id: string,
  position: string,
  status: WorkspaceEmployee["status"] = "ACTIVE",
): WorkspaceEmployee => ({
  id,
  employeeNumber: id,
  name: `Employee ${id}`,
  email: `${id}@example.test`,
  branchId: "branch-1",
  phone: "",
  position,
  department: "Operations",
  branch: "Makati",
  status,
  employmentType: "FULL_TIME",
  hiredOn: "2026-01-01",
  manager: "Not assigned",
  emergencyContact: { name: "", relationship: "", phone: "" },
  governmentIds: [],
  documents: [],
  attendance: [],
});

describe("employee directory utilities", () => {
  it("combines branch, department, employment and status filters within the loaded records", () => {
    const target = { ...employee("one", "Manager"), department: "Accounting", employmentType: "CONTRACT" as const };
    const otherBranch = { ...target, id: "two", branchId: "branch-2", branch: "BGC" };
    const otherStatus = { ...target, id: "three", status: "INACTIVE" as const };
    const rows = [target, otherBranch, otherStatus];
    expect(filterDirectoryEmployees(rows, { query: "one", branch: "id:branch-1", department: "Accounting", employment: "CONTRACT", status: "ACTIVE" }).map((row) => row.id)).toEqual(["one"]);
    expect(filterDirectoryEmployees(rows, { query: "", branch: "id:branch-2", department: "Operations", employment: "", status: "ALL" })).toEqual([]);
    expect(filterDirectoryEmployees(rows, { query: "", branch: "", department: "", employment: "", status: "ALL" })).toHaveLength(3);
  });
  it("splits an employee name for HR profile fields", () => {
    expect(splitEmployeeName("Maya Anne Santos Jr.")).toEqual({
      firstName: "Maya",
      middleName: "Anne",
      lastName: "Santos",
      suffix: "Jr.",
    });
  });

  it("sends a combined name without unsupported split-name fields", () => {
    const payload = buildEmployeeCreatePayload({
      firstName: "Maya",
      middleName: "Anne",
      lastName: "Santos",
      suffix: "Jr.",
      email: "maya@example.test",
      branchId: "branch-1",
      position: "Coordinator",
      department: "Operations",
      employmentType: "FULL_TIME",
      startDate: "2026-10-01",
      managerEmployeeId: "employee-manager-1",
      phone: "",
      status: "ACTIVE",
    });

    expect(payload.name).toBe("Maya Anne Santos Jr.");
    expect(payload).not.toHaveProperty("firstName");
    expect(payload).not.toHaveProperty("middleName");
    expect(payload).not.toHaveProperty("lastName");
    expect(payload).not.toHaveProperty("suffix");
    expect(payload.managerEmployeeId).toBe("employee-manager-1");
  });

  it("offers active employee records as supervisor candidates", () => {
    const candidates = [
      employee("manager", "Branch Manager"),
      employee("it-admin", "IT Administrator"),
      employee("supervisor", "Shift Supervisor"),
      employee("staff", "Operations Associate"),
      employee("inactive-manager", "Manager", "INACTIVE"),
    ];

    expect(eligibleEmployeeManagers(candidates).map(({ id }) => id)).toEqual([
      "manager",
      "it-admin",
      "supervisor",
      "staff",
    ]);
  });

  it("includes a custom attendance schedule only when selected", () => {
    const payload = buildEmployeeCreatePayload({
      firstName: "Maya",
      lastName: "Santos",
      email: "maya@example.test",
      branchId: "branch-1",
      position: "Coordinator",
      department: "Operations",
      employmentType: "FULL_TIME",
      startDate: "2026-10-01",
      status: "ACTIVE",
      useCustomSchedule: "on",
      timeZone: "Asia/Manila",
      workDays: ["1", "2", "3", "4", "5"],
      shiftStart: "08:30",
      shiftEnd: "17:30",
      breakMinutes: "45",
      graceMinutes: "5",
    });

    expect(payload.workSchedule).toEqual({
      timeZone: "Asia/Manila",
      workDays: [1, 2, 3, 4, 5],
      shiftStart: "08:30",
      shiftEnd: "17:30",
      breakMinutes: 45,
      graceMinutes: 5,
    });
  });
});

describe("work branch form payloads", () => {
  it("keeps every selected checkbox and removes stale IDs when choosing all", () => {
    expect(employeeWorkBranchPayload({ workBranchSelection: "selected", workBranchIds: ["makati", "ortigas"] })).toEqual({ workBranchIds: ["makati", "ortigas"], allWorkBranches: false });
    expect(employeeWorkBranchPayload({ workBranchSelection: "selected", allWorkBranches: "on", workBranchIds: ["makati"] })).toEqual({ workBranchIds: [], allWorkBranches: true });
    expect(employeeWorkBranchPayload({ phone: "123" })).toEqual({});
  });
});

describe("directory work branch matching", () => {
  const filters = { query: "", branch: "id:branch-2", department: "", employment: "", status: "ALL" };
  it("includes a manager under either assigned work branch without duplicating the record", () => {
    const manager = { ...employee("manager", "Manager"), workBranchIds: ["branch-1", "branch-2"] };
    expect(filterDirectoryEmployees([manager], filters)).toEqual([manager]);
    expect(filterDirectoryEmployees([manager], { ...filters, branch: "id:branch-1" })).toEqual([manager]);
    expect(filterDirectoryEmployees([manager], { ...filters, branch: "id:branch-3" })).toEqual([]);
  });
  it("matches all-work-branch assignments and preserves other filters", () => {
    const manager = { ...employee("manager", "Manager"), allWorkBranches: true };
    expect(filterDirectoryEmployees([manager], filters)).toEqual([manager]);
    expect(filterDirectoryEmployees([manager], { ...filters, department: "Accounting" })).toEqual([]);
  });
});
