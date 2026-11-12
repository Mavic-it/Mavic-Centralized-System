"use client";

import { useState } from "react";
import { TaskAssigneePicker } from "./task-assignee-picker";
import type { Context, Detail } from "./types";
import css from "./workspace.module.css";

export function TaskReassignment({
  detail,
  employees,
  branches,
  busy,
  onReassign,
}: {
  detail: Detail;
  employees: Context["employees"];
  branches: Context["branches"];
  busy: boolean;
  onReassign: (employeeIds: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  if (!detail.canReassign) return null;

  const currentIds =
    detail.assignees?.map((assignee) => assignee.id) ??
    (detail.employeeId ? [detail.employeeId] : []);
  const availableIds = new Set(employees.map((employee) => employee.id));
  const hasUnavailableCurrent = currentIds.some((id) => !availableIds.has(id));
  const unchanged =
    selected.length === currentIds.length &&
    currentIds.every((id) => selected.includes(id));

  function start() {
    setSelected(currentIds.filter((id) => availableIds.has(id)));
    setOpen(true);
  }

  async function submit() {
    if (!selected.length || unchanged || busy) return;
    if (await onReassign(selected)) setOpen(false);
  }

  return (
    <section className={css.taskReassignment} aria-labelledby="reassign-title">
      <div className={css.taskReassignmentHeading}>
        <div>
          <h3 id="reassign-title">Task assignees</h3>
          <p>Change who can work on and access this task.</p>
        </div>
        {!open ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls="task-reassignment-form"
            disabled={busy}
            onClick={start}
          >
            Reassign task
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            aria-expanded="true"
            aria-controls="task-reassignment-form"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        )}
      </div>
      <div
        className={css.taskReassignmentForm}
        id="task-reassignment-form"
        hidden={!open}
      >
        <fieldset disabled={busy}>
          <legend className={css.srOnly}>Select task assignees</legend>
          <TaskAssigneePicker
            employees={employees}
            branches={branches}
            selected={selected}
            onChange={setSelected}
          />
        </fieldset>
        {hasUnavailableCurrent && (
          <p className={css.notice} role="status">
            One or more current assignees are no longer active or in your branch
            scope. They cannot remain assigned; choose at least one active
            employee to continue.
          </p>
        )}
        <p className={css.muted} aria-live="polite">
          {selected.length} selected. Linked active accounts receive an in-app
          update; eligible email accounts also receive an assignment email.
          Removed assignees lose access to this task.
        </p>
        <button
          type="button"
          className={css.primary}
          disabled={busy || !selected.length || unchanged}
          onClick={() => void submit()}
        >
          {busy ? "Saving assignees..." : "Save assignees"}
        </button>
      </div>
    </section>
  );
}
