# Business Rules Context

## Leave cancellation and filing (2026-11-06)

- Future approved leave cancellation requires an employee request and an authorized reviewer decision. A reviewer may propose cancellation of a pending/future approved request; the employee may confirm, explain why it should continue, or suggest new dates. A reschedule suggestion requires reviewer approval and becomes a new PENDING request; the original remains active until the decision is finalized.
- Do not restore/deduct credits or change attendance while cancellation is pending. On an approved cancellation, restore eligible paid usage and synchronize attendance atomically. Preserve branch scope, request history and reviewer separation for employee-originated cancellation.
- New Vacation Leave (VL) and Leave Without Pay (LWOP) requests require three calendar days’ advance notice in Philippine Time; a configured longer notice wins. Enforce on the API and show it in the filing form. Other leave types follow their effective policy notice.

## Employee employment classifications (2026-11-06)

- New employee forms offer PROBATIONARY (display Provisionary), REGULAR, PROJECT_BASED and CONTRACTUAL. Existing FULL_TIME/PART_TIME/CONTRACT data is retained. Provisionary employment requires probationEndDate and evaluationDueDate, both valid date-only values no earlier than the start date; evaluation due is a displayed status, not an automatic review workflow.
- Employee statuses are ACTIVE, INACTIVE, RESIGNED, RETIRED and TERMINATED. Job levels are RANK_AND_FILE, SUPERVISORY and MANAGERIAL, with unchanged historical values allowed when editing existing records.
- Each branch starts with Executive Department, Admin, Marketing, Accounting, IT and Maintenance; existing custom departments and assignments remain. Explicit REGULAR employment qualifies for regular-only leave when all other policy checks pass; explicit non-regular classifications cannot use a stale legacy profile flag to qualify. Legacy employment codes retain their existing regularization checks.
- This is employee-core work within active HRIS Phase 1. Contract and rollout: `docs/EMPLOYEE_EMPLOYMENT_DEFAULTS.md`.

## Simple incident workflow (user-approved 2026-11-05)

- This supersedes role-only formal discipline below: every Super Admin, HR Admin and assigned Branch Manager needs an explicit account grant to initiate a formal case, issue NTE or record its decision. A grant never bypasses branch scope, assigned reviewer requirements or no-self-review. Super Admin manages grants/revocations with a reason, confirmation and audit; no automatic role grants. Explicit Super Admin self-grant is allowed and audited.
- New resolutions/decisions require findings, an outcome and an action choice. A disciplinary action requires a confirmed finding, action details, explicit authority and the formal notice/explanation path. Recording it never changes attendance or payroll. One formal decision closes both report and case; historical unstructured decisions remain readable.
- Reporter-only withdrawal is permitted on an open report without an active formal case. Dismissal requires an independent HR/Super reviewer; assigned managers need explicit disciplinary authority. Dismissing an existing formal case always requires that authority. Both require a reason and preserve history. Terminal records cannot reopen.
- Incident list and CSV reporting support employee, category, branch, date and existing status/queue filters. CSV excludes private narrative, findings, decisions and evidence; branch scope is rechecked even for personal report participants. Management exports are capped at 5,000 records, formula-safe and audited.
- Fixed categories remain; drafts/category administration remain excluded. Main HRIS Phase 1 remains active. Design, rollout and validation: `docs/INCIDENT_SIMPLE_WORKFLOW.md`.

- No business rule is assumed from a UI behavior or client request.
- Authoritative rules must be documented here or in the owning domain module.
- Authorization and ownership decisions are always enforced by the API.
- Ambiguous requirements must be identified as open decisions before implementation.

## Tasks and confidential cases (user-confirmed 2026-10-28)

- Tasks use the canonical employee identity and require a different authorized manager to accept an assignee's completion.
- Employees immediately see tasks assigned to them and reports created by Super/HR admins or Branch Managers that name them as the concerned employee, including when selected later. Incident creation-role snapshots govern existing reports too; internal/reporter-only follow-ups remain private and confidential employee-origin reports retain notice-only subject access. Initial files on new management reports are shared with record participants; existing file audiences are preserved.
- Incident review is limited to Super/HR admins within scope and Branch Managers explicitly assigned to a case. Reporters and concerned employees cannot review their own case.
- Incident reports are allegations; no automatic violation, sanction, attendance edit or payroll deduction is created.
- Reporter correspondence, employee notices/explanations and internal case notes have separate server-enforced audiences. IT administrators gain no access to confidential incident or case content. A linked IT Admin can access only tasks explicitly assigned to their employee identity and receives those task notifications without manager or review privileges.
- The maintained implementation contract is `docs/TASKS_AND_INCIDENTS.md`. This targeted user request does not advance unrelated HRIS phases.

## Complete incident workflow (user-authorized 2026-10-29)

