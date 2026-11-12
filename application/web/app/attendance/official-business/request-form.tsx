"use client";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { FieldLabel } from "../../components/field-label";
import { randomUuid } from "../../lib/random-uuid";
import { useConfirmation } from "../../components/ui/confirmation-provider";
import { obApi, obDate } from "./api";
import type { ObContext, ObDraft, ObRangePreview } from "./types";
import { ObAttendancePreview } from "./attendance-preview";
import css from "./ob.module.css";
export function ObRequestForm({
  context,
  onClose,
  onSaved,
}: {
  context: ObContext;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [draft, setDraft] = useState<ObDraft>({
    employeeId: context.ownEmployee?.id ?? context.employees[0]?.id,
    workDate: "",
    endDate: "",
    startTime: "",
    endTime: "",
    destination: "",
    reason: "",
    submissionKey: randomUuid(),
  });
  const [preview, setPreview] = useState<ObRangePreview | null>(null);
  const confirm = useConfirmation();
  const check = useMutation({
    mutationFn: () => obApi<ObRangePreview>("/preview", draft),
    onSuccess: (r) => setPreview(r),
  });
  const save = useMutation({
    mutationFn: () => obApi<{ id: string }>("/requests", draft),
    onSuccess: (r) => onSaved(r.id),
  });
  const busy = check.isPending || save.isPending;
  function update<K extends keyof ObDraft>(key: K, value: ObDraft[K]) {
    setDraft((d) => ({
      ...d,
      [key]: value,
      ...(key === "workDate" && (!d.endDate || d.endDate < String(value))
        ? { endDate: String(value) }
        : {}),
    }));
    setPreview(null);
    check.reset();
    save.reset();
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!preview) {
      check.mutate();
      return;
    }
    if (
      await confirm({
        title: "Submit Official Business request?",
        description:
          "A request for each scheduled workday will be sent for approval. Attendance changes only after approval.",
        confirmLabel: "Submit OB",
      })
    )
      save.mutate();
  }
  return (
    <Modal
      presentation="drawer"
      className={`${css.modal} ${css.filingDrawer}`}
      aria-labelledby="ob-form-title"
      onClose={onClose}
      busy={busy}
    >
      <header className={css.modalHeader}>
        <div>
          <p className={css.eyebrow}>Attendance request</p>
          <h2 id="ob-form-title">File Official Business</h2>
        </div>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Close
        </Button>
      </header>
      <form onSubmit={(e) => void submit(e)}>
        <div className={css.formGrid}>
          <fieldset disabled={busy} className={css.fields}>
            <section
              className={css.formSection}
              aria-labelledby="ob-schedule-title"
            >
              <h3 id="ob-schedule-title">Schedule</h3>
              {context.canReview && (
                <label>
                  <FieldLabel required>Employee</FieldLabel>
                  <select
                    required
                    value={draft.employeeId ?? ""}
                    onChange={(e) => update("employeeId", e.target.value)}
                  >
                    <option value="">Choose employee</option>
                    {context.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className={css.twoColumns}>
                <label>
                  <FieldLabel required>OB start date</FieldLabel>
                  <input
                    required
                    type="date"
                    value={draft.workDate}
                    onChange={(e) => update("workDate", e.target.value)}
                  />
                </label>
                <label>
                  <FieldLabel required>OB end date</FieldLabel>
                  <input
                    required
                    type="date"
                    min={draft.workDate || undefined}
                    value={draft.endDate}
                    onChange={(e) => update("endDate", e.target.value)}
                  />
                </label>
              </div>
              <small>
                Use the same date for one day. Times apply to each workday; rest
                days and holidays are skipped. An earlier end time means the
                following morning.
              </small>
              <div className={css.twoColumns}>
                <label>
                  <FieldLabel required>Estimated start</FieldLabel>
                  <input
                    required
                    type="time"
                    value={draft.startTime}
                    onChange={(e) => update("startTime", e.target.value)}
                  />
                </label>
                <label>
                  <FieldLabel required>Estimated end</FieldLabel>
                  <input
                    required
                    type="time"
                    value={draft.endTime}
                    onChange={(e) => update("endTime", e.target.value)}
                  />
                </label>
              </div>
            </section>
            <section
              className={css.formSection}
              aria-labelledby="ob-assignment-title"
            >
              <h3 id="ob-assignment-title">Assignment details</h3>
              <div className={css.assignmentColumns}>
                <label>
                  <FieldLabel required>
                    Destination / field assignment
                  </FieldLabel>
                  <input
                    required
                    maxLength={200}
                    value={draft.destination}
                    onChange={(e) => update("destination", e.target.value)}
                  />
                </label>
                <label>
                  <FieldLabel>Destination branch</FieldLabel>
                  <select
                    value={draft.destinationBranchId ?? ""}
                    onChange={(e) =>
                      update("destinationBranchId", e.target.value || undefined)
                    }
                  >
                    <option value="">Field / client location</option>
                    {context.branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                <FieldLabel required>Business purpose / reason</FieldLabel>
                <textarea
                  required
                  maxLength={2000}
                  value={draft.reason}
                  onChange={(e) => update("reason", e.target.value)}
                />
              </label>
            </section>
          </fieldset>
          <div>
            {preview ? (
              <div className={css.fields}>
                {!!preview.skipped?.length && (
                  <p className={css.notice}>
                    Skipped rest days / holidays:{" "}
                    {preview.skipped.map(obDate).join(", ")}
                  </p>
                )}
                <p>
                  {preview.days?.length ?? 1} workday request(s) will be filed
                  for individual approval.
                </p>
                {preview.days ? (
                  preview.days.map((day) => (
                    <div key={day.workDate}>
                      <h3>{obDate(day.workDate)}</h3>
                      <ObAttendancePreview calculation={day.calculation} />
                    </div>
                  ))
                ) : (
                  <ObAttendancePreview calculation={preview.calculation} />
                )}
              </div>
            ) : (
              <section className={css.preview}>
                <h3>Review before filing</h3>
                <p>
                  Enter your assignment, then preview its schedule and
                  attendance impact.
                </p>
                <p>
                  Times are estimates. No biometric punches will be created. OB
                  does not use leave credits or automatically grant overtime.
                </p>
              </section>
            )}
          </div>
        </div>
        {(check.error || save.error) && (
          <p className={css.error} role="alert">
            {(check.error || save.error)?.message}
          </p>
        )}
        <footer className={css.footer}>
          <span role="status">
            {busy
              ? "Processing request..."
              : preview
                ? "Preview ready. You may submit for approval."
                : ""}
          </span>
          <Button type="submit" disabled={busy || !draft.employeeId}>
            {busy
              ? "Processing..."
              : preview
                ? "Submit OB"
                : "Preview attendance"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
