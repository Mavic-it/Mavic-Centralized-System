# My Leave workflow audit — 2026-10-19

Compared the user's “Simplify and Fix Leave Management Workflow” brief with the current My Leave frontend, leave API/service, PostgreSQL records, approval permissions and attendance/DTR integration. **The requested flow is partially implemented, not complete.** This is an audit; no application behavior, leave records, credits or policies were changed.

## Findings requiring attention

1. **High — Historical approval and current ledger disagree.** Read-only checks for the employee from the earlier example found one approved Sick request for four days, with no policy reference and no earned/used/adjustment ledger entries. The request also has no matching USED transaction. The current in-scope active policy is paid Vacation; there is no active Sick policy and no posted credits. An old approval therefore exists while the ledger correctly reports no available credits. This does not establish when or why that historical request was originally approved. HR must reconcile its source and pay treatment; do not invent credits or retroactive deductions.
2. **High — Eligibility is reconstructed in the browser.** `availableRequestTypes` uses policies effective today and available balance today. There is no backend eligibility/quotation endpoint. Backend checks on submission additionally consider selected dates, service tenure, SIL eligibility and existing reservations. The two sides can disagree, especially for future-effective policies/credits or policy changes across the requested period.
3. **High — No requested-days/balance preview.** The form has dates and reason, but does not display selected-type credits, schedule-aware requested days or projected remaining credits before submission. The backend does count days when saving.
4. **High — Holidays are not excluded by leave-day counting.** `buildRequestDays` reads branch schedules, employee schedule history and daily overrides, but does not read the configured holiday calendar. Its `countNonWorkingDays` option can also intentionally count rest days; the current Vacation policy has that option enabled. Day counting must follow the approved policy rather than silently changing existing requests.
5. **High — No explicit self-approval guard.** The decision controller checks role, stage and branch, but does not compare the requester with the approver or consult a policy exception for self-approval. A manager with an employee record may therefore meet the ordinary branch/stage rules for their own request.
6. **High — DTR integration is incomplete.** Approved request-day rows are read by attendance and by DTR recalculation. Final approval does not invalidate/recalculate existing DTR snapshots. DTR calculation reads aggregate approved leave units and exports generic “Approved Leave”; it does not carry the leave type and paid/unpaid distinction through that calculation/export. The approval conflict query rejects any existing attendance row on a counted day, including a previously generated absence/DTR row, rather than distinguishing actual biometric work from an empty attendance record. Original source retention exists, but the full requested synchronization is not implemented.
7. **Medium — Zero-credit rules are not fully policy-driven.** Negative balances are blocked and UNPAID is exempt from credit deduction. However, submission/approval/reservation checks use the type `UNPAID`, while the browser also treats any policy with `paid=false` as credit-free. A non-UNPAID type configured unpaid can therefore be offered by the browser and still require credits on the backend. No configurable negative-paid-balance exception exists.
8. **Medium — Documents are always optional.** Secure proof upload/download exists, but policies cannot require a document for selected types or situations, and the backend has no conditional requirement validation.
9. **Medium — Team calendar and arbitrary approval steps are absent.** Manager-to-optional-HR stages exist. There is no team leave calendar or policy-configurable sequence beyond the HR-required flag.

## Requirement coverage

| Requirement | Current status |
| --- | --- |
| Own balance cards, prominent File leave, compact requests, separate Balances & history | Implemented; employee-linked users/admins use own employee scope |
| Responsive cards/table, drawer, loading/empty/error feedback, keyboard behavior | Implemented; shared custom/native controls plus existing UI primitives, not an entirely shadcn form |
| Backend-authoritative eligible types with precise reasons | Partial: submission validation exists; no eligibility endpoint; browser generic explanation only |
| Available credits, requested days and projected balance in filing form | Missing |
| Schedule/nonworking-day calculation | Implemented on save, subject to policy; configured holidays are missing |
| Proof upload | Implemented as optional PDF/JPG/PNG, 5 MB; policy-required proof missing |
| Earned/used/adjusted/expired/commuted ledger and history | Implemented for current ledger-based operations; historical requests are not automatically reconciled |
| Pending reservations and release on rejection/cancel | Implemented through pending-status aggregation; cancel is restricted to pending own requests |
| Exactly-once final deduction, concurrency protection and audit | Existing transaction/row locks and unique source key; broader acceptance suite still needed |
| Manager → optional HR → final status, remarks and timestamps | Implemented; explicit self-approval prevention missing |
| Server-side own/branch/role checks and restricted attachments | Present; manager review uses active branch; IT has no leave review action |
| Approved leave in attendance and DTR exports | Partial; saved-snapshot refresh, specific leave code and paid/unpaid propagation need work |
| Team calendar and full configurable approval steps | Missing beyond optional HR stage |

## Recommended incremental order

1. Add an employee-scoped backend eligibility/preview contract that uses the same policy/date/schedule/holiday/credit rules as submission; drive the form from it with explicit selected-type and projected-balance information.
2. Enforce self-approval policy and consistent paid/unpaid credit semantics, with authorization and concurrency regression tests.
3. Add conditional document requirements if HR needs them; retain optional upload for policies that do not.
4. Complete approved-leave DTR synchronization without overwriting source punches, including stale-snapshot handling, leave codes, paid/unpaid export fields and distinguishing actual-work conflicts from empty rows.
5. Have HR review legacy approved requests against source records. Make any correction explicit, audited and separately authorized; do not automatically fabricate balances. Add team calendar and broader approval configuration only within the requested scope.

## Evidence

- `application/web/app/leave/leave-management-workspace.tsx`: policy filtering, `availableRequestTypes`, own-request query scope and submit mutation.
- `application/web/app/leave/my-leave-presentation.tsx`: current filing fields and explicit no-eligible-types state.
- `application/api/src/hr/leaves/leave.controller.ts`: create/update ownership, decision stage/branch gates and protected document access.
- `application/api/src/hr/leaves/leave.service.ts`: policy checks, transaction/row locks, ledger/reservations, request-day building and final approval conflict query.
- `application/api/src/hr/attendance/attendance.service.ts`: approved-leave attendance projection alongside retained attendance records.
- `application/api/src/hr/attendance/dtr.service.ts`, `dtr.calculator.ts`, `dtr.export.ts`: aggregate leave-unit calculation and saved DTR export behavior.

Database inspection was limited to request/ledger/policy aggregates for the previously reported example. No names, reasons, attachments, credentials or session tokens were fetched by the audit. Existing test results verify only their covered behavior; they do not establish compliance with the missing workflow requirements above.

Audit validation: 25 focused My Leave/drawer web tests, 21 leave API tests and 45 DTR parser/calculator/export/service tests passed. No end-to-end acceptance test was added for the missing workflow, and no application code or historical data was changed.
