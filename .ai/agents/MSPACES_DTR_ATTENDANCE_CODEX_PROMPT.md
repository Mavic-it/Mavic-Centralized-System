# Codex Implementation Prompt — Revise MSPACES DTR & Attendance

You are the senior full-stack engineer working inside my **existing MSPACES centralized HRIS/branch management system** in VS Code. **Implement** a revised, production-ready, branch-aware **Biometric excel file Import → Attendance Processing → Review/Correction → Saved DTR → Summary Dashboard → Excel/CSV Export** workflow. This is a modification of the current working system, **not a greenfield rewrite**. Inspect the repository, existing DTR/attendance pages, PostgreSQL schema, authentication, role/branch permissions, and existing export libraries **before making changes**. Reuse its architecture, design system (including shadcn/ui if already adopted), APIs, validation, loading skeletons, and coding conventions. Preserve unrelated modules and working functionality.

## 1. Reference files — support BOTH real-world input structures

Find and examine these user-supplied reference workbooks if they are present in the repository or a local accessible folder. If they are absent from the coding environment, use the exact specifications below and do not block implementation:

**Format A — raw biometric punch log (`Lea-Feb. 11 to 25, 2025.xls`)**
- Legacy `.xls`; a flat event log where one row represents **one biometric punch**, not a full attendance day.
- Headers visible in the reference: `Date And Time`, `Personnel ID`, `First Name`, `Last Name`, `Card Number`, `Device Name`, `Event Point`, `Verify Type`, `In/Out Status`, `Event Description`, `Remarks` (header spelling may vary).
- Example fields: timestamps like `2/25/2025 15:23`; numeric personnel ID `65`; first name `Lea`; `In/Out Status` values such as `Check-In` or `Check-Out`.
- Import ALL rows as source punches, not one row per employee. Sort chronologically and derive attendance dates/times with configurable pairing rules. The supplied example has apparently contradictory time/status sequences, so **do not blindly trust Check-In/Check-Out labels or swap times silently**. Flag suspicious sequences for review; allow documented branch-specific mapping and an option to use first/last valid punch where authorized.

**Format B — daily attendance workbook (`Attendance_2026-09-26_to_2026-10-10.xlsx`)**
- `.xlsx` with **15 date-named worksheets** (`2026-09-26` through `2026-10-10`). Each worksheet is a different attendance day, not a distinct import.
- Worksheet headers: `Name`, `Dept`, `Shift Start`, `Shift End`, `In`, `Out`, `Status`.
- Example time formats: `08:00`, `17:00`, `7:46 AM`, `5:08 PM`; statuses include `Present`, `Absent`, `Late`, `Early Out/No Out`, and combinations such as `Late & Early Out/No Out`.
- Extract the **attendance date from the worksheet name**; parse each employee row across every sheet. Blank cells remain missing, not numeric zero or a time. A source `Status` is advisory and can be compared with independently calculated status; inconsistencies become review exceptions. Do not treat a repeated In/Out time as proof of a full workday.
- Handle optional/missing shifts and Dept values, fall back to approved employee/branch schedules only according to configured precedence.

Do **not** hardcode either file to a branch. Require branch selection on import and save a reusable **source-format template assigned to each branch/device**, while allowing multiple templates for one branch and future new branches.

## 2. Desired end-to-end user flow

