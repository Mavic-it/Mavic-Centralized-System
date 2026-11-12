import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { IconActionButton } from "./icon-action-button";
import { hrRequest } from "./people-workspace-services";
import { employmentTypeLabel } from "./employee-employment-options";
import type { EmployeeAssignmentHistoryApiRecord } from "./people-workspace-types";
import styles from "./employee-assignment-history-card.module.css";

const eventLabels: Record<
  EmployeeAssignmentHistoryApiRecord["eventType"],
  string
> = {
  INITIAL: "Initial assignment",
  TRANSFER: "Branch transfer",
  PROMOTION: "Position change",
  STATUS_CHANGE: "Employment status change",
  ASSIGNMENT_CHANGE: "Assignment update",
};

function formatDate(value: string | null): string {
  if (!value) return "Date not recorded";
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(date.getTime())) return "Date not recorded";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatRecordedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recorded date unavailable";
  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatValue(value: string | null | undefined): string {
  if (!value) return "Not assigned";
  return value.replaceAll("_", " ");
}

export default function EmployeeAssignmentHistoryCard({
  employeeId,
}: {
  employeeId: string;
}) {
  const [filter, setFilter] = useState("ALL");
  const historyQuery = useQuery({
    queryKey: ["employee-assignment-history", employeeId],
    queryFn: () =>
      hrRequest<EmployeeAssignmentHistoryApiRecord[]>(
        "employees",
        `/${encodeURIComponent(employeeId)}/assignment-history`,
      ),
    enabled: Boolean(employeeId),
  });

  return (
    <section
      data-employee-panel
      className={styles.card}
      aria-labelledby="assignment-history-title"
    >
      <div className={styles.cardHeader}>
        <h2 id="assignment-history-title">Assignment history</h2>
        {!historyQuery.isPending && !historyQuery.isError && (
          <span className={styles.count}>
            {historyQuery.data?.length ?? 0} events
          </span>
        )}
      </div>

      {historyQuery.isPending && (
        <div
          aria-label="Loading assignment history"
          aria-busy="true"
          className={styles.skeleton}
          role="status"
        >
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonMeta} />
          <div className={styles.skeletonGrid}>
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
      )}

      {historyQuery.isError && (
        <div className={styles.error} role="alert">
          <p>
            {historyQuery.error.message || "Unable to load assignment history."}
          </p>
          <IconActionButton
            icon={RefreshCw}
            label="Retry loading assignment history"
            disabled={historyQuery.isFetching}
            onClick={() => void historyQuery.refetch()}
          />
        </div>
      )}

      {!historyQuery.isPending &&
        !historyQuery.isError &&
        (historyQuery.data?.length ? (
          <>
            <div className={styles.toolbar}>
              <p>Explore recorded moves and role changes.</p>
              <label>
                Event type{" "}
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="ALL">All events</option>
                  {Object.entries(eventLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!historyQuery.data.some(
              (event) => filter === "ALL" || event.eventType === filter,
            ) && <p className={styles.empty}>No events match this filter.</p>}
            <ol aria-label="Employee assignment events" className={styles.list}>
              {historyQuery.data
                .filter(
                  (event) => filter === "ALL" || event.eventType === filter,
                )
                .map((event, index) => (
                  <li className={styles.event} key={event.id}>
                    <details open={index === 0}>
                      <summary className={styles.eventHeader}>
                        <span className={styles.marker} aria-hidden="true" />
                        <div className={styles.eventHeading}>
                          <h3>{eventLabels[event.eventType]}</h3>
                          <p>
                            Effective {formatDate(event.effectiveDate)} ·
                            Recorded {formatRecordedAt(event.recordedAt)}
                          </p>
                        </div>
                      </summary>
                      <dl className={styles.assignmentGrid}>
                        <div>
                          <dt>Branch</dt>
                          <dd>{event.branchName}</dd>
                        </div>
                        <div>
                          <dt>Department</dt>
                          <dd>{event.department}</dd>
                        </div>
                        <div>
                          <dt>Position</dt>
                          <dd>{event.position}</dd>
                        </div>
                        <div>
                          <dt>Reports to</dt>
                          <dd>{formatValue(event.manager)}</dd>
                        </div>
                        <div>
                          <dt>Employment type</dt>
                          <dd>{employmentTypeLabel(event.employmentType)}</dd>
                        </div>
                        <div>
                          <dt>Status</dt>
                          <dd>{formatValue(event.status)}</dd>
                        </div>
                      </dl>
                      <p className={styles.actor}>
                        {event.changedByName
                          ? `Recorded by ${event.changedByName}`
                          : "Recorded by system"}
                      </p>
                    </details>
                  </li>
                ))}
            </ol>
          </>
        ) : (
          <p className={styles.empty} role="status">
            No assignment history has been recorded yet.
          </p>
        ))}
    </section>
  );
}
