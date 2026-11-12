import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EmployeeFileFacts,
  employeeHireDate,
} from "./employee-file-presentation";
import EmployeeHrProfileCard from "./employee-hr-profile-card";
import EmployeeDocumentsSection, {
  matchesDocumentSearch,
} from "./employee-documents-section";
import { DialogProvider } from "./ui/confirmation-provider";
import type { WorkspaceEmployee } from "../data/people";
const employee: WorkspaceEmployee = {
  id: "employee",
  name: "Alex Employee",
  employeeNumber: "E-1",
  email: "alex@example.invalid",
  phone: "Not provided",
  position: "Specialist",
  department: "Operations",
  branch: "Makati",
  status: "ACTIVE",
  employmentType: "FULL_TIME",
  hiredOn: "2026-10-23",
  manager: "Jordan Supervisor",
  emergencyContact: { name: "", relationship: "", phone: "" },
  governmentIds: [],
  documents: [],
  attendance: [],
};
function hr(role: "HR_ADMIN" | "BRANCH_MANAGER", collapsible = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["employee-hr-profile", employee.id], {
    jobLevel: "Associate",
    basicSalary: 30000,
    salaryGrade: "A",
  });
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <EmployeeHrProfileCard
        employee={employee}
        employeeId={employee.id}
        role={role}
        onNotice={() => {}}
        collapsible={collapsible}
      />
    </QueryClientProvider>,
  );
}
describe("Employee 201 file presentation", () => {
  it("shows real employment facts without inventing completion or sensitive payroll metrics", () => {
    const html = renderToStaticMarkup(
      <EmployeeFileFacts employee={employee} />,
    );
    expect(html).toContain("Makati");
    expect(html).toContain("Full time");
    expect(html).toContain("Jordan Supervisor");
    expect(html).toContain('aria-label="Employee employment summary"');
    expect(html).not.toContain("salary");
  });
  it("formats hire dates without timezone shifting and preserves missing-value labels", () => {
    expect(employeeHireDate("2026-10-23")).toContain("23");
    expect(employeeHireDate("Not provided")).toBe("Not provided");
    expect(employeeHireDate("")).toBe("Not provided");
  });
  it("keeps two groups initially expanded, secondary groups collapsed and HR-only compensation restricted", () => {
    const html = hr("HR_ADMIN");
    expect(html.match(/<details/g)).toHaveLength(4);
    expect(html.match(/ open=""/g)).toHaveLength(2);
    expect(html).toContain("30000.00");
    expect(hr("BRANCH_MANAGER")).not.toContain("30000.00");
    expect(hr("BRANCH_MANAGER")).not.toContain("Compensation");
    expect(hr("HR_ADMIN", false)).not.toContain("<details");
  });
  it("searches names/types case-insensitively without treating whitespace as a restrictive query", () => {
    expect(
      matchesDocumentSearch(" contract ", "Offer.pdf", "Contract or record"),
    ).toBe(true);
    expect(matchesDocumentSearch("PASSPORT", "Passport.pdf")).toBe(true);
    expect(matchesDocumentSearch("   ", "Offer.pdf")).toBe(true);
    expect(matchesDocumentSearch("other", "Offer.pdf")).toBe(false);
  });
  it("opens document previews in the current portal and hides upload/archive actions from read-only users", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    client.setQueryData(
      ["employee-document-records", employee.id],
      [
        {
          id: "doc",
          fileName: "Offer.pdf",
          category: "CONTRACT_RECORD",
          hasFile: true,
          status: "ACTIVE",
          version: 1,
          createdAt: "2026-10-23T01:00:00Z",
        },
      ],
    );
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <DialogProvider>
          <EmployeeDocumentsSection
            employee={employee}
            role="EMPLOYEE"
            canManageDocuments={false}
            onNotice={() => {}}
          />
        </DialogProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain("Search files");
    expect(html).toContain("Offer.pdf");
    expect(html).toContain('aria-label="View Offer.pdf"');
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("Upload document");
    expect(html).not.toContain("Remove Offer.pdf");
  });
});
