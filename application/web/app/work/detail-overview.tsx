import {
  Building2,
  CalendarDays,
  Flag,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { label, type Detail, type Kind } from "./types";
import { isClosed, isOverdue, workDate } from "./presentation";
import { ProgressBar, StatusBadge } from "./record-collection";
import css from "./workspace.module.css";
const timestamp = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(value))
    : "Not recorded";
export function DetailOverview({
  kind,
  detail: d,
}: {
  kind: Kind;
  detail: Detail;
}) {
  const brief = (
    <section className={css.descriptionPanel}>
      <h3>{kind === "tasks" ? "Task brief" : "What happened"}</h3>
      <p className={css.prose}>{d.description}</p>
      {kind === "incidents" && d.remarks && (
        <p className={`${css.prose} ${css.reportRemarks}`}>{d.remarks}</p>
      )}
    </section>
  );
  return (
    <div className={css.overview}>
      {kind === "tasks" && brief}
      <div className={css.statusPanel}>
        <div>
          <span className={css.sectionLabel}>Current status</span>
          <StatusBadge
            status={
              kind === "incidents" ? (d.workflowStatus ?? d.status) : d.status
            }
          />
        </div>
        {kind === "incidents" && !isClosed(d.status) && (
          <p className={css.muted}>
            {d.status === "DETAILS_REQUESTED"
              ? d.canManage ? "More information has been requested. Check the response before continuing your review." : "More information is needed. Read the request in history, then reply below."
              : d.isSubject && ["NOTICE_ISSUED", "AWAITING_RESPONSE"].includes(d.caseStatus ?? "")
                ? "You have received a notice. Read it in history and use the response option below."
                : d.canManage
                  ? "Read the report, then choose the next action below. Each update is saved in history."
                  : "Your report is being reviewed. You can read updates in history and add information below when available."}
          </p>
        )}
        {isClosed(d.status) && (
          <p className={css.muted}>
            {d.status === "RESOLVED"
              ? "This report is resolved. An authorized HR reviewer can finalize closure."
              : "This record is closed. Its history and authorized files remain available."}
          </p>
        )}
      </div>
      {kind === "incidents" && brief}
      {kind === "tasks" && (
        <section className={css.progressPanel}>
          <div>
            <h3>Completion</h3>
            <span>{d.progress ?? 0}%</span>
          </div>
          <ProgressBar value={d.progress ?? 0} />
          <p className={css.muted}>
            {d.status === "FOR_REVIEW"
              ? "Submitted for a manager to review."
              : d.status === "COMPLETED"
                ? "Completion accepted by an authorized manager."
                : "Progress is updated by the assigned employee."}
          </p>
        </section>
      )}
      {kind === "incidents" && d.caseStatus && (
        <section className={css.progressPanel}>
          <h3>Linked disciplinary case</h3>
          <p className={css.muted}>
            Notices, explanations and the final decision are recorded in the
            case history below.
          </p>
        </section>
      )}
      <dl className={css.recordMetadata}>
        {kind === "incidents" && (
          <>
            <div>
              <dt>Incident reference</dt>
              <dd className={css.reference}>
                {d.referenceNumber ?? "Not available"}
              </dd>
            </div>
            <div>
              <dt>Offense level</dt>
              <dd>
                {d.offense
                  ? `${["", "1st", "2nd", "3rd"][Number(d.offense)]} offense`
                  : "Not classified"}
              </dd>
            </div>
            <div>
              <dt>Who this report concerns</dt>
              <dd>
                {d.reportScope === "GENERAL" ? "General workplace" : "Branch"}
              </dd>
            </div>
            {d.closedAt && (
              <div>
                <dt>Closed</dt>
                <dd>{timestamp(d.closedAt)}</dd>
              </div>
            )}
          </>
        )}
        <div>
          <dt>
            <UserRound size={15} />
            {kind === "tasks" ? "Assignee" : "Concerned employee"}
          </dt>
          <dd>{d.employeeName ?? "General workplace report"}</dd>
        </div>
        <div>
          <dt>
            <Building2 size={15} />
            Branch
          </dt>
          <dd>{d.branchName}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={15} />
            {kind === "tasks" ? "Due date" : "Incident date"}
          </dt>
          <dd data-overdue={isOverdue(d)}>
            {workDate(d.dueDate ?? d.incidentDate)}
            {isOverdue(d) && <span className={css.overdueTag}>Overdue</span>}
          </dd>
        </div>
        <div>
          <dt>
            {kind === "tasks" ? <Flag size={15} /> : <LockKeyhole size={15} />}{" "}
            {kind === "tasks" ? "Priority" : "Category"}
          </dt>
          <dd>{label(d.priority ?? d.category ?? "Private case")}</dd>
        </div>
      </dl>
    </div>
  );
}
