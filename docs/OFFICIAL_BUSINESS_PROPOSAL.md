# Official Business filing — proposed implementation

Status: accepted by the user and implemented 2026-11-07. See OFFICIAL_BUSINESS_IMPLEMENTATION.md for the delivered contract, validation and rollout. The original proposal below is retained as design history. Main HRIS Phase 1 stays active; implement this attendance extension only when requested, without starting unrelated phases.

## Outcome and current inventory

Employees file Official Business (OB) for one work date, with estimated start/end, destination and reason. An independent authorized reviewer approves the work interval. Schedule views and DTR then explain and account for the approved off-site work, including days with no biometric logs.

Already present: effective-dated employee/base schedules; dated weekly roster entries with OB/WFH labels; manual OB DTR overrides; immutable imported sources; DTR revisions, stale detection and approval/period locks; approved-leave synchronization; branch-aware attendance UI; shared modal, notifications, tab rail and page-header components. Reuse these services and patterns.

Missing: employee OB requests, reviewer decisions/history, structured approved OB intervals, coverage calculations combining office work with OB, request-linked schedule/DTR indicators, and no-log OB rows. The existing calculator exempts OB from ordinary work calculations; merely changing an assignment label is insufficient.

## Contract and recommended defaults

- OB is work, not leave; it never consumes leave credits.
- One request covers one employee and one work date, with full-day or partial-day coverage. Employee identity and employment branch come from the server. Employees may submit only for themselves; authorized HR may file on behalf with explicit attribution.
- Required: work date, estimated start/end, destination type (field/client/another branch), destination branch or location, and business purpose/reason. Optional supporting attachment is deferred until explicitly needed.
- Show scheduled shift and breaks beside the requested interval. Reviewer sees the current schedule, raw punches, existing leave/OB, and proposed credited minutes before deciding.
- Estimated times stay labeled as estimates. Approval is an auditable authorization to credit a work interval, not a claim that a biometric punch happened. Store approved interval separately; if reviewer proposes different times, require employee resubmission or an explicit acknowledged amendment rather than silently changing the request.
- Do not modify recurring schedule rules. Apply approved OB as a dated assignment overlay in the effective schedule. Keep the original shift, breaks and roster revision, and show Office + OB for a mixed day. Date-only schedule changes, if needed, use the existing authorized schedule workflow rather than bypassing it through OB approval.
- An OB destination in another branch does not transfer employment or create a second employee/DTR entry. Home/work-date branch controls approval and accounting; destination alone grants no access to employee records.
- Default approval: one independent scoped HR/Admin/authorized manager. No OB self-approval; the leave-specific self-approval override does not automatically apply to OB. Linked IT accounts may file for themselves if attendance self-service permits, but gain no reviewer authority.
- Allow same-day and retrospective filing within an open period, with a mandatory explanation for retrospective requests. Show Pending OB immediately to authorized reviewers, but do not treat it as approved attendance.
- Block approval/cancellation/amendment affecting an APPROVED or LOCKED DTR period until an authorized reopen. Filing may remain pending while blocked; surface the reason clearly.
- Validate overnight intervals with explicit next-day end, branch timezone, and a bounded span compatible with existing attendance rules. Do not infer a same-time start/end to mean 24 hours.
- Proposed defaults require business confirmation before implementing credited-time policy: paid regular-work credit within scheduled hours; standard configured break deductions; no automatic overtime. The estimated/approved interval is the credited basis in v1; actual completion confirmation is a separate optional future workflow.

## Workflow and visibility

Request states: PENDING -> APPROVED or REJECTED; PENDING -> CANCELLED by the filer. Keep drafts as unsent local form state only in v1.

Approved withdrawal uses a cancellation request. Until its independent approval, the original OB remains effective. After approval, remove only that request's active overlay and recalculate; preserve all history. Corrections require cancellation/replacement or a versioned amendment, never editing past approval silently.

Notify authorized reviewers on submission and the employee on decision. Show pending/approved/cancellation badges in My Work Schedule, the branch roster, attendance overview and DTR review. Reviewers see the reason in the request drawer; shared calendar cells show only OB, destination summary and status. Avoid private reasons in broad notifications/exports.

## DTR calculation and synchronization

Introduce one structured effective-attendance context used by import preview, commit, recalculate, review, overview and exports. Resolve the base schedule, dated roster, approved leave, approved OB intervals, raw punches and explicit manual corrections consistently. Do not infer approved OB from free-text labels.

