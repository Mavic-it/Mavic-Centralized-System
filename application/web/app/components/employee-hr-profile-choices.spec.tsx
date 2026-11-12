import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import EmployeeHrProfileCard from "./employee-hr-profile-card";
import type { WorkspaceEmployee } from "../data/people";
const employee: WorkspaceEmployee = {
  id: "employee",
  employeeNumber: "E-1",
  name: "Alex Employee",
  email: "alex@example.invalid",
  phone: "",
  position: "Specialist",
  department: "Operations",
  branch: "Makati",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  hiredOn: "2026-10-23",
  manager: "",
  emergencyContact: { name: "", relationship: "", phone: "" },
  governmentIds: [],
  documents: [],
  attendance: [],
};
function render(profile: {
  gender: string | null;
  civilStatus: string | null;
  jobLevel?: string | null;
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["employee-hr-profile", employee.id], profile);
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EmployeeHrProfileCard
        employee={employee}
        employeeId={employee.id}
        role="HR_ADMIN"
        editorMode
        onNotice={() => {}}
      />
    </QueryClientProvider>,
  );
}
describe("HR profile dropdown choices", () => {
  it("uses job level choices and preserves a historical current level", () => {
    const html = render({ gender: null, civilStatus: null, jobLevel: "L2" });
    expect(html).toContain('<select name="jobLevel">');
    for (const value of ["RANK_AND_FILE", "SUPERVISORY", "MANAGERIAL"])
      expect(html).toContain(`value="${value}"`);
    expect(html).toContain('value="L2" selected="">L2 (existing)');
  });
  it("renders gender and civil status as labelled selects with standard choices and an unspecified option", () => {
    const html = render({ gender: null, civilStatus: null });
    expect(html).toContain('<select name="gender">');
    expect(html).toContain('<select name="civilStatus">');
    for (const value of [
      "Male",
      "Female",
      "Non-binary",
      "Single",
      "Married",
      "Widowed",
      "Separated",
      "Annulled",
      "Divorced",
    ])
      expect(html).toContain(`value="${value}"`);
    expect(html).toContain('value="" selected="">Not specified');
    expect(html).not.toContain('<input maxLength="50" name="gender"');
  });
  it("keeps nonstandard historical values selected without silently normalizing saved data", () => {
    const html = render({
      gender: "female",
      civilStatus: "Previously recorded status",
    });
    expect(html).toContain('value="female" selected="">female');
    expect(html).toContain(
      'value="Previously recorded status" selected="">Previously recorded status',
    );
  });
});
