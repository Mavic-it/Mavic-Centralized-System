# Leave configuration implementation

The user explicitly requested all stages of the leave-credit configuration brief. This targeted extension is authorized independently of the main HRIS phase; it does not open unrelated payroll/benefits modules.

## Component tree and contracts

Existing LeaveManagementWorkspace retains request/role/query ownership. LeavePolicySettings owns a typed configuration editor and policy version history; LeaveCreditTools owns filters, explicit allocation and report export; LeaveEligibilityReview owns HR-reviewed statutory/event facts; MyLeaveRequestForm consumes a server eligibility/preview response. Shared buttons, native controls, existing modal/confirmation provider, table pagination and semantic workspace theme remain in use. New API configuration/eligibility endpoints share LeaveService and its transaction engine rather than duplicating request models.

## State and interaction

Server state includes catalog, versioned policy configuration, verified event entitlements, grants and ledger. Local state includes draft configuration, filters, selected dates/type, pending/failed preview and confirmation. Allocation is an explicit HR action with a date/reason, disabled until a configured schedule is enabled. No startup credits or historical ledger backfill. Async errors remain retryable; stale quotes never authorize submission. Existing request attachments remain private. Saving a policy creates a revision, while requests keep immutable rule snapshots. Negative balance, carry-over, expiry, cash conversion, SIL coverage and self-approval require explicit configuration.

## Visual and accessibility

Policy Settings and Credits remain within Leave Management tabs. Group controls under entitlement, eligibility, allocation, carry-over/expiry, approval and evidence sections. A live preview in My Leave shows requested/available/projected days and concrete ineligibility reasons. Use labeled fields, native selects/date/file controls, adjacent errors, live status announcements, confirmation before allocation/cancellation, keyboard focus/escape via existing dialogs, matching skeletons and stacked mobile forms. No decorative motion. Named table regions remain keyboard scrollable for wide reports, with request mobile cards retained.

## Files and verification

Add additive configuration migration; policy configuration DTO/rule helpers; configuration controller/service for catalog, eligibility review, allocation/export; extend existing LeaveService snapshots/day counting/approval/reversal and DTR stale handling. Add focused web configuration components/styles and preserve existing paths. Verify version stability, branches, actor permissions, no automatic example grants, annual/monthly/anniversary idempotency, event quotas, zero-credit rules, reservations, exactly-once usage/reversal, date/holiday behavior, exports and concurrency on PostgreSQL rollback fixtures. Run focused and full web tests, API regressions, builds/types/lint and isolated responsive browser checks. Migration/operational instructions and remaining HR policy decisions belong in the handover.