1. Preserve raw biometric rows and original IN/OUT. Display approved OB intervals as separate evidence with request reference and approver.
2. Full-day approved OB without punches creates a derived attendance row/status, not synthetic biometric punches. Include it in roster, overview, DTR generation and exports even if no import source exists.
3. Partial-day OB credits only its approved interval. The remaining scheduled interval still requires valid office attendance or explicit review. A known office IN followed by approved OB through shift end can resolve the missing office OUT only under a documented continuity rule and departure boundary; never bridge an unexplained gap automatically.
4. Derive regular credited minutes from the union of validated office-work and approved OB intervals, clipped to the scheduled work window, less configured breaks once. Keep actual worked minutes and approved OB credited minutes separately visible. Never sum overlapping intervals twice.
5. Compute late/undertime against uncovered scheduled time. Full-day OB does not falsely produce absence; partial OB does not erase a real uncovered period. Rest-day/holiday OB and time outside the shift require explicit review and the existing separate OT approval policy.
6. Reject overlapping active OB intervals, conflicting full-day leave and overlapping partial leave. Since existing half-day leave may not identify AM/PM intervals, block ambiguous same-day combinations until HR resolves them or explicit leave-period support is designed. Do not guess precedence.
7. Flag contradictory punches, changed schedules, unresolved breaks, manual NORMAL/OB overrides and multiple-source ambiguity for review. Existing manual OB labels/overrides remain supported as legacy sources; show their provenance and avoid double credit.
8. Approval/cancellation runs in one PostgreSQL transaction with existing DTR branch locking, employee/date serialization, overlap checks, request version checks and idempotency keys. Use a consistent lock order across OB, roster edits, leave and DTR commit/period approval.
9. Store schedule/roster revision and approved-context version in DTR sources. Approval, cancellation, relevant schedule edits and punches invalidate affected drafts/previews. Return committed rows to DRAFT or mark stale, clear prior approval, and prevent stale export until reviewed. Never alter locked snapshots silently.
10. Handle approval-before-import, approval-after-import, repeat import and no-punch days identically. Cancellation removes the linked derived row only if it has no other sources; otherwise recalculate the existing row.

Examples for acceptance:

| Situation | Expected outcome |
| --- | --- |
| 09:00–18:00 shift; office IN 09:00; OB 13:00–18:00; no office OUT | Approved OB explains the missing OUT. Credit the OB interval; credit office time only with a valid departure boundary or approved continuity rule. Deduct the configured break once. |
| Full-shift field assignment; no punches | Approved OB row exists with approved credited hours and source reference; raw punches remain empty. |
| Another-branch assignment | One employee/day record in the responsible branch; destination displayed without granting destination-wide access. |
| OB only 15:00–18:00; no evidence for 09:00–15:00 | Do not credit a full day; uncovered portion remains flagged. |
| Actual punch overlaps approved OB | Count overlapping minutes once, retain both sources. |
| Pending/rejected/cancelled OB | Pending explains a request is awaiting review; only approved OB changes credited attendance. |

## Frontend component design

1. Component tree: AttendanceWorkspace -> OfficialBusinessWorkspace -> OBToolbar, OBRequestList, OBRequestFormModal, OBRequestDrawer, OBAttendancePreview, OBHistoryTimeline. Reuse PageHeader/PageHelp, AttendanceSectionNav, Modal, confirmation and existing feedback primitives. Add compact OB badges to MyWorkSchedule and WeeklyWorkRoster; shared DTR output shows actual versus approved OB sources.
2. Responsibilities: workspace owns queries/actions; toolbar owns filter controls; list shows summaries; form owns validated inputs; drawer owns review presentation; preview explains calculated impact; timeline renders append-only events. Schedule/DTR children receive read-only OB summaries rather than implementing approval logic themselves.
3. Contracts: typed OBRequest/OBSummary/OBPreview/OBEvent interfaces, list filters, pagination, expectedVersion and idempotency keys. Events include onSubmit/onApprove/onReject/onCancelRequest. Error response includes safe code, message, field errors and conflict details. API-derived identity, permission flags and calculation are authoritative.
4. State: server state via existing query cache; branch/status/employee/date/page filters in URL where supported; form state local until submit; selected request/modal state local or requestId URL for deep links. Submission PENDING, approval/rejection, cancellation request and final cancellation are explicit transitions. Invalidate affected schedule/overview/DTR/notification queries on commit.
5. Visual system: existing red/white/ink design, full-width module content with shared gutters, compact toolbar and aligned File OB/help actions. Employee view defaults to My filings; reviewers see Needs review and All authorized requests. One row/card shows reference, employee (reviewer view), date, time range, destination, status and Open. Preview groups Scheduled, Biometric, Requested OB and Result with concise source labels. Mobile cards and full-width stacked form fields; desktop two-column form/impact preview; responsive review drawer.
6. Accessibility: labeled date/time controls, explanatory next-day toggle, real buttons, keyboard-operable tabs and focus-visible states. Modal traps/restores focus and supports Escape; review confirmation moves focus predictably. Inline errors link to controls; summary/live region announces submit/result/conflict. Status uses text plus color; reduced motion and 200% zoom remain usable.
7. Required UI states: matching skeletons; no requests; no base schedule; no linked employee; unauthorized; pending; rejection reason; success; unavailable/changed request; duplicate submission; leave/OB overlap; changed shift; locked period; retryable network error; cancellation confirmation. Preserve form inputs after recoverable errors. A preview is informative, never a substitute for approval-time validation.
8. Help: explain when to file OB, estimated versus approved time, missing-punch coverage, pending versus approved effect, and locked-period restrictions in the existing page-help modal.

