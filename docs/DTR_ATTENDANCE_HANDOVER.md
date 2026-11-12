# Attendance & DTR handover

The requested workflow is integrated into `/attendance` → **Attendance & DTR**. Select the authorized branch in the existing page header. This is the expressly requested attendance/payroll-input slice; the main HRIS phase remains Phase 1. Wage valuation, statutory multipliers, benefits, integrations and payslips are excluded.

## Implementation

- XLS/BIFF, XLSX and UTF-8 CSV import, date-named multi-sheet workbooks, custom header mappings, explicit MDY/DMY/ISO dates and strict or authorized first/last punch reconciliation. Originals and normalized rows are retained in PostgreSQL bytea/JSONB using the existing private document-storage convention; source mutations are rejected by database triggers.
- Branch/device identity aliases map only to existing branch employees. Names require manual review. Committing unmatched rows retains them for later mapping/reprocessing and excludes them from ledger totals. Invalid source dates must be fixed through a new template preview before commit. Template changes create retained source revisions; exact file/template duplicates reuse the existing batch. Overlap replacement is explicit, reasoned and restricted to unlocked DTR records in the same branch. Live clock records cannot be overwritten through import. Reprocessing an identity correction moves the derived record without creating a second employee-day and records the ownership change.
- The canonical `attendance_records` table holds versioned calculation/source/override snapshots in `dtr_data`. The retained Attendance history uses these same computed minute values. Existing employee/date uniqueness remains. Source rows, audited changes and export snapshots are separate retained records. No employees are created during imports.
- Schedule resolution follows authorized date correction, weekly roster, effective employee assignment, branch default, then Missing Schedule. Approved leave-day rows and configured holidays prevent unexplained absence; only covered employee-days can become absence. Historical assignment status is used when it has a known effective date. Unknown employment dates, ambiguous DST/local timestamps, missing punches/schedules and contradictory source information stay exceptions. Future dates never become absence.
- Integer-minute calculation separates lateness, remaining paid-work deficit, potential OT and approved OT. Missing OUT never becomes an entire day's undertime. Raw intervals preserve multiple IN/OUT pairs; exact repeats remain in source but are excluded from pairing. Unresolved rows are excluded from payroll totals. Free-text remarks have no attendance effect. Structured WFH/OB/RD and shift corrections require an authorized, reasoned action and period approval.
- Saved draft cutoffs, period approval, export locking, optimistic correction revisions and reasoned reopening are persistent. Branch advisory locks serialize competing DTR writes. Input guards reject changes affecting protected periods and flag affected unlocked rows for explicit audited recalculation. Legacy correction/OT APIs cannot alter DTR records. Current branch ownership and explicit attendance permissions are enforced by the server. Employees receive only their own approved records without raw source logs; IT has no attendance permission by default.
- XLSX has Summary, Employee DTR and Exceptions sheets, employee TOTAL rows, typed dates/times, labeled integer minute columns, approved/potential OT, absence days and styling. DTR CSV and summary CSV are available. Downloads record a snapshot, hash, actor and period revision and lock the complete approved branch period. The selected employee filter affects export rows. A single-day range is the daily report.
- The existing page hosts reusable import, ledger, review dialog, settings and workflow components. Forms use labeled controls, contained scrollable/paginated tables, error/loading/empty states and the shared modal/confirmation provider. The attendance proxy preserves binary multipart bytes/downloads and bounds requests at 9 MB; files are limited to 8 MB, 100 worksheets and 10,000 normalized source rows.

Design and component contracts: [DTR_ATTENDANCE_DESIGN.md](DTR_ATTENDANCE_DESIGN.md). Main files: `application/api/src/hr/attendance/dtr.*`, `application/web/app/attendance/dtr-*`, existing Attendance controller/service/workspace and proxy, RoleService, and HrModule.

## Migrations and deployment

Apply the additive migrations in order; never rerun the retirement migration manually:

1. `1792454400000-RestoreAttendanceDtrWorkflow`: source/templates/mappings/settings/audit/export/period tables; canonical record JSON; source immutability.
2. `1792454401000-AttendanceDtrIntegrity`: stale-input marker and protected-input/legacy-write guards.
3. `1792454402000-DtrSourceRevisions`: immutable template/source revisions and scoped input guards.
4. `1792454403000-DtrDraftCutoffs`: persistent draft cutoff state.

The running local API automatically applied the base migration during development; subsequent schema changes were therefore kept as forward migrations. The original migration is not an upgrade path for an already recorded database. The integration test applies missing migrations within a transaction and rolls everything back. No deleted pre-retirement records can be reconstructed by these migrations; that requires the old backup.

From repository root:

```powershell
npm.cmd install
npm.cmd run build --workspace application/api
```

