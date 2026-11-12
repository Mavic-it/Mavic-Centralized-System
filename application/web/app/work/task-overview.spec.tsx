import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskOverview } from "./task-overview";
import { taskPreview, taskStage } from "./task-status";
import type { Detail } from "./types";
const detail: Detail = {
  id: "task",
  title: "Shared task",
  description: "Task brief",
  employeeId: "one",
  employeeName: "Employee One",
  branchName: "Branch",
  status: "TODO",
  progress: 0,
  version: 1,
  isAssignee: true,
  canManage: false,
  isReporter: false,
  isSubject: false,
  canAssignReviewer: false,
  events: [
    {
      id: "event-1",
      action: "COMMENT",
      audience: "PARTICIPANTS",
      message: "Progress update",
      createdAt: "2026-10-29T09:00:00.000Z",
      actor: "Employee One",
    },
  ],
  attachments: [
    {
      id: "file-1",
      eventId: "event-1",
      filename: "progress.pdf",
      mime: "application/pdf",
    },
  ],
  startDate: "2026-10-29",
  dueDate: "2026-11-01",
  assignees: [
    { id: "one", name: "Employee One", branchId: "b", branchName: "Branch" },
    { id: "two", name: "Employee Two", branchId: "b", branchName: "Branch" },
  ],
};
const overview = (value: Detail) => (
  <TaskOverview
    detail={value}
    busy={false}
    onSave={async () => true}
    employees={[]}
    branches={[]}
    onReassign={async () => true}
    onStopRecurrence={async () => {}}
  />
);
describe("task overview and simple progress", () => {
  it("shows editable status, file input, comment and all assignees together", () => {
    const html = renderToStaticMarkup(overview(detail));
    for (const text of [
      "Task brief",
      "Activity &amp; files",
      "Progress update",
      "progress.pdf",
      "Download progress.pdf",
      "Update task status",
      "Not started",
      "Started",
      "In progress",
      "Stuck",
      "Done",
      "Comment or review note",
      'name="file"',
      "Employee Two",
      "Start date",
    ])
      expect(html).toContain(text);
    expect(html.match(/attachments\/file-1/g)).toHaveLength(1);
    expect(html).toContain('aria-label="View progress.pdf"');
    expect(html).not.toContain('type="range"');
    expect(html).not.toContain('type="number"');
  });
  it("renders completed tasks read-only and independent manager review controls", () => {
    expect(
      renderToStaticMarkup(overview({ ...detail, status: "COMPLETED" })),
    ).not.toContain('name="file"');
    const html = renderToStaticMarkup(
      overview({
        ...detail,
        status: "FOR_REVIEW",
        isAssignee: false,
        canManage: true,
      }),
    );
    expect(html).toContain("Approve completion");
    expect(html).toContain("Request changes");
    expect(html).not.toContain('name="taskState"');
  });
  it("shows the new assignees in task reassignment history", () => {
    const html = renderToStaticMarkup(
      overview({
        ...detail,
        assignees: [
          {
            id: "two",
            name: "Employee Two",
            branchId: "b",
            branchName: "Branch",
          },
        ],
        events: [
          {
            id: "event-reassigned",
            action: "REASSIGNED",
            audience: "PARTICIPANTS",
            message: "Task assignees updated.",
            createdAt: "2026-11-01T09:00:00.000Z",
            actor: "Manager",
            details: { assigneeIds: ["two"] },
          },
        ],
      }),
    );
    expect(html).toContain("Reassigned");
    expect(html).toContain("Assignees: Employee Two");
  });
  it("shows the series end and stop control only when future tasks remain", () => {
    const html = renderToStaticMarkup(
      overview({
        ...detail,
        recurrence: "WEEKLY",
        recurrenceEndDate: "2026-12-31",
        recurrenceActive: true,
        canStopRecurrence: true,
      }),
    );
    expect(html).toContain("part of a weekly series");
    expect(html).toContain("Stop future tasks");
    expect(
      renderToStaticMarkup(
        overview({
          ...detail,
          recurrence: "WEEKLY",
          recurrenceEndDate: "2026-12-31",
          recurrenceActive: false,
          canStopRecurrence: false,
        }),
      ),
    ).not.toContain("Stop future tasks");
  });
  it("maps progress from state and retains the saved value when stuck", () => {
    expect(taskPreview("NOT_STARTED", 50)).toEqual({
      progress: 0,
      status: "TODO",
    });
    expect(taskPreview("STARTED", 0)).toEqual({
      progress: 10,
      status: "STARTED",
    });
    expect(taskPreview("IN_PROGRESS", 10)).toEqual({
      progress: 50,
      status: "IN_PROGRESS",
    });
    expect(taskPreview("STUCK", 50)).toEqual({ progress: 50, status: "STUCK" });
    expect(taskPreview("DONE", 50)).toEqual({
      progress: 100,
      status: "FOR_REVIEW",
    });
    expect(taskStage("FOR_REVIEW")).toBe("DONE");
  });
});