## Backend/data contract and proposed file boundaries

Add request and append-only event tables with canonical employee/user/branch FKs, work date, timezone, estimated/approved start/end timestamps, destination fields, reason, status/version, actor/decision metadata, original schedule/revision snapshot and unique submission key. Use an approved-interval table/projection linked to request ID if needed by queries; it is derived approval state, not an independent editable source of truth. Include cancellation decision history. Add indexes for employee/date/status and branch/status/date. Never cascade-delete historical requests.

Proposed endpoints under /attendance/official-business: GET me, GET requests (scoped), GET :id, POST preview, POST requests, POST :id/approve, POST :id/reject, POST :id/cancel and POST :id/cancellation-decision. Controller guards enforce module permission plus own/reviewer scope; service rechecks the exact record and schedule branch in transaction. Require a reason for rejection and approved cancellation. Notifications commit with the business event and use existing retry/delivery mechanisms.

Add:
- application/api/src/hr/attendance/official-business/{ob.dto.ts,ob.types.ts,ob.policy.ts,ob.service.ts,ob.controller.ts}: validated transport, policy, request lifecycle and small controller.
- application/api/src/hr/attendance/effective-attendance.ts and approved-official-business.ts: shared structured context and transactional DTR synchronization, reusing existing locking conventions.
- application/api/src/database/migrations/<next-timestamp>-OfficialBusinessRequests.ts: additive tables/indexes/constraints only.
- application/web/app/attendance/official-business/{types.ts,api.ts,workspace.tsx,request-form.tsx,request-list.tsx,request-drawer.tsx,attendance-preview.tsx,history.tsx,ob.module.css}: isolated feature responsibilities.
- docs/OFFICIAL_BUSINESS_IMPLEMENTATION.md: approved policy, API contract, rollout and verification results when implementation begins.

Change the attendance workspace/nav/client contracts, MyWorkSchedule and WeeklyWorkRoster, DTR calculator/types/service/import/review/output/export, attendance overview queries, HR module provider wiring, module-permission registry if required and page-help guide. Exact registry/notification file ownership is confirmed during implementation. Keep large existing workspace orchestration thin; no parallel authentication, schedule or notification system.

## Verification and rollout

Implementation order: approve policy defaults and source-of-truth contract -> additive schema -> request/approval/RBAC tests -> effective-context and DTR integration -> employee/reviewer UI -> no-log overview/roster/export integration -> independent code review against the supplied checklist -> migration/build/browser checks.

Must-pass tests:
- Own-record access; branch isolation including direct ID/URL changes; destination branch cannot widen scope; no self-approval; linked IT filing without review privileges.
- Invalid dates, zero/negative/overnight intervals, invalid employment dates, missing schedule and inactive employee.
- Two concurrent approvals/submissions, stale request version, duplicate retry, overlap with approved leave/OB and branch transfer between filing/decision.
- Full-day no-punch OB, partial OB with missing OUT, unexplained gaps, break deduction once, overlapping punches, no automatic OT, rest-day/holiday review.
- Approval before/after import; duplicate import; preview becoming stale after OB/schedule change; locked period; approved cancellation and recalculation; no-log source removal.
- Rollback after a failed schedule/DTR update leaves request, overlay and notifications consistent. SMTP failure cannot lose the committed request.
- Identical credit/status/source attribution in schedule, overview, DTR review and Excel/PDF exports.
- Browser employee filing -> reviewer preview/decision -> DTR result; reject/cancel/error recovery; keyboard/focus, screen-reader labels, reduced motion and 360/768/1440px layouts without overflow.

Use rollback-only PostgreSQL fixtures for integration; no production balance/attendance changes for testing. Apply additive migrations before deploying dependent API/UI. Existing imported punches and approved/locked cutoffs remain unchanged. Historical roster OB entries stay legacy; do not fabricate employee requests or approvers for them. No new payroll calculation engine.

## Business decisions to confirm before implementation

1. Is reviewer approval sufficient to credit the entered estimated interval, or must the employee later confirm actual completion? Recommended v1: approved interval is explicit credited-work authorization; changes require review.
2. May scoped Branch Managers approve OB, or only HR/Super Admin? Recommended: independent scoped Branch Manager/HR/Super Admin with attendance edit/review permission.
3. For office IN + afternoon OB + no office OUT, may approval attest continuous work until OB starts? Recommended: require explicit reviewer confirmation of the office-to-field departure boundary; do not silently infer it.
4. What retrospective filing window applies? Recommended v1: current open cutoff, required explanation; locked periods require authorized reopening.

No claim of zero defects: implementation is ready only after the above checks pass and any remaining gaps are documented. This is a repository-grounded proposal, not an implemented or tested feature.
