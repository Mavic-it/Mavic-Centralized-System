import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TaskAutomationOptions } from "./task-automation-options";
import type { TaskTemplate } from "./types";

const templates: TaskTemplate[] = [
  {
    id: "template-1",
    branchId: null,
    name: "Daily office inspection",
    title: "Daily office inspection",
    description: "Check shared spaces.",
    priority: "NORMAL",
    isSystem: true,
  },
];

function view(repeatBlocked = false) {
  return renderToStaticMarkup(
    <TaskAutomationOptions
      templates={templates}
      loading={false}
      error=""
      branchName="Mspaces Makati"
      selectedTemplateId=""
      onTemplateChange={vi.fn()}
      onRetry={vi.fn()}
      onSaveTemplate={vi.fn(async () => true)}
      savingTemplate={false}
      disabled={false}
      recurrence="WEEKLY"
      recurrenceEndDate="2026-11-26"
      startDate="2026-11-05"
      repeatBlocked={repeatBlocked}
      onRecurrenceChange={vi.fn()}
      onEndDateChange={vi.fn()}
    />,
  );
}

describe("task automation options", () => {
  it("offers shared and branch templates plus a bounded repeat schedule", () => {
    const html = view();
    expect(html).toContain("Daily office inspection");
    expect(html).toContain("Task template");
    expect(html).toContain('type="date"');
    expect(html).toContain("Repeat until");
    expect(html).toContain("Save as template");
  });

  it("explains why recurrence is unavailable for cross-branch assignees", () => {
    const html = view(true);
    expect(html).toContain("Recurring tasks need all assignees");
    expect(html).toContain('value="DAILY" disabled=""');
  });
});
