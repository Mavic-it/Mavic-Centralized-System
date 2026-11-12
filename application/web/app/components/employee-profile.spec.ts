import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workspace = readFileSync(
  new URL("./people-workspace.tsx", import.meta.url),
  "utf8",
);
const services = readFileSync(
  new URL("./people-workspace-services.ts", import.meta.url),
  "utf8",
);

describe("employee profile record normalization", () => {
  it("provides a safe display name when the API omits an employee name", () => {
    expect(services).toContain('name: employee.name ?? "Unnamed employee"');
  });

  it("updates the employee cache immediately after a successful save", () => {
    expect(workspace).toMatch(
      /queryClient\.setQueryData\(\s*employeeQueryKey,\s*currentEmployee\s*\?\s*mergeWorkspaceEmployee\(currentEmployee, updatedEmployee\)/,
    );
    expect(workspace).toContain(
      'queryClient.invalidateQueries({ queryKey: ["employees"] })',
    );
    expect(workspace).toContain(
      "queryClient.invalidateQueries({ queryKey: employeeQueryKey })",
    );
  });

  it("does not put the display fallback into the editable name field", () => {
    expect(workspace).toMatch(
      /employee\.name === "Unnamed employee"\s*\?\s*""\s*:\s*employee\.name/,
    );
  });
});

describe("employee file section layout", () => {
  it("shows employment work information by default and switches sections from buttons", () => {
    expect(workspace).toMatch(
      /useState<EmployeeProfileSectionId>\(\(\) =>\s*searchParams\.get\("section"\) === "documents"\s*\? "documents"\s*:\s*"work-information"/,
    );
    expect(workspace).toContain('title="Employment & HR Profile"');
    expect(workspace).toContain('aria-label="Employee file sections"');
    expect(workspace).toContain("setActiveProfileSection(section.id)");
    expect(workspace).toContain("<EmployeeHrProfileCard");
    expect(workspace).toContain("embedded");
    expect(workspace).not.toContain('label: "Available balance"');
    expect(workspace).not.toContain('label: "Recent check-ins"');
    const sections = workspace.slice(workspace.indexOf('const profileSections:'),workspace.indexOf('const profileSections:')+700);
    expect(sections.indexOf('label: "Assignment history"')).toBeGreaterThan(sections.indexOf('restrictedEmployeeProfileSections'));

  });

  it("keeps restricted profile sections out of the section list for IT admins", () => {
    expect(workspace).toMatch(
      /role !== "IT_ADMIN"\s*\?\s*restrictedEmployeeProfileSections/,
    );
    expect(workspace).not.toContain('label: "HR profile"');
  });

  it("places the employee edit action in the employment work information card", () => {
    expect(workspace).toMatch(
      /title="Employment & HR Profile"[\s\S]*?aside=\{[\s\S]*?Edit employee/,
    );
    const heroActionsStart = workspace.indexOf("accountActions");
    const heroEnd = workspace.indexOf("</section>", heroActionsStart);
    expect(workspace.slice(heroActionsStart, heroEnd)).not.toContain(
      "Edit profile",
    );
  });
});

describe("My portal section layout", () => {
  it("opens personal and employment details and provides each portal section", () => {
    expect(workspace).toMatch(/useState<PortalSectionId>\("profile"\)/);
    expect(workspace).toContain('aria-label="My portal sections"');
    expect(workspace).toContain('label: "Personal & employment details"');
    expect(workspace).not.toContain('label: "My requests"');
    expect(workspace).not.toContain('label: "Schedule & attendance"');
    expect(workspace).toContain('label: "Payslips"');
    expect(workspace).toContain('label: "My documents"');
    expect(workspace).not.toContain('label: "Announcements & notifications"');
    expect(workspace).toContain("setActivePortalSection(section.id)");
  });
});
