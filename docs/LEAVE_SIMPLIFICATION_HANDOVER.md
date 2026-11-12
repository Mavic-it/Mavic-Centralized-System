> Historical implementation. The current implementation is described in [Simple leave implementation handover](LEAVE_V1_IMPLEMENTATION_HANDOVER.md).

> Retired at user request on 2026-10-22. See [leave removal handover](LEAVE_REMOVAL_HANDOVER.md) for the current application state. The implementation below is historical.

# Simplified leave management handover

> Superseded by [Simple leave v1](LEAVE_SIMPLE_V1_HANDOVER.md) on 2026-10-22: four management pages and one final approval decision. The following describes the earlier implementation.

Implemented the supplied leave simplification request in the existing leave module. Main HRIS Phase 1 remains active. Mavic branding follows the latest user instruction.

## Navigation and workflow

Management has three destinations: `/leave` (Requests & Approvals), `/leave/policies` (Policy Settings), `/leave/reports` (Credit Reports). `/my-leave` stays separate. The existing `/leave/allocation` URL redirects to Policy Settings's Credit Allocation Rules disclosure, and `/leave/credits` remains a report redirect. Existing navigation permissions are retained.

Requests use six essential filters, seven table columns including branch, four summaries (pending, approved, rejected, employees on leave today), stage-aware review, required rejection remarks and the shared detail drawer. Employees on leave today uses counted request-day records rather than treating weekends/gaps in a date range as approved working days. Drawer balances use the authorized balance endpoint.

Policy Settings starts with its table; Add/Edit uses a separate `LeavePolicyEditor` dialog. Detailed rules, type definitions, SIL/event evidence checks and the existing version history remain. Allocation controls and manual ledger postings live inside Credit Allocation Rules. New policies remain inactive and do not pre-grant company examples. Global type-catalog changes remain Super Admin only; HR maintains policies within its existing scope.

My Leave keeps the authoritative balance source and own-record guards. It suppresses zero cards without an applicable policy or ledger history, uses actual catalog names, and describes event entitlements separately where configured. File Leave opens the existing eligibility-backed form in a shared dialog, with an explicit balance/requested-days/projected-balance preview and inline submission errors. Required supporting documents, overlap/credit/eligibility checks, idempotent submission behavior, notifications and cancellation rules remain server controlled.

## Reports and adjustments

`GET /leaves/configuration/credits/report` accepts year, employeeId, branchId, type and employmentStatus. Branch scope is derived by the service; employees, staff and IT cannot access reports. Managers can read/export within their branch but cannot allocate or adjust credits.

A repeatable-read report derives opening balance plus annual movements from the existing ledger. Current-year reports include live pending/approved-future reservations; past-year reports explicitly exclude historical pending reservations because that state cannot be reconstructed reliably from the current request records. Branch/employment filters use current assignments rather than inventing historical employment snapshots. Current year is through the reported asOf date. There are no future-year reports.

The table, four totals and CSV/Excel exports use the same filters and report computation. Exports include report year/asOf/basis and reconciliation-gap notes; spreadsheet-formula escaping remains. Ledger dialogs include signed movements, balance after each transaction, actor and reason/reference. Opening balances appear separately and are included in availability; commutations are visible and deducted. Ledger dialogs show at most 5,000 entries with an explicit truncation message.

Adjustments remain `POST /leaves/credits` with entryType ADJUSTED, signed amount, reason, effective date and an idempotency key. The new dialog requires confirmation and refreshes report/balance/ledger queries. It does not overwrite balances. Existing API permission, reservation, negative-balance, audit and retry rules remain.

## Automatic allocations

Reuse the existing hourly, idempotent allocator. Policies must explicitly enable automatic allocation and define effective/grant/eligibility rules. The scheduler requires `LEAVE_ALLOCATION_SCHEDULER_ENABLED=true` and `LEAVE_ALLOCATION_ACTOR_ID` referring to an active authorized HR/Super Admin account. Its branch scope limits which employees it can allocate to; use an authorized company-wide actor for company-wide scheduling. These environment values were not changed automatically and no allocation run was submitted. Policy Settings now shows whether scheduled allocation is active; authorized HR can also run the existing configured allocation manually with a reason and confirmation.

## Historical data finding

A read-only local audit found one pre-existing approved SICK request (2026-10-09 through 2026-10-12, four days) with no policy snapshot, no linked usage transaction and no employee ledger history. No duplicate usage transactions/source keys or orphan request entries were found. Report totals remain ledger based and show a reconciliation warning when the selected scope contains missing usage entries. HR must establish the historical opening entitlement and appropriate audited correction before treating that old approval as reconciled. No credit was fabricated, deducted or granted to hide this mismatch. Run `node scripts/audit-leave-credits.mjs` from the API for aggregate read-only checks without printing employee identities.

## Preservation and rollout

No database migration, table replacement, historical rewrite or automatic grants were introduced. Existing transaction boundaries, idempotent allocations/deductions, ledger reservations/releases, approval snapshots, approved-cancellation rules and attendance/DTR invalidation remain. Original biometric/source records are untouched.

Deploy API and web together, and restart the compiled API to load the new report/status routes. Do not enable allocation until the policy values, eligible employee scope and scheduler actor are confirmed by HR. Existing policies and evidence checks were retained rather than treating statutory law as a design preference.

## Validation scope

Focused API and frontend suites cover role/branch boundaries, export filters/format escaping, policy defaults, balances and record visibility, approval/rejection/cancellation guards, request form previews and navigation. A real PostgreSQL temporary-table test verifies annual arithmetic, opening balances, signed ledger movements, actor names, historical reservations, branch isolation and missing-usage warnings; fixtures are rolled back. Existing records were inspected read-only.

Browser review uses actual-component artificial HTML fixtures in an isolated headless browser. Desktop/mobile request/report/form/policy layouts were checked at 390px and 1440px; document width matched viewport width. This is layout verification, not a signed-in end-to-end approval/allocation or real document-upload test. Full production deployment, a real scheduled grant and HR reconciliation of the historical approval remain operator validation activities.

Final verification (2026-10-22): 95 leave/report/DTR API tests, 44 focused frontend tests and the rolled-back PostgreSQL report integration test passed. API/web production builds, web TypeScript, focused frontend ESLint and full API lint passed; API lint retains existing warnings in unchanged files. Headless sample-fixture measurements matched viewport/document widths at 390 and 1440 pixels. No historical credit/approval records or environment secrets were modified.
