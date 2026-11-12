import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IncidentDecisionFields } from "./incident-decision-fields";
import { IncidentFilters } from "./incident-controls";

describe("simple incident decision and reporting controls", () => {
  it("requires findings and an explicit outcome and prevents actions during ordinary resolution", () => {
    const html = renderToStaticMarkup(
      <IncidentDecisionFields canApplyAction={false} />,
    );
    expect(html).toMatch(/name="findings"[^>]*required/);
    expect(html).toMatch(/name="outcome"[^>]*required/);
    expect(html).toContain("Select an outcome");
    expect(html).toContain("No disciplinary action");
    expect(html).not.toContain('value="WARNING"');
    expect(html).not.toContain('name="actionDetails"');
  });
  it("offers category and date filters with legacy records and keyboard-native controls", () => {
    const html = renderToStaticMarkup(
      <IncidentFilters
        category="SECURITY"
        onCategory={() => {}}
        from=""
        to=""
        onDates={() => {}}
      />,
    );
    expect(html).toContain('value="SECURITY" selected');
    expect(html).toContain("Timekeeping (legacy)");
    expect(html).toContain('type="date"');
  });
});
