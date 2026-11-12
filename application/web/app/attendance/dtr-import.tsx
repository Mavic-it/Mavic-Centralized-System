"use client";
import { RequiredMark } from "../components/required-mark";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Upload,
  CheckCircle2,
  CircleAlert,
  FileSpreadsheet,
  X,
} from "lucide-react";
import {
  dtrRequest,
  jsonBody,
  type Batch,
  type Configuration,
  type ImportCalculation,
  type Override,
  type RecordRow,
} from "./dtr-client";
import { attendanceMonth, dtrCutoff, type DtrCutoff } from "./dtr-cutoff";
import { DtrOutputTable } from "./dtr-output-table";
import { Modal } from "../components/ui/modal";
import { useConfirmation } from "../components/ui/confirmation-provider";
import styles from "./dtr.module.css";

export function DtrImport({
  branchId,
  configuration,
  onSaved,
}: {
  branchId: string;
  configuration: Configuration;
  onSaved: (cutoff?: DtrCutoff) => void;
}) {
  const confirm = useConfirmation();
  const [activeStep, setActiveStep] = useState(0);
  const flowRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(0);
  useEffect(() => {
    if (previousStep.current === activeStep) return;
    previousStep.current = activeStep;
    flowRef.current
      ?.querySelector<HTMLElement>(`[data-import-step="${activeStep}"] h3`)
      ?.focus({ preventScroll: true });
    flowRef.current?.scrollIntoView({ block: "start" });
  }, [activeStep]);
  const [dayOverrides, setDayOverrides] = useState<
    Record<string, { employeeId: string; workDate: string } & Override>
  >({});
  const [editing, setEditing] = useState<RecordRow | null>(null);
  const [dayArrangement, setDayArrangement] = useState("NORMAL");
  const [dayStart, setDayStart] = useState("");
  const [dayEnd, setDayEnd] = useState("");
  const [dayRemarks, setDayRemarks] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [date, setDate] = useState("");
  const [month, setMonth] = useState(attendanceMonth);
  const [half, setHalf] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [overlap, setOverlap] = useState("REJECT");
  const [reason, setReason] = useState("");
  const [batchId, setBatchId] = useState("");
  const cutoff = dtrCutoff(month, half);
  const history = useQuery({
    queryKey: ["dtr-import-history", branchId],
    queryFn: () =>
      dtrRequest<{
        batches: { id: string; filename: string; status: string }[];
      }>(`history?branchId=${encodeURIComponent(branchId)}`),
  });
  function accept(value: Batch) {
    setBatch(value);
    setActiveStep(value.cutoff ? 2 : 1);
    setDayOverrides({});
    setEditing(null);
    setMapping(
      Object.fromEntries(
        value.identities.map((identity) => [
          identity.key,
          identity.employeeId ?? "",
        ]),
      ),
    );
    calculate.reset();
    commit.reset();
    if (value.cutoff) {
      setMonth(value.cutoff.from.slice(0, 7));
      setHalf(value.cutoff.from.endsWith("-11") ? "11-25" : "26-10");
    }
  }
  function selection() {
    if (!batch || !cutoff)
      throw new Error("Choose a file and a complete cutoff first.");
    return {
      branchId,
      ...cutoff,
      dayOverrides: Object.values(dayOverrides),
      mappings: Object.entries(mapping)
        .filter(([, employeeId]) => employeeId)
        .map(([key, employeeId]) => ({ key, employeeId })),
    };
  }
  const upload = useMutation({
    mutationFn: async () => {
      if (!file || !cutoff)
        throw new Error("Choose a file and a complete cutoff first.");
      const data = new FormData();
      data.set("branchId", branchId);
      data.set("file", file);
      data.set("from", cutoff.from);
      data.set("to", cutoff.to);
      if (templateId) data.set("templateId", templateId);
      if (date) data.set("date", date);
      return dtrRequest<Batch>("preview", { method: "POST", body: data });
    },
    onSuccess: accept,
  });
  const resume = useMutation({
    mutationFn: () =>
      dtrRequest<Batch>(
        `batches/${encodeURIComponent(batchId)}?branchId=${encodeURIComponent(branchId)}`,
      ),
    onSuccess: accept,
  });
  const calculate = useMutation({
    mutationFn: (changes: typeof dayOverrides | undefined) =>
      dtrRequest<ImportCalculation>(
        `batches/${encodeURIComponent(batch!.id)}/calculate`,
        jsonBody({
          ...selection(),
          dayOverrides: Object.values(changes ?? dayOverrides),
        }),
      ),
    onSuccess: () => {
      setEditing(null);
      setActiveStep(3);
    },
    onError: () => {
      setEditing(null);
      setActiveStep(2);
    },
  });
  const commit = useMutation({
    mutationFn: async () => {
      if (!calculate.data || !batch)
        throw new Error("Calculate and review the output first.");
      if (
        overlap === "REPLACE" &&
        !(await confirm({
          title: "Replace unlocked attendance?",
          description:
            "Existing unlocked DTR rows in this cutoff will be replaced. Original files and audit history are retained. Approved or exported periods must be reopened first.",
          confirmLabel: "Replace and save",
          tone: "danger",
        }))
      )
        return null;
      return dtrRequest<{ saved: number; cutoff: DtrCutoff }>(
        `batches/${encodeURIComponent(batch.id)}/commit`,
        jsonBody({
          ...selection(),
          overlap,
          reason,
          reprocess: batch.status === "COMMITTED",
          contextHash: calculate.data.contextHash,
        }),
      );
    },
    onSuccess: (result) => {
      if (result) onSaved(result.cutoff);
    },
  });
  const busy =
    upload.isPending ||
    resume.isPending ||
    calculate.isPending ||
    commit.isPending;
  function changeSource() {
    setDayOverrides({});
    setEditing(null);
    setBatch(null);
    calculate.reset();
    commit.reset();
    upload.reset();
  }
  function changeCutoff() {
    if (batch && !batch.cutoff) {
      calculate.reset();
      commit.reset();
    } else changeSource();
  }
  const matchLabel: Record<string, string> = {
    SAVED_MAPPING: "Saved identification",
    EMPLOYEE_NUMBER: "Employee ID match",
    EXACT_NAME: "Unique full-name match",
    MANUAL_REQUIRED: "Manual identification needed",
  };
  const calculated = calculate.data;
  const unresolved = calculated?.invalidSourceRows ?? 0;
  const trailingDate = cutoff
    ? new Date(Date.parse(`${cutoff.to}T00:00:00Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;
  const requiredKeys = new Set(
    batch?.rows
      .filter(
        (row) =>
          cutoff &&
          row.date &&
          row.date >= cutoff.from &&
          row.date <= trailingDate!,
      )
      .map((row) => row.key),
  );
  const unidentified = [...requiredKeys].filter((key) => !mapping[key]).length;
  const identifiedCount =
    batch?.identities.filter((identity) => mapping[identity.key]).length ?? 0;
  const matchedAutomatically =
    batch?.identities.filter(
      (identity) =>
        identity.matchMethod !== "MANUAL_REQUIRED" &&
        mapping[identity.key] === identity.employeeId,
    ).length ?? 0;
  const stepLabels = [
    "Choose file",
    "Select cutoff",
    "Identify employees",
    "Review calculations",
  ];
  const availableSteps = [
    true,
    Boolean(file || batch),
    Boolean(batch && cutoff),
    Boolean(calculated),
  ];
  return (
    <div className={`${styles.workspace} ${styles.importFlow}`} ref={flowRef}>
      <div
        className={styles.importProgress}
        role="group"
        aria-label={`Step ${activeStep + 1} of 4`}
      >
        <ol className={styles.importSteps} aria-label="DTR import progress">
          {stepLabels.map((label, index) => (
            <li
              key={label}
              data-current={index === activeStep}
              data-complete={index < activeStep}
            >
              <button
                type="button"
                className={styles.importStepButton}
                aria-label={`Step ${index + 1}: ${label}`}
                aria-current={index === activeStep ? "step" : undefined}
                disabled={busy || !availableSteps[index]}
                onClick={() => setActiveStep(index)}
              >
                <span className={styles.importStepNumber}>{index + 1}</span>
                <span className={styles.importStepLabel}>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className={styles.importCurrentStep} role="status">
          Step {activeStep + 1} of 4: {stepLabels[activeStep]}
        </p>
      </div>
      <div className={styles.importCards}>
        <section
          className={styles.card}
          data-import-step="0"
          hidden={activeStep !== 0}
          aria-labelledby="dtr-file-title"
        >
          <div className={styles.importCardHeading}>
            <span className={styles.importCardIndex}>01</span>
            <div>
              <h3 id="dtr-file-title" tabIndex={-1}>
                Choose attendance file
              </h3>
              <p>Start with an Excel or CSV export from your DTR device.</p>
            </div>
          </div>
          <div
            className={styles.importDrop}
            data-has-file={Boolean(file)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (!busy) {
                setFile(event.dataTransfer.files[0] ?? null);
                changeSource();
              }
            }}
          >
            <input
              className={styles.importFileInput}
              id="dtr-file"
              type="file"
              accept=".xls,.xlsx,.csv"
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                changeSource();
              }}
            />
            <label className={styles.importDropLabel} htmlFor="dtr-file">
              <span className={styles.importDropIcon}>
                <Upload size={20} aria-hidden="true" />
              </span>
              <span className={styles.importDropCopy}>
                <strong>
                  {file
                    ? "Choose a different file"
                    : "Drag your file here, or browse"}
                </strong>
                <small>XLS, XLSX or CSV · maximum 8 MB</small>
              </span>
              <span className={styles.importBrowse}>Browse files</span>
            </label>
            {file && (
              <div className={styles.importSelectedFile}>
                <FileSpreadsheet size={17} aria-hidden="true" />
                <span>
                  <strong>{file.name}</strong>
                  <small>
                    {(file.size / (1024 * 1024)).toFixed(2)} MB · Ready to
                    preview
                  </small>
                </span>
                <button
                  type="button"
                  aria-label="Remove selected file"
                  disabled={busy}
                  onClick={() => {
                    setFile(null);
                    changeSource();
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>
          <details className={styles.importAdvanced}>
            <summary>File format options</summary>
            <label className={styles.field}>
              <span>Branch source template</span>
              <select
                value={templateId}
                disabled={busy}
                onChange={(event) => {
                  setTemplateId(event.target.value);
                  changeSource();
                }}
              >
                <option value="">
                  Auto-detect · ISO dates · strict pairing
                </option>
                {configuration.templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} · v{template.version}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Daily CSV date override</span>
              <input
                type="date"
                value={date}
                disabled={busy}
                onChange={(event) => {
                  setDate(event.target.value);
                  changeSource();
                }}
              />
            </label>
            <p className={styles.muted}>
              Date-named worksheets keep their own dates. Blank times remain
              missing.
            </p>
          </details>
          <details className={styles.importAdvanced}>
            <summary>Resume a stored import</summary>
            <label className={styles.field}>
              <span>Stored file</span>
              <select
                value={batchId}
                disabled={busy}
                onChange={(event) => setBatchId(event.target.value)}
              >
                <option value="">Select saved file</option>
                {history.data?.batches.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.filename} · {item.status}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.button}
              disabled={!batchId || busy}
              onClick={() => resume.mutate()}
            >
              Open saved preview
            </button>
            {history.error && (
              <p className={styles.error} role="alert">
                {history.error.message}
              </p>
            )}
          </details>
          <button
            type="button"
            className={`${styles.button} ${styles.primary} ${styles.importAction}`}
            disabled={!file || busy}
            onClick={() => setActiveStep(1)}
          >
            Continue to cutoff
          </button>
        </section>
        <section
          className={styles.card}
          data-import-step="1"
          hidden={activeStep !== 1}
          aria-labelledby="dtr-cutoff-title"
        >
          <div className={styles.importCardHeading}>
            <span className={styles.importCardIndex}>02</span>
            <div>
              <h3 id="dtr-cutoff-title" tabIndex={-1}>
                Choose payroll cutoff
              </h3>
              <p>{file?.name ?? batch?.filename}</p>
              <p>Attendance will be grouped and saved within this period.</p>
            </div>
          </div>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>
                Starting month
                <RequiredMark />
              </span>
              <input
                type="month"
                value={month}
                required
                disabled={busy}
                onChange={(event) => {
                  setMonth(event.target.value);
                  changeCutoff();
                }}
              />
            </label>
          </div>
          <fieldset className={styles.cutoffChoices}>
            <legend>Select cutoff dates</legend>
            <label data-selected={half === "11-25"}>
              <input
                type="radio"
                name="dtr-cutoff"
                value="11-25"
                checked={half === "11-25"}
                disabled={busy}
                onChange={() => {
                  setHalf("11-25");
                  changeCutoff();
                }}
              />
              <span>
                <strong>11–25</strong>
                <small>Same-month cutoff</small>
              </span>
            </label>
            <label data-selected={half === "26-10"}>
              <input
                type="radio"
                name="dtr-cutoff"
                value="26-10"
                checked={half === "26-10"}
                disabled={busy}
                onChange={() => {
                  setHalf("26-10");
                  changeCutoff();
                }}
              />
              <span>
                <strong>26–10</strong>
                <small>Spans into the following month</small>
              </span>
            </label>
          </fieldset>
          {cutoff ? (
            <p className={styles.cutoffSummary}>
              <span>Selected period</span>
              <strong>{cutoff.from}</strong>
              <span>to</span>
              <strong>{cutoff.to}</strong>
            </p>
          ) : (
            <p className={styles.muted}>
              Choose one of the two monthly payroll cutoffs.
            </p>
          )}
          <button
            type="button"
            className={`${styles.button} ${styles.primary} ${styles.importAction}`}
            disabled={(!file && !batch) || !cutoff || busy}
            onClick={() => (batch ? setActiveStep(2) : upload.mutate())}
          >
            {upload.isPending ? (
              "Reading file and matching employees…"
            ) : (
              <>
                <span>
                  {batch
                    ? "Continue to employee identification"
                    : "Preview file & match employees"}
                </span>
                <span aria-hidden="true">→</span>
              </>
            )}
          </button>

          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => setActiveStep(0)}
          >
            Back to file
          </button>
        </section>
      </div>
      {calculate.isPending && (
        <p role="status" className={styles.muted}>
          Calculating attendance...
        </p>
      )}
      {[upload.error, resume.error, calculate.error, commit.error]
        .filter(Boolean)
        .map((error, index) => (
          <p role="alert" className={styles.error} key={index}>
            {error?.message}
          </p>
        ))}
      {batch && (
        <section
          className={`${styles.card} ${styles.importStageCard}`}
          aria-labelledby="dtr-identification-title"
          data-import-step="2"
          hidden={activeStep !== 2}
        >
          <div className={styles.importCardHeading}>
            <span className={styles.importCardIndex}>03</span>
            <div>
              <h3 id="dtr-identification-title" tabIndex={-1}>
                Review employee identification
              </h3>
              <p>
                Confirm automatic matches and choose the correct employee where
                needed.
              </p>
            </div>
          </div>
          <p className={styles.muted}>
            {batch.filename} · {batch.sourceCount} retained source rows ·{" "}
            {batch.identities.length} source identities. Only attendance within
            the selected cutoff will be saved.
          </p>
          <div
            className={styles.identitySummary}
            aria-label="Identification progress"
          >
            <div>
              <strong>{batch.identities.length}</strong>
              <span>Source identities</span>
            </div>
            <div data-tone="success">
              <strong>{matchedAutomatically}</strong>
              <span>Matched automatically</span>
            </div>
            <div data-tone={unidentified ? "warning" : "success"}>
              <strong>{batch.identities.length - identifiedCount}</strong>
              <span>Still to identify</span>
            </div>
          </div>
          {batch.duplicate && (
            <p className={styles.notice}>
              This file and cutoff were previously saved. Reprocessing requires
              replacement and a reason.
            </p>
          )}
          <div
            className={`${styles.scroll} ${styles.importIdentityScroll}`}
            role="region"
            aria-label="Employee identification"
            tabIndex={0}
          >
            <table className={styles.table}>
              <caption>
                Unique employee IDs and full names are matched automatically.
                Review uncertain identification and choose the correct branch
                employee.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name / ID in file</th>
                  <th scope="col">Identification</th>
                  <th scope="col">System employee</th>
                </tr>
              </thead>
              <tbody>
                {batch.identities.map((identity) => (
                  <tr key={identity.key}>
                    <th scope="row">
                      {identity.name || identity.identifier}
                      <small>
                        {identity.identifier}{" "}
                        {identity.device && `· ${identity.device}`}
                      </small>
                    </th>
                    <td>
                      <span
                        className={styles.matchBadge}
                        data-warning={!mapping[identity.key]}
                      >
                        {mapping[identity.key] ? (
                          <CheckCircle2 size={14} aria-hidden="true" />
                        ) : (
                          <CircleAlert size={14} aria-hidden="true" />
                        )}
                        {mapping[identity.key] &&
                        mapping[identity.key] !== identity.employeeId
                          ? "Manually identified"
                          : matchLabel[
                              identity.matchMethod ?? "MANUAL_REQUIRED"
                            ]}
                      </span>
                      {identity.matchNote && (
                        <small>{identity.matchNote}</small>
                      )}
                    </td>
                    <td>
                      <select
                        className={styles.select}
                        aria-label={`Employee mapping for ${identity.name || identity.identifier}`}
                        value={mapping[identity.key] ?? ""}
                        disabled={busy}
                        onChange={(event) => {
                          setMapping({
                            ...mapping,
                            [identity.key]: event.target.value,
                          });
                          setDayOverrides({});
                          setEditing(null);
                          calculate.reset();
                          commit.reset();
                        }}
                      >
                        <option value="">
                          Choose employee — review required
                        </option>
                        {configuration.employees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} ({employee.employeeNumber})
                            {identity.suggestions.includes(employee.id)
                              ? " · suggested"
                              : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className={styles.importAdvanced}>
            <summary>
              Original normalized rows ({batch.rows.length}; first 100 shown)
            </summary>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Sheet / row</th>
                    <th>Date</th>
                    <th>Name / ID</th>
                    <th>IN / OUT / Punch</th>
                    <th>Diagnostics</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.rows.slice(0, 100).map((row) => (
                    <tr key={`${row.sheet}:${row.row}`}>
                      <td>
                        {row.sheet}:{row.row}
                      </td>
                      <td>{row.date ?? "Invalid"}</td>
                      <td>{row.name || row.identifier}</td>
                      <td>
                        {row.punch ??
                          `${row.actualIn ?? "Missing"} / ${row.actualOut ?? "Missing"}`}{" "}
                        {row.direction}
                      </td>
                      <td>
                        {row.status} {row.errors.join("; ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {unidentified > 0 && (
            <p role="status" className={styles.notice}>
              {unidentified} identities are unassigned. You can continue now;
              their attendance rows will be skipped. Return here to map them
              later.
            </p>
          )}
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => setActiveStep(1)}
          >
            Back to cutoff
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={!cutoff || busy}
            onClick={() => calculate.mutate(undefined)}
          >
            {calculate.isPending
              ? "Calculating against employee schedules…"
              : "Calculate & review output"}
          </button>
        </section>
      )}
      {calculated && (
        <section
          className={`${styles.card} ${styles.importStageCard}`}
          aria-labelledby="dtr-output-title"
          data-import-step="3"
          hidden={activeStep !== 3}
        >
          <div className={styles.importCardHeading}>
            <span className={styles.importCardIndex}>04</span>
            <div>
              <h3 id="dtr-output-title" tabIndex={-1}>
                Review calculated attendance
              </h3>
              <p>
                Check the source punches against each employee&apos;s scheduled
                hours.
              </p>
            </div>
          </div>
          <p className={styles.muted}>{batch?.filename}</p>
          <button
            type="button"
            className={styles.button}
            disabled={busy}
            onClick={() => setActiveStep(2)}
          >
            Back to employee identification
          </button>
          <p className={styles.cutoffSummary}>
            {calculated.cutoff.from} <span>through</span> {calculated.cutoff.to}
          </p>
          <p className={styles.muted}>
            Uses saved employee schedules, date-specific rosters, attendance
            rules, holidays and approved leave. Imported schedule columns never
            replace the approved schedule. OT is potential OT until approved.
          </p>
          <p className={styles.notice}>
            {calculated.rows.length} employee-days ·{" "}
            {calculated.unmappedSourceRows} source rows skipped because no
            system employee was selected · {calculated.outsideCutoffRows} rows
            outside this cutoff. Only mapped employees are included; missing
            calendar dates are not automatically absences.
          </p>
          {unresolved > 0 && (
            <p role="alert" className={styles.error}>
              {calculated.invalidSourceRows} invalid-date source rows. Correct
              the source file before saving.
            </p>
          )}
          {calculated.rows.length ? (
            <DtrOutputTable
              rows={calculated.rows}
              preview
              onReview={(row) => {
                setEditing(row);
                setDayArrangement(
                  row.data.override.arrangement ??
                    (row.data.calculation.statuses.includes("WFH")
                      ? "WFH"
                      : row.data.calculation.statuses.includes("OB")
                        ? "OB"
                        : "NORMAL"),
                );
                setDayStart(row.data.calculation.schedule?.shiftStart ?? "");
                setDayEnd(row.data.calculation.schedule?.shiftEnd ?? "");
                setDayRemarks(row.data.override.remarks ?? "");
              }}
            />
          ) : (
            <p className={styles.empty}>
              No matched attendance falls within this cutoff. Review the file
              dates and employee identification.
            </p>
          )}
          <p className={styles.muted}>
            Rows needing review can be saved as drafts. They are excluded from
            totals and cannot be approved or exported until resolved. Saving
            recalculates against the current schedules.
          </p>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Overlap handling</span>
              <select
                value={overlap}
                disabled={busy}
                onChange={(event) => setOverlap(event.target.value)}
              >
                <option value="REJECT">Reject existing employee-days</option>
                <option value="REPLACE">
                  Replace unlocked imported rows with audit history
                </option>
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Import / reprocess reason
                <RequiredMark />
              </span>
              <input
                value={reason}
                disabled={busy}
                minLength={3}
                maxLength={1000}
                required
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className={`${styles.button} ${styles.primary}`}
            disabled={
              busy ||
              Boolean(editing) ||
              calculate.isError ||
              unresolved > 0 ||
              calculated.rows.length === 0 ||
              reason.trim().length < 3
            }
            onClick={() => commit.mutate()}
          >
            {commit.isPending
              ? "Saving attendance…"
              : batch?.status === "COMMITTED"
                ? "Reprocess cutoff attendance"
                : "Confirm & save selected employees"}
          </button>
          {editing && (
            <Modal
              className={styles.modal}
              aria-labelledby="preview-day-title"
              busy={busy}
              onClose={() => setEditing(null)}
            >
              <form
                className={styles.card}
                aria-label="Change preview attendance day"
                onSubmit={(event) => {
                  event.preventDefault();
                  const key = `${editing.employeeId}:${editing.workDate}`;
                  const changedShift =
                    dayStart !==
                      editing.data.calculation.schedule?.shiftStart ||
                    dayEnd !== editing.data.calculation.schedule?.shiftEnd;
                  const changes = {
                    ...dayOverrides,
                    [key]: {
                      ...editing.data.override,
                      employeeId: editing.employeeId,
                      workDate: editing.workDate,
                      arrangement: dayArrangement as Override["arrangement"],
                      remarks: dayRemarks,
                      ...(changedShift
                        ? { shiftStart: dayStart, shiftEnd: dayEnd }
                        : {}),
                    },
                  };
                  setDayOverrides(changes);
                  calculate.mutate(changes);
                }}
              >
                <h3 id="preview-day-title">
                  {editing.employeeName} - {editing.workDate}
                </h3>
                <p className={styles.muted}>
                  Apply a sudden arrangement or shift change to this attendance
                  day. The weekly work schedule stays as saved. Remarks describe
                  the location or reason; remarks alone do not change
                  attendance.
                </p>
                <div className={styles.fields}>
                  <label className={styles.field}>
                    <span>
                      Work arrangement
                      <RequiredMark />
                    </span>
                    <select
                      required
                      value={dayArrangement}
                      onChange={(event) =>
                        setDayArrangement(event.target.value)
                      }
                    >
                      <option value="NORMAL">Office / normal</option>
                      <option value="WFH">WFH</option>
                      <option value="OB">OB (Official business)</option>
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>
                      Shift IN (branch time)
                      <RequiredMark />
                    </span>
                    <input
                      type="time"
                      required
                      value={dayStart}
                      onChange={(event) => setDayStart(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>
                      Shift OUT (branch time)
                      <RequiredMark />
                    </span>
                    <input
                      type="time"
                      required
                      value={dayEnd}
                      onChange={(event) => setDayEnd(event.target.value)}
                    />
                  </label>
                  <label className={styles.field}>
                    <span>
                      Remarks / where / reason
                      <RequiredMark />
                    </span>
                    <input
                      required
                      maxLength={1000}
                      value={dayRemarks}
                      onChange={(event) => setDayRemarks(event.target.value)}
                    />
                  </label>
                </div>
                <button className={styles.button} disabled={busy} type="submit">
                  Apply & recalculate day
                </button>{" "}
                <button
                  className={styles.button}
                  disabled={busy}
                  type="button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
              </form>
            </Modal>
          )}
        </section>
      )}
    </div>
  );
}
