import { describe, expect, it } from "vitest";
import { actions, type Detail } from "./types";
const detail = (extra: Partial<Detail> = {}): Detail => ({
  id: "id",
  title: "Task",
  description: "Description",
  branchName: "Branch",
  employeeId: "employee",
  status: "TODO",
  version: 1,
  canManage: false,
  isAssignee: false,
  isReporter: false,
  isSubject: false,
  canAssignReviewer: false,
  events: [],
  attachments: [],
  ...extra,
});
describe("work actions shown to participants", () => {
  it("keeps task progress with assignees and review with a different manager", () => {
    expect(actions("tasks", detail({ isAssignee: true }))).toEqual([
      "COMMENT",
      "START",
      "PROGRESS",
      "SUBMIT",
    ]);
    expect(
      actions("tasks", detail({ status: "FOR_REVIEW", canManage: true })),
    ).toEqual(["COMMENT", "ACCEPT", "CHANGES", "CANCEL"]);
    expect(
      actions(
        "tasks",
        detail({ status: "FOR_REVIEW", canManage: true, isAssignee: true }),
      ),
    ).toEqual(["COMMENT"]);
    expect(
      actions("tasks", detail({ status: "COMPLETED", canManage: true })),
    ).toEqual([]);
  });
  it("separates reporting, designated review and employee response", () => {
    expect(
      actions("incidents", detail({ status: "SUBMITTED", isReporter: true })),
    ).toEqual(["COMMENT", "WITHDRAW", "EXPLAIN"]);
    expect(
      actions(
        "incidents",
        detail({ status: "NOTICE_ISSUED", isSubject: true }),
      ),
    ).toEqual(["ACKNOWLEDGE", "RESPONSE"]);
    expect(
      actions(
        "incidents",
        detail({
          status: "UNDER_REVIEW",
          caseStatus: "DECISION_PENDING",
          canManage: true,
          canResolve: true,
          canDiscipline: true,
        }),
      ),
    ).toContain("DECIDE");
    expect(
      actions(
        "incidents",
        detail({
          status: "SUBMITTED",
          canManage: true,
          canAssignReviewer: true,
        }),
      ),
    ).toContain("ASSIGN_REVIEWER");
    expect(
      actions("incidents", detail({ status: "CLOSED", canManage: true })),
    ).toEqual([]);
  });
});

describe("incident report and disciplinary actions", () => {
  it("offers clarification and explanation only to authorized report participants", () => {
    expect(
      actions(
        "incidents",
        detail({
          status: "DETAILS_REQUESTED",
          isSubject: true,
          reportSource: "MANAGEMENT_REPORTED",
        }),
      ),
    ).toContain("CLARIFY");
    expect(
      actions(
        "incidents",
        detail({
          status: "UNDER_REVIEW",
          isSubject: true,
          reportSource: "MANAGEMENT_REPORTED",
        }),
      ),
    ).toContain("EXPLAIN");
    expect(
      actions(
        "incidents",
        detail({
          status: "DETAILS_REQUESTED",
          isSubject: true,
          reportSource: "EMPLOYEE_REPORTED",
        }),
      ),
    ).not.toContain("CLARIFY");
  });
  it("limits resolution and initiation to HR and closes only resolved reports", () => {
    const manager = detail({
      status: "UNDER_REVIEW",
      employeeId: "employee",
      canManage: true,
    });
    expect(actions("incidents", manager)).toContain("HR_ESCALATE");
    expect(actions("incidents", manager)).not.toContain("RESOLVE");
    expect(actions("incidents", manager)).not.toContain("ESCALATE");
    const hr = {
      ...manager,
      canResolve: true,
      canInitiateCase: true,
      canDiscipline: true,
    };
    expect(actions("incidents", hr)).toContain("RESOLVE");
    expect(actions("incidents", hr)).toContain("ESCALATE");
    expect(
      actions("incidents", { ...hr, caseStatus: "NOTICE_ISSUED" }),
    ).not.toContain("RESOLVE");
    expect(actions("incidents", { ...hr, status: "RESOLVED" })).toEqual([
      "CLOSE",
    ]);
    expect(actions("incidents", { ...hr, status: "CLOSED" })).toEqual([]);
  });
});

describe("explicit discipline and terminal reports", () => {
  it("does not infer disciplinary authority from HR/Super review flags", () => {
    const reviewer = detail({
      status: "UNDER_REVIEW",
      canManage: true,
      canResolve: true,
      canAssignReviewer: true,
      canInitiateCase: true,
    });
    expect(actions("incidents", reviewer)).not.toContain("ESCALATE");
    expect(
      actions("incidents", { ...reviewer, caseStatus: "DISCIPLINARY_REVIEW" }),
    ).not.toContain("NOTICE");
    expect(
      actions("incidents", { ...reviewer, caseStatus: "DECISION_PENDING" }),
    ).not.toContain("DECIDE");
    expect(
      actions("incidents", {
        ...reviewer,
        canDiscipline: true,
        canResolve: false,
        caseStatus: "DECISION_PENDING",
      }),
    ).toContain("DECIDE");
  });
  it("keeps withdrawal with the reporter and protects active formal cases", () => {
    const report = detail({ status: "UNDER_REVIEW", isSubject: true });
    expect(actions("incidents", report)).not.toContain("WITHDRAW");
    expect(actions("incidents", { ...report, isReporter: true })).toContain(
      "WITHDRAW",
    );
    expect(
      actions("incidents", {
        ...report,
        isReporter: true,
        caseStatus: "NOTICE_ISSUED",
      }),
    ).not.toContain("WITHDRAW");
    for (const status of ["WITHDRAWN", "DISMISSED"])
      expect(
        actions("incidents", {
          ...report,
          status,
          canManage: true,
          canDiscipline: true,
        }),
      ).toEqual([]);
  });
});
