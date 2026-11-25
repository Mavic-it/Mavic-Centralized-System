# Inquiry monitoring and management

## Contract and inventory

The existing CRM inquiry service stores a small legacy record in PostgreSQL (with a non-production test adapter). Its controller has no HTTP method decorators. There are no inquiry pages; the sidebar entry is disabled. Customers likewise have no exposed HTTP workflow. Reservations already implement locking, capacity, scheduling, payment and approval rules. Branches, module access, audit logs, notifications, loading components and appearance tokens are reusable. Existing unrelated working-tree changes must be preserved.

The locally inspected workbook has ORTIGAS, MAKATI, BOTH BRANCH and three pivot sheets. ORTIGAS column A is inquiry date despite a blank header; B is reservation date. Other sheets start with DATE. No workbook or personal rows are committed.

A local parser-only audit read 2,429 inquiry records from the supplied workbook, found no missing inquiry dates and identified 197 legacy Reserved rows. These are observations of that file, never application constants. Parsing did not import its personal data into an application database.

## Architecture and trust boundaries

Extend the existing inquiries table additively. Handling branch alone controls ownership; preferred branches never confer access. All API reads, aggregates, exports and mutations must enforce authenticated module grants and selected branch scope. New records may omit contacts/customer ID. Customer linking requires the same handling branch; names never automatically merge customers. Assignment requires an active account attached to the handling branch or an active Super Admin. Services and preferred branches use join tables. PostgreSQL sequence references tolerate gaps. Writes use transactions, immutable events and optimistic versions. Archive is reversible. Imported reserved is a legacy outcome, never a system reservation.

## Component design

1. Tree: protected server page -> InquiryWorkspace -> InquiryFilters; InquiryList (table/Kanban); InquiryDashboard; InquiryFollowUps; InquiryReports; InquirySettings. Separate InquiryForm, InquiryDetail, InquiryImport dialogs; shared Modal and content-loading primitives.
2. Ownership: workspace fetches and invalidates server data; presentations receive typed records and callbacks; form owns draft/validation; detail owns activity/task actions; import owns upload/preview/confirmation.
3. Contracts: typed inquiry, lookup, metadata, paginated collection and detail/event/task responses; API failures expose safe message/status; never render source HTML.
4. State: query server state; local filters, page and view; local form drafts and dialogs. Pending disables duplicate submits; successful writes invalidate queries; denied access, empty data and errors with retry are explicit. Archive confirmation and reopen reasons are required.
5. Visual system: existing app shell/sidebar group, semantic surface/border/text/primary/status tokens, configurable title/header/body font sizes. Compact operational headers; responsive filter grid and form sections; horizontally scrollable tables and Kanban columns.
6. Accessibility: semantic headings/forms/tables/buttons, labels and red required markers, keyboard-operable cards (no drag-only controls), native dialog focus trap/Escape/return focus, alert feedback, visible focus, reduced-motion-safe skeletons, usable narrow viewport and zoom.
7. Files: API crm/inquiries owns management DTO/service/controller/import/domain tests; database/migrations owns additive schema; web inquiries owns feature contracts/components/styles; workspace route files own authorization; api/inquiries owns cookie forwarding. Permission registry and shell are extended narrowly.
8. Verification: validation/lifecycle/import tests, branch-denial/filter tests, API and frontend typechecks/lint/build; PostgreSQL integration only against an explicitly disposable test database. Browser checks require an available authenticated running environment.

## Phases and acceptance

- Phase 1: audit, contract, workbook structure, design (complete).
- Phase 2: implemented additive schema, persistent CRUD/lookups, branch and module grants, scoped customer matching, assignment and history.
- Phase 3: implemented sidebar/routes, table/Kanban/form/detail, appearance tokens and loading states.
- Phase 4: implemented immutable activity, versioned follow-up completion/rescheduling, server-paginated queues, configurable reminders/escalations, and bounded preview/confirm imports with editable mappings/corrections and idempotency.
- Phase 5: implemented filtered database analytics, CSV/XLSX/PDF exports, Overview reporting source and transactional reservation links using the existing reservation workflow.
- Phase 6: automated verification and code review implemented; final checks and operational limits are recorded below. Authenticated browser acceptance and deployment remain separate verification steps.

Success requires server-enforced handling-branch scope on every endpoint; no fabricated data; version conflicts preserve history; required follow-up and loss/reopen reasons enforced; preview never writes; confirming the same import cannot duplicate rows; global aggregates count inquiry IDs once; exports are formula-safe and share filters.

## Migration and operations

Migration 1795910400000 is additive, preserves legacy columns/records and adds lookup/join/event/task/import structures and indexes. Existing rows retain unknown dates rather than inventing inquiry dates. Invalid old follow-up timestamp strings remain in the original JSON without unsafe casts. Historical staff and budget constraints use NOT VALID so old anomalies survive while new writes are constrained; validate them after a separately reviewed cleanup. Migration 1795910401000 adds inquiry reservation links, unique conversion request keys and reservation-state synchronization across multiple linked bookings. Deploy both migrations before new API/web. Do not reset the database. Rollback application code first; retain new tables/data for recovery rather than destructive down migration. Review backups, retention of import raw source data and operational query plans before production rollout. Application databases have not been migrated by this implementation task; integration fixtures run in isolated schemas inside rolled-back transactions.

