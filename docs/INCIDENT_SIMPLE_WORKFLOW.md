# Simple incident workflow — approved 2026-11-05

Scope: the five changes approved in chat: simple visible workflow, structured decision, explicit disciplinary permission, withdrawal/dismissal with reasons, and filtered CSV reporting. Categories stay fixed; drafts and category administration are excluded. Main HRIS Phase 1 remains active.

## Component design

1. Tree: existing WorkWorkspace → IncidentControls / IncidentAuthority / RecordCollection; existing RecordDetail → IncidentWorkspace → IncidentDecisionFields and case history. Reuse Modal, confirmation provider, attachments and query loading/error handling.
2. Responsibilities: workspace owns list/detail orchestration; controls own filters/export; authority owns explicitly granted account authority; decision fields collect the single structured decision; incident workspace owns permitted next actions and displays the visible workflow.
3. Contracts: typed authority accounts {id,name,role,granted}; authority POST {userId,granted,reason}. Decisions extend existing WorkActionDto with findings, outcome (NO_VIOLATION/CONFIRMED), disciplinaryAction (NONE/WARNING/REPRIMAND/SUSPENSION/OTHER), actionDetails and required message/reason. Historical unstructured decisions remain readable. New RESOLVE/DECIDE submissions require structured fields; deploy web and API together after the migration. Server returns canDiscipline and workflow status. All errors reuse {message}.
4. State: server owns case, authority and records. Existing query cache invalidates after writes. Filters and selection stay local in the existing workspace. Decision fields use form state; action details required only when action selected. Terminal actions require confirmation and a reason. No automatic classification, sanction execution, attendance edit or payroll effect.
5. Visuals: preserve red/neutral surfaces, spacing and typography. One current-step badge and one action composer. Category/date/branch/employee filters share existing responsive groups. Authority is an optional disclosure for Super Admin, not a separate page. Narrow screens stack fields; export is a secondary action.
6. Accessibility: native labeled selects/inputs/textarea, visible focus, keyboard-operable disclosure, pending buttons disabled, errors announced, existing modal focus trapping and confirmation reused. No new motion. Long text wraps and controls fit at mobile widths and zoom.
7. Files: API work DTO/policy/service/controller, new incident-authority service and incident-report utility, one additive migration; web work types/workspace/incident-controls/incident-workspace, new decision and authority components, small CSS additions; focused API/frontend tests. Existing proxy handles routes and downloads.
8. Verification: transition/DTO/CSV tests; rollback-only PostgreSQL authority, branch/self-review, lifecycle, privacy and export tests; component action/decision/filter tests, frontend type/lint, API build/type-aware lint. Browser fixture if available. No real incident records or email sent in tests.

## Authority and lifecycle contract

Only active Super Admins may explicitly grant/revoke authority for active Super Admin/HR Admin/Branch Manager accounts within their authenticated branch scope. Explicit self-grant by a Super Admin is allowed, confirmed and audited; role alone grants nothing. Authority never widens case visibility or manager reviewer assignment. Grants are account-wide within existing branch scope; every notice/decision checks live authority under the account lock. No automatic grant/backfill. Existing history and open cases remain readable.

Stored report/case statuses remain compatible. A derived visible step shows Submitted → Under Review → Pending Explanation → For Decision → Resolved/Closed. Clarification maps to Pending Explanation; formal notice/response takes precedence. Structured resolution can complete an ordinary review without formal discipline; a confirmed disciplinary action requires authority. Formal cases require notice/explanation before decision. Withdrawal is reporter-only on an open report with no active formal case; dismissal is authorized HR/Super review or explicitly authorized assigned manager. Both retain all history and require reasons. No reopening.

CSV uses the same authorized collection query and employee/category/branch/date/status/queue filters, with a 5,000-row maximum. Only management roles can export. Columns contain summary metadata and visible workflow, never descriptions, internal notes, findings, evidence or private correspondence. CSV cells are quoted and spreadsheet formula prefixes neutralized. Export itself is audited.

## Rollout

