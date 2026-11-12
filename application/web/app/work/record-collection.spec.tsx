import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RecordCollection } from "./record-collection";

describe("task assignee filter", () => {
  it("keeps incident secondary controls in one collapsed disclosure and removes duplicate page filters", () => {
    const html = renderToStaticMarkup(
      <RecordCollection
        kind="incidents"
        items={[]}
        status=""
        statuses={["SUBMITTED"]}
        onStatus={vi.fn()}
        loading={false}
        busy={false}
        onRefresh={vi.fn()}
        onOpen={vi.fn()}
        extraFilters={
          <label>
            Violation category
            <select>
              <option>All categories</option>
            </select>
          </label>
        }
        extraFilterCount={2}
      />,
    );
    expect(html).toMatch(/<details[^>]*><summary>/);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("Filters");
    expect(html).toContain("Violation category");
    expect(html).not.toContain('aria-label="Filter records on this page"');
    expect(html).toContain('aria-label="Display records"');
  });
  it("shows only the supplied branch-authorized users as filter choices", () => {
    const html = renderToStaticMarkup(
      <RecordCollection
        kind="tasks"
        items={[]}
        status=""
        statuses={["TODO"]}
        onStatus={vi.fn()}
        loading={false}
        busy={false}
        onRefresh={vi.fn()}
        onOpen={vi.fn()}
        userFilter={{
          users: [{ id: "employee-a", name: "Employee A" }],
          value: "",
          onChange: vi.fn(),
        }}
      />,
    );
    expect(html).toContain('aria-label="Filter tasks by assignee"');
    expect(html).toContain('value="employee-a"');
    expect(html).toContain("Employee A");
    expect(html).not.toContain("Employee B");
  });
});
