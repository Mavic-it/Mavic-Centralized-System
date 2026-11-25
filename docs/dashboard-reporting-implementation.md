# MAVIC dashboard and reporting implementation

Current state (2026-11-23): Overview presents three authorized headline figures, only nonzero items needing attention, and one selected module at a time. One grouped module selector exposes every permitted source without separate group tabs. Branch and Dates stay visible; More filters contains the custom date range, grouping and applicable status controls. All data-compatible charts for the selected module are visible immediately; the chart section can be collapsed when less detail is wanted. A compact numeric state appears when a distribution would mislead. The report drawer holds full metric definitions, the aggregate table and bounded reservation/people previews. HR shows four curated key figures and only nonzero attention items; module details start collapsed and open to the detailed status pie, category/branch bars and activity trend supported by the selected module. Summary figures use existing authorized sources and show their snapshot/period scope. The duplicate standalone `/reports` page, sidebar entry, analytics export route and dedicated permission remain removed; leave and reservation module reports remain in their modules.

Trend detail (2026-11-23): Record volume over time now shows an integer count scale and selected date labels, plus total records, periods with activity and the peak period. A period inspector exposes the exact count for a chosen point through a visible readout and keyboard-operable range control; all period totals are available on demand in an accessible table. Weekly, monthly and yearly labels identify period starts, with a note that the first and last groups can contain only part of the selected date range. These are counts from the authorized aggregate rows, including zero-activity periods in a populated selected range; no comparison or forecast is inferred.

Other chart detail (2026-11-23): Status mix and category/branch bars show both counts and shares, with a total and leading category summary. Status-over-time columns include a count scale and date labels; selecting a column or using the keyboard period control exposes its total and each status count, and an on-demand table lists exact values across all periods. Long daily trends and status charts use horizontally scrollable plots with bounded height. All details derive from current authorized rows and filters.

Data cleanup and HR priorities (2026-11-23): HR replaces the repeated all-module count-card grid with four decision measures: active employees (current snapshot), hires by employment start date (selected dates), approved overtime hours (payroll-ready DTR rows) and employees on approved leave today (Manila day, independent of period/status filters). Module accordion headings retain one total for navigation; detail panels hold the additional metrics and reports. Attention lists show nonzero operational counts only. Workforce hires are reported as hiring activity, not an urgent attention item. Attention counts remain in source order because counts of unlike items (employees, requests, stock locations) cannot be ranked as one comparable score. Overview module metrics do not repeat an attention count already shown above it. Existing filters, source permissions and definitions remain authoritative; no synthetic rates, payroll figures, missing DTR absences or later-phase HR data are added.

Data cleanup validation (2026-11-23): frontend TypeScript and scoped ESLint passed. Documentation whitespace checks passed. No test suite or signed-in browser review was run for this cleanup.

Implemented 2026-11-21. The main HRIS plan remains in Phase 1. This adds reporting over existing records; it does not introduce later HRIS workflows or change business records.

## Delivered experience

- `/` uses live operations aggregates in a compact overview: three headline figures, nonzero attention links and one grouped selector for authorized modules. Only one module insight is visible at a time, with every data-compatible chart displayed by default and an option to collapse the chart section. The report drawer contains all metric values and definitions, the paginated aggregate table and, when present, today's reservation and permitted employee previews.
- `/hr` uses live workforce, calculated DTR, leave, official business, task and incident aggregates. Its all-module view starts with active employees, new hires, approved overtime and employees on leave today; nonzero attention links follow, then collapsed module panels. A selected panel opens the pie, relevant category/branch bars, trend and deeper report details. The optional People at a glance preview is bounded to six records; department distribution is calculated in PostgreSQL.
- Both dashboards support branch, inclusive date, module, grouping and applicable status filters. Overview keeps Branch and Dates in its primary toolbar and places custom dates, grouping and applicable status under More filters; HR retains its existing filter layout. Date presets cover today, yesterday, seven/thirty days, this month and last month. Applied filters are written to the URL and restored on reload. Aggregates use daily, Monday-based weekly, monthly or yearly buckets.
- The HR dashboard keeps expandable module panels. Overview headline cards and the grouped module selector focus an authorized module. All charts supported by that module's current data appear together without an extra click: a time series for dated activity, stacked columns for bounded status-by-period activity, a donut for multiple statuses, and bars for category/branch comparisons where available. The chart section remains collapsible; a number appears when a distribution would be misleading. Chart status controls focus the selected module's trend and table without changing server authorization. Report tables paginate ten aggregate rows. The Overview drawer previews the first ten reservations starting today and links to the reservations module for the full list.
- Every metric has a source definition. Snapshot metrics are explicitly distinguished from activity in the selected period. No invented comparisons, occupancy percentages or sample KPI values remain in these routes.

