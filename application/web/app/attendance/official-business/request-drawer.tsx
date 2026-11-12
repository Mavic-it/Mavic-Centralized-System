"use client";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { useConfirmation } from "../../components/ui/confirmation-provider";
import { obApi, obDate, obTime, obTimestamp } from "./api";
import type { ObRequest } from "./types";
import { ObAttendancePreview } from "./attendance-preview";
import css from "./ob.module.css";
export function ObRequestDrawer({
  id,
  onClose,
  onSaved,
}: {
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const q = useQuery({
    queryKey: ["official-business", "detail", id],
    queryFn: () => obApi<ObRequest>(`/requests/${id}`),
  });
  const [comment, setComment] = useState(""),
    [continuity, setContinuity] = useState(false);
  const confirm = useConfirmation();
  const action = useMutation({
    mutationFn: (choice: string) =>
      obApi(`/requests/${id}/decision`, {
        version: q.data!.version,
        action: choice,
        comment,
        officeContinuity: continuity,
      }),
    onSuccess: () => {
      setComment("");
      onSaved();
    },
  });
  async function decide(choice: string) {
    if (!comment.trim() || action.isPending) return;
    if (
      await confirm({
        title:
          r?.isOwner && choice === "APPROVE"
            ? "Self-approve OB?"
            : choice.replaceAll("_", " ").toLowerCase() + " OB?",
        description:
          choice === "APPROVE"
            ? "This authorizes the filed work interval and updates draft DTR attendance. Original punches remain unchanged."
            : "This decision is recorded in request history. Approved attendance changes only after an authorized decision.",
        confirmLabel: "Confirm decision",
      })
    )
      action.mutate(choice);
  }
  const r = q.data;
  return (
    <Modal
      className={css.drawer}
      aria-labelledby="ob-detail-title"
      onClose={onClose}
      busy={action.isPending}
    >
      <header className={css.modalHeader}>
        <div>
          <p className={css.eyebrow}>Official Business</p>
          <h2 id="ob-detail-title">Request details</h2>
        </div>
        <Button variant="outline" onClick={onClose} disabled={action.isPending}>
          Close
        </Button>
      </header>
      {q.isPending ? (
        <p role="status" className={css.notice}>
          Loading OB details...
        </p>
      ) : q.isError ? (
        <div className={css.notice}>
          <p role="alert">{q.error.message}</p>
          <Button onClick={() => void q.refetch()}>Retry</Button>
        </div>
      ) : (
        r && (
          <div className={css.drawerBody}>
            <div className={css.identity}>
              <strong>{r.employeeName}</strong>
              <span>{r.branchName}</span>
              <span className={css.badge} data-status={r.status}>
                {r.status}
                {r.cancellationPending ? " / Cancellation pending" : ""}
              </span>
            </div>
            <dl className={css.facts}>
              <div>
                <dt>Work date</dt>
                <dd>{obDate(r.workDate)}</dd>
              </div>
              <div>
                <dt>Estimated interval</dt>
                <dd>
                  {obTime(r.startsAt, r.timeZone)} -{" "}
                  {obTime(r.endsAt, r.timeZone)} ({r.timeZone})
                </dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>{r.destination}</dd>
              </div>
              <div>
                <dt>Purpose</dt>
                <dd>{r.reason}</dd>
              </div>
              {r.retrospectiveReason && (
                <div>
                  <dt>Retrospective explanation</dt>
                  <dd>{r.retrospectiveReason}</dd>
                </div>
              )}
            </dl>
            {r.status === "PENDING" && r.canReview && (
              <label className={css.check}>
                <input
                  type="checkbox"
                  checked={continuity}
                  onChange={(e) => setContinuity(e.target.checked)}
                  disabled={
                    action.isPending ||
                    !r.preview.actualIn ||
                    !!r.preview.actualOut
                  }
                />{" "}
                I confirm the employee worked continuously from the recorded
                office IN until OB departure. This explicitly authorizes
                coverage of the missing office OUT.
              </label>
            )}
            {(r.status === "PENDING" || r.status === "APPROVED") && (
              <ObAttendancePreview
                calculation={continuity ? r.continuityPreview : r.preview}
              />
            )}
            {((r.canReview &&
              (r.status === "PENDING" || r.cancellationPending)) ||
              (r.isOwner &&
                (r.status === "PENDING" ||
                  (r.status === "APPROVED" && !r.cancellationPending)))) && (
              <section className={css.decision}>
                <h3>{r.canReview ? "Review decision" : "Request action"}</h3>
                <label>
                  Reason / reviewer comment
                  <textarea
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={action.isPending}
                  />
                </label>
                <div className={css.actions}>
                  {r.canReview && r.status === "PENDING" && (
                    <>
                      <Button
                        disabled={!comment.trim() || action.isPending}
                        onClick={() => void decide("APPROVE")}
                      >
                        {r.isOwner ? "Approve own OB" : "Approve OB"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!comment.trim() || action.isPending}
                        onClick={() => void decide("REJECT")}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {r.canReview && r.cancellationPending && (
                    <>
                      <Button
                        disabled={!comment.trim() || action.isPending}
                        onClick={() => void decide("APPROVE_CANCELLATION")}
                      >
                        Approve cancellation
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!comment.trim() || action.isPending}
                        onClick={() => void decide("REJECT_CANCELLATION")}
                      >
                        Keep OB approved
                      </Button>
                    </>
                  )}
                  {r.isOwner && r.status === "PENDING" && (
                    <Button
                      variant="outline"
                      disabled={!comment.trim() || action.isPending}
                      onClick={() => void decide("CANCEL")}
                    >
                      Cancel request
                    </Button>
                  )}
                  {r.isOwner &&
                    r.status === "APPROVED" &&
                    !r.cancellationPending && (
                      <Button
                        variant="outline"
                        disabled={!comment.trim() || action.isPending}
                        onClick={() => void decide("REQUEST_CANCELLATION")}
                      >
                        Request cancellation
                      </Button>
                    )}
                </div>
                {action.error && (
                  <p role="alert" className={css.error}>
                    {action.error.message}
                  </p>
                )}
              </section>
            )}
            <section>
              <h3>Request history</h3>
              <ol className={css.timeline}>
                {r.events?.map((e, i) => (
                  <li key={i}>
                    <strong>{e.action.replaceAll("_", " ")}</strong>
                    <small>
                      {e.actor} / {obTimestamp(e.createdAt)} PHT
                    </small>
                    <p>{e.comment}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        )
      )}
    </Modal>
  );
}