Migration 1795910402000 repairs inquiry event tables that were recorded as migrated without the `sequence` column. It assigns existing events a stable chronological order and adds the sequence default/index for new events. Apply this migration before using event history, lost-reason filters, dashboard or reports on an affected database.

Migration 1795910403000 repairs inquiry databases that recorded the management migration but lack the task `action_type`, `priority`, `version`, or `reminder_checked_at` columns and the `inquiry_task_reminders` table. The missing fields receive the original defaults; existing task rows are preserved. The reminder table restores the original foreign keys and composite key, so repeated worker runs deduplicate notices. Apply this forward migration before running the reminder worker; do not delete the migration history or rerun the original management migration. Roll back application code if needed and retain task/reminder history. The migration runs transactionally, and its `IF NOT EXISTS` clauses make an interrupted repair safe to retry.

## KPI definitions

Inquiry cohort uses inquiry_date (inclusive date range), excludes archived unless explicitly requested and applies handling-branch scope. Null historical dates appear only in unbounded cohorts. Global totals count IDs once. Conversion denominator is all inquiries in that cohort excluding Needs Review; numerator is distinct currently CONVERTED inquiries with verified service-conversion or reservation-completion history. Imported legacy outcomes alone never count; an imported inquiry can subsequently gain a real verified conversion. Reserved counts require system reservation history. Legacy Reserved counts identify historical imports and can overlap a later verified outcome. Follow-up today/overdue KPIs count tasks, while their inquiry drill-down counts distinct inquiries with such tasks. Business days use Asia/Manila. Service totals can overlap and are non-additive. Zero denominators yield zero.

## Implemented API and frontend inventory

All API routes are under `/inquiries`, protected by authentication, granular module permission resolution, persistent rate limits and handling-branch scope. JSON requests use strict DTO validation; multipart options use bounded allowlists. Read-only grants are supported independently from mutation grants. Record mutations also require inquiry view permission so a successful write cannot be followed by a denied detail response.

| Routes | Behavior |
| --- | --- |
| GET/POST `/`; GET/PATCH `/:id` | Paginated/sorted filters, create, detail, versioned edit |
| GET `/metadata`, `/customers` | Authorized branches/staff/lookups/permissions; customer suggestions by name or normalized email/phone, never automatic merging |
| POST `/:id/action`, `/bulk` | Status/reopen with reason; archive/restore with reason and audit |
| POST `/:id/activities` | Append-only activity history |
| GET `/followups`; POST `/:id/tasks`, `/:id/tasks/:taskId`, `/:id/tasks/:taskId/reschedule` | Server-paginated queues, scheduling, completion/cancellation and versioned rescheduling |
| POST `/settings`; PATCH `/settings/:id` | Create/edit/reorder/deactivate lookup values; historical references remain |
| GET/PATCH `/settings/reminders?branchId=...` | Per-branch reminder enablement, advance minutes, overdue enablement and escalation hours |
| POST `/import/preview`, `/import/confirm` | XLSX/CSV validation, mapping, corrections, duplicate review and import |
| GET `/dashboard`, `/reports`, `/export` | Real cohort aggregates; detailed or summary CSV/XLSX/PDF exports |
| POST `/:id/convert-service` | Evidence-backed non-reservation service conversion |

Existing POST `/reservations` accepts `inquiryId` and a UUID `inquiryRequestKey`. It locks the inquiry, checks its scope and eligible service/branch, returns an existing booking on retry, and uses existing resource locking, availability, price, payment and approval rules. Successful booking changes synchronize the inquiry through the database trigger. Cancelling one booking cannot override another completed/confirmed linked booking. Reusing a conversion request cannot create a second booking.

Frontend routes: `/inquiries`, `/inquiries/list`, `/inquiries/followups`, `/inquiries/reports`, `/inquiries/settings`. Server page authorization wraps each route. Feature components are under `application/web/app/inquiries`; cookie-forwarding API handlers are under `application/web/app/api/inquiries`. Existing app shell, native Modal, loading primitives, query provider and semantic appearance tokens are reused. Reservation prefill passes only the inquiry ID in the URL; contact details are fetched through the protected API.

## Import behavior and limits

