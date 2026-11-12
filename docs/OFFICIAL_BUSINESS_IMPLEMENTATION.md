# Official Business implementation

Implemented 2026-11-07 as the user-approved attendance extension. Main HRIS Phase 1 remains active; no unrelated phase started. The proposal in OFFICIAL_BUSINESS_PROPOSAL.md records the approved design and policy defaults.

## Where to use it

- Managers: Attendance > Official Business > Authorized requests. Current selected branch filters the review queue.
- Employees: My Work Schedule / Work schedule > File / view Official Business, or /attendance/official-business. The dedicated entry uses personal-portal authorization; it does not grant attendance management.
- File OB supplies an inclusive start/end date range (same date for one day), estimated daily start/end times, destination, optional destination branch and reason. Multi-day filings create one reviewed request per scheduled workday in a single transaction; rest days and holidays are skipped and listed in preview. An end time earlier than the start time automatically means the following morning, subject to the effective shift. Ranges are limited to 366 calendar days and each included day retains normal eligibility, conflict and cutoff validation. Per-day preview and range submission use the existing endpoints; legacy single-date API payloads remain supported. Successful range submissions record an audit retry manifest and return all daily request IDs; retries cannot reuse a key for a different range. Past work dates use the same required business purpose/reason as other OB filings; no separate retrospective explanation is required. Filing and approval are allowed before a covering DTR cutoff has been created; once a covering period exists, the current open DRAFT/REOPENED cutoff rule applies. Approved/locked periods still require reopening. The filing form previews the effective shift, actual punches, credited OB and exceptions before submission.
- A reviewer opens the request, enters a decision reason and approves/rejects. HR Admins and Branch Managers may approve their own employee OB within authorized original/current branch scope. These decisions are explicitly recorded as SELF_APPROVE (or SELF_APPROVE_CANCELLATION) with actor, time and audit role/ownership snapshot. Other roles retain the independent-review rule. Super Admin is review-only and cannot preview or submit OB, including on behalf of another employee; the UI hides filing and defaults to the authorized review queue. A missing office OUT may be covered only when the reviewer explicitly attests continuity from an existing office IN to the OB departure. The API rejects future/absent/past-departure IN attestations.
- Employees may cancel pending requests. Approved withdrawal requests a separate independent cancellation decision. Approval remains effective until cancellation approval. Every transition adds an immutable event and audit entry.

## Data and attendance behavior

Additive migration OfficialBusinessRequests1794873600000 creates attendance_ob_requests and append-only attendance_ob_events, indexed by employee/date and branch/status/date. Requests reference canonical employee, user and branch identities. Version checks prevent stale decisions and unique submission keys prevent duplicate filings. Approval uses branch DTR advisory locking followed by employee/request row locking and rechecks current/original branch scope, employment, effective schedule, leave/OB conflicts and protected cutoff state.

The recurring schedule and biometric source rows are preserved. A structured dated OB overlay is loaded into DTR context and visible as a request-linked badge on weekly/monthly employee schedules and the branch roster. Pending/approved OB explains missing records in Attendance overview/history, including days without a biometric source. Reasons remain in the authorized request drawer; broad schedule badges show destination/status only.

DTR combines the union of approved OB intervals, validated office punch pairs and explicitly attested office time within the scheduled shift. Configured breaks are deducted once; overlapping sources are never added twice. actualIn/actualOut remain the original effective punch values; no OB punch is fabricated. OB credited minutes, office evidence and attested office minutes remain separate from total credited minutes. OB never consumes leave credits and does not automatically grant overtime. Uncovered scheduled time, conflicting manual arrangement overrides, changed schedules and ambiguous sources remain review exceptions.

Approval creates/recalculates a canonical attendance row even with no imported punches and returns it to DRAFT. Existing source data is retained. Approved/locked DTR periods block OB changes until reopened. Cancellation recalculates against remaining sources; source-less days stay unresolved for reconciliation. Import preview includes a context fingerprint: changed OB/schedule context rejects stale saves, and OB-bearing imports require a calculated preview. Import recalculation uses the same context. Identity remapping of OB-bearing attendance is blocked pending reconciliation. Existing schedule/leave/employee input triggers continue to mark derived DTR stale. Approved OB blocks overlapping leave approval, and approved leave blocks OB approval.

