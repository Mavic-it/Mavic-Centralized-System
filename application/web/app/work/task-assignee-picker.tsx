"use client";

import { Search, UserRound, X } from "lucide-react";
import { useState } from "react";
import { PersonAvatar } from "../components/person-avatar";
import type { Context } from "./types";
import css from "./workspace.module.css";
import { RequiredMark } from "../components/required-mark";

export function TaskAssigneePicker({
  employees,
  branches,
  selected,
  onChange,
}: {
  employees: Context["employees"];
  branches: Context["branches"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const matches = employees.filter((employee) => {
    const branch = branches.find((item) => item.id === employee.branchId)?.name;
    return `${employee.name} ${branch ?? ""}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });
  const selectedEmployees = employees.filter((employee) =>
    selected.includes(employee.id),
  );
  const missingEmailCount = selectedEmployees.filter(
    (employee) => employee.taskEmailReady === false,
  ).length;
  const unselectedMatches = matches.filter(
    (employee) => !selected.includes(employee.id),
  );
  const remaining = Math.max(0, 50 - selected.length);
  const visibleIds = unselectedMatches
    .slice(0, remaining)
    .map((employee) => employee.id);

  function toggle(id: string, checked: boolean) {
    onChange(
      checked
        ? selected.length < 50 && !selected.includes(id)
          ? [...selected, id]
          : selected
        : selected.filter((item) => item !== id),
    );
  }

  return (
    <section
      className={css.assigneePicker}
      aria-labelledby="task-assignees-title"
    >
      <div className={css.taskAssigneeHeader}>
        <div>
          <h3 id="task-assignees-title">
            Assignees
            <RequiredMark />
          </h3>
          <p>Choose who will work on this task together.</p>
        </div>
        <span className={css.taskAssigneeCount}>
          {selected.length} <span>/ 50</span>
        </span>
      </div>

      {selectedEmployees.length > 0 && (
        <div className={css.selectedAssignees} aria-label="Selected assignees">
          {selectedEmployees.map((employee) => (
            <button
              type="button"
              key={employee.id}
              aria-label={`Remove ${employee.name}`}
              onClick={() => toggle(employee.id, false)}
            >
              <span>{employee.name}</span>
              <X size={14} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      <div className={css.assigneeSearchRow}>
        <label className={css.assigneeSearch}>
          <Search size={17} aria-hidden="true" />
          <span className={css.srOnly}>Search employees by name or branch</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search employee or branch"
          />
        </label>
        <div className={css.assigneeActions}>
          <button
            type="button"
            className={css.assigneeAction}
            disabled={!visibleIds.length}
            onClick={() => onChange([...selected, ...visibleIds])}
          >
            Add visible{visibleIds.length ? ` (${visibleIds.length})` : ""}
          </button>
          <button
            type="button"
            className={css.assigneeAction}
            disabled={!selected.length}
            onClick={() => onChange([])}
          >
            Clear
          </button>
        </div>
      </div>

      {selected.length === 50 && (
        <p className={css.assigneeHint} role="status">
          The 50-person limit is reached. Remove someone to add another.
        </p>
      )}
      <div
        className={css.taskAssignees}
        role="group"
        aria-label="Available employees"
      >
        {matches.map((employee) => {
          const checked = selected.includes(employee.id);
          const branch = branches.find(
            (item) => item.id === employee.branchId,
          )?.name;
          return (
            <label
              className={css.taskAssigneeOption}
              key={employee.id}
              data-selected={checked}
            >
              <input
                type="checkbox"
                value={employee.id}
                checked={checked}
                disabled={!checked && selected.length >= 50}
                onChange={(event) => toggle(employee.id, event.target.checked)}
              />
              <PersonAvatar
                className={css.taskAssigneeAvatar}
                employeeId={employee.id}
                name={employee.name}
                profilePictureUpdatedAt={employee.profilePictureUpdatedAt}
                size={34}
                fallback={
                  employee.name.trim() ? undefined : <UserRound size={15} />
                }
              />
              <span className={css.taskAssigneeText}>
                <strong>{employee.name}</strong>
                <small>
                  {branch ?? "Branch unavailable"}
                  {employee.taskEmailReady === false
                    ? " · Task email unavailable"
                    : ""}
                </small>
              </span>
            </label>
          );
        })}
        {!matches.length && (
          <p className={css.assigneeEmpty}>
            {employees.length
              ? "No employees match your search."
              : "No active employees in your authorized branches."}
          </p>
        )}
      </div>
      {missingEmailCount > 0 && (
        <p className={css.assigneeWarning} role="status">
          {missingEmailCount} selected{" "}
          {missingEmailCount === 1 ? "employee does" : "employees do"} not have
          an active eligible account with a valid email address, so they will
          not receive task email notifications.
        </p>
      )}
      <p className={css.assigneeHint}>
        {selected.length
          ? "Everyone selected shares this task, its progress, and updates."
          : "Select at least one employee. All assignees share the task and its updates."}
      </p>
    </section>
  );
}