1. Authorized HR/admin opens **Attendance & DTR** and selects an authorized branch (e.g., Makati), attendance date or payroll cutoff, and import mode.
2. They upload `.xls`, `.xlsx`, or `.csv` through drag-and-drop/file picker. Support a single daily file OR a multi-day workbook. Show progress, validation, sheet/date counts, and a helpful failure message.
3. System auto-detects the saved branch format or asks to choose/create a mapping template (header row, relevant sheets, date source, employee identifier, punch vs daily-row data, time fields, event type, status/shift fields). Show a preview and allow corrections before commit. Save/reuse the template.
4. On confirmation, save **immutable original-file metadata/source reference, raw normalized rows or punches, an import batch ID, and a processing/audit record** in PostgreSQL. File persistence must use the project's approved secure file-storage mechanism.
5. Match imported employees to **existing Employee/201 File records using branch-scoped biometric ID/employee ID aliases first**. Only use names as a carefully reviewed fallback. Show unmatched and ambiguous identities for manual mapping and remember approved mappings. Never create employees just because a name appears in a file, or match across branches by name alone.
6. Normalize all supported formats into the **same attendance-by-employee-by-date model** and calculate results using assigned schedules, approved leaves, holidays, rest days, and configurable policy rules. Keep raw imported data unchanged for auditability.
7. Save a **persistent attendance ledger** and display daily and cutoff-based summaries immediately after processing. Users can revisit past imports/dates without reuploading files.
8. Show exceptions and support permitted corrections (actual IN/OUT, employee mapping, shift, remarks, work arrangement, rest day, leave reference). Every change records old/new values, actor, reason, timestamp and recalculation. Keep changes as overrides, not destructive edits of the source.
9. Support review/approval/finalization as appropriate to the existing role model. Prevent silent changes to locked or payroll-exported periods; require a controlled correction/reopen process.
10. Provide **export** of a formatted payroll DTR workbook, summary workbook/CSV, and optionally a branch daily attendance file. Exports must use the selected branch, date range, filters, approved/current attendance version, and **exactly the same calculation engine** as the UI. Record export history and who exported it.

## 3. Required pages and UX

Revise existing routes/components instead of adding competing screens:

- **Attendance Overview**: branch picker limited by access; daily/date-range/payroll-cutoff filters; recent import history;  KPI cards (active/scheduled employees, present days, absence days, late occurrences, late minutes, undertime minutes, OT minutes/approved hours, missing punches, exceptions). Label units and definitions clearly. Do not confuse people with employee-days.
- **Biometric Imports**: file upload, source format/template selection, date coverage preview, import validation, duplicates/overlaps, employee mapping, progress, error log, commit action, stored history/status, and safe reprocessing.
- **Attendance Ledger**: sortable/filterable/paginated employee-date table with Employee, Branch, Date, Actual IN, Actual OUT, Scheduled IN/OUT, Late (minutes), Undertime (minutes), OT (minutes), Absent flag, Status, Rest Day/Holiday, Remarks, Source, Exception, Approval state, and Edit/Review action. Allow employee/day detail drawer showing original punches, calculations and audit trail.
- **DTR Summary & Export**: selected period and branch, overall cards plus employee-level totals; preview/export controls; per-employee grouping and TOTAL row, similar to the supplied DTR screenshot. Allow CSV and styled XLSX export.
- **Branch Attendance Settings**: assigned import templates, employee biometric identifiers, shift schedules, grace periods, breaks, OT/undertime handling, rest days, holidays and payroll cutoffs. Keep configurable policies explicit and permission-controlled.

Match the current app's consistent layout, shadcn components where present, mobile-friendly tables, error/empty/success states, skeletons that match real page layouts, keyboard accessibility, and clear confirmation dialogs. Preserve the useful inline shift-edit/remarks ideas shown in the current UI, but save them to the backend with role checks and an audit trail.

## 4. Calculation and business rules — correctness is essential

