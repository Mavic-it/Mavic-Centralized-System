"use client";
import { useState } from "react";
import { Modal } from "../components/ui/modal";
import { inquiryApi, type Metadata } from "./types";
import css from "./workspace.module.css";
type Preview = {
  checksum: string;
  total: number;
  skipped: number;
  sheets: {
    name: string;
    headerRow: number;
    headers: string[];
    columns: Record<string, number>;
  }[];
  rows: {
    sheet: string;
    row: number;
    clientName: string;
    date: string | null;
    status: string;
    warnings: string[];
    duplicate: boolean;
    serviceIds: string[];
    channelId?: string;
    sourceId?: string;
    skip: boolean;
  }[];
};
export function InquiryImport({
  meta,
  onClose,
  onSaved,
}: {
  meta: Metadata;
  onClose: () => void;
  onSaved: () => void;
}) {
  type Correction = {
    clientName?: string;
    date?: string;
    status?: string;
    serviceIds?: string[];
    channelId?: string;
    sourceId?: string;
    reason?: string;
    skip?: boolean;
  };
  const [options, setOptions] = useState<{
    mapping: Record<
      string,
      { headerRow: number; columns: Record<string, number> }
    >;
    corrections: Record<string, Correction>;
  }>({ mapping: {}, corrections: {} });
  const [dirty, setDirty] = useState(false);
  const fields = [
    "date",
    "reservationDate",
    "clientName",
    "location",
    "services",
    "channel",
    "source",
    "action",
    "nextAction",
    "followUpDate",
    "status",
    "reason",
    "remarks",
  ];
  function correct(key: string, patch: Correction) {
    setOptions((old) => ({
      ...old,
      corrections: {
        ...old.corrections,
        [key]: { ...old.corrections[key], ...patch },
      },
    }));
    setDirty(true);
  }
  const [file, setFile] = useState<File | null>(null),
    [branch, setBranch] = useState(meta.branches[0]?.id ?? ""),
    [staff, setStaff] = useState(meta.userId),
    [preview, setPreview] = useState<Preview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<{
      imported: number;
      duplicates: number;
      review: number;
    } | null>(null);
  async function run(confirm: boolean) {
    if (!file) return;
    setBusy(true);
    setError("");
    const form = new FormData();
    form.set("file", file);
    form.set("branchId", branch);
    form.set("assignedStaffId", staff);
    form.set("options", JSON.stringify(options));
    if (preview) form.set("checksum", preview.checksum);
    try {
      if (confirm) {
        setResult(await inquiryApi("/import/confirm", form));
        onSaved();
      } else {
        setPreview(await inquiryApi("/import/preview", form));
        setDirty(false);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="inquiry-import-title"
      busy={busy}
      onClose={onClose}
    >
      <div className={css.sections}>
        <div className={css.header}>
          <h2 id="inquiry-import-title">Import inquiries</h2>
          <button disabled={busy} onClick={onClose}>
            Close
          </button>
        </div>
        <p>
          Upload → validate and preview → confirm. Legacy reserved records stay
          historical; uncertain values are marked Needs Review. Handling
          ownership is selected explicitly for this batch.
        </p>
        {error && (
          <div role="alert" className={css.error}>
            {error}
          </div>
        )}
        {result ? (
          <div role="status">
            Imported {result.imported}; skipped {result.duplicates} exact
            duplicates; {result.review} rows flagged for review.
          </div>
        ) : (
          <>
            <div className={css.fields}>
              <label>
                Workbook or CSV
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setPreview(null);
                    setOptions({ mapping: {}, corrections: {} });
                    setDirty(false);
                  }}
                />
              </label>
              <label>
                Handling branch
                <select
                  value={branch}
                  disabled={busy}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setPreview(null);
                  }}
                >
                  {meta.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Assignee
                <select
                  value={staff}
                  disabled={busy}
                  onChange={(e) => {
                    setStaff(e.target.value);
                    setPreview(null);
                  }}
                >
                  {meta.staff
                    .filter((s) => !s.branchId || s.branchId === branch)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <button disabled={!file || busy} onClick={() => run(false)}>
              {busy ? "Processing…" : "Validate and preview"}
            </button>
            {preview && (
              <>
                <details>
                  <summary>Review column mapping</summary>
                  {preview.sheets.map((sheet) => (
                    <fieldset key={sheet.name}>
                      <legend>{sheet.name}</legend>
                      <div className={css.fields}>
                        <label>
                          Header row
                          <input
                            type="number"
                            min={1}
                            max={5000}
                            value={
                              options.mapping[sheet.name]?.headerRow ??
                              sheet.headerRow
                            }
                            onChange={(e) => {
                              setOptions((old) => ({
                                ...old,
                                mapping: {
                                  ...old.mapping,
                                  [sheet.name]: {
                                    headerRow: Number(e.target.value),
                                    columns:
                                      old.mapping[sheet.name]?.columns ??
                                      sheet.columns,
                                  },
                                },
                              }));
                              setDirty(true);
                            }}
                          />
                        </label>
                        {fields.map((field) => (
                          <label key={field}>
                            {field.replace(/([A-Z])/g, " $1")}
                            <select
                              value={
                                options.mapping[sheet.name]?.columns[field] ??
                                sheet.columns[field] ??
                                -1
                              }
                              onChange={(e) => {
                                setOptions((old) => ({
                                  ...old,
                                  mapping: {
                                    ...old.mapping,
                                    [sheet.name]: {
                                      headerRow:
                                        old.mapping[sheet.name]?.headerRow ??
                                        sheet.headerRow,
                                      columns: {
                                        ...(old.mapping[sheet.name]?.columns ??
                                          sheet.columns),
                                        [field]: Number(e.target.value),
                                      },
                                    },
                                  },
                                }));
                                setDirty(true);
                              }}
                            >
                              <option value={-1}>Not mapped</option>
                              {sheet.headers.map((header, n) => (
                                <option key={n} value={n}>
                                  {String.fromCharCode(65 + n)} ·{" "}
                                  {header || "Blank header"}
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </details>
                <p>
                  {preview.total} rows · {preview.skipped} skipped headers,
                  empty rows or pivot sheets. Exact duplicates will be skipped;
                  ambiguous records retain source values for review.
                </p>
                <div className={css.scroll}>
                  <table className={css.table}>
                    <thead>
                      <tr>
                        {[
                          "Worksheet / Row",
                          "Client",
                          "Date",
                          "Status",
                          "Validation",
                        ].map((h) => (
                          <th scope="col" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.slice(0, 100).map((r) => (
                        <tr key={`${r.sheet}-${r.row}`}>
                          <td>
                            {r.sheet} / {r.row}
                          </td>
                          <td>
                            <input
                              aria-label={`Client at ${r.sheet} row ${r.row}`}
                              maxLength={200}
                              value={
                                options.corrections[`${r.sheet}:${r.row}`]
                                  ?.clientName ?? r.clientName
                              }
                              onChange={(e) =>
                                correct(`${r.sheet}:${r.row}`, {
                                  clientName: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`Inquiry date at ${r.sheet} row ${r.row}`}
                              type="date"
                              value={
                                options.corrections[`${r.sheet}:${r.row}`]
                                  ?.date ??
                                r.date ??
                                ""
                              }
                              onChange={(e) =>
                                correct(`${r.sheet}:${r.row}`, {
                                  date: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td>
                            <select
                              aria-label={`Status at ${r.sheet} row ${r.row}`}
                              value={
                                options.corrections[`${r.sheet}:${r.row}`]
                                  ?.status ?? r.status
                              }
                              onChange={(e) =>
                                correct(`${r.sheet}:${r.row}`, {
                                  status: e.target.value,
                                })
                              }
                            >
                              {[
                                "NEW",
                                "IN_PROGRESS",
                                "FOLLOW_UP",
                                "NO_RESPONSE",
                                "OCULAR_SCHEDULED",
                                "PROPOSAL_SENT",
                                "LOST",
                                "CLOSED",
                                "NEEDS_REVIEW",
                              ].map((v) => (
                                <option key={v} value={v}>
                                  {v.replaceAll("_", " ")}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            {r.duplicate
                              ? "Exact duplicate · skip"
                              : r.warnings.join("; ") || "Valid"}
                            <details>
                              <summary>Resolve or skip row</summary>
                              <label>
                                Channel
                                <select
                                  value={
                                    options.corrections[`${r.sheet}:${r.row}`]
                                      ?.channelId ??
                                    r.channelId ??
                                    ""
                                  }
                                  onChange={(e) =>
                                    correct(`${r.sheet}:${r.row}`, {
                                      channelId: e.target.value || undefined,
                                    })
                                  }
                                >
                                  <option value="">Needs review</option>
                                  {meta.lookups
                                    .filter(
                                      (l) => l.kind === "CHANNEL" && l.active,
                                    )
                                    .map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {l.label}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <label>
                                Services
                                <select
                                  multiple
                                  value={
                                    options.corrections[`${r.sheet}:${r.row}`]
                                      ?.serviceIds ?? r.serviceIds
                                  }
                                  onChange={(e) =>
                                    correct(`${r.sheet}:${r.row}`, {
                                      serviceIds: Array.from(
                                        e.target.selectedOptions,
                                        (o) => o.value,
                                      ),
                                    })
                                  }
                                >
                                  {meta.lookups
                                    .filter(
                                      (l) => l.kind === "SERVICE" && l.active,
                                    )
                                    .map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {l.label}
                                      </option>
                                    ))}
                                </select>
                              </label>
                              <label>
                                Lost reason
                                <input
                                  maxLength={1000}
                                  value={
                                    options.corrections[`${r.sheet}:${r.row}`]
                                      ?.reason ?? ""
                                  }
                                  onChange={(e) =>
                                    correct(`${r.sheet}:${r.row}`, {
                                      reason: e.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                Skip this row
                                <input
                                  type="checkbox"
                                  checked={
                                    options.corrections[`${r.sheet}:${r.row}`]
                                      ?.skip ?? r.skip
                                  }
                                  onChange={(e) =>
                                    correct(`${r.sheet}:${r.row}`, {
                                      skip: e.target.checked,
                                    })
                                  }
                                />
                              </label>
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>Preview displays the first 100 rows.</p>
                <button
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(preview.rows, null, 2)],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "inquiry-import-validation.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download validation results
                </button>
                <button
                  className={css.primary}
                  disabled={busy || dirty || preview.total === 0}
                  onClick={() => run(true)}
                >
                  Confirm import
                </button>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
