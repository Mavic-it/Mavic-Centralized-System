"use client";
import { useState } from "react";
import { FieldLabel } from "../components/field-label";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../components/ui/modal";
import { Button } from "../components/ui/button";
import { X } from "lucide-react";
import { IconActionButton } from "../components/icon-action-button";
import { useConfirmation } from "../components/ui/confirmation-provider";
import {
  api,
  send,
  useAction,
  dateLabel,
  dateTimeLabel,
  currentDate,
} from "./api";
import { ErrorState, Loading, Status } from "./ui";
import type { Context, Detail } from "./types";
import { leaveEventLabel, leaveEventComment } from "./request-presentation";
import { addCalendarDays, effectiveNoticeDays } from "./filing-dates";
import css from "./leave.module.css";
export function RequestDrawer({
  id,
  context,
  onClose,
}: {
  id: string;
  context: Context;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["leave", "detail", id],
    queryFn: () => api<Detail>(`/requests/${id}`),
  });
  const [comment, setComment] = useState("");
  const [responseChoice, setResponseChoice] = useState<
    "CONFIRM" | "CONTINUE" | "RESCHEDULE"
  >("CONTINUE");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [decisionKind, setDecisionKind] = useState<string | null>(null);
  const confirm = useConfirmation();
  const action = useAction((kind: string) => {
    if (kind === "propose")
      return send(`/requests/${id}/cancellation-proposal`, { comment });
    if (kind === "respond")
      return send(`/me/requests/${id}/cancellation-response`, {
        action: responseChoice,
        comment,
        ...(responseChoice === "RESCHEDULE"
          ? { startDate: newStart, endDate: newEnd }
          : {}),
      });
    if (kind === "review-approve" || kind === "review-reject")
      return send(`/requests/${id}/cancellation-decision`, {
        action: kind === "review-approve" ? "APPROVE" : "REJECT",
        comment,
      });
    return send(
      kind === "cancel"
        ? `/me/requests/${id}/cancel`
        : `/requests/${id}/${kind}`,
      { comment },
    );
  }, "Leave request updated.");
  async function decide(kind: string) {
    if (action.isPending) return;
    const reasonRequired = kind === "reject" || kind === "cancel";
    if (reasonRequired && !comment.trim()) return;
    if (
      await confirm({
        title:
          kind === "approve"
            ? own
              ? "Approve your own leave request?"
              : "Approve this leave request?"
            : kind === "reject"
              ? "Reject this leave request?"
              : "Cancel this leave request?",
        description:
          kind === "approve"
            ? own
              ? "Your name, role, time and self-approval will be recorded in the history. The normal credit and attendance checks still apply."
              : r?.policy.paid
                ? "This records the final decision and consumes the reserved paid credits."
                : "This records the final decision for unpaid leave. No paid credits are deducted."
            : kind === "cancel"
              ? r?.status === "APPROVED"
                ? "An authorized reviewer must approve this cancellation. Your approved leave stays in place while you wait."
                : "The pending request is cancelled and its reserved credits are released."
              : "The employee will see your rejection reason.",
        confirmLabel:
          kind === "approve"
            ? own
              ? "Approve my request"
              : "Approve request"
            : kind === "reject"
              ? "Reject request"
              : r?.status === "APPROVED"
                ? "Request cancellation"
                : "Cancel request",
        tone: kind === "approve" ? "default" : "danger",
      })
    )
      action.mutate(kind);
    setDecisionKind(kind);
  }
  const r = q.data?.request;
  const own = r?.employeeId === context.ownEmployee?.id;
  const review = q.data?.cancellationReview;
  const earliestReschedule = r
    ? addCalendarDays(
        currentDate(),
        effectiveNoticeDays(r.typeCode, r.policy.minimumNoticeDays ?? 0),
      )
    : currentDate();
  const canCancel =
    own &&
    !review &&
    (r?.status === "PENDING" ||
      (r?.status === "APPROVED" && r.startDate > currentDate()));
  const canPropose =
    context.canReview &&
    !own &&
    !review &&
    (r?.status === "PENDING" ||
      (r?.status === "APPROVED" && r.startDate > currentDate()));
  const canRespond = own && review?.status === "AWAITING_EMPLOYEE";
  const canDecideReview =
    context.canReview && !own && review?.status === "AWAITING_REVIEW";
  const commentRequired =
    decisionKind === "reject" ||
    decisionKind === "cancel" ||
    canCancel ||
    (canPropose && !q.data?.canReview) ||
    canRespond ||
    canDecideReview;
  async function submitWorkflow(
    kind: "propose" | "respond" | "review-approve" | "review-reject",
  ) {
    if (action.isPending || !comment.trim()) return;
    if (
      kind === "respond" &&
      responseChoice === "RESCHEDULE" &&
      (!newStart ||
        !newEnd ||
        newStart < earliestReschedule ||
        newEnd < newStart)
    )
      return;
    const title =
      kind === "propose"
        ? "Ask the employee about cancellation?"
        : kind === "respond"
          ? responseChoice === "CONFIRM"
            ? "Confirm cancellation?"
            : responseChoice === "CONTINUE"
              ? "Send your explanation?"
              : "Propose new leave dates?"
          : kind === "review-approve"
            ? "Approve the cancellation or new dates?"
            : "Decline this change?";
    if (
      await confirm({
        title,
        description:
          kind === "review-approve" && review?.proposedStart
            ? "The original request will be cancelled and a new pending request will be created for the proposed dates."
            : kind === "respond" && responseChoice === "CONTINUE"
              ? "Your original leave request stays in place and your explanation is recorded."
              : "Your response and the final decision are recorded in request history.",
        confirmLabel: kind === "review-reject" ? "Decline change" : "Continue",
        tone:
          kind === "review-approve" ||
          (kind === "respond" && responseChoice === "CONFIRM")
            ? "danger"
            : "default",
      })
    )
      action.mutate(kind);
  }
  return (
    <Modal
      className={css.requestDrawer}
      aria-labelledby="leave-detail-title"
      onClose={onClose}
      busy={action.isPending}
    >
      <header className={css.drawerHeader}>
        <div>
          <p className={css.eyebrow}>Leave request</p>
          <h2 id="leave-detail-title">
            {r?.employeeName ?? "Request details"}
          </h2>
          <p className={css.muted}>
            {r
              ? `${r.typeName} · ${r.days} ${r.days === 1 ? "day" : "days"}`
              : "Dates, decision, and request history"}
          </p>
        </div>
        <IconActionButton
          icon={X}
          label="Close leave request details"
          disabled={action.isPending}
          onClick={onClose}
        />
      </header>
      <div className={css.drawerBody}>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <div className={css.details}>
            <ErrorState error={q.error} retry={() => void q.refetch()} />
          </div>
        ) : (
          r && (
            <div className={css.details}>
              <div className={css.requestNextStep}>
                <strong>
                  {review
                    ? "A change to this leave is being discussed"
                    : r.status === "PENDING"
                      ? "Waiting for approval"
                      : r.status === "APPROVED"
                        ? "This leave is approved"
                        : r.status === "CANCELLED"
                          ? "This leave was cancelled"
                          : "This leave was declined"}
                </strong>
                <p>
                  {review
                    ? own
                      ? "Read the message below and respond if requested."
                      : "Review the employee?s response below."
                    : q.data?.canReview
                      ? "Review the dates and reason, then approve or decline below."
                      : r.status === "PENDING"
                        ? "Your reviewer will check this request. You can follow updates here."
                        : r.status === "APPROVED"
                          ? "The dates below are approved. If your plans change, request cancellation below."
                          : "No action is needed on this request. Any new leave dates appear as a separate request."}
                </p>
              </div>
              <div className={css.detailGrid}>
                <div>
                  <h3>Employee</h3>
                  <p>{r.employeeName}</p>
                  <small>{r.branchName}</small>
                </div>
                <div>
                  <h3>Status</h3>
                  <Status value={r.status} />
                </div>
                <div>
                  <h3>Leave type</h3>
                  <p>
                    {r.typeName} · {r.policy.paid ? "Paid" : "Unpaid"}
                  </p>
                </div>
                <div>
                  <h3>Leave dates</h3>
                  <p>
                    {dateLabel(r.startDate)} – {dateLabel(r.endDate)}
                  </p>
                  <strong>
                    {r.days} {r.days === 1 ? "day" : "days"}
                  </strong>
                </div>
                <div>
                  <h3>Submitted</h3>
                  <p>{dateTimeLabel(r.submittedAt)}</p>
                </div>
                <div>
                  <h3>{r.policy.paid ? "Leave credits" : "Pay"}</h3>
                  <p>
                    {!r.policy.paid
                      ? "Unpaid leave · No paid credits deducted"
                      : q.data?.balance
                        ? `${q.data.balance.available} days available ? ${q.data.balance.reserved} days awaiting approval`
                        : "Unavailable after branch transfer"}
                  </p>
                </div>
              </div>
              <div>
                <h3>Reason</h3>
                <p>{r.reason}</p>
              </div>
              {r.fileName && (
                <a
                  className={css.link}
                  download
                  href={`/api/leave/requests/${r.id}/document`}
                >
                  Download {r.fileName}
                </a>
              )}
              {review && (
                <section
                  className={css.notice}
                  aria-label="Cancellation review"
                >
                  <h3>
                    {review.status === "AWAITING_EMPLOYEE"
                      ? "Your response is needed"
                      : "Waiting for reviewer decision"}
                  </h3>
                  <p>
                    {review.origin === "REVIEWER"
                      ? "A reviewer has suggested cancelling this leave."
                      : "The employee has asked to cancel approved leave."}
                  </p>
                  <p>
                    <strong>Reason:</strong> {review.reason}
                  </p>
                  {review.response && (
                    <p>
                      <strong>Employee response:</strong> {review.response}
                    </p>
                  )}
                  {review.proposedStart && (
                    <p>
                      <strong>Suggested dates:</strong>{" "}
                      {dateLabel(review.proposedStart)} –{" "}
                      {dateLabel(review.proposedEnd!)}
                    </p>
                  )}
                  <small>
                    The current leave stays in place until the required response
                    or decision is complete.
                  </small>
                </section>
              )}
              {(q.data?.canReview ||
                canCancel ||
                canPropose ||
                canRespond ||
                canDecideReview) && (
                <div className={css.form} style={{ padding: 0 }}>
                  {canRespond && (
                    <label>
                      Your response
                      <select
                        value={responseChoice}
                        onChange={(e) =>
                          setResponseChoice(
                            e.target.value as typeof responseChoice,
                          )
                        }
                        disabled={action.isPending}
                      >
                        <option value="CONTINUE">
                          Explain why my request should continue
                        </option>
                        <option value="CONFIRM">Confirm cancellation</option>
                        <option value="RESCHEDULE">Propose new dates</option>
                      </select>
                    </label>
                  )}
                  {canRespond && responseChoice === "RESCHEDULE" && (
                    <div className={css.fields}>
                      <label>
                        <FieldLabel required>New start date</FieldLabel>
                        <input
                          required
                          type="date"
                          min={earliestReschedule}
                          value={newStart}
                          onChange={(e) => setNewStart(e.target.value)}
                          disabled={action.isPending}
                        />
                      </label>
                      <label>
                        <FieldLabel required>New end date</FieldLabel>
                        <input
                          required
                          type="date"
                          min={newStart || earliestReschedule}
                          value={newEnd}
                          onChange={(e) => setNewEnd(e.target.value)}
                          disabled={action.isPending}
                        />
                      </label>
                    </div>
                  )}
                  <label>
                    <FieldLabel required={commentRequired}>
                      {canRespond ? "Your explanation" : "Reason or comment"}
                    </FieldLabel>
                    <textarea
                      required={commentRequired}
                      rows={3}
                      maxLength={1000}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      disabled={action.isPending}
                    />
                  </label>
                  <small className={css.muted}>
                    {canRespond
                      ? "Confirm cancellation, explain why your leave should continue, or suggest new dates for review."
                      : canDecideReview
                        ? "Approve or decline this change. The original leave remains valid until you decide."
                        : canPropose
                          ? q.data?.canReview
                            ? "Approve to accept this leave. Add a reason to decline it or ask the employee to cancel."
                            : "Add a reason to ask the employee about cancelling this leave."
                          : own && q.data?.canReview
                            ? "You may approve your own request as an authorized manager. Self-approval is explicitly recorded in history. Cancellation requires a reason."
                            : r.status === "APPROVED" && canCancel
                              ? "Cancellation of approved leave requires a reviewer decision."
                              : "Approval is final in one step. Rejection and cancellation require a reason."}
                  </small>
                </div>
              )}
              <details className={css.requestHistory}>
                <summary>View request history ({q.data?.events.length ?? 0})</summary>
                <ol className={css.timeline}>
                  {q.data?.events.map((e, i) => (
                    <li key={e.id ?? `${e.createdAt}-${i}`}>
                      <strong>{leaveEventLabel(e.action)}</strong>
                      <small>
                        {e.actor} · {dateTimeLabel(e.createdAt)}
                      </small>
                      {e.comment && leaveEventComment(e.comment) && (
                        <p>{leaveEventComment(e.comment)}</p>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
              {action.error && <ErrorState error={action.error} />}
              {decisionKind &&
                (decisionKind === "reject" || decisionKind === "cancel") && (
                  <p className={css.muted} role="status">
                    Comment is required to {decisionKind} this request.
                  </p>
                )}
            </div>
          )
        )}
      </div>
      <footer className={`${css.footer} ${css.drawerFooter}`}>
        {!canCancel &&
          !q.data?.canReview &&
          !canPropose &&
          !canRespond &&
          !canDecideReview && (
            <span className={css.muted}>
              No action needed. You can view earlier updates in request history.
            </span>
          )}
        {canCancel && (
          <Button
            variant="outline"
            disabled={!comment.trim() || action.isPending}
            onClick={() => void decide("cancel")}
          >
            {r?.status === "APPROVED"
              ? "Request cancellation"
              : "Cancel request"}
          </Button>
        )}
        {canPropose && (
          <Button
            variant="outline"
            disabled={!comment.trim() || action.isPending}
            onClick={() => void submitWorkflow("propose")}
          >
            Suggest cancellation
          </Button>
        )}
        {canRespond && (
          <Button
            disabled={
              !comment.trim() ||
              action.isPending ||
              (responseChoice === "RESCHEDULE" &&
                (!newStart ||
                  !newEnd ||
                  newStart < earliestReschedule ||
                  newEnd < newStart))
            }
            onClick={() => void submitWorkflow("respond")}
          >
            Send response
          </Button>
        )}
        {canDecideReview && (
          <>
            <Button
              variant="outline"
              disabled={!comment.trim() || action.isPending}
              onClick={() => void submitWorkflow("review-reject")}
            >
              Decline change
            </Button>
            <Button
              disabled={!comment.trim() || action.isPending}
              onClick={() => void submitWorkflow("review-approve")}
            >
              {review?.proposedStart
                ? "Accept new dates"
                : "Approve cancellation"}
            </Button>
          </>
        )}
        {q.data?.canReview && (
          <>
            {!own && (
              <Button
                variant="outline"
                disabled={!comment.trim() || action.isPending}
                onClick={() => void decide("reject")}
              >
                Reject
              </Button>
            )}
            <Button
              disabled={action.isPending}
              onClick={() => void decide("approve")}
            >
              {action.isPending
                ? "Saving…"
                : own
                  ? "Approve my request"
                  : "Approve"}
            </Button>
          </>
        )}
      </footer>
    </Modal>
  );
}
