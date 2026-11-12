import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskReassignment } from "./task-reassignment";
import type { Detail } from "./types";

const detail: Detail = {
  id: "task-1",
  title: "Prepare room",
  description: "Set up the training room.",
  branchName: "Makati",
  employeeId: "employee-1",
  assignees: [
    {
      id: "employee-1",
      name: "Employee One",
      branchId: "branch-1",
      branchName: "Makati",
    },
  ],
  status: "IN_PROGRESS",
  version: 2,
  canManage: true,
  canReassign: true,
  isAssignee: false,
  isReporter: false,
  isSubject: false,
  canAssignReviewer: false,
  events: [],
  attachments: [],
};

describe("task reassignment control", () => {
  it("shows the reassignment action only when the server grants it", () => {
    const props = {
      detail,
      employees: [
        { id: "employee-1", name: "Employee One", branchId: "branch-1" },
        { id: "employee-2", name: "Employee Two", branchId: "branch-1" },
      ],
      branches: [{ id: "branch-1", name: "Makati" }],
      busy: false,
      onReassign: async () => true,
    };
    expect(renderToStaticMarkup(<TaskReassignment {...props} />)).toContain(
      "Reassign task",
    );
    expect(
      renderToStaticMarkup(
        <TaskReassignment
          {...props}
          detail={{ ...detail, canReassign: false }}
        />,
      ),
    ).not.toContain("Reassign task");
  });

  it("keeps closed task reassignment disabled by the server-provided state", () => {
    expect(
      renderToStaticMarkup(
        <TaskReassignment
          detail={{ ...detail, canReassign: false, status: "COMPLETED" }}
          employees={[]}
          branches={[]}
          busy={false}
          onReassign={async () => true}
        />,
      ),
    ).toBe("");
  });
});