- Self-reported incidents are reports, never automatic disciplinary cases. Employee self-report identity/branch/source is server derived and supplementary statements are append-only.
- Assigned managers may acknowledge, clarify, note and refer to an authorized HR/Super reviewer. Only scoped Super/HR reviewers resolve/close reports or initiate formal discipline. Existing no-self-review and explicit Branch Manager designation remain.
- SUBMITTED and DETAILS_REQUESTED remain compatible stored statuses (display Pending review and Needs clarification). HR referral/resolution add ESCALATED/RESOLVED; closure requires resolution. Formal case_status has an independent notice/response/decision lifecycle on its originating incident.
- Internal referral reasons/notes stay private. Clarification/visible responses notify addressed participants, and committed notification rows queue safe email independently of SMTP success. Full contract: docs/INCIDENT_WORKFLOW_IMPLEMENTATION.md. Main HRIS Phase 1 remains active.

## Shared task overview revision (user-authorized 2026-10-29)

- A task may have 1-50 canonical employee assignees sharing one task/status/history. Each is notified and may update progress; an approver must be an authorized manager outside the entire assignee set. Management requires access to every original/current assignee branch.
- A different authorized manager who is not currently assigned may replace the full assignee list on an open task with active employees inside their authorized branch scope. Status, progress and history stay unchanged; new assignees are notified and removed assignees lose access. The operation is version-checked and audited.
- New task forms require a start date no later than the due date. Existing unknown dates and recorded numeric progress are preserved.
- Status selection maps Not started/Started/In progress/Stuck/Done to 0/10/50/retained/100 percent. Done submits FOR_REVIEW until independent acceptance. Stuck is red; no manual percentage input is needed.
- Combined task details support status, comments/review and uploads directly. Creation supports searchable multi-assignee selection with a 50-person cap, grouped priority choices, and required start/due dates. Optional action evidence commits atomically on its comment/review event. Existing incident workflow/privacy and HRIS Phase 1 remain unchanged. Contract: docs/TASK_WORKFLOW_REVISION.md.

## Task automation and branch reporting (user-authorized 2026-11-05)

- Managers may filter task collections by branch only inside their authenticated selected branch scope. Task search, branch filters and Excel/PDF exports apply the same API authorization and filters; exports include up to 5,000 matching tasks and require narrower filters above that limit.
- Shared starter task templates and manager-created branch templates store task title, description and priority. Template endpoints require a manager role and current branch scope; custom template names are case-insensitively unique within a branch.
- Recurring task series support daily, weekly and monthly cadence, require an end date, and are limited to one year. The first task is created immediately; scheduled occurrences preserve the start-date cadence anchor and the due-date offset. Monthly schedules retain the original day when possible. A series uses the same assignees and one branch; cross-branch assignments remain supported for one-off tasks but cannot repeat.
- A worker generates due occurrences in the Asia/Manila calendar and stores task, assignment, immutable creation event, audit, in-app notifications and assignment-mail outbox transactionally. A unique series/occurrence constraint and row locking prevent duplicate generation. A series pauses and is audited if its creator loses branch authority or an assignee becomes inactive or transfers from the series branch. An authorized manager may stop future occurrences, with version checks and audit history; existing tasks remain. HRIS Phase 1 and incident workflows remain unchanged. Full contract: `docs/TASK_WORKFLOW_REVISION.md`.

## Private incident case workspace (user-authorized 2026-10-29)

- Incident creation uses grouped report context, factual narrative/remarks and optional evidence sections. Incident details use one scrollable private workspace with inline permitted actions, audience-labeled history and files instead of redundant tabs.
- Action evidence is optional PDF/PNG/JPEG up to 5 MB and is committed with its immutable event using that event's audience. Standalone upload audience is separate from comment audience. API authorization, branch scope and file validation remain authoritative. No schema or HRIS phase change. Contract: docs/INCIDENT_WORKFLOW_IMPLEMENTATION.md.
- Private case detail uses a single action/comment composer as its file-entry point; action evidence appears inline beside its event. Remarks share the report narrative, and repeated reviewer/source/submission/update metadata is omitted from the summary. Key case reference, subject, branch, date and category remain.

## Incident visibility and scope update (user-authorized 2026-10-29)

- Reports store BRANCH or GENERAL scope; the selected/routed branch remains the authorization anchor for general workplace records.
- Scoped HR/Super Admin and Branch Managers in the concerned employee's reporting hierarchy may read relevant private reports. A reporting-line Branch Manager receives read-only access; reviewer actions still require explicit assignment. Selected branch access is still enforced.
- Routine authorized manager responses may omit a message, while referrals, clarification requests, resolutions, closure and formal notice/decision content remain required. Report creation omits the extra remarks field. Contract: docs/INCIDENT_WORKFLOW_IMPLEMENTATION.md.
