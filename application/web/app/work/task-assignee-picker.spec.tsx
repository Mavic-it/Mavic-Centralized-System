import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskAssigneePicker } from "./task-assignee-picker";

const branches = [{ id: "makati", name: "Mspaces Makati" }];
const employees = [
  { id: "carlyn", name: "Carlyn Vergara", branchId: "makati" },
  { id: "loel", name: "Loel M. Campaña", branchId: "makati" },
];

describe("task assignee picker", () => {
  it("shows selected people, search actions, and the shared assignment guidance", () => {
    const html = renderToStaticMarkup(
      <TaskAssigneePicker
        employees={employees}
        branches={branches}
        selected={["carlyn"]}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain(">1 <span>/ 50</span>");
    expect(html).toContain("Remove Carlyn Vergara");
    expect(html).toContain("Search employee or branch");
    expect(html).toMatch(/Add visible.*1/);
    expect(html).toContain("shares this task, its progress, and updates");
  });

  it("prevents selecting beyond 50 assignees", () => {
    const fullRoster = Array.from({ length: 51 }, (_, index) => ({
      id: `employee-${index}`,
      name: `Employee ${index}`,
      branchId: "makati",
    }));
    const selected = fullRoster.slice(0, 50).map((employee) => employee.id);
    const html = renderToStaticMarkup(
      <TaskAssigneePicker
        employees={fullRoster}
        branches={branches}
        selected={selected}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("The 50-person limit is reached");
    expect(html).toContain('type="checkbox" disabled="" value="employee-50"');
  });

  it("warns when selected employees cannot receive task email notifications", () => {
    const html = renderToStaticMarkup(
      <TaskAssigneePicker
        employees={[
          {
            id: "carlyn",
            name: "Carlyn Vergara",
            branchId: "makati",
            taskEmailReady: true,
          },
          {
            id: "loel",
            name: "Loel M. Campaña",
            branchId: "makati",
            taskEmailReady: false,
          },
        ]}
        branches={branches}
        selected={["loel"]}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain("Task email unavailable");
    expect(html).toContain(
      "1 selected employee does not have an active eligible account with a valid email address",
    );
    expect(html).toContain('role="status"');
  });
});
