export type Kind = "tasks" | "incidents";
export const incidentCategories = [
  {
    value: "ATTENDANCE",
    title: "Attendance",
    example: "Habitual lateness, unauthorized absence",
  },
  {
    value: "CONDUCT",
    title: "Workplace Conduct",
    example: "Disrespectful or disruptive behavior",
  },
  {
    value: "POLICY",
    title: "Company Policy",
    example: "Violation of established office rules",
  },
  {
    value: "PERFORMANCE",
    title: "Performance",
    example: "Neglect of assigned duties",
  },
  {
    value: "SECURITY",
    title: "Security",
    example: "Unauthorized access or security breach",
  },
  {
    value: "PROPERTY",
    title: "Property",
    example: "Damage or misuse of company equipment",
  },
  {
    value: "SAFETY",
    title: "Safety",
    example: "Failure to follow workplace safety procedures",
  },
  { value: "OTHER", title: "Other", example: "Custom incident categories" },
] as const;
export type Context = {
  ownEmployee: { id: string; name: string; branchId: string } | null;
  canManage: boolean;
  canAssignReviewer: boolean;
  canManageAuthority?: boolean;
  branches: { id: string; name: string }[];
  employees: {
    id: string;
    name: string;
    branchId: string;
    profilePictureUpdatedAt?: string | null;
    taskEmailReady?: boolean;
  }[];
  reviewers: { id: string; name: string; role?: string }[];
};
export type TaskTemplate = {
  id: string;
  branchId: string | null;
  name: string;
  title: string;
  description: string;
  priority: string;
  isSystem: boolean;
};
export type RecordItem = {
  id: string;
  title: string;
  description: string;
  branchName: string;
  employeeName?: string;
  profilePictureUpdatedAt?: string | null;
  employeeId: string | null;
  status: string;
  version: number;
  progress?: number;
  startDate?: string | null;
  assignees?: {
    id: string;
    name: string;
    branchId: string;
    branchName: string;
    profilePictureUpdatedAt?: string | null;
  }[];
  priority?: string;
  recurrence?: "DAILY" | "WEEKLY" | "MONTHLY" | null;
  recurrenceEndDate?: string | null;
  recurrenceActive?: boolean | null;
  occurrenceDate?: string | null;
  dueDate?: string;
  incidentDate?: string;
  category?: string;
  offense?: string | null;
  referenceNumber?: string;
  reportSource?: string;
  reportScope?: string;
  incidentTime?: string | null;
  remarks?: string;
  caseStatus?: string | null;
  workflowStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  reviewerName?: string | null;
  resolvedAt?: string | null;
  resolvedByName?: string | null;
  resolutionSummary?: string | null;
  closedAt?: string | null;
};
export type Detail = RecordItem & {
  canManage: boolean;
  canReassign?: boolean;
  isAssignee: boolean;
  isReporter: boolean;
  isSubject: boolean;
  canAssignReviewer: boolean;
  canResolve?: boolean;
  canInitiateCase?: boolean;
  canDiscipline?: boolean;
  events: {
    id: string;
    action: string;
    audience: string;
    message: string;
    createdAt: string;
    actor?: string;
    details?: {
      progress?: number;
      assigneeIds?: string[];
      findings?: string;
      outcome?: string;
      disciplinaryAction?: string;
      actionDetails?: string;
    };
  }[];
  canDelete?: boolean;
  canStopRecurrence?: boolean;
  attachments: {
    id: string;
    eventId: string;
    filename: string;
    mime?: "application/pdf" | "image/png" | "image/jpeg";
  }[];
};
export const taskStatuses = [
  "TODO",
  "STARTED",
  "IN_PROGRESS",
  "STUCK",
  "FOR_REVIEW",
  "COMPLETED",
  "CANCELLED",
];
export const incidentStatuses = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "DETAILS_REQUESTED",
  "PENDING_EXPLANATION",
  "FOR_DECISION",
  "ESCALATED",
  "RESOLVED",
  "CLOSED",
  "WITHDRAWN",
  "DISMISSED",
];
export const caseStatuses = [
  "DISCIPLINARY_REVIEW",
  "NOTICE_ISSUED",
  "AWAITING_RESPONSE",
  "DECISION_PENDING",
  "CLOSED",
];
export type IncidentSummary = {
  total: number;
  pending: number;
  clarification: number;
  resolved: number;
};
export const label = (value: string) =>
  (
    ({
      TODO: "Not started",
      CONDUCT: "Workplace Conduct",
      POLICY: "Company Policy",
      STARTED: "Started",
      STUCK: "Stuck",
      finished: "Completed reports",
      SUBMITTED: "Submitted",
      PENDING_EXPLANATION: "Pending explanation",
      FOR_DECISION: "For decision",
      NOTICE_ISSUED: "Pending explanation",
      AWAITING_RESPONSE: "Pending explanation",
      DECISION_PENDING: "For decision",
      DETAILS_REQUESTED: "Needs clarification",
      SELF_REPORTED: "Self-reported",
      MANAGEMENT_REPORTED: "Admin / manager report",
      EMPLOYEE_REPORTED: "Employee report",
    }) as Record<string, string>
  )[value] ??
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/^./, (s) => s.toUpperCase());
export async function request<T>(
  kind: Kind,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/work/${kind}${path}`, {
    ...init,
    cache: "no-store",
    headers:
      init?.body instanceof FormData
        ? undefined
        : { "Content-Type": "application/json" },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "The service returned an unreadable response." }));
  if (!response.ok)
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(" ")
        : (body.message ?? "Unable to complete this request."),
    );
  return body as T;
}
export function actions(kind: Kind, d: Detail): string[] {
  if (
    ["COMPLETED", "CANCELLED", "CLOSED", "WITHDRAWN", "DISMISSED"].includes(
      d.status,
    )
  )
    return [];
  if (kind === "tasks")
    return [
      "COMMENT",
      ...(d.isAssignee &&
      ["TODO", "STARTED", "IN_PROGRESS", "STUCK"].includes(d.status)
        ? [...(d.status === "TODO" ? ["START"] : []), "PROGRESS", "SUBMIT"]
        : []),
      ...(d.canManage && !d.isAssignee
        ? [
            ...(d.status === "FOR_REVIEW" ? ["ACCEPT", "CHANGES"] : []),
            "CANCEL",
          ]
        : []),
    ];
  const result: string[] = [];
  const formal =
    d.caseStatus ??
    (caseStatuses.includes(d.status) && d.status !== "CLOSED"
      ? d.status
      : null);
  const hr = d.canResolve ?? d.canAssignReviewer;
  const discipline = d.canDiscipline === true;
  if (d.status === "RESOLVED") return d.canManage && hr ? ["CLOSE"] : [];
  if (d.canManage || d.isReporter) result.push("COMMENT");
  if (d.isReporter && (!formal || formal === "CLOSED")) result.push("WITHDRAW");
  if (d.canManage && (hr || discipline) && (!formal || discipline))
    result.push("DISMISS");
  if (
    (d.isReporter ||
      (d.isSubject && d.reportSource === "MANAGEMENT_REPORTED")) &&
    d.status === "DETAILS_REQUESTED"
  )
    result.push("CLARIFY");
  if (
    (d.isReporter ||
      (d.isSubject && d.reportSource === "MANAGEMENT_REPORTED")) &&
    ["SUBMITTED", "UNDER_REVIEW", "ESCALATED"].includes(d.status)
  )
    result.push("EXPLAIN");
  if (d.isSubject && formal === "NOTICE_ISSUED") result.push("ACKNOWLEDGE");
  if (
    d.isSubject &&
    ["NOTICE_ISSUED", "AWAITING_RESPONSE"].includes(formal ?? "")
  )
    result.push("RESPONSE");
  if (d.canManage) {
    if (["SUBMITTED", "DETAILS_REQUESTED", "ESCALATED"].includes(d.status))
      result.push("REVIEW");
    if (["SUBMITTED", "UNDER_REVIEW", "ESCALATED"].includes(d.status))
      result.push("RECEIVE", "REQUEST_DETAILS");
    if (["SUBMITTED", "UNDER_REVIEW", "DETAILS_REQUESTED"].includes(d.status)) {
      result.push("HR_ESCALATE");
      if (!formal) result.push("SET_SUBJECT");
    }
    if (
      hr &&
      ["UNDER_REVIEW", "ESCALATED"].includes(d.status) &&
      (!formal || formal === "CLOSED")
    )
      result.push("RESOLVE");
    if (discipline && d.status === "UNDER_REVIEW" && !formal && d.employeeId)
      result.push("ESCALATE");
    if (discipline && formal === "DISCIPLINARY_REVIEW") result.push("NOTICE");
    if (discipline && formal === "DECISION_PENDING") result.push("DECIDE");
    if (d.canAssignReviewer) result.push("ASSIGN_REVIEWER");
  }
  return result;
}
export const actionLabels: Record<string, string> = {
  WITHDRAW: "Withdraw report",
  DISMISS: "Dismiss report",
  RECEIVE: "Acknowledge report",
  CLARIFY: "Reply to clarification",
  EXPLAIN: "Add explanation",
  HR_ESCALATE: "Refer to HR",
  RESOLVE: "Resolve report",
  START: "Start task",
  PROGRESS: "Update progress",
  SUBMIT: "Submit for review",
  ACCEPT: "Accept completion",
  CHANGES: "Request changes",
  CANCEL: "Cancel task",
  COMMENT: "Add comment",
  REVIEW: "Start review",
  REQUEST_DETAILS: "Request clarification",
  ESCALATE: "Initiate disciplinary case",
  NOTICE: "Issue Notice to Explain",
  ACKNOWLEDGE: "Acknowledge receipt",
  RESPONSE: "Submit explanation",
  DECIDE: "Record decision and close",
  CLOSE: "Close resolved report",
  SET_SUBJECT: "Identify concerned employee",
  ASSIGN_REVIEWER: "Assign case reviewer",
};