Apply additive SimpleIncidentWorkflow migration before updated API. It adds the explicit grant table and expands the existing status check; no business record rewrite or role grants. Structured decisions live in existing append-only work-event metadata. Recovery is a forward migration; preserve history. No later HRIS phase starts.

The local database migration is verified as applied, with unchanged incident counts and zero authority grants. Other environments must apply `1794441600000-SimpleIncidentWorkflow` before the API/web update. Initial setup: a Super Admin opens Incidents → Disciplinary authority, selects an eligible account, enters a reason and confirms the grant. To manage an independent Super Admin account with no branch, select All branches first. No real account grants were made during implementation.

## Implemented file boundaries

- API lifecycle and validation: `application/api/src/work/work.dto.ts`, `work.policy.ts`, `work.service.ts`, `work.controller.ts`.
- Authority and export: `application/api/src/work/incident-authority.ts`, `incident-report.ts`; additive schema: `application/api/src/database/migrations/1794441600000-SimpleIncidentWorkflow.ts`.
- UI orchestration/types: `application/web/app/work/workspace.tsx`, `types.ts`, `presentation.ts`.
- Existing presentation: `application/web/app/work/incident-controls.tsx`, `incident-workspace.tsx`, `detail-overview.tsx`, `record-collection.tsx`, `workspace.module.css`.
- New focused components: `application/web/app/work/incident-decision-fields.tsx`, `incident-authority.tsx`, `incident-export.tsx`.
- Tests: API work policy/PostgreSQL/report suites and frontend work action/decision/reporting suites. The existing auth guard and proxy protect every new route.

## Verification

- API work plus shared authorization guard: 109 tests passed, including rollback-only PostgreSQL fixtures. New coverage includes no automatic authority even for Super Admin, grant/revoke audit, denied grants, independent assigned-manager decisions, branch/self-review restrictions, required findings/reasons, no confidential decision leakage to reporters, terminal states, filtered export, transferred employees and oversized-export rejection.
- Frontend work plus work proxy: 37 tests passed. Browser fixtures using actual components passed 29 grouped checks at 360/768/1440px, including required decision fields, dependent action details, complete decision payload, closure, withdrawal/dismissal confirmations, grant control, unauthorized action hiding, branch/employee/category filters, CSV requests and the category placeholder. No runtime exceptions or viewport overflow. Mobile decision and desktop list screenshots inspected. Evidence: `tmp/simple-incident-review/checks.json` and screenshots; fixture writes use artificial data only.
- API production build/type-aware lint and frontend TypeScript/changed-file ESLint passed. Frontend production Webpack build passed, including TypeScript and all 43 generated pages. Live read-only health returned 200; anonymous incident list/authority/export returned 401. Real signed-in mutations and SMTP delivery were not exercised.

Commands: API `WORK_DB_TEST=true npx.cmd vitest run src/work src/security/auth.guard.spec.ts --testTimeout=20000 --hookTimeout=30000`, `npm.cmd run build`, `npx.cmd oxlint --type-aware src/work/ src/database/migrations/1794441600000-SimpleIncidentWorkflow.ts`; web `npx.cmd vitest run app/work app/api/work`, `npx.cmd tsc --noEmit`, changed-file `npx.cmd eslint`, `npm.cmd run build -- --webpack`; fixture `bun run tmp/build-simple-incident-fixture.ts` and `node tmp/check-simple-incident.mjs`. The browser check runs outside the execution sandbox against local artificial fixtures; it sends no real API writes. `node tmp/apply-simple-incident.mjs` verified migration registration, unchanged incident records and zero grants.

Review: reporter payloads never receive confidential structured decision contents via resolution summaries; case participants see only audience-permitted events. Audit entries omit detailed findings/action text. Authority checks serialize with grant/revoke through account locks and read grants after the lock with a fresh statement snapshot. CSV uses the existing authorized collection query, additionally enforces branch scope and exports a fixed metadata allowlist. No payroll, attendance, automatic offense or retrospective discipline changes.
