# Simple leave implementation - 2026-10-22

The latest request reintroduces leave according to `.ai/agents/MSPACES_LEAVE_MANAGEMENT_CODEX.md`. It supersedes the earlier removal request. Main HRIS Phase 1 remains active; this implementation does not start another HRIS phase.

## My Leave presentation update

The latest UI refinement adds unpaid-leave monitoring cards with real approved/pending days and request counts via `GET /leave/me/overview?year=2026`. Unpaid cards never imply credit allocation or an available paid balance. Paid cards show available credits, allocation, net usage, pending reservations and adjustments. Leave details now open in a right-side drawer like password-reset request details, retaining native focus, Escape and backdrop behavior. Unlinked Super Admin accounts see a profile-linking information panel and authorized management actions; linked accounts retain personal filing and a no-self-approval explanation. No database migration or entitlement change is needed. See [presentation design](MY_LEAVE_PRESENTATION_DESIGN.md).

## Screens and flow

- `/my-leave`: eligible paid credits, year selection, paged history, request dialog, server-calculated preview, attachments, details and qualifying cancellation. Unlinked accounts receive an explicit message.
- `/leave`: Requests & Approvals, with branch/employee/type/status/date filters, pagination, detail/history and a single final approval or rejection.
- `/leave/balances`: Leave Balances, year and scope filters, paged credits, immutable transaction history and confirmed adjustments with reasons/references.
- `/leave/settings`: Leave Settings, versioned policy dialogs, eligibility decisions and safe annual backfill.
- `/leave/reports`: Reports & Analytics, five live KPIs, status/type charts, drilldown, scoped CSV and XLSX downloads using the existing ExcelJS library.

The four management destinations share the existing sidebar group. Only the most specific matching link is selected. Managers cannot see settings or grant credits. IT administrators cannot access leave personnel data. Super Admin/HR administer within their existing scope. Personal leave always uses `users.employee_id`, including for administrators.

## Database and integrity

`application/api/src/database/migrations/1792627202000-SimpleLeaveV1.ts` adds leave types, immutable policy versions, eligibility assignments, requests, working-date rows, bounded documents, an append-only credit ledger and request events. It reuses existing employee, account and branch tables. Days use PostgreSQL NUMERIC with whole/half-day checks, foreign keys, indexes and unique source keys.

The historical retirement migration and its recovery backup are retained. No old credits or requests are restored automatically. Fresh migrations create five **inactive draft** example types and no grants. The local database already had the new migration and configured active policies/credit entries when checked; these existing records were preserved. Never rerun a seed to reset an operated system.

Employee row locks serialize credit adjustments, reservations and decisions. Requests snapshot the policy and filing branch. Usage and cancellation restoration have unique request sources; annual grant sources remain stable across policy versions, preventing a second grant when a policy changes. Rejection releases the reservation without usage. A database trigger rejects edits/deletions of credit history.

Availability is `allocated + adjustments - usage + restorations - pending paid reservations`. Paid requests normally cannot overdraw it. Unpaid requests reserve no credits. Policy settings cannot silently change the financial effect of an existing request. Later corrections require signed ledger adjustments.

## API

All routes use the existing authenticated NestJS application under singular `/leave`. Strict DTOs reject unknown identity/day fields; the server derives identity, branch, policy, chargeable days and permissions.

- Context and policy options: `GET /leave/context`, `/leave/types`, `/leave/me/types`.
- Personal: `POST /leave/me/preview`, `GET /leave/me/balances`, `GET/POST /leave/me/requests`, `POST /leave/me/requests/:id/cancel`.
- Requests: `GET /leave/requests`, `GET /leave/requests/:id`, `POST /leave/requests/:id/approve|reject`, `GET /leave/requests/:id/document`.
- Credits: `GET /leave/balances`, `GET /leave/balances/:employeeId/transactions`, `POST /leave/balances/:employeeId/adjustments`.
- Configuration: `POST /leave/types`, `PATCH /leave/types/:id`, `POST /leave/assignments`, `POST /leave/allocate`.
- Reports: `GET /leave/reports/overview`, `GET /leave/reports/export?format=csv|xlsx`.

The Next.js `/api/leave` proxy follows the existing cookie/session forwarding pattern and bounded uploads. Documents require request-level authorization, verified PDF/PNG/JPEG signatures and a 5 MB limit. Responses use private/no-store headers and safe download names. Spreadsheet cells are formula-safe. Aggregate reports and notices exclude leave reasons and supporting documents.

## Working days, approval and DTR

Chargeable days honor employee daily rosters, effective schedule history, branch schedules and configured holidays. Where a schedule is missing, an explicit Monday-Friday fallback appears in the preview. V1 requests stay within one calendar credit year; split a cross-year range. Half-day requests cover one permitted working date. Overlapping pending/approved ranges are rejected conservatively, including nonworking gaps within those ranges.