- Inquiry and reservation dates remain separate. Missing Ortigas date headers, differing layouts, repeated headers, pivots, blank rows, serial dates, textual dates, spelling/case variants, multi-service cells and N/A values are handled. Numeric day/month ambiguity stays unresolved with original values retained.
- Preview writes no records. Header rows and columns can be remapped per sheet. Up to 100 row corrections can be supplied per request; larger corrections should be made in the workbook. Corrections require revalidation before confirmation. They cannot fabricate verified conversion outcomes or change branch ownership.
- The handling branch is explicitly chosen for the batch; sheet names suggest preferred branches only within authorized access. Both Branch resolves the two historical branch names without creating a synthetic branch.
- Upload limit: 5 MB; expanded ZIP metadata limit: 30 MB; 30 worksheets; 5,000 records; 51 columns. Encrypted/ZIP64 archives are rejected. Raw rows, normalized values, worksheet/row, checksum, importing actor and time are persisted for imported records. Repeated exact rows from the same source position are skipped, and possible same-client/date matches are flagged for review without overwriting existing inquiries.
- Historical Reserved becomes a closed legacy outcome. Historical follow-up dates remain source metadata rather than fabricated new overdue tasks. Imported activities retain unknown historical timestamps/actors; the import itself has its real actor and time.
- Filtered detail exports cap at 5,000 records; summary exports query aggregates directly. Spreadsheet text is formula-safe. PDF uses a paginated basic Latin report; XLSX/CSV retain Unicode.

## Review findings addressed

The review corrected ORM update-result handling (repeated task completion), stale task schedules, null contact normalization, immutable event ordering, reference truncation after six digits, read-only/granular routing, settings rendering, upload buffering bounds, import row numbers/options, duplicate ownership checks, historical activity attribution, reminder deduplication/starvation, and verified conversions after legacy imports. Security and integration fixtures use synthetic records only.

## Local validation and rollout

Run the API and web builds with the existing Bun scripts. The API discovers compiled migrations under `dist/database/migrations`; review **all** pending migrations before enabling the repository's `DB_MIGRATIONS_RUN` option in a local/staging environment. Other unrelated migrations already present in the working tree must not be applied implicitly. This work does not deploy or reset any database.

For focused database tests, use PowerShell from the repository root:

```powershell
$env:INQUIRY_DB_TEST='true'
$env:RESERVATION_DB_TEST='true'
bun run --cwd application/api test src/crm/inquiries src/crm/crm.module.spec.ts src/security/business-persistence.spec.ts src/operations/reservations/reservation-management.service.spec.ts src/operations/reservations/reservation-management.integration.spec.ts src/reporting/analytics.spec.ts --no-file-parallelism --hookTimeout=60000 --testTimeout=60000
```

The inquiry fixture refuses non-local database hosts, creates isolated schemas and rolls back data/schema changes. Serial database tests avoid a demonstrated host-load timeout in parallel fixture setup. Integration environment flags are opt-in; normal CI remains compatible with the existing test/build scripts. No packages, Docker definitions or deployment workflows were changed.

Remaining acceptance work: authenticated browser interaction/keyboard/zoom and narrow/wide light/dark/accent screenshot review; Docker image build in CI; and operational retention/backup/index review before production rollout. No general CRM attachment storage or customer-profile UI exists to safely reuse, so attachment upload and customer-profile presentation were not introduced. Follow-up calendars intentionally show a labeled page of queue results, with paging controls. Grouped charts are lightweight CSS distributions with accessible counts; they do not introduce a chart dependency.

## Validation results (2026-11-24)

- Final targeted backend run: **83 tests passed across 9 files**, including inquiry PostgreSQL migration/workflow fixtures, reservation PostgreSQL availability/lifecycle tests, CRM compatibility, persistence and analytics tests. Parallel fixture setup previously exceeded the default 10-second hook budget under host load; the documented serial run with 60-second limits passed.
- Frontend/proxy/access run: **16 tests passed across 3 files**. Covers escaped record presentation, semantic tables/Kanban, empty denominators, ID-based and cohort-bounded drill-down, management/read-only settings, response validation, error propagation, authentication forwarding and upload bounds.
- API and frontend production builds passed. Frontend full TypeScript check passed. Focused API type-aware lint passed without warnings; focused frontend ESLint passed. All five inquiry pages and the API proxy appear in the successful Next.js route build.
- A broad API `tsc --noEmit -p application/api/tsconfig.json` also includes existing repository test files and reported unrelated pre-existing errors; the supported `bun run build` source configuration succeeds. This work does not claim that unrelated whole-repository checks pass.
- Docker/Actions definitions were inspected for script and dependency compatibility; actual image builds and an authenticated end-to-end browser session were not run. Unit rendering checks do not substitute for those acceptance checks.

## Local reminder schema repair (2026-11-25)

The local database had the inquiry management migration recorded but lacked the four task fields and reminder table above. It held zero inquiry tasks at the time of repair. The local API applied migration 1795910403000; the migration record and repaired schema were verified directly. The compiled reminder worker completed a local run with zero warnings. A PostgreSQL integration test recreated the incomplete schema, preserved an existing task through the repair, reran the migration to verify idempotence, and confirmed one reminder/notification across two worker runs. All 19 inquiry integration tests, focused type-aware lint and the API build passed. Other environments require their own schema check and normal migration rollout before the worker starts.