From `application/api`, using the existing DB environment variables:

```powershell
node scripts/migrate-attendance-dtr.mjs
node scripts/migrate-attendance-dtr.mjs --apply
```

The script selects only these additive migrations and prints names/pending state without credentials. Build and apply before starting the new API/web version. The normal project migration runner can also apply them. Keep `DB_SYNCHRONIZE=false`; automatic migration execution is environment-specific. Migrations deliberately refuse destructive rollback; use forward fixes or an operator-managed backup restore. Retention/backup access must protect original employee PII. No new environment variables are required. Dependencies: ExcelJS 4.4 and SheetJS 0.20.3 from its official distribution, recorded in package and lockfiles. [SheetJS installation documentation](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/) specifies the distribution URL.

## HR setup and operational boundaries

- Confirm the branch/employee timezone, shift, workdays, break duration, grace and employment dates using existing schedule/employee administration. No universal 08:00–17:00 shift is assumed.
- If schedules deduct an unpaid break, configure its actual start/end in Branch settings. Missing or inconsistent break placement is a blocking exception. The branch policy has one explicit break window; unusual employee break arrangements require reconciliation/configuration before approval.
- Configure the OT threshold/increment and approved holidays. Potential OT is never payable automatically. Corrections/recalculation invalidate prior approved OT unless explicitly approved again.
- Save a template with **MDY** for the Lea raw log; keep **STRICT** pairing to flag contradictory labels. Select **FIRST_LAST** only as a documented HR decision. Date-named daily sheets use their sheet dates; a daily CSV can take an explicit date override.
- Review preview identities/diagnostics, commit, resolve exceptions in the saved ledger, and save/select the payroll cutoff. Recalculate after changing inputs, approve the complete branch period, then export. Exported periods must be reopened with a reason before corrections; earlier export snapshots remain in history. Notify payroll if an earlier file has already been used externally.
- Branch policy/holiday edits conservatively require reopening protected branch periods because those settings are not effective-dated. Employee/roster changes are scoped by employee and effective dates; default schedule edits preserve old protected snapshots while flagging unlocked data. Current employee branch scope controls historical visibility, consistent with the retained HRIS access policy. Earlier export snapshots remain retained after transfers.

## Verification and remaining checks

Representative XLS and 15-sheet/16-employee XLSX fixtures are generated by the tests because the original reference workbooks were not present in the repository. Tests cover parsing, retained repeats, ambiguous sequences, dates/serials/DST, multiple intervals, overnight shifts, schedules/breaks/grace, leave/rest/holidays, future dates, missing punches, safe totals, injection and XLSX round-trip. The opt-in PostgreSQL integration checks actual schema constraints, source revisions, persistence across service instances, duplicate commits, identity corrections without duplicate days, branch/own scope, reasoned corrections, stale revisions, approval, export, source immutability, locking, reopening and recalculation. All database fixtures roll back.

Commands run:

```powershell
# application/api
$env:DTR_DB_TEST='true'
node ../../node_modules/vitest/vitest.mjs run src/hr/attendance
# application/web
node ../../node_modules/vitest/vitest.mjs run app/attendance app/api/attendance
# repository root
npm.cmd run build --workspace application/api
npm.cmd run build --workspace application/web
npm.cmd run lint --workspace application/api
```

Changed web files were checked with the web package's ESLint and TypeScript. Focused checks and both production builds passed during implementation. The broader API run reported five failures in existing `hr.module.spec.ts` and `foundation.controllers.spec.ts` assertions, already documented before this task: outdated leave-role/branch fixtures, missing employee-create request headers, missing `hasUserAccount` expectation and preserved Super Admin employee linkage. The broader web run reported two existing source-string assertions in `employee-profile.spec.ts` targeting the old layout/name implementation. Those unrelated files were not changed.

Final focused results: **54 API/database tests passed** across the DTR and retained attendance suites; **10 web tests passed** across attendance presentation/schedule/proxy suites. The final API lint passed with six warnings confined to existing leave, user and system test files; changed-file web ESLint passed. Both production builds passed (the web build includes TypeScript). All four migrations are applied to the configured local database and the migration checker reports `pending:false`. The base was applied by the running local API; the checked migration command applied the remaining three. Integration fixtures, including the reverse-ordered 22:00–07:00 raw XLS overnight case and identity remapping, were rolled back. No production database was deployed.

No real Excel desktop session or interactive browser accessibility/responsive test was available. XLSX validity was verified by reading the generated binary back through ExcelJS; web checks cover rendered markup and byte-preserving proxy behavior. Before rollout, HR should validate the actual reference files against approved policies and visually check the workflow on target browsers. No claim of zero defects or statutory payroll compliance is made.
