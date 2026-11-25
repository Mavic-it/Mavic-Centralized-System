"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../components/ui/modal";
import {
  inquiryApi,
  label,
  statuses,
  type Detail,
  type Inquiry,
  type Metadata,
} from "./types";
import { LoadingFields } from "../components/content-loading";
import css from "./workspace.module.css";

export function InquiryDetail({
  id,
  meta,
  onClose,
  onEdit,
  onChanged,
}: {
  id: string;
  meta: Metadata;
  onClose: () => void;
  onEdit: (r: Inquiry) => void;
  onChanged: () => void;
}) {
  const query = useQuery({
    queryKey: ["inquiries", "detail", id],
    queryFn: () => inquiryApi<Detail>(`/${id}`),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmArchive, setConfirmArchive] = useState(false);
  async function act(path: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      await inquiryApi(`/${id}${path}`, body);
      await query.refetch();
      onChanged();
      setConfirmArchive(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function status(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void act("/action", {
      version: query.data!.record.version,
      status: f.get("status"),
      reason: f.get("reason") || undefined,
    });
  }
  const r = query.data?.record;
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="inquiry-detail-title"
      onClose={onClose}
      busy={busy}
    >
      <div className={css.sections}>
        <div className={css.header}>
          <h2 id="inquiry-detail-title">{r?.reference ?? "Inquiry details"}</h2>
          <button onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        {query.isPending ? (
          <LoadingFields
            label="Loading inquiry details"
            labels={["Client", "Inquiry", "Assignment", "Activity timeline"]}
          />
        ) : query.isError ? (
          <div role="alert" className={css.error}>
            {query.error.message}
            <button onClick={() => query.refetch()}>Retry</button>
          </div>
        ) : (
          r && (
            <>
              <div>
                <h2>{r.clientName}</h2>
                <p>
                  {r.branchName} · {r.inquiryDate ?? "Date needs review"} ·{" "}
                  {r.assignedStaffName ?? "Unassigned"}
                </p>
                <p>
                  <span className={css.badge} data-status={r.status}>
                    {label(r.status)}
                  </span>{" "}
                  {r.legacyOutcome &&
                    `Legacy outcome: ${label(r.legacyOutcome)}`}
                </p>
              </div>
              <div className={css.fields}>
                <div>
                  <strong>Services</strong>
                  <p>
                    {r.serviceIds
                      .map(
                        (id) =>
                          meta.lookups.find((l) => l.id === id)?.label ?? id,
                      )
                      .join(", ") || "Needs review"}
                  </p>
                </div>
                <div>
                  <strong>Preferred branches</strong>
                  <p>
                    {r.preferredBranchIds
                      .map(
                        (id) =>
                          meta.branches.find((b) => b.id === id)?.name ?? id,
                      )
                      .join(", ")}
                  </p>
                </div>
                <div>
                  <strong>Client contacts</strong>
                  <p>
                    {[
                      r.client.email,
                      r.client.phone,
                      r.client.companyName,
                      r.client.contactPerson,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No contact information recorded"}
                  </p>
                </div>
                <div>
                  <strong>Requirements</strong>
                  <p>{r.requirements || "None recorded"}</p>
                </div>
              </div>
              <div>
                <strong>Description</strong>
                <p>{r.description || "None recorded"}</p>
                <p>{r.notes}</p>
              </div>
              {error && (
                <div role="alert" className={css.error}>
                  {error}
                </div>
              )}
              <div className={css.actions}>
                {meta.permissions.convert &&
                  !r.archivedAt &&
                  r.serviceIds.some(
                    (id) => meta.lookups.find((l) => l.id === id)?.reservable,
                  ) && (
                    <Link
                      className={css.button}
                      href={`/reservations/list?inquiryId=${encodeURIComponent(r.id)}`}
                    >
                      Create Reservation from Inquiry
                    </Link>
                  )}
                {meta.permissions.update && !r.archivedAt && (
                  <button disabled={busy} onClick={() => onEdit(r)}>
                    Edit inquiry
                  </button>
                )}
                {meta.permissions.archive && (
                  <button
                    disabled={busy}
                    onClick={() => setConfirmArchive(true)}
                  >
                    {r.archivedAt ? "Restore" : "Archive"}
                  </button>
                )}
              </div>
              {confirmArchive && (
                <FormLayout
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("/action", {
                      version: r.version,
                      archived: !r.archivedAt,
                      reason: f.get("reason"),
                    });
                  }}
                >
                  <h2>
                    {r.archivedAt ? "Restore inquiry" : "Archive inquiry"}
                  </h2>
                  <p>
                    {r.archivedAt
                      ? "The inquiry will return to active lists."
                      : "The record and its history will be retained. Open tasks will be hidden from active queues."}
                  </p>
                  <label>
                    Reason <span className={css.required}>*</span>
                    <input required name="reason" maxLength={1000} />
                  </label>
                  <div className={css.actions}>
                    <button
                      type="button"
                      onClick={() => setConfirmArchive(false)}
                    >
                      Cancel
                    </button>
                    <button disabled={busy} type="submit">
                      Confirm
                    </button>
                  </div>
                </FormLayout>
              )}
              {meta.permissions.update && !r.archivedAt && (
                <FormLayout onSubmit={status}>
                  <h2>Update status</h2>
                  <div className={css.fields}>
                    <label>
                      Status
                      <select name="status" defaultValue={r.status}>
                        {statuses
                          .filter(
                            (s) =>
                              ![
                                "NEEDS_REVIEW",
                                "RESERVED",
                                "CONVERTED",
                                "PENDING_RESERVATION",
                              ].includes(s) || s === r.status,
                          )
                          .map((s) => (
                            <option key={s} value={s}>
                              {label(s)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Reason (required for loss or reopening)
                      <input
                        name="reason"
                        maxLength={1000}
                        list="lost-reasons"
                      />
                      <datalist id="lost-reasons">
                        {meta.lookups
                          .filter((l) => l.kind === "LOST_REASON" && l.active)
                          .map((l) => (
                            <option key={l.id} value={l.label} />
                          ))}
                      </datalist>
                    </label>
                  </div>
                  <button disabled={busy}>Save status</button>
                </FormLayout>
              )}
              {meta.permissions.convert &&
                !r.archivedAt &&
                r.serviceIds.some((id) => {
                  const l = meta.lookups.find((l) => l.id === id);
                  return (
                    l &&
                    !l.reservable &&
                    ![
                      "Location Inquiry",
                      "Availability Inquiry",
                      "Amenities Inquiry",
                      "Other",
                    ].includes(l.label)
                  );
                }) && (
                  <FormLayout
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act("/convert-service", {
                        version: r.version,
                        evidence: f.get("evidence"),
                      });
                    }}
                  >
                    <h2>Confirm service conversion</h2>
                    <label>
                      Confirmation evidence
                      <textarea required name="evidence" maxLength={5000} />
                    </label>
                    <button disabled={busy}>Confirm successful service</button>
                  </FormLayout>
                )}
              <section>
                <h2>Follow-ups</h2>
                {!query.data?.tasks.length && <p>No follow-ups scheduled.</p>}
                {query.data?.tasks.map((t) => (
                  <div className={css.panel} key={t.id}>
                    <strong>{t.description}</strong>
                    <p>
                      {new Date(t.dueAt).toLocaleString()} · {label(t.status)}
                    </p>
                    {t.result && <p>{t.result}</p>}
                    {t.status === "OPEN" &&
                      !r.archivedAt &&
                      meta.permissions.manageFollowups && (
                        <FormLayout
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(`/tasks/${t.id}`, {
                              status: f.get("status"),
                              version: t.version ?? 1,
                              result: f.get("result"),
                            });
                          }}
                        >
                          <label>
                            Result
                            <input required name="result" maxLength={5000} />
                          </label>
                          <select aria-label="Follow-up outcome" name="status">
                            <option value="COMPLETED">Completed</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                          <button disabled={busy}>Record result</button>
                        </FormLayout>
                      )}
                    {t.status === "OPEN" &&
                      !r.archivedAt &&
                      meta.permissions.manageFollowups && (
                        <details>
                          <summary>Reschedule follow-up</summary>
                          <FormLayout
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              void act(`/tasks/${t.id}/reschedule`, {
                                version: t.version ?? 1,
                                dueAt: new Date(
                                  String(f.get("dueAt")),
                                ).toISOString(),
                                reason: f.get("reason"),
                              });
                            }}
                          >
                            <label>
                              New due date and time
                              <input
                                required
                                name="dueAt"
                                type="datetime-local"
                              />
                            </label>
                            <label>
                              Rescheduling reason
                              <input required name="reason" maxLength={1000} />
                            </label>
                            <button disabled={busy}>Save new schedule</button>
                          </FormLayout>
                        </details>
                      )}
                  </div>
                ))}
                {meta.permissions.manageFollowups && !r.archivedAt && (
                  <FormLayout
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act("/tasks", {
                        description: f.get("description"),
                        dueAt: new Date(String(f.get("dueAt"))).toISOString(),
                        actionType: f.get("actionType"),
                        priority: f.get("priority"),
                      });
                    }}
                  >
                    <div className={css.fields}>
                      <label>
                        Next action
                        <input name="description" required maxLength={1000} />
                      </label>
                      <label>
                        Action type
                        <select name="actionType">
                          {[
                            "FOLLOW_UP",
                            "CALL",
                            "MESSAGE",
                            "EMAIL",
                            "OCULAR",
                            "OTHER",
                          ].map((v) => (
                            <option key={v} value={v}>
                              {label(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Priority
                        <select name="priority">
                          {["NORMAL", "LOW", "HIGH", "URGENT"].map((v) => (
                            <option key={v} value={v}>
                              {label(v)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Due date and time
                        <input name="dueAt" type="datetime-local" required />
                      </label>
                    </div>
                    <button disabled={busy}>Schedule follow-up</button>
                  </FormLayout>
                )}
              </section>
              {meta.permissions.activities && !r.archivedAt && (
                <FormLayout
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("/activities", {
                      type: f.get("type"),
                      description: f.get("description"),
                    });
                  }}
                >
                  <h2>Add activity</h2>
                  <label>
                    Activity type
                    <select name="type">
                      {[
                        "CALL",
                        "MESSAGE",
                        "EMAIL",
                        "PROPOSAL",
                        "PRICELIST",
                        "VISIT",
                        "OCULAR",
                        "NOTE",
                        "FOLLOW_UP_RESULT",
                      ].map((v) => (
                        <option key={v} value={v}>
                          {label(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Description
                    <textarea name="description" required maxLength={5000} />
                  </label>
                  <button disabled={busy}>Record activity</button>
                </FormLayout>
              )}
              {query.data?.importSource && (
                <details>
                  <summary>
                    Imported source: {query.data.importSource.worksheet} / row{" "}
                    {query.data.importSource.rowNumber}
                  </summary>
                  <p>
                    Batch {query.data.importSource.batchId} ? imported{" "}
                    {new Date(
                      query.data.importSource.importedAt,
                    ).toLocaleString()}
                  </p>
                  <p>
                    {query.data.importSource.normalized.warnings?.join("; ")}
                  </p>
                  <p>
                    Historical reservation date:{" "}
                    {query.data.importSource.normalized.reservationDate ??
                      "Unresolved"}{" "}
                    ? Historical follow-up date:{" "}
                    {query.data.importSource.normalized.followUpDate ??
                      "Unresolved"}
                  </p>
                  <pre
                    style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                  >
                    {JSON.stringify(
                      query.data.importSource.normalized.raw,
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
              {!!query.data?.reservations?.length && (
                <section>
                  <h2>Linked reservations</h2>
                  {query.data.reservations.map((b) => (
                    <p key={b.id}>
                      <Link
                        href={`/reservations/list?search=${encodeURIComponent(b.reference)}`}
                      >
                        {b.reference}
                      </Link>{" "}
                      ? {label(b.status)} ?{" "}
                      {new Date(b.startAt).toLocaleString()}
                    </p>
                  ))}
                </section>
              )}
              <section>
                <h2>Activity timeline</h2>
                <ol className={css.timeline}>
                  {query.data?.events.map((ev) => (
                    <li key={ev.id}>
                      <strong>{label(ev.type)}</strong>
                      <p>{ev.description}</p>
                      {ev.newStatus && (
                        <p>
                          {ev.previousStatus &&
                            `${label(ev.previousStatus)} → `}
                          {label(ev.newStatus)}
                        </p>
                      )}
                      <time>
                        {ev.occurredAt
                          ? new Date(ev.occurredAt).toLocaleString()
                          : "Historical activity · original time unknown"}{" "}
                        · {ev.actorName ?? "Historical actor"}
                      </time>
                    </li>
                  ))}
                </ol>
              </section>
            </>
          )
        )}
      </div>
    </Modal>
  );
}