Routing prefers an active, authorized branch manager, otherwise authorized HR/Super Admin. A linked employee cannot decide their own request. Rejection/cancellation require comments. A decision is final; repeated matching requests do not post another financial movement or notification.

Approved leave appears in attendance summaries even without an imported DTR row. Existing saved DTR rows recalculate from their retained sources; subsequent imports/recalculations read approved units again without duplicating credits. Paid/unpaid information is retained. Full-day leave blocks contradictory clock-in and approval against recorded full-day attendance. Half-day attendance remains subject to the existing DTR review rules. Payroll deductions remain outside scope.

Leave decisions and cancellations acquire the same branch advisory lock as DTR imports/approval/export, before employee locks. A locked/approved DTR period blocks a conflicting leave change atomically; HR must reopen it first.

## Notifications and allocation operations

In-app notifications reuse the existing notifications table and secure record links. Notification persistence uses a savepoint so a notification failure is logged without corrupting a successful leave transaction. SMTP notices reuse the existing EmailService/configuration and run **after commit**, without private reasons. Duplicate submissions/decisions and rolled-back transactions do not send email. SMTP failures are logged and never reverse a committed decision; this release does not add a durable email retry queue. No real email was sent by the fixture tests.

HR must approve and activate policies, verify eligibility and enable automatic allocation for applicable annual policies before granting credits. SIL additionally requires an explicit verified eligibility/equivalence assignment. No statutory entitlement engine or automatic stacking is introduced.

The controlled `POST /leave/allocate` operation can safely backfill a selected year without replacing adjustments. The hourly annual/onboarding job is opt-in:

```dotenv
LEAVE_ALLOCATION_SCHEDULER_ENABLED=true
LEAVE_ALLOCATION_ACTOR_ID=<active authorized HR or Super Admin account ID>
```

Set these on the API server and restart it after policy approval. The actor's branch scope applies. Newly eligible employees are picked up on the next controlled/hourly run. The example environment leaves this disabled; no real environment credentials were changed.

Report request dates/status apply to request records. Credit totals cover the full chosen credit year and include live reservations; the reporting basis appears on screen and in both exports. Credit scope follows current employee assignments; request history follows the filing branch. Balance queries cap employees at 2,000 and candidate balance rows at 10,000. Request reports cap records at 10,000 and require narrower filters rather than truncating silently.

## Verification

- API regression suite: **334 passed**, with the opt-in DTR database test skipped in the normal run and passed separately. Final focused policy, API/export and SMTP checks: **40 passed**.
- PostgreSQL isolated-schema acceptance: 13 tests passed, including reservation/decision races, self-approval, scope, duplicate grants, adjustments, working days, eligibility, documents, unpaid leave, restoration, saved DTR recalculation and locked-period rollback. The isolated schema is removed after testing.
- Existing PostgreSQL DTR integration: passed its rollback-only import/correction/approval/export/reopen workflow.
- Web suite: **134 passed** across 41 files. This includes access, unlinked profiles, navigation and notification links. Obsolete removal expectations now reflect the reintroduced routes.
- API build, production Next.js webpack build and TypeScript checks passed. Web lint passed without warnings. API `bun run lint` passed with four pre-existing warnings in unrelated user/system tests; the new leave code is clean.
- Headless Chrome fixture checks at 390px and 1440px: all five pages fit, visible controls have labels, dialog keyboard focus remains contained, preview is visible, and request submission closes the dialog. No browser runtime exceptions. These use real UI components with fixture API responses, not a signed-in production browser session. Evidence: `tmp/leave-v1-review/checks.json` and screenshots.
- Local migration verification: `tmp/leave-v1-migration-check.json`; employee/account/branch/attendance/audit rows remained unchanged during the verification. Existing active policies and two credit entries were retained.

Main source ownership: API `hr/leaves`, `hr/attendance/approved-leave.ts`, DTR/attendance hooks, HrModule, email and static role grants; web `app/leave`, five workspace routes/loading states, API proxy, sidebar/access/notification mapping. The HRIS master override and maintained inventory describe the current scope.

## All-types reporting update - 2026-10-23

The report response includes `typeBreakdown`, covering all permission-scoped configured types even when they have no credit entries or requests. Future and inactive policy states are labelled. Paid credit totals retain the full-year reporting basis; unpaid approved/pending chargeable days follow the selected request period/status. No unpaid credit balance is fabricated. Authorized historical types remain visible after policy scope changes. CSV and the new XLSX Leave types sheet include the same numbers. The report filters merge authorized type names from the breakdown so chart drilldown remains selectable for historical/new policies. No schema migration or new grants are required.
