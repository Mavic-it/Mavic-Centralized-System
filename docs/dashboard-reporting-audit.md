# Dashboard and reporting audit

Current scope update (2026-11-21): the standalone `/reports` page was removed at the user's request because it repeated Overview. Live Overview and HR dashboards remain; module-specific leave and reservation reports remain. Any central Reports recommendations below are historical audit findings, not active functionality.

Status: implementation completed for supported data sources; final verification is recorded in `dashboard-reporting-implementation.md`. The findings below describe the pre-implementation state. The main HRIS plan remains in Phase 1.

## Existing surfaces

- The operations overview (`application/web/app/(workspace)/page.tsx`) renders the constants in `app/data/dashboard.ts`. Employees, inquiries, room states, reservation rows and branch names are illustrative, not database results. Its branch parameter selects a hardcoded key and is not an authorization boundary.
- `/hr` uses `PeopleWorkspace` and fetches the employee directory for two counts and a three-person preview. It has loading, error and empty states, but downloads the entire visible directory and has no attendance or leave summary. The employee list controller combines results per selected branch; consolidated analytics must count distinct employee IDs.
- Reservation and leave reports already exist under their modules. The reservation report groups bookings by branch and includes financial totals; the leave report has scoped filters and CSV/XLSX export. Work tasks and incidents have their own scoped exports. There is no unified Reports & Analytics page.
- `ReportingModule` stores arbitrary `report_metrics`; its controller methods are not decorated HTTP routes. Its test records synthetic values, so this is not a live business analytics API.

## Verified data and existing definitions

- Reservation summary counts records whose start date is today in Asia/Manila, irrespective of status; upcoming counts future PENDING and CONFIRMED records. Available spaces exclude inactive and maintenance rooms, active overlapping reservations and space blocks. The period report uses reservation start time and separately reports CONFIRMED, CANCELLED and NO_SHOW counts. Reuse these definitions explicitly rather than relabeling availability as utilization.
- Inventory overview uses active catalog items, balances and reorder thresholds. Low stock counts positive available balance at or below threshold; zero balance is reported separately. Inventory valuation has a separate authorization check.
- Leave reporting uses the existing management authorization, scoped branches, overlapping request dates and a 10,000-request cap. Request reasons are not necessary for summary metrics.
- Attendance records, dated schedules, holidays, official business and leave are represented in the attendance/DTR implementation. Missing punches alone cannot establish absence; use its existing rules before offering attendance rates.
- Employees, branches, rooms, reservations, inventory balances, leave requests and attendance records have migrations and relationships. Existing indexes include employee branch, attendance branch/date and leave branch/status/date. Query plans and reservation reporting indexes still need measurement against representative data before adding migrations.

## Security and implementation priorities

1. Establish a server-side analytics contract with independently checked module permissions and selected authorized branch scope. Dashboard access alone must not disclose employee, leave, inventory valuation or incident information. Reject unauthorized explicit branch IDs and handle no active branches; do not infer global access from role names.
2. Replace the sample overview with bounded queries over authorized sources, clear unavailable/error states and Manila date boundaries. Restrict reservation detail and action links to users authorized for the underlying module.
3. Provide a distinct-employee aggregate and bounded preview for HR; reuse leave and DTR logic with their own permission checks. Do not disclose incident narratives or mark unscheduled employees absent.
4. Reuse existing module reports and exports for a unified navigation/filter experience. Define each metric's status, date, scope and comparison rules; implement server-side authorized exports for any new report. Test single, multiple, no-branch and unauthorized-branch cases, plus filters, timezone boundaries and zero results.
5. Extract shared filter, metric, chart, loading and empty-state components only after documenting their contracts and accessibility. Preserve existing responsive layout, theme and permissions. Profile aggregation queries before adding indexes.

## Resolution

The overview sample dataset was removed, HR's full-directory overview was replaced by bounded preview and database aggregates, and Reports is now an active protected route. Shared analytics endpoints cover workforce, reservations, spaces, DTR, leave, official business, stock, movements, assets, tasks, incidents, accounts and branches. Work aggregation reuses the existing private visibility predicate. Parent/module denial, authorized active branches, read/export limits, sanitized aggregate CSV and export audit are enforced server-side. Inquiry/customer and later HRIS workflow metrics remain explicitly unavailable. No schema change was needed.

The audit focused on relevant page, data and authorization paths, not every unrelated function in the repository. Detailed definitions, files, validation and remaining limitations are in `dashboard-reporting-implementation.md`.