Prior Overview layout verification (2026-11-23): 11 focused analytics frontend checks, frontend TypeScript and changed-file ESLint passed before the three-figure/minimal-control refinement. A frontend production build was attempted but stopped when the existing `next/font/google` Geist dependency could not reach Google Fonts from this environment; it did not report an application compilation error. No signed-in browser layout check was performed for that earlier layout.

Minimal Overview refinement verification (2026-11-23): 12 focused analytics frontend checks passed, along with frontend TypeScript and changed-file ESLint. `git diff --check` passed. A signed-in browser layout check and another production build were not run for this refinement; the earlier build attempt was blocked by the Google Fonts fetch noted above.

Collapsed chart verification (2026-11-23): 14 focused analytics frontend checks passed, including the multi-choice and single-choice disclosures. Frontend TypeScript and changed-file ESLint passed. No signed-in browser layout check or new production build was run for this chart-only update.

All-charts disclosure verification (2026-11-23): 15 focused analytics frontend checks passed, covering concurrent trend, stacked, status, branch and category graphs when supported by module data. Frontend TypeScript and changed-file ESLint passed. No signed-in browser layout check or new production build was run for this presentation change.

Detailed chart refinement (2026-11-23): shared count bars now show totals, leading category and each category's share; the status donut and status legend add percentage shares. The status-over-time chart has integer count ticks, more legible bucket labels, selectable columns, a keyboard period inspector with per-status counts and an optional exact-value matrix. Dense plots remain bounded in height and scroll horizontally. Frontend TypeScript and changed-file ESLint passed after this refinement. No test suite or signed-in browser review was run for this pass.

Default-visible charts verification (2026-11-23): the 15 focused analytics frontend checks passed with the chart section initially open for multi-chart and single-chart modules. Frontend TypeScript and changed-file ESLint passed. No signed-in browser layout check or new production build was run for this change.

## API and validation

All endpoints use the existing global authentication guard plus independent analytics authorization:

| Endpoint | Contract |
| --- | --- |
| `GET /analytics/context` | Authorized active branches, reporting categories, Manila date/timezone and coverage notes |
| `GET /analytics/data` | Effective filters and branch scope, generated timestamp, permitted module panels, definitions, metrics and aggregate rows |

Queries accept `mode`, optional `branchId`, inclusive `from`/`to`, `category`, `grouping`, optional `status`, and bounded `reservationPage`. Defaults are overview, all permitted modules, day grouping and the most recent thirty Manila calendar days. DTO validation rejects unknown properties, arrays in scalar fields, invalid categories/grouping and invalid paging. Service validation rejects impossible/reversed dates and ranges exceeding 366 calendar days.

The same-origin Next.js proxy forwards only the context and data endpoints, preserves session cookies, sets private/no-store caching and uses a timeout. Response schemas are validated in the browser. Authentication, branch restrictions and source access are enforced by the API.

## Metric definitions and sources

Every aggregate row is scoped to an authorized active branch. No source queries an unbounded role-derived global scope. Current statuses are used; reporting does not reconstruct a record's historical status as of a past date.

