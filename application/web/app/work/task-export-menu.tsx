"use client";

import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { useRef, useState } from "react";
import css from "./workspace.module.css";

export function TaskExportMenu({
  filters,
  kind = "tasks",
}: {
  filters: Record<string, string>;
  kind?: "tasks" | "incidents";
}) {
  const [busy, setBusy] = useState<"xlsx" | "pdf" | "">("");
  const [error, setError] = useState("");
  const menu = useRef<HTMLDetailsElement>(null);

  async function download(format: "xlsx" | "pdf") {
    if (busy) return;
    setBusy(format);
    setError("");
    try {
      const query = new URLSearchParams(
        Object.entries(filters).filter(([, value]) => !!value),
      );
      query.set("format", format);
      const response = await fetch(
        `/api/work/${kind}/${kind === "tasks" ? "export" : "report-export"}?${query}`,
        { cache: "no-store" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const message = Array.isArray(body?.message)
          ? body.message.join(" ")
          : body?.message;
        throw new Error(message ?? `Unable to export ${kind}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${kind}-${format === "xlsx" ? "export.xlsx" : "report.pdf"}`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      menu.current?.removeAttribute("open");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : `Unable to export ${kind}.`,
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className={css.taskExportWrap}>
      <details className={css.taskExport} ref={menu}>
        <summary
          aria-label={
            kind === "tasks" ? "Export task list" : "Export incident list"
          }
        >
          <Download size={16} aria-hidden="true" />
          <span>{busy ? "Preparing…" : "Export"}</span>
        </summary>
        <div
          className={css.taskExportMenu}
          aria-label={
            kind === "tasks" ? "Task export format" : "Incident export format"
          }
        >
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void download("xlsx")}
          >
            <FileSpreadsheet size={16} aria-hidden="true" />
            Excel (.xlsx)
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void download("pdf")}
          >
            <FileText size={16} aria-hidden="true" />
            PDF report
          </button>
        </div>
      </details>
      {error && (
        <span className={css.taskExportError} role="alert">
          {error}
        </span>
      )}
      <span className={css.srOnly} aria-live="polite">
        {busy ? `Preparing ${busy === "xlsx" ? "Excel" : "PDF"} export.` : ""}
      </span>
    </div>
  );
}
