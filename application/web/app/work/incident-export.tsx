"use client";
import { TaskExportMenu } from "./task-export-menu";

export function IncidentExport({
  filters,
}: {
  filters: Record<string, string>;
}) {
  return <TaskExportMenu kind="incidents" filters={filters} />;
}
