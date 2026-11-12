> Retired at user request on 2026-10-22. See [leave removal handover](LEAVE_REMOVAL_HANDOVER.md) for the current application state. The implementation below is historical.

# Simple leave v1 handover

This replaces the earlier two-stage leave workflow and three-page simplification. The requested leave slice is authorized independently; the main HRIS Phase 1 boundary remains active.

## Implemented flow

Employees open My Leave, review database-backed credits, request eligible leave, and receive a PENDING request. One authorized, scoped reviewer records APPROVED or REJECTED. Approval consumes the ledger reservation once; rejection and permitted cancellation release or restore credits under the retained transaction rules. Legacy PENDING_MANAGER/PENDING_HR values remain readable during rollout. They never trigger another approval stage. Original approvals, policy snapshots, balances, supporting documents and attendance source records are retained.

Management navigation has four destinations: Requests & Approvals (/leave), Leave Balances (/leave/credits), Leave Settings (/leave/policies), and Reports & Analytics (/leave/reports). Branch managers cannot configure policies or adjust credits. My Leave remains separate. Existing allocation URLs redirect into Leave Settings.

My Leave now shows allocated, used, reserved and available days. The form uses the eligibility API, displays reservations and projected availability, and supports a single-date half-day only when HR enables allowHalfDay in the applicable policy. Preview, request-day rows, reservation, approval and ledger all use 0.5 days. Without a schedule, the documented fallback is Monday-Friday. Existing configured schedules, holidays, eligibility, statutory evidence and attachments continue to apply. No example benefits are automatically granted.

The API prioritizes the actual account-to-employee link for personal reads and ownership. A legacy email fallback remains only for unlinked non-super-admin accounts. A super administrator must link an employee before personal filing. Self-approval is always rejected, including policies that historically allowed it. All saved policy versions use one review and disable self-approval; historical snapshots remain unchanged.

## Reports and balances

Balances provide branch/employee/type/year filters, ledger history, and confirmed, reasoned adjustments through the existing immutable ledger API. Analytics adds request counts by status, paid-credit movements, accessible status and credit charts, date ranges and request-status filters. Chart links preserve period, employee, branch and type filters. CSV/XLSX include the same filtered computations and request summaries, including scopes that have requests without any credit-based balance rows. No new chart dependency was added.

Request counts use leave dates overlapping the selected period and current recorded request statuses. Without a custom range, counts include future requests within the selected year. Credit movements use the selected period with opening balance before its start; valuation ends at the earlier of its end and today in Asia/Manila. Only a valuation through today includes live pending/approved-future reservations. Historical pending state cannot be reconstructed and is explicitly excluded. Request-status filtering affects request counts, while balances always include the complete applicable ledger. Employee branch/employment filters for balances use current assignments; request counts enforce the request's branch snapshot. Reports disclose these bases.

## Migration and deployment

Migration 1792627200000-SimpleLeaveWorkflow adds legacy_pending_status and half_day, converts only pending stages to PENDING, and adds a pending-scope index. It preserves the old stage in a separate column; down restores pending stages while retaining additive history columns and completed decisions. It does not rewrite ledger rows or existing policy snapshots.

Build API, apply the migration, then deploy API and web together. The local-only runner is `node scripts/migrate-simple-leave.mjs` from application/api after `bun run build`. It runs only this migration and verifies history/ledger preservation plus recorded migration/schema state. The configured local database has the migration recorded and both columns verified. One historical approved request and zero ledger entries were preserved. No grants, adjustments or approval decisions were submitted to real employees.

Existing annual allocation remains controlled by approved policy and LEAVE_ALLOCATION_SCHEDULER_ENABLED / LEAVE_ALLOCATION_ACTOR_ID. These values were not changed. Existing monthly/event/carryover configurations remain supported for compatibility; they are not newly enabled or prefilled. HR must approve any policy activation.

## Historical issue

The pre-existing approved SICK request without a linked usage transaction or opening entitlement remains flagged for HR reconciliation. No credits or opening entitlement were invented to conceal it.

## Verification

See the final verification entry in docs/HRIS_IMPLEMENTATION_PLAN.md. Isolated PostgreSQL fixtures roll back their data or remove only their task-owned schema. They exercise single-decision usage, half-day preview/reservation/deduction, rejection release, allocation retry protection, self-approval, locked DTR handling and report arithmetic/scope/date/status filters. Signed-in production deployment and real notification/email delivery are separate operational checks.

Final validation: 123 API/DTR tests (including the two added export regressions), 45 frontend tests and 14 PostgreSQL fixture tests passed; one optional DTR test was skipped. API build, web TypeScript, focused web ESLint and API lint passed (existing API warnings remain). Web production build passed using Webpack with access to download the existing Geist font. Default Turbopack encountered a Next.js workStore prerender invariant on unrelated error/password routes. Chrome static component fixtures were inspected at 390px/1440px: no document overflow, no unlabelled visible form controls, report links reachable by Tab. Screenshots and measurements are local under tmp/leave-simple-v1-review. These are artificial fixture checks, not signed-in browser end-to-end testing.