- All timestamps must be interpreted using the branch's configured timezone (default **Asia/Manila**) and stored consistently. Handle Excel serial dates, 12/24-hour text times, locale ambiguity, invalid inputs, and overnight shifts across dates.
- Schedule priority should be explicit: approved employee/date override → assigned employee shift/rotation → branch default → **Missing Schedule exception**. Do not silently assume all staff always work 08:00–17:00.
- `lateMinutes = max(0, validActualIn - scheduledStart - allowedGrace)` under the configured policy, with no negative late values. A late occurrence and number of minutes are separate metrics.
- `undertimeMinutes` derives from valid worked time and scheduled paid work after applicable breaks, leaves and policies; do not simply equate every missing OUT with an entire day's undertime. Missing punches must remain exceptions until resolved under policy.
- Overtime is **not automatically payroll-payable**: identify potential OT and approved OT separately. Apply thresholds, round-off, minimum increments and approval only when configured. Do not automatically count all minutes after scheduled OUT as approved overtime.
- Mark **Absent** only when the person is scheduled and active for that date, there is no valid attendance, and no relevant approved leave/holiday/rest-day/WFH/OB exception under company policy. A future date, off-day or unimported date must not automatically become absence.
- Recognize statuses/markers such as Present, Late, Undertime, Absent, Incomplete Punch, Rest Day (`RD`), Work From Home (`WFH`), Official Business (`OB`), Approved Leave, Regular Holiday, Special Non-working Day, and Missing Schedule. Status combinations must be deterministic and explained.
- Provide flexible remarks: `No OT`, `WFH`, `OB`, `Change Shift`, `Holiday`, `RD`, `Custom`, plus approved leaves and other policy-driven statuses. **A free-text remark must not bypass approvals or automatically create paid time**.
- On raw-punch imports: keep all punches, deduplicate true repeats carefully, handle multiple breaks/ins/outs, missing/misordered device events, cross-midnight attendance, and conflicting manual edits. Expose reconciliation decisions rather than pretending uncertain data are valid.
- On daily-sheet imports: do not trust `Status` as the sole source of truth; compare with punches and schedules and preserve raw source status for troubleshooting.
- Missing/ambiguous source data **must not be guessed**. Flag and isolate unresolved records; show what was excluded from payroll-ready totals.
- Holiday/rest-day/payroll rate calculations must be **configurable and approved by HR/payroll**. Do not invent Philippine statutory multipliers or start changing salary computations in this task.
- Use integer minutes internally; convert to hours/display units only at presentation/export according to explicit rounding rules. Avoid floating-point drift.

## 5. PostgreSQL data design and security

Inspect existing tables/models first; extend them with compatible migrations rather than duplicating concepts. Support, as applicable:

- `attendance_import_batches`: branch, source format/template/version, original filename, file hash/storage key, dates covered, uploader, timestamps, row counts, processing status, validation errors.
- `attendance_source_events` / `attendance_source_rows`: immutable normalized raw imported data with source sheet and row number, source employee identifier, punch timestamp or daily IN/OUT/status, and import batch link.
- `biometric_format_templates`: branch association, friendly name, file type, header/sheet rules, field mappings, punch-pairing options, active flag, version.
- `employee_biometric_mappings`: branch-scoped device/personnel identifiers → existing Employee/201 File.
- `employee_shifts` / schedule assignments and branch attendance rules (reuse existing equivalents); approved leaves and holiday calendar links.
- `attendance_daily_records`: unique employee+branch+work date with source/derived actual times, scheduled times, computed minutes and flags, approval/lock state, calculation version, updated-at.
- `attendance_adjustments` and `attendance_audit_logs`: full history and justification for corrections and approvals.
- `attendance_exports`: branch, date range/cutoff, format, output version, generated-by/time.

Use appropriate foreign keys, indexes, uniqueness constraints, migrations, and transactions. Prevent duplicate attendance or double-counted totals when the same file is uploaded twice: hash-based detection plus date/employee overlap review. Provide **safe merge/replace/reprocess** options only when explicitly permitted, preserving historic imports and locked records. Design imports to be idempotent and use a reproducible, versioned calculation service.

Enforce role and branch permissions server-side, not only with UI controls: `SUPER_ADMIN` may administer all branches; `HR_ADMIN`/`BRANCH_MANAGER` can manage authorized branch attendance; `IT_ADMIN` has technical/config access only when permissions allow; `STAFF/EMPLOYEE` can view only their own approved DTR/attendance, never edit payroll results. Reuse existing RBAC permissions rather than hardcoding role checks that undermine current policies. Protect employee PII and original files, validate file type/size, avoid formula/CSV injection on export, and do not execute workbook macros or formulas.

## 6. Export requirements (match sample outcome)

Create an XLSX report visually similar to the reference payroll DTR:

`ATTENDANCE | [selected cutoff/branch]`

`Name | Date | ACTUAL IN | ACTUAL OUT | SCHEDULE IN | SCHEDULE OUT | OVERTIME | LATES | UNDERTIME | ABSENT | RESTDAY/SPECIAL HOLIDAY | HOLIDAY | REMARKS`

