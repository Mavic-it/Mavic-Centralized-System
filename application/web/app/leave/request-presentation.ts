const eventLabels: Record<string, string> = {
  SUBMITTED: "Leave requested",
  APPROVED: "Leave approved",
  SELF_APPROVED: "Leave approved by the requester",
  REJECTED: "Leave declined",
  CANCEL_PROPOSED: "Reviewer asked to cancel this leave",
  CANCEL_REQUESTED: "Employee requested cancellation",
  CANCEL_DECLINED: "Employee asked to keep the leave",
  CANCEL_REJECTED: "Cancellation was declined",
  CANCELLED: "Leave cancelled",
  RESCHEDULE_PROPOSED: "Employee suggested new dates",
  RESCHEDULED: "New request created for the updated dates",
};
export function leaveEventLabel(action: string): string {
  return eventLabels[action] ?? action.toLowerCase().replaceAll("_", " ");
}
export function leaveEventComment(comment: string): string {
  return comment.replace(/^Rescheduled from [0-9a-f-]{36}\.\s*/i, "");
}