| Category | Included records and date basis | Measures | Required source access |
| --- | --- | --- | --- |
| Workforce | `employees`, current primary branch, all stored employment statuses; one record per employee | Headcount, exact ACTIVE/INACTIVE counts, hires whose `employment.startDate` falls in the period; department and branch distribution | Employee directory plus management role; profile links separately require employee-profile access |
| Reservations | `reservations.start_date_time` within inclusive Manila dates; all statuses | Reservation counts and pending counts; today's count and rows use today independently of selected period | Reservation list |
| Spaces | Active `rooms`, current overlapping reservations and `reservation_space_blocks` | Active spaces; unavailable, occupied, reserved, available counts | Reservation spaces |
| Attendance | Existing `attendance_records.dtr_data`, work date, joined to employee's current primary branch | Recorded employee-days, approved overtime hours, records needing review; status distribution | Attendance plus management role |
| Leave | `leave_requests` overlapping the period, grouped by request start date | Request counts and pending counts; approved `leave_request_days.units` inside the period; usage by leave type; distinct employees on approved leave today | Leave reports and parent policy, plus management role |
| Official business | `attendance_ob_requests.work_date` in the period | Requests by status, pending requests | Attendance plus management role |
| Inventory | Current non-archived catalog balance rows by item, branch and storage location | Stock-location count, low/out-of-stock locations, status distribution | Inventory stock and parent policy |
| Movements | `inventory_movements.created_at` in Manila dates | Posted movements by movement type | Inventory movements and parent policy |
| Assets | Current `assets` in scope | Registered assets by stored status | Inventory overview and parent policy |
| Tasks | Tasks created in the selected Manila dates, not deleted, using WorkService private visibility | Task counts, current overdue counts excluding COMPLETED/CANCELLED | Tasks plus management role |
| Incidents | `workplace_incidents.incident_date`, using WorkService private visibility | Counts by current status; unresolved excludes RESOLVED/CLOSED/WITHDRAWN/DISMISSED | Incidents plus management role; reviewer/participant/reporting-line visibility still applies |
| Accounts | Current scoped primary-branch accounts; HR/branch managers restricted to EMPLOYEE/STAFF | Counts by account status | User access and its domain role restrictions |
| Branches | Current authorized active `branches` | Active branch count and distribution | Branch management access |

Spaces prioritize unavailable maintenance/inactive status or a current block, then checked-in occupancy, then a pending/confirmed reservation; remaining spaces are available. This is a count of spaces, not time/capacity utilization. Historical space usage cannot be inferred from current status.

Attendance uses persisted calculator output. Stale or non-payroll-ready rows are shown as needing review and contribute no approved overtime. Other displayed categories prioritize calculated absence, lateness, presence, leave, rest day and other. These are mutually exclusive recorded-day categories, not an attendance-rate denominator or absence-unit total. Missing records are never generated as absences. The existing roster/holiday/leave/OB calculator remains the authority and is not rerun by reporting.

Low stock uses `on_hand - reserved - quarantined` and the existing catalog reorder threshold. Positive balances at/below threshold are low stock; zero balances are out of stock. Aggregates are labeled stock locations because one item can have several locations. Unlike inventory units are not summed together, and purchase prices/valuation are not exposed.

Workforce uses the same primary-branch boundary as the employee directory. Additional work-branch associations do not duplicate headcount or grant employee-directory visibility. Unassigned accounts and records outside the active scope do not enter branch totals.

Leave usage sums approved daily units, not whole request durations spanning outside the selected dates. The current-leave metric is explicitly independent of date/status filters. Request-start buckets for overlapping leave can precede the start of the selected window; the description states this. No leave reasons, medical documents, private incident narratives, salaries, government identifiers or account contact data are included.

## Access and performance

- Overview and HR dashboard retain separate registered permissions; each source category additionally requires its existing module permission.
- Source permission resolution honors per-user overrides, critical-module protections and explicit parent denial. Domain role restrictions remain in force, including no IT access to confidential HR incidents. Source categories are omitted when denied; requesting one explicitly returns 403.
- Auth middleware rehydrates branch assignments on every request. Analytics gives finite `branchIds` precedence, including an empty array. A fallback global scope requires both explicit `allBranches` and `scope=ALL`; role names never imply global access. Explicit unauthorized/inactive IDs return 403.
- WorkService extracts its existing visibility predicate for reuse by both list and aggregation. Aggregation does not select narrative fields. Shared tasks are counted once and manager visibility still checks original/current assignee branches. Incident visibility retains the existing reviewer, participant and recursive reporting-line rules.
- Read endpoints use the existing PostgreSQL rate limiter at 90 requests/minute/account. Responses are private/no-store.
- SQL uses parameterized values and database aggregation, bounded previews, a 366-day maximum and a 5,000-row-per-module aggregate cap. Large reports must narrow dates/branches or increase grouping interval. Department/type breakdowns have a 200-group cap. Source queries run sequentially to bound pressure on the shared pool. No new database indexes, tables, migrations or business-data updates are required.
- React Query uses page-local caches, query keys containing every applied filter, cancellation and the existing realtime invalidation provider. Filter changes reset pagination and discard old results. Revoked access is rechecked on every API call.