- Group rows by employee, then chronologically by date, and add a clear **TOTAL** row for each employee (late/UT totals in minutes; OT with labeled units; absence as days; optional approved/pending OT columns).
- Show `RD` for applicable rest days; display missing punches as `No time in` / `No time out` only where accurate. Make date and time formatting consistent; highlight exceptions without corrupting data types.
- Include a **Summary** sheet (branch, cutoff, generated at/by, employee-wise and aggregate metrics), **Employee DTR** sheet, and **Exceptions** sheet. Optionally add a restricted Raw Logs sheet for admins; do not expose sensitive raw logs to unauthorized users.
- Permit exporting one employee or all employees for the selected branch/period, and export **daily summary** as well as cutoff/monthly results.
- Provide an export preview, meaningful filename such as `Makati_DTR_2026-09-26_to_2026-10-10.xlsx`, and verify workbook content opens correctly in Excel.
- Do not silently round OT to a full hour just to imitate the screenshot; configure the rule and make output units explicit.

## 7. Implementation sequence

1. **Audit existing implementation**: locate routes, components, file parsers, schedule/leave services, models, exports, tests, and authentication. Report a short architecture/change plan, then actually implement it. Avoid breaking the existing HRIS and leave/payroll modules.
2. **Database and domain service**: introduce minimal schema changes and shared normalized import/attendance calculation structures with deterministic recomputation.
3. **Flexible parsers**: implement both exact reference formats, resilient header matching, multi-sheet date handling, saved format templates, input validation and row-level diagnostics. Use maintained libraries that are compatible with the current stack; support legacy `.xls` securely.
4. **API/server workflow**: upload → preview → confirm → persist → match → calculate → exception/review → approve/lock → retrieve histories/summary → export; secure all operations by role/branch.
5. **Frontend**: refactor existing Attendance & DTR screens to use these APIs, including importing, saved history, KPI cards, ledger, reviews, branch templates and export preview. No hardcoded/demo attendance data in production pages.
6. **Tests and verification**: unit, integration and UI checks. Add representative fixtures for both reference formats and edge cases. Run existing lint, type check, migration, test suite and relevant build commands. Fix actual failures rather than claiming success without running them.
7. **Handover**: summarize touched files, database migrations, new env/config variables, setup/migration steps, what was tested, remaining risks, and any policy decisions HR must confirm.

## 8. Acceptance tests (must pass)

- Import Format A `.xls`: personnel 65 / Lea yields multiple retained biometric punches; unusual Check-In/Check-Out ordering produces a visible exception unless a documented reconciliation rule resolves it.
- Import Format B `.xlsx`: all **15 date-named worksheets** are processed, not just the active sheet; rows become employee-day entries with proper worksheet dates and imported raw status preserved.
- Upload one daily Makati attendance file: imported data is **saved in PostgreSQL**, branch-scoped, and immediately generates daily Present/Late/Absent/OT/Undertime/Exception summaries for the dates actually covered; reopening the screen without reuploading shows the same saved results.
- Import multiple days / select a payroll cutoff: dashboard aggregates from the same stored ledger, without double counting. A 15-day x 16-employee input may produce up to 240 employee-day records after matching/validation, not 240 independent employee profiles.
- Reupload the same file: no duplicate punch/attendance totals; show safe duplicate/overlap UX. Unmatched staff and missing punches do not generate invented times or payroll-ready values.
- An approved leave/rest day is not marked as an unexplained absence. A changed schedule triggers correct recalculation while preserving audit history. Overnight shifts and grace periods work.
- Editing one row updates the saved attendance, per-employee totals, dashboard totals and newly generated Excel report consistently.
- Branch HR cannot read another branch's imports, employees or exports by manipulating URLs/API parameters; Employee self-service shows only their own authorized data.
- Export employee DTR and summary to `.xlsx`/`.csv`; dates, actual/scheduled times, lateness, undertime, approved/pending OT, absent counts, rest day, remarks and TOTAL rows agree with the current on-screen calculations.
- Existing working pages, employee 201 files, leave workflows, loading skeletons and permission rules still function after the change.

## 9. Output expectations

**Do not stop at a proposal, pseudo-code or mocked screen. Make the changes in the current repository** in manageable commits/steps, using the existing application patterns. Where business policy is genuinely unspecified (grace period, paid OT approval, paid leave, meal-break treatment, shift rounding, overnight cutoffs), implement a safe configurable rule and clearly mark it for HR confirmation rather than inventing a payroll policy. Prioritize accurate imports, persistence, reconciled attendance, summary calculations, and reliable exports over decorative UI.
