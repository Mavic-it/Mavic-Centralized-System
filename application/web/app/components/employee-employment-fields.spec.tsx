import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeeEmploymentFields } from "./employee-employment-fields";
import { buildEmployeeCreatePayload } from "./employee-directory-utils";

describe("Employment fields", () => {
  it("offers the four default types with an empty selection for new records", () => {
    const html = renderToStaticMarkup(<EmployeeEmploymentFields />);
    for (const label of [
      "Provisionary",
      "Regular",
      "Project based",
      "Contractual",
    ])
      expect(html).toContain(label);
    expect(html).toContain('value="" disabled="" selected=""');
    expect(html).not.toContain('value="FULL_TIME"');
    expect(html).not.toContain('name="probationEndDate"');
  });
  it("shows both required provisionary dates and retains a saved date", () => {
    const html = renderToStaticMarkup(
      <EmployeeEmploymentFields
        initialType="PROBATIONARY"
        probationEndDate="2027-04-30"
        evaluationDueDate="2027-04-15"
      />,
    );
    const endDate = html.match(/<input[^>]*name="probationEndDate"[^>]*>/)?.[0];
    const evaluationDate = html.match(
      /<input[^>]*name="evaluationDueDate"[^>]*>/,
    )?.[0];
    expect(endDate).toContain('required=""');
    expect(endDate).toContain('value="2027-04-30"');
    expect(evaluationDate).toContain('required=""');
    expect(evaluationDate).toContain('value="2027-04-15"');
  });
  it("keeps historical types selected and sends dates only for provisionary creation", () => {
    expect(
      renderToStaticMarkup(
        <EmployeeEmploymentFields initialType="FULL_TIME" />,
      ),
    ).toContain('value="FULL_TIME" selected="">Full time (existing)');
    const input = {
      employmentType: "PROBATIONARY",
      probationEndDate: "2027-04-30",
      evaluationDueDate: "2027-04-15",
    };
    expect(buildEmployeeCreatePayload(input)).toMatchObject(input);
    expect(
      buildEmployeeCreatePayload({ ...input, employmentType: "REGULAR" }),
    ).not.toHaveProperty("probationEndDate");
  });
});
