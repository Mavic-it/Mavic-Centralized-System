"use client";

import { FieldLabel } from "../components/field-label";
import type { FormEvent } from "react";
import { LockKeyhole, MessageSquare } from "lucide-react";
import { actionLabels, label, type Context, type Detail } from "./types";
import { DetailOverview } from "./detail-overview";
import { AttachmentPicker } from "./attachment-picker";
import { ProgressEditor } from "./progress-editor";
import { RecordFile } from "./record-file";
import { IncidentDecisionFields } from "./incident-decision-fields";
import css from "./workspace.module.css";

export function IncidentWorkspace({
  detail,
  available,
  currentAction,
  employees,
  branches,
  reviewers,
  audience,
  busy,
  progress,
  onAction,
  onAudience,
  onProgress,
  onSubmit,
}: {
  detail: Detail;
  available: string[];
  currentAction: string;
  employees: Context["employees"];
  branches: Context["branches"];
  reviewers: Context["reviewers"];
  audience: string;
  busy: boolean;
  progress: string | null;
  onAction: (action: string) => void;
  onAudience: (audience: string) => void;
  onProgress: (progress: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const eventIds = new Set(detail.events.map((event) => event.id));
  const optionalMessage =
    detail.canManage &&
    ["COMMENT", "REVIEW", "RECEIVE", "ASSIGN_REVIEWER", "SET_SUBJECT"].includes(
      currentAction,
    );
  const unlinkedFiles = detail.attachments.filter(
    (attachment) => !eventIds.has(attachment.eventId),
  );

  return (
    <div className={css.incidentWorkspace}>
      <DetailOverview kind="incidents" detail={detail} />

      {!!available.length && (
        <form
          id="incident-update-composer"
          onSubmit={onSubmit}
          className={`${css.form} ${css.incidentComposer}`}
        >
          <fieldset disabled={busy}>
            <div className={css.incidentSectionHeading}>
              <MessageSquare size={18} aria-hidden="true" />
              <div>
                <h3>Next step</h3>
                <p>
                  Choose what you want to do, then add a message if needed.
                </p>
              </div>
            </div>
            <label>
              <FieldLabel required={true}>What would you like to do?</FieldLabel>
              <select
                required
                name="action"
                value={currentAction}
                onChange={(event) => onAction(event.target.value)}
              >
                {available.map((action) => (
                  <option key={action} value={action}>
                    {actionLabels[action]}
                  </option>
                ))}
              </select>
            </label>
            {currentAction === "ACKNOWLEDGE" && (
              <p className={css.notice}>
                Acknowledging receipt does not admit guilt or agree with the
                allegation.
              </p>
            )}
            {currentAction === "NOTICE" && (
              <p className={css.notice}>
                Include the allegation, relevant policy, response instructions,
                and any company-approved deadline. The concerned employee will
                receive this notice privately.
              </p>
            )}
            {currentAction === "DECIDE" && (
              <p className={css.notice}>
                Record the findings, explanation considered, policy basis and
                decision. No payroll or attendance adjustment is made.
              </p>
            )}
            {currentAction === "RESOLVE" && (
              <p className={css.notice}>
                Write the employee-visible resolution summary. Internal evidence
                and disciplinary decisions remain private.
              </p>
            )}
            {currentAction === "HR_ESCALATE" && (
              <p className={css.notice}>
                Choose an authorized HR reviewer. The referral reason remains
                internal.
              </p>
            )}
            {currentAction === "CLARIFY" && (
              <p className={css.notice}>
                Ask for the specific information needed to continue the review.
                Your message and any attached evidence follow the report&apos;s
                participant privacy.
              </p>
            )}
            {currentAction === "PROGRESS" && (
              <ProgressEditor
                value={progress ?? String(detail.progress ?? 0)}
                onChange={onProgress}
              />
            )}
            {currentAction === "SET_SUBJECT" && (
              <label>
                <FieldLabel required={true}>Concerned employee</FieldLabel>
                <select name="employeeId" required>
                  <option value="">Choose employee</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} /{" "}
                      {
                        branches.find(
                          (branch) => branch.id === employee.branchId,
                        )?.name
                      }
                    </option>
                  ))}
                </select>
              </label>
            )}
            {["ASSIGN_REVIEWER", "HR_ESCALATE"].includes(currentAction) && (
              <label>
                <FieldLabel required={true}>Designated reviewer</FieldLabel>
                <select name="reviewerId" required>
                  <option value="">Choose authorized reviewer</option>
                  {reviewers
                    .filter(
                      (reviewer) =>
                        currentAction !== "HR_ESCALATE" ||
                        !reviewer.role ||
                        ["SUPER_ADMIN", "HR_ADMIN"].includes(reviewer.role),
                    )
                    .map((reviewer) => (
                      <option key={reviewer.id} value={reviewer.id}>
                        {reviewer.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            {detail.canManage && currentAction === "COMMENT" && (
              <label>
                <FieldLabel required={true}>
                  Who can read this update?
                </FieldLabel>
                <select
                  required
                  value={audience}
                  onChange={(event) => onAudience(event.target.value)}
                >
                  <option value="INTERNAL">Case reviewers only</option>
                  <option value="REPORTER">Case reviewers and reporter</option>
                  <option value="SUBJECT">
                    Case reviewers and concerned employee
                  </option>
                </select>
              </label>
            )}
            <label>
              <FieldLabel required={!optionalMessage}>
                {[
                  "CLOSE",
                  "DECIDE",
                  "RESOLVE",
                  "WITHDRAW",
                  "DISMISS",
                  "CANCEL",
                  "CHANGES",
                ].includes(currentAction)
                  ? "Reason / decision"
                  : "Message"}
              </FieldLabel>
              <textarea
                name="message"
                rows={4}
                required={!optionalMessage}
                maxLength={8000}
                placeholder="Write a clear update for the selected action."
              />
            </label>
            {["RESOLVE", "DECIDE"].includes(currentAction) && (
              <IncidentDecisionFields
                key={currentAction}
                canApplyAction={
                  currentAction === "DECIDE" && detail.canDiscipline === true
                }
              />
            )}
            <AttachmentPicker key={detail.version} disabled={busy} />
            <button className={css.primary} disabled={busy}>
              {busy ? "Saving..." : actionLabels[currentAction]}
            </button>
          </fieldset>
        </form>
      )}

      <details
        className={css.incidentActivity}
        aria-labelledby="incident-history-title"
      >
        <summary className={css.incidentHistorySummary} id="incident-history-title">
          View report history ({detail.events.length})
        </summary>
        <div className={css.incidentSectionHeading}>
          <MessageSquare size={18} aria-hidden="true" />
          <div>
            <p>Read earlier updates and their attachments. Each update shows who can read it.</p>
          </div>
        </div>
        <ol className={css.timeline}>
          {detail.events.map((event) => (
            <li key={event.id}>
              <span className={css.timelineDot}>
                <MessageSquare size={13} aria-hidden="true" />
              </span>
              <div className={css.activityHeading}>
                <strong>{label(event.action)}</strong>
                <span className={css.audienceBadge}>
                  <LockKeyhole size={12} aria-hidden="true" />
                  {event.audience === "INTERNAL"
                    ? "Case reviewers only"
                    : event.audience === "REPORTER"
                      ? "Reviewers and reporter"
                      : event.audience === "SUBJECT"
                        ? "Reviewers and concerned employee"
                        : "Record participants"}
                </span>
              </div>
              <small>
                {event.actor && `${event.actor} · `}
                {new Date(event.createdAt).toLocaleString()}
              </small>
              <p className={css.prose}>{event.message}</p>
              {event.details?.findings && (
                <dl className={css.recordMetadata}>
                  <div>
                    <dt>Findings</dt>
                    <dd className={css.prose}>{event.details.findings}</dd>
                  </div>
                  <div>
                    <dt>Outcome</dt>
                    <dd>
                      {event.details.outcome === "CONFIRMED"
                        ? "Violation confirmed"
                        : "No violation established"}
                    </dd>
                  </div>
                  <div>
                    <dt>Disciplinary action</dt>
                    <dd>{label(event.details.disciplinaryAction ?? "NONE")}</dd>
                  </div>
                  {event.details.actionDetails && (
                    <div>
                      <dt>Action details</dt>
                      <dd className={css.prose}>
                        {event.details.actionDetails}
                      </dd>
                    </div>
                  )}
                </dl>
              )}
              {detail.attachments
                .filter((attachment) => attachment.eventId === event.id)
                .map((file) => (
                  <RecordFile
                    key={file.id}
                    kind="incidents"
                    recordId={detail.id}
                    file={file}
                  />
                ))}
            </li>
          ))}
        </ol>
        {!detail.events.length && (
          <p className={css.empty}>No authorized updates are available.</p>
        )}
        {!!unlinkedFiles.length && (
          <div className={css.fileList}>
            {unlinkedFiles.map((file) => (
              <RecordFile
                key={file.id}
                kind="incidents"
                recordId={detail.id}
                file={file}
              />
            ))}
          </div>
        )}
      </details>
    </div>
  );
}