DTR review and output details expose OB sources and credits; existing CSV/Excel exports add approved OB, office evidence, total credited work and attested office columns. Normal DTR approval/export requirements remain; OB approval alone does not approve DTR/payroll export.

## API

Under /attendance/official-business:
- GET context: own employee and role/scope-authorized filing choices.
- GET requests: mine/review, branch, employee, status, date and page filters; 20-row pages.
- POST preview and POST requests: validated one-day interval input with submissionKey.
- GET requests/:id: authorized detail, history, calculation and optional continuity preview.
- POST requests/:id/decision: version, action, required comment and optional officeContinuity. Actions: APPROVE, REJECT, CANCEL, REQUEST_CANCELLATION, APPROVE_CANCELLATION, REJECT_CANCELLATION.

Authentication and module edit/view permissions are enforced by the existing guard. Service checks own/reviewer identity and branch boundaries; destination branch never grants reviewer access. In-app notifications are committed with the request/decision; private reasons are not placed in the notification. The queue refreshes every 30 seconds and successful actions invalidate schedule/attendance/DTR caches. This feature does not add a new email delivery integration.

## Frontend boundaries and verification

OfficialBusinessWorkspace owns context/list/action invalidation. ObRequestForm owns local unsent inputs and server preview; ObRequestDrawer owns decisions/history; ObAttendancePreview explains source/credit differences; ScheduleObBadge links date assignments to authorized details. Existing Modal/DialogProvider supplies focus isolation/restoration, Escape/outside dismissal and confirmation. Responsive layout uses shared gutters, compact filters, filing cards, two-column desktop form and a stacked phone form. Loading, empty, error, blocked, no-linked-employee and pending states are explicit. Inline API errors preserve user input.

Verification results are recorded in the main HRIS inventory. Browser fixture uses the real OB components and module CSS, a real browser DOM and synthetic fetch responses, not real authenticated employee data. It exercises filing/preview/confirmation/review/continuity/approval/close and viewport overflow at 390/768/1440px. Evidence is in tmp/ob-browser-review. Screenshots are fixture screenshots; full signed-in production workflow was not exercised.

## Rollout and operational notes

Build API, then use the configured normal migration runner, or from application/api run node scripts/migrate-official-business.mjs to inspect and node scripts/migrate-official-business.mjs --apply to apply only this additive migration. Start/restart updated API and frontend after migration. Environments without OB tables retain ordinary attendance/DTR support through the optional context lookup; the new OB request endpoints require the migration.

Inspection during this session found the configured local database already contained the migration record and OB tables through the running API's normal migration process. A read-only count confirmed zero saved OB requests after tests. Database integration fixtures run inside an always-rolled-back transaction; no real employee request was submitted.

For rollback, disable OB entry/mutations and keep request/event tables/history; do not drop attendance or request data. Review any approved intervals before reverting calculation code.

Deliberate limits: workdays only, no holiday/rest-day OB entitlement or automatic OT; resolve same-day leave before OB; no attachment workflow; changing approved times requires reviewed cancellation and a new filing; retrospective filing may precede cutoff setup; existing covering periods must satisfy the current open cutoff rule; changes to a filed schedule require cancellation/refiling. Legacy free-text/manual OB remains distinguishable and requires reconciliation if it conflicts with a structured request. No payroll engine or multi-step approval chain added.

Review focus: own/branch isolation, self-approval, stale/duplicate requests, locked cutoffs, source preservation, break/overlap arithmetic, notification transaction integrity, stale import context and UI error recovery. Residual validation limits: no real user credentials, production export, SMTP delivery or multi-process concurrency load test; correctness is supported by focused calculation tests, rollback-only PostgreSQL lifecycle/import regressions, type/lint/build checks and fixture browser interactions.
