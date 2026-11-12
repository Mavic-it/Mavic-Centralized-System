import { actions, type Detail, type Kind, type RecordItem } from "./types";
export const isClosed = (status: string) =>
  [
    "COMPLETED",
    "CANCELLED",
    "RESOLVED",
    "CLOSED",
    "WITHDRAWN",
    "DISMISSED",
  ].includes(status);
export function statusTone(status: string): string {
  if (status === "STUCK") return "danger";
  if (status === "STARTED") return "info";
  if (["COMPLETED", "RESOLVED", "CLOSED"].includes(status)) return "success";
  if (
    [
      "FOR_REVIEW",
      "DETAILS_REQUESTED",
      "NOTICE_ISSUED",
      "AWAITING_RESPONSE",
    ].includes(status)
  )
    return "warning";
  if (["DISCIPLINARY_REVIEW", "DECISION_PENDING"].includes(status))
    return "purple";
  if (
    [
      "IN_PROGRESS",
      "SUBMITTED",
      "DETAILS_REQUESTED",
      "ESCALATED",
      "UNDER_REVIEW",
    ].includes(status)
  )
    return "info";
  return "neutral";
}
export function todayInManila(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function isOverdue(r: RecordItem, today = todayInManila()): boolean {
  return !!r.dueDate && !isClosed(r.status) && r.dueDate < today;
}
export function workDate(value?: string): string {
  if (!value) return "No date";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-PH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(date)
    : "No date";
}
export type RecordSort = "newest" | "date" | "priority" | "title";
export function workTimestamp(value?: string): string {
  if (!value) return "Not available";
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila",
  }).format(timestamp);
}
export function visibleRecords(
  items: RecordItem[],
  query: string,
  sort: RecordSort,
  group: "all" | "active" | "closed",
): RecordItem[] {
  const normalize = (v: string) =>
    v
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const term = normalize(query.trim());
  const result = items.filter(
    (r) =>
      (group === "all" || (group === "closed") === isClosed(r.status)) &&
      normalize(
        [
          r.title,
          r.description,
          r.employeeName,
          r.branchName,
          r.priority,
          r.status,
          r.category,
        ]
          .filter(Boolean)
          .join(" "),
      ).includes(term),
  );
  const priority: Record<string, number> = {
    URGENT: 0,
    HIGH: 1,
    NORMAL: 2,
    LOW: 3,
  };
  if (sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
  if (sort === "date")
    result.sort((a, b) =>
      (a.dueDate ?? a.incidentDate ?? "9999").localeCompare(
        b.dueDate ?? b.incidentDate ?? "9999",
      ),
    );
  if (sort === "priority")
    result.sort(
      (a, b) =>
        (priority[a.priority ?? ""] ?? 4) - (priority[b.priority ?? ""] ?? 4),
    );
  return result;
}
export function nextAction(kind: Kind, d: Detail): string | undefined {
  const available = actions(kind, d);
  if (kind === "incidents") {
    for (const action of [
      "ACKNOWLEDGE",
      "RESPONSE",
      "DECIDE",
      "NOTICE",
      "CLARIFY",
    ])
      if (available.includes(action)) return action;
  }
  return (
    available.find(
      (a) =>
        ![
          "COMMENT",
          "CANCEL",
          "ASSIGN_REVIEWER",
          "SET_SUBJECT",
          "CLOSE",
          "WITHDRAW",
          "DISMISS",
        ].includes(a),
    ) ??
    available.find((a) => a === "COMMENT") ??
    (available.length === 1 ? available[0] : undefined)
  );
}
export const audienceLabel = (audience: string) =>
  ({
    PARTICIPANTS: "Record participants",
    INTERNAL: "Case reviewers only",
    REPORTER: "Reviewers and reporter",
    SUBJECT: "Reviewers and concerned employee",
  })[audience] ?? "Authorized participants";