## Components, charts and loading

`app/analytics/workspace.tsx` owns requests, URL filters, refresh and page orchestration. `filters.tsx` owns the native labeled controls; `panel.tsx` owns metrics, previews and paginated aggregate tables; `charts.tsx` owns accessible status/branch bars and time-ordered SVG trends; `loading.tsx` matches the filter/card/chart/table layout. `contracts.ts` validates responses and centralizes query/date/format helpers. Existing PageHeader, PageHeading, Skeleton, realtime provider and appearance tokens are reused.

No chart package or motion dependency was added. Charts expose numeric labels, SVG titles/descriptions and exact table values. The activity trend uses an integer y-axis and selected x-axis date labels; it fills zero-activity buckets across a selected date range when aggregate rows exist, avoiding a misleading line across missing dates. A visible period inspector and optional period-total table expose exact plotted counts without crowding long ranges. Grouped boundary buckets can be partial because source rows are filtered to the selected dates before grouping. Other activity charts show observed reporting buckets. Semantic tables scroll inside their panels. Native controls, visible focus, polite loading announcements, alert errors and reduced-motion CSS are included. The dark/light and saved text-scale tokens are respected.

## Files and integration

Backend: `src/reporting/analytics.dto.ts`, `analytics.types.ts`, `analytics-access.ts`, `analytics-sources.ts`, `analytics.service.ts`, `analytics.controller.ts`, their tests, `reporting.module.ts`, `foundation/permissions/module-registry.ts`, and the shared WorkService visibility/aggregation path.

Frontend: `app/analytics/*`, `app/api/analytics/[...path]/*`, overview/HR route pages and loading files, workspace route/permission mappings, proxy protection, and removal of the old full-directory HR overview implementation. The obsolete `app/data/dashboard.ts` sample dataset was deleted. The standalone Reports route and sidebar entry were removed.

Existing reservation, leave, task and incident module reports/exports remain available through their established pages. Public booking, unrelated working-tree changes and existing HRIS workflows are preserved.

## Validation and limits

Completed checks so far:

- After central Reports removal, 13 focused backend checks passed, including rollback-only PostgreSQL integration against the installed schema. The integration covers all 13 aggregate sources, finite/empty/unauthorized branch scopes, employee and assignee deduplication, Manila midnight, stale DTR overtime exclusion, fractional leave units, stock thresholds, private incidents and module denial.
- Sixteen frontend checks passed across analytics rendering/contracts, the same-origin proxy, page guides and workspace route access. The proxy regression confirms that the removed export path returns 404.
- Reporting-directory type-aware lint, scoped frontend ESLint, the API production build and the frontend production build passed. The frontend build generated 48 static pages and its route list includes `/` and `/hr`, excludes `/reports`, and retains `/leave/reports` and `/reservations/reports`.
- The earlier 49 browser fixture checks included the now-removed Reports mode. Those screenshots are retained as historical implementation evidence in `tmp/analytics-browser-review/`; they are not current two-dashboard browser validation.

No signed-in production account or real employee record was used for browser fixtures. This is not production-scale load testing or an authenticated end-to-end browser test.

## Unavailable capabilities and follow-up recommendations

- CRM inquiry/customer controllers have no protected reporting workflow; their counts and actions are not fabricated. Payroll, recruitment, training and performance dashboards remain outside the implemented HRIS phase.
- Historical headcount, prior-period percentage comparisons, scheduled-workday attendance rates and time/capacity utilization require additional reliable definitions/history. No such figures are invented.
- Existing domain-specific exports stay on their module pages. Employee-level and department-specific filter controls can be added using bounded authorized lookup endpoints when required.
- Measure real query plans and dataset sizes before adding indexes or a materialized reporting store. Current SQL reuses existing branch/date and domain indexes; no production-scale performance claim is made.

Deploy the API change before or together with the web change. There is no migration or backfill step. Historical export audits, if any, remain in the audit log.
