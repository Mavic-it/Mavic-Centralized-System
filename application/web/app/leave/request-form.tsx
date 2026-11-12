"use client";
import { FieldLabel } from "../components/field-label";
import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../components/ui/modal";
import { Button } from "../components/ui/button";
import { randomUuid } from "../lib/random-uuid";
import { api, send, useAction } from "./api";
import {
  addCalendarDays,
  effectiveNoticeDays,
  noticeLabel,
} from "./filing-dates";
import { ErrorState, Loading } from "./ui";
import type { LeaveType, Preview } from "./types";
import css from "./leave.module.css";
export function RequestForm({ onClose }: { onClose: () => void }) {
  const clock = useQuery({
    queryKey: ["leave", "filing-time"],
    queryFn: () => api<{ serverNow: string; today: string }>("/me/filing-time"),
    staleTime: 0,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
  const [fromInput, setFrom] = useState(""),
    [toInput, setTo] = useState(""),
    [typeId, setType] = useState(""),
    [halfDay, setHalf] = useState(false),
    [key] = useState(randomUuid);
  const types = useQuery({
    queryKey: ["leave", "own-types", fromInput || clock.data?.today],
    queryFn: () =>
      api<LeaveType[]>(
        `/me/types?from=${encodeURIComponent(fromInput || clock.data!.today)}`,
      ),
    enabled: !!clock.data && !clock.isError,
  });
  const selected = types.data?.find((t) => t.id === typeId);
  const notice = selected
    ? effectiveNoticeDays(selected.code, selected.policy.minimumNoticeDays ?? 0)
    : 0;
  const earliest = clock.data ? addCalendarDays(clock.data.today, notice) : "";
  const from = fromInput || earliest;
  const to = toInput || from;
  const valid =
    !!clock.data &&
    !clock.isError &&
    !!typeId &&
    !!from &&
    !!to &&
    from <= to &&
    from >= earliest &&
    from.slice(0, 4) === to.slice(0, 4);
  const preview = useQuery({
    queryKey: ["leave", "preview", typeId, from, to, halfDay],
    queryFn: () =>
      send<Preview>("/me/preview", {
        typeId,
        startDate: from,
        endDate: to,
        halfDay,
      }),
    enabled: valid,
    retry: false,
  });
  const submit = useAction(
    (body: FormData) => api("/me/requests", { method: "POST", body }),
    "Leave request submitted.",
    onClose,
  );
  const insufficient = !!(
    selected?.policy.paid &&
    selected.policy.blockInsufficient &&
    preview.data &&
    (preview.data.afterApproval ?? 0) < 0
  );
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !valid ||
      !preview.data ||
      preview.isFetching ||
      submit.isPending ||
      insufficient
    )
      return;
    const form = new FormData(event.currentTarget);
    form.set("typeId", typeId);
    form.set("startDate", from);
    form.set("endDate", to);
    form.set("halfDay", String(halfDay));
    form.set("submissionKey", key);
    form.set("reason", String(form.get("reason") ?? "").trim());
    const file = form.get("document");
    if (file instanceof File && !file.size) form.delete("document");
    submit.mutate(form);
  }
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="request-leave-title"
      busy={submit.isPending}
      onClose={onClose}
    >
      <header className={css.dialogHeader}>
        <div>
          <h2 id="request-leave-title">Request leave</h2>
          <p className={css.muted}>
            Choose your dates and review the charge before submitting.
          </p>
        </div>
        <Button variant="ghost" onClick={onClose} disabled={submit.isPending}>
          Close
        </Button>
      </header>
      <form onSubmit={save}>
        <div className={css.form}>
          {types.isPending ? (
            <Loading />
          ) : types.isError ? (
            <ErrorState
              error={types.error}
              retry={() => void types.refetch()}
            />
          ) : null}
          {clock.isPending && (
            <p role="status">Getting current Philippine time…</p>
          )}
          {clock.isError && (
            <ErrorState
              error={clock.error}
              retry={() => void clock.refetch()}
            />
          )}
          {clock.data && (
            <p className={css.muted}>
              Current Philippine date and time:{" "}
              {new Intl.DateTimeFormat("en-PH", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "Asia/Manila",
              }).format(new Date(clock.data.serverNow))}{" "}
              (PHT). Updated every 30 seconds.
            </p>
          )}
          <div className={css.fields}>
            <p className={`${css.notice} ${css.wide}`}>
              Vacation Leave and Leave Without Pay must be filed at least 3
              calendar days before the first leave day. Other types follow their
              displayed policy notice.
            </p>
            <label className={css.wide}>
              <FieldLabel required={true}>Leave type</FieldLabel>
              <select
                required
                value={typeId}
                onChange={(e) => {
                  setType(e.target.value);
                  const nextType = types.data?.find(
                    (t) => t.id === e.target.value,
                  );
                  const start = clock.data
                    ? addCalendarDays(
                        clock.data.today,
                        nextType
                          ? effectiveNoticeDays(
                              nextType.code,
                              nextType.policy.minimumNoticeDays ?? 0,
                            )
                          : 0,
                      )
                    : "";
                  setFrom(start);
                  setTo(start);
                  setHalf(false);
                }}
                disabled={submit.isPending || types.isFetching}
              >
                <option value="">
                  {types.data?.length
                    ? "Select an eligible leave type"
                    : "No eligible types — contact HR"}
                </option>
                {types.data?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · {t.policy.paid ? "Paid" : "Unpaid"}
                  </option>
                ))}
              </select>
              {selected && (
                <small>
                  {noticeLabel(notice)} Earliest start: {earliest} (PHT). Dates
                  follow the selected leave type.
                </small>
              )}
            </label>
            <label>
              <FieldLabel required={true}>Start date</FieldLabel>
              <input
                type="date"
                required
                value={from}
                min={earliest || undefined}
                onChange={(e) => {
                  setFrom(e.target.value);
                  if (toInput && toInput < e.target.value)
                    setTo(e.target.value);
                  setHalf(false);
                }}
                disabled={submit.isPending || !clock.data || clock.isError}
              />
            </label>
            <label>
              <FieldLabel required={true}>End date</FieldLabel>
              <input
                type="date"
                required
                min={from}
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setHalf(false);
                }}
                disabled={submit.isPending || !clock.data || clock.isError}
              />
            </label>
            {selected?.policy.halfDay && from === to && (
              <label className={css.check}>
                <input
                  type="checkbox"
                  checked={halfDay}
                  onChange={(e) => setHalf(e.target.checked)}
                  disabled={submit.isPending}
                />
                Half day
              </label>
            )}
            <label className={css.wide}>
              <FieldLabel required={true}>Reason</FieldLabel>
              <textarea
                name="reason"
                rows={3}
                maxLength={1000}
                required
                disabled={submit.isPending}
              />
            </label>
            {selected && selected.policy.attachmentRule !== "NONE" && (
              <label className={css.wide}>
                <FieldLabel
                  required={selected.policy.attachmentRule === "REQUIRED"}
                >
                  Supporting document
                </FieldLabel>
                <input
                  name="document"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  required={selected.policy.attachmentRule === "REQUIRED"}
                  disabled={submit.isPending}
                />
                <small>PDF, PNG or JPEG, up to 5 MB.</small>
              </label>
            )}
          </div>
          {from && earliest && from < earliest && (
            <p role="alert" className={css.notice}>
              Choose {earliest} or later for this leave type (PHT).
            </p>
          )}
          {from.slice(0, 4) !== to.slice(0, 4) && (
            <p role="alert">
              Please split leave that crosses a credit year into separate
              requests.
            </p>
          )}
          {preview.isFetching && valid && (
            <p role="status">Calculating working days and available credits…</p>
          )}
          {preview.isError && valid && (
            <ErrorState
              error={preview.error}
              retry={() => void preview.refetch()}
            />
          )}
          {preview.data && valid && (
            <div role="status" aria-live="polite">
              <dl className={css.preview}>
                {[
                  ["Available", preview.data.available ?? "Credit-free"],
                  ["Reserved / pending", preview.data.reserved],
                  ["Requested days", preview.data.days],
                  [
                    "After approval",
                    preview.data.afterApproval ?? "No deduction",
                  ],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className={css.muted}>
                {preview.data.fallback
                  ? "Monday–Friday fallback applies where no schedule is assigned."
                  : "Counted from your assigned working schedule."}{" "}
                Configured holidays are excluded.
              </p>
            </div>
          )}
          {insufficient && (
            <p role="alert" className={css.notice}>
              Insufficient available credits. Ask HR to review your balance or
              choose eligible unpaid leave.
            </p>
          )}
          {submit.error && <ErrorState error={submit.error} />}
        </div>
        <footer className={css.footer}>
          <Button
            type="button"
            variant="outline"
            disabled={submit.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              !valid ||
              !selected ||
              !preview.data ||
              preview.isFetching ||
              preview.isError ||
              insufficient ||
              submit.isPending
            }
          >
            {submit.isPending ? "Submitting…" : "Submit request"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
