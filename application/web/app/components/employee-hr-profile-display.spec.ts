import { describe, expect, it } from "vitest";
import type { WorkspaceEmployee } from "../data/people";
import type { EmployeeHrProfileApiRecord } from "./people-workspace-types";
import { employeeHrProfileDisplaySections } from "./employee-hr-profile-display";

const employee: WorkspaceEmployee = {
  id: "employee-1",
  employeeNumber: "EMP-001",
  name: "Avery Santos",
  email: "avery@mspaces.test",
  branchId: "branch-1",
  phone: "09171234567",
  position: "Operations Associate",
  department: "Operations",
  branch: "Makati",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  hiredOn: "2026-10-01",
  manager: "Jordan Lee",
  emergencyContact: { name: "", relationship: "", phone: "" },
  governmentIds: [],
  documents: [],
  attendance: [],
};

const profile: EmployeeHrProfileApiRecord = {
  employeeId: "employee-1",
  firstName: "Avery",
  middleName: null,
  lastName: "Santos",
  suffix: null,
  preferredName: "Ave",
  dateOfBirth: null,
  gender: null,
  civilStatus: null,
  nationality: null,
  personalEmail: "avery@example.com",
  currentAddress: null,
  permanentAddress: null,
  jobLevel: "L2",
  salaryGrade: "SG-2",
  basicSalary: 0,
  workSchedule: null,
  shift: "Day",
  probationary: false,
  regularizationDate: null,
  separationDate: null,
  separationReason: null,
};

describe("employee HR profile display sections", () => {
  it("shows provisionary dates and an evaluation due indicator", () => {
    const sections = employeeHrProfileDisplaySections(
      null,
      {
        ...employee,
        employmentType: "PROBATIONARY",
        probationEndDate: "2026-11-01",
        evaluationDueDate: "2026-10-15",
      },
      { canManageEmployees: true, canViewCompensation: false },
    );
    expect(sections[0].fields).toEqual(
      expect.arrayContaining([
        { label: "Employment type", value: "Provisionary" },
        { label: "End of provisionary date", value: "2026-11-01" },
        { label: "Evaluation due date", value: "2026-10-15" },
        { label: "Evaluation", value: "Due for evaluation" },
      ]),
    );
  });
  it("omits blank values and groups populated fields", () => {
    const sections = employeeHrProfileDisplaySections(profile, employee, {
      canManageEmployees: true,
      canViewCompensation: true,
    });

    expect(sections.map(({ title }) => title)).toEqual([
      "Work information",
      "Personal details",
      "Employment details",
      "Compensation",
    ]);
    expect(sections[0].fields).toContainEqual({
      label: "Position",
      value: "Operations Associate",
    });
    expect(sections[0].fields).toContainEqual({
      label: "Work email",
      value: "avery@mspaces.test",
    });
    expect(sections[1].fields).toContainEqual({
      label: "First name",
      value: "Avery",
    });
    expect(
      sections[1].fields.some(({ label }) => label === "Middle name"),
    ).toBe(false);
    expect(sections[2].fields).toContainEqual({
      label: "Probationary",
      value: "No",
    });
    expect(sections[3].fields).toContainEqual({
      label: "Base salary",
      value: "0.00",
    });
  });

  it("keeps employment and compensation fields out of self-service views", () => {
    const sections = employeeHrProfileDisplaySections(profile, employee, {
      canManageEmployees: false,
      canViewCompensation: false,
    });

    expect(sections.map(({ title }) => title)).toEqual([
      "Work information",
      "Personal details",
    ]);
    expect(
      sections[0].fields.some(({ label }) => label === "Salary grade"),
    ).toBe(false);
  });

  it("still shows the employee data when no HR profile exists yet", () => {
    const sections = employeeHrProfileDisplaySections(null, employee, {
      canManageEmployees: true,
      canViewCompensation: true,
    });

    expect(sections.map(({ title }) => title)).toEqual([
      "Work information",
      "Personal details",
    ]);
    expect(sections[0].fields).toContainEqual({
      label: "Department",
      value: "Operations",
    });
    expect(sections[1].fields).toContainEqual({
      label: "First name",
      value: "Avery",
    });
    expect(sections[1].fields).toContainEqual({
      label: "Last name",
      value: "Santos",
    });
  });
});

describe("shared branch assignment display", () => {
  it("shows both work branches separately from the primary branch", () => {
    const fields = employeeHrProfileDisplaySections(null, { ...employee, workBranches: [{ id: "branch-1", name: "Makati" }, { id: "branch-2", name: "Ortigas" }] }, { canManageEmployees: true, canViewCompensation: false })[0].fields;
    expect(fields).toEqual(expect.arrayContaining([{ label: "Primary branch", value: "Makati" }, { label: "Work branches", value: "Makati, Ortigas" }]));
  });
  it("shows a dynamic all-branch assignment", () => {
    const fields = employeeHrProfileDisplaySections(null, { ...employee, allWorkBranches: true }, { canManageEmployees: true, canViewCompensation: false })[0].fields;
    expect(fields).toContainEqual({ label: "Work branches", value: "All current and future active branches" });
  });
});
