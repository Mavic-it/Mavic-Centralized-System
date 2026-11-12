# Attendance DTR implementation

This user-requested slice restores biometric import and attendance reporting after the forward-only retirement. Phase 1 remains the main active phase. Salary valuation, statutory rates, benefits and payslips are excluded. Retired data cannot be recovered by this implementation.

## Component tree and responsibilities

`AttendanceContent → DtrWorkspace → DtrImport, DtrLedger, DtrSettings, DtrReview`.
The existing page owns session and branch access. DtrWorkspace owns period, selected employee, server queries and invalidation. DtrImport owns file selection, mapping preview and explicit commit. DtrLedger renders saved employee-days, totals and export preview. DtrReview owns a reasoned correction form in the existing native Modal. DtrSettings owns reusable source templates and explicit policy/holiday configuration. Existing branch schedule and weekly roster editors remain authoritative.

## Contracts and state

Workspace props: branchId:string, canManage:boolean. API calls use authenticated same-origin attendance proxies. JSON errors contain message. Import uses multipart file plus branch/template; preview is retained with original bytes in PostgreSQL, using the same private bytea storage convention as employee documents. Commit reparses retained normalized rows; browser results are never trusted. Preview → committed is transactional and idempotent; source rows and file are immutable. Approved aliases are branch/device scoped. Names require explicit mapping. Unmatched rows remain visible and excluded; never create employees.

Local state: file/template selection, mapping form, current page/filter/sort, selected review row. Shared server state: batches, policies/templates, canonical attendance_records, audit, period locks, exports. Date-range and branch transitions reset preview selection. Mutations invalidate saved ledger, history, summary and existing attendance queries. Approval freezes attendance; reasoned reopening invalidates prior approval. Export locks the selected period and records a versioned snapshot/hash. Overlaps are rejected unless explicitly choosing unlocked replacement with a reason.

## Visual system

Primary task: import and reconcile. Secondary tasks: export and settings. Reuse existing neutral cards, red primary actions, typography and spacing. Import/setup form uses two columns on desktop and one on mobile. KPI cards label people versus employee-days and integer minute units. Ledger has a contained horizontal scroll area and pagination. Errors use alert text; success uses status feedback; busy controls are disabled. Loading placeholders reserve card/table geometry. Empty/unauthorized states explain the required branch/access. Source removal is not offered because originals are retained for audit.

## Accessibility

Use semantic forms, labelled native inputs/selects/buttons, table captions/headers and visible focus. File picker is keyboard operable and complements drop input. Error/status live regions announce completion. Existing Modal handles Escape, focus trapping/restoration and busy dismissal prevention. Confirm replacement/reopen/export locking with the existing confirmation provider. No animation is required; respect reduced motion and 200% zoom.

## File boundaries and verification

API: `hr/attendance/dtr.types.ts`, `dtr.parser.ts`, `dtr.calculator.ts`, `dtr.export.ts`, `dtr.dto.ts`, `dtr.service.ts`, `dtr.controller.ts`; additive migration `1792454400000-RestoreAttendanceDtrWorkflow.ts`; integrate HrModule and retained AttendanceService guards/read metrics. Web: `app/attendance/dtr-workspace.tsx`, `dtr-import.tsx`, `dtr-ledger.tsx`, `dtr-settings.tsx`, `dtr-review.tsx`, `dtr-client.ts`, `dtr.module.css`; integrate workspace and multipart proxy.

Focused tests cover both real-world workbook structures, all 15 sheets, timestamp parsing, suspicious/repeated/missing punches, overnight shifts, breaks/grace, approved leave/rest/holidays, future dates, duplicate/overlap behavior, branch/own scope, locking/corrections, export round-trip and injection. Run API/web type checks, lint, builds and suites; use a rollback-only PostgreSQL integration transaction where configured. Document actual results and rollout in HRIS_IMPLEMENTATION_PLAN.md.

## Safe policy defaults requiring HR confirmation

No payable OT without explicit approval; integer minutes without implicit hour rounding. Imported shifts are advisory until an authorized override is saved. Missing schedules/punches are excluded from payroll-ready totals. Break handling defaults to an unresolved exception when breaks exist and their placement is not configured. WFH/OB/holiday/rest/leave must be structured authorized inputs; arbitrary remarks have no calculation effects. Dates are branch-local; ambiguous date strings require an explicit template date order. No inferred absences for dates or employees absent from source coverage.
