"use client";

import { FieldLabel } from "../components/field-label";
import { BookmarkPlus, CalendarClock, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TaskTemplate } from "./types";
import css from "./workspace.module.css";
import { RequiredMark } from "../components/required-mark";

export function TaskAutomationOptions({
  templates,
  loading,
  error,
  branchName,
  selectedTemplateId,
  onTemplateChange,
  onRetry,
  onSaveTemplate,
  savingTemplate,
  disabled,
  recurrence,
  recurrenceEndDate,
  startDate,
  repeatBlocked,
  onRecurrenceChange,
  onEndDateChange,
}: {
  templates: TaskTemplate[];
  loading: boolean;
  error: string;
  branchName: string;
  selectedTemplateId: string;
  onTemplateChange: (id: string) => void;
  onRetry: () => void;
  onSaveTemplate: (name: string) => Promise<boolean>;
  savingTemplate: boolean;
  disabled: boolean;
  recurrence: "" | "DAILY" | "WEEKLY" | "MONTHLY";
  recurrenceEndDate: string;
  startDate: string;
  repeatBlocked: boolean;
  onRecurrenceChange: (value: "" | "DAILY" | "WEEKLY" | "MONTHLY") => void;
  onEndDateChange: (value: string) => void;
}) {
  const [savingName, setSavingName] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const templateNameInput = useRef<HTMLInputElement>(null);
  const selected = templates.find(
    (template) => template.id === selectedTemplateId,
  );
  useEffect(() => {
    if (savingName) templateNameInput.current?.focus();
  }, [savingName]);

  async function saveTemplate() {
    if (!templateName.trim() || savingTemplate) return;
    if (await onSaveTemplate(templateName.trim())) {
      setTemplateName("");
      setSavingName(false);
    }
  }

  return (
    <section
      className={css.taskAutomation}
      aria-label="Task templates and schedule"
    >
      <div className={css.taskAutomationHeading}>
        <span className={css.taskAutomationIcon} aria-hidden="true">
          <CalendarClock size={17} />
        </span>
        <div>
          <h3>Templates & repeat schedule</h3>
          <p>Reuse a task or create this task again automatically.</p>
        </div>
      </div>

      <div className={css.taskAutomationGrid}>
        <label>
          <span>
            Task template · {branchName || "Choose an assignee branch"}
          </span>
          <select
            value={selectedTemplateId}
            disabled={disabled || loading || !branchName}
            onChange={(event) => onTemplateChange(event.target.value)}
          >
            <option value="">Start without a template</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
                {template.isSystem ? " · Shared" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Repeat task</span>
          <select
            value={recurrence}
            disabled={disabled}
            onChange={(event) =>
              onRecurrenceChange(
                event.target.value as "" | "DAILY" | "WEEKLY" | "MONTHLY",
              )
            }
          >
            <option value="">Does not repeat</option>
            <option value="DAILY" disabled={repeatBlocked}>
              Every day
            </option>
            <option value="WEEKLY" disabled={repeatBlocked}>
              Every week
            </option>
            <option value="MONTHLY" disabled={repeatBlocked}>
              Every month
            </option>
          </select>
        </label>
      </div>

      {repeatBlocked && (
        <p className={css.taskAutomationNotice} role="status">
          Recurring tasks need all assignees to belong to the same branch.
          Select one branch’s assignees to repeat this task.
        </p>
      )}

      <div className={css.taskTemplateFooter}>
        {loading ? (
          <span className={css.muted} role="status">
            Loading templates…
          </span>
        ) : error ? (
          <span className={css.taskTemplateError} role="alert">
            {error}{" "}
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          </span>
        ) : (
          <span className={css.muted} aria-live="polite">
            {selected
              ? `Using “${selected.name}”. Edit the fields above as needed.`
              : "Shared starter templates are available in every active branch."}
          </span>
        )}
        {!savingName ? (
          <button
            type="button"
            className={css.taskTemplateSaveButton}
            disabled={disabled || !branchName}
            onClick={() => setSavingName(true)}
          >
            <BookmarkPlus size={15} aria-hidden="true" />
            Save as template
          </button>
        ) : (
          <div className={css.taskTemplateSaveForm}>
            <label htmlFor="task-template-name">
              Template name
              <RequiredMark />
            </label>
            <input
              id="task-template-name"
              aria-required="true"
              ref={templateNameInput}
              value={templateName}
              maxLength={80}
              placeholder="Template name"
              disabled={disabled || savingTemplate}
              onChange={(event) => setTemplateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveTemplate();
                }
                if (event.key === "Escape") setSavingName(false);
              }}
            />
            <button
              type="button"
              disabled={disabled || savingTemplate || !templateName.trim()}
              onClick={() => void saveTemplate()}
            >
              {savingTemplate ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              disabled={savingTemplate}
              onClick={() => setSavingName(false)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {recurrence && (
        <div className={css.taskRepeatPanel}>
          <label>
            <FieldLabel required={true}>Repeat until</FieldLabel>
            <input
              type="date"
              value={recurrenceEndDate}
              min={firstRepeatDate(startDate, recurrence)}
              max={maxRecurrenceEnd(startDate)}
              required
              disabled={disabled}
              onChange={(event) => onEndDateChange(event.target.value)}
            />
          </label>
          <p>
            <RotateCcw size={14} aria-hidden="true" />
            Each new task keeps this task’s assignees, branch, priority, and
            due-date spacing. End date is within one year.
          </p>
        </div>
      )}
    </section>
  );
}

function maxRecurrenceEnd(startDate: string) {
  if (!startDate) return undefined;
  const date = new Date(`${startDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 365);
  return date.toISOString().slice(0, 10);
}

function firstRepeatDate(
  startDate: string,
  recurrence: "" | "DAILY" | "WEEKLY" | "MONTHLY",
) {
  if (!startDate || !recurrence) return startDate || undefined;
  const date = new Date(`${startDate}T00:00:00.000Z`);
  if (recurrence === "DAILY") date.setUTCDate(date.getUTCDate() + 1);
  else if (recurrence === "WEEKLY") date.setUTCDate(date.getUTCDate() + 7);
  else {
    const anchorDay = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + 1);
    const lastDay = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();
    date.setUTCDate(Math.min(anchorDay, lastDay));
  }
  return date.toISOString().slice(0, 10);
}
