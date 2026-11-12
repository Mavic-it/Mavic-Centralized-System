import { FieldLabel } from "../components/field-label";
import { useRef, useState, type FormEvent } from "react";
import { LockKeyhole, MessageSquare, RotateCcw } from "lucide-react";
import type { Context, Detail } from "./types";
import { label } from "./types";
import { ProgressBar, StatusBadge } from "./record-collection";
import { AttachmentPicker } from "./attachment-picker";
import { RecordFile } from "./record-file";
import { TaskReassignment } from "./task-reassignment";
import {
  taskStages,
  taskStage,
  taskStageLabels,
  taskPreview,
  type TaskStage,
} from "./task-status";
import { audienceLabel, workDate, isClosed } from "./presentation";
import css from "./workspace.module.css";
export type TaskUpdate = {
  action: string;
  message: string;
  taskState?: TaskStage;
};
export function TaskOverview({
  detail: d,
  busy,
  onSave,
  employees,
  branches,
  onReassign,
  onStopRecurrence,
}: {
  detail: Detail;
  busy: boolean;
  onSave: (update: TaskUpdate, file?: File) => Promise<boolean>;
  employees: Context["employees"];
  branches: Context["branches"];
  onReassign: (employeeIds: string[]) => Promise<boolean>;
  onStopRecurrence: () => Promise<void>;
}) {
  const [stage, setStage] = useState<TaskStage | null>(null),
    [message, setMessage] = useState(""),
    [reviewAction, setReviewAction] = useState("COMMENT"),
    [hasFile, setHasFile] = useState(false),
    [fileKey, setFileKey] = useState(0);
  const form = useRef<HTMLFormElement>(null);
  const closed = isClosed(d.status),
    canStatus = d.isAssignee && !closed && d.status !== "FOR_REVIEW";
  const selected = stage ?? taskStage(d.status),
    changed = canStatus && stage !== null && stage !== taskStage(d.status);
  const preview = changed
    ? taskPreview(selected, d.progress ?? 0)
    : { progress: d.progress ?? 0, status: d.status };
  const canReview = d.canManage && !d.isAssignee && !closed;
  const ready = changed || !!message.trim() || hasFile;
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget),
      value = f.get("file");
    const file = value instanceof File && value.name ? value : undefined;
    const action = changed ? "STATUS" : canReview ? reviewAction : "COMMENT";
    const text =
      message.trim() ||
      (changed
        ? `Task status changed to ${taskStageLabels[selected]}.`
        : file
          ? "Supporting file added."
          : "");
    if (
      await onSave(
        { action, message: text, ...(changed ? { taskState: selected } : {}) },
        file,
      )
    ) {
      setStage(null);
      setMessage("");
      setHasFile(false);
      setFileKey((v) => v + 1);
      setReviewAction("COMMENT");
    }
  }
  return (
    <div className={css.overview}>
      <section>
        <h3>Task brief</h3>
        <p className={css.prose}>{d.description}</p>
      </section>
      {d.recurrence && (
        <section
          className={css.taskRecurringNote}
          aria-label="Recurring task schedule"
        >
          <p className={css.notice} role="note">
            This task is part of a {d.recurrence.toLowerCase()} series through{" "}
            {workDate(d.recurrenceEndDate ?? undefined)}.{" "}
            {d.recurrenceActive
              ? "Future tasks use the same assignees and branch."
              : "No more future tasks will be created."}
          </p>
          {d.canStopRecurrence && (
            <button
              type="button"
              className={css.taskStopRecurrence}
              disabled={busy}
              onClick={() => void onStopRecurrence()}
            >
              <RotateCcw size={15} aria-hidden="true" />
              Stop future tasks
            </button>
          )}
        </section>
      )}
      <section
        className={`${css.progressPanel} ${css.taskProgress}`}
        data-task-status={preview.status}
      >
        <div>
          <h3>Task status</h3>
          <div>
            <StatusBadge status={preview.status} />
          </div>
        </div>
        <ProgressBar value={preview.progress} status={preview.status} />
        {d.status === "FOR_REVIEW" && (
          <p className={css.muted}>
            Done / awaiting an independent manager review.
          </p>
        )}
        {d.status === "STUCK" && (
          <p className={css.muted}>
            Stuck / the last saved progress is retained until work resumes.
          </p>
        )}
      </section>
      {!closed && (
        <form
          className={`${css.form} ${css.taskComposer}`}
          ref={form}
          onSubmit={submit}
        >
          <fieldset disabled={busy}>
            {canStatus && (
              <label>
                <FieldLabel required={true}>Update task status</FieldLabel>
                <select
                  required
                  name="taskState"
                  value={selected}
                  onChange={(e) => setStage(e.target.value as TaskStage)}
                >
                  {taskStages.map((v) => (
                    <option key={v} value={v}>
                      {taskStageLabels[v]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canReview && (
              <label>
                <FieldLabel required={true}>Review action</FieldLabel>
                <select
                  required
                  name="taskReviewAction"
                  value={reviewAction}
                  onChange={(e) => setReviewAction(e.target.value)}
                >
                  <option value="COMMENT">Add comment</option>
                  {d.status === "FOR_REVIEW" && (
                    <>
                      <option value="ACCEPT">Approve completion</option>
                      <option value="CHANGES">Request changes</option>
                    </>
                  )}
                  <option value="CANCEL">Cancel task</option>
                </select>
              </label>
            )}
            <label>
              <FieldLabel required={canReview && reviewAction !== "COMMENT"}>
                Comment or review note
              </FieldLabel>
              <textarea
                name="taskMessage"
                rows={3}
                maxLength={8000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  changed
                    ? "Add an optional note about this status change"
                    : "Write a comment or review note"
                }
                required={canReview && reviewAction !== "COMMENT"}
              />
            </label>
            <AttachmentPicker
              key={fileKey}
              disabled={busy}
              onChange={() =>
                setHasFile(
                  !!form.current?.querySelector<HTMLInputElement>(
                    'input[name="file"]',
                  )?.files?.length,
                )
              }
            />
            <button className={css.primary} disabled={busy || !ready}>
              {busy
                ? "Saving..."
                : changed
                  ? selected === "DONE"
                    ? "Submit for review"
                    : "Save status"
                  : canReview && reviewAction !== "COMMENT"
                    ? reviewAction === "ACCEPT"
                      ? "Approve completion"
                      : reviewAction === "CHANGES"
                        ? "Request changes"
                        : "Cancel task"
                    : hasFile && !message.trim()
                      ? "Upload file"
                      : "Send comment"}
            </button>
            {canStatus && (
              <p className={css.muted}>
                Progress follows the selected status. Done submits this shared
                task for manager review.
              </p>
            )}
          </fieldset>
        </form>
      )}
      {closed && (
        <p className={css.notice}>
          This task is {label(d.status).toLowerCase()}. Its history and files
          remain available.
        </p>
      )}
      <dl className={css.recordMetadata}>
        <div>
          <dt>Assignees</dt>
          <dd>
            {d.assignees?.length
              ? d.assignees.map((a) => (
                  <div key={a.id}>
                    {a.name} / {a.branchName}
                  </div>
                ))
              : d.employeeName}
          </dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{d.branchName}</dd>
        </div>
        <div>
          <dt>Start date</dt>
          <dd>{d.startDate ? workDate(d.startDate) : "Not set"}</dd>
        </div>
        <div>
          <dt>Due date</dt>
          <dd>{workDate(d.dueDate)}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{label(d.priority ?? "NORMAL")}</dd>
        </div>
      </dl>
      <TaskReassignment
        detail={d}
        employees={employees}
        branches={branches}
        busy={busy}
        onReassign={onReassign}
      />
      <section className={css.taskActivity}>
        <div className={css.sectionHeading}>
          <MessageSquare size={18} />
          <h3>Activity & files</h3>
        </div>
        <p className={css.muted}>
          Comments, status changes, and their attached files appear together.
        </p>
        <ol className={css.timeline}>
          {d.events.map((event) => (
            <li key={event.id}>
              <span className={css.timelineDot}>
                <MessageSquare size={13} />
              </span>
              <div className={css.activityHeading}>
                <strong>{label(event.action)}</strong>
                <span className={css.audienceBadge}>
                  <LockKeyhole size={12} />
                  {audienceLabel(event.audience)}
                </span>
              </div>
              <small>
                {event.actor && `${event.actor} · `}
                {new Date(event.createdAt).toLocaleString()}
              </small>
              <p className={css.prose}>{event.message}</p>
              {event.action === "REASSIGNED" &&
                Array.isArray(event.details?.assigneeIds) && (
                  <p className={css.muted}>
                    Assignees:{" "}
                    {event.details.assigneeIds
                      .map(
                        (id) =>
                          d.assignees?.find((assignee) => assignee.id === id)
                            ?.name ?? id,
                      )
                      .join(", ")}
                  </p>
                )}
              {typeof event.details?.progress === "number" && (
                <span className={css.progressTag}>
                  Progress: {event.details.progress}%
                </span>
              )}
              {d.attachments
                .filter((a) => a.eventId === event.id)
                .map((a) => (
                  <RecordFile
                    key={a.id}
                    kind="tasks"
                    recordId={d.id}
                    file={a}
                  />
                ))}
            </li>
          ))}
        </ol>
        {!d.events.length && (
          <p className={css.empty}>No shared updates yet.</p>
        )}
        {d.attachments.some(
          (attachment) =>
            !d.events.some((event) => event.id === attachment.eventId),
        ) && (
          <div className={css.fileList}>
            {d.attachments
              .filter(
                (attachment) =>
                  !d.events.some((event) => event.id === attachment.eventId),
              )
              .map((a) => (
                <RecordFile key={a.id} kind="tasks" recordId={d.id} file={a} />
              ))}
          </div>
        )}
        {!d.attachments.length && (
          <p className={css.muted}>No supporting files yet.</p>
        )}
      </section>
    </div>
  );
}
