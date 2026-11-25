# Dashboard and reporting component and API design

Current scope update (2026-11-21): this design records the original three-page implementation. The standalone Reports page and its export endpoint were removed at the user's request. `AnalyticsWorkspace` now serves Overview and HR only; the shared metrics and tables remain. See `dashboard-reporting-implementation.md` for current behavior.

## Component tree and responsibilities

Protected route pages render `AnalyticsWorkspace(mode: 'overview' | 'hr' | 'reports')`. It owns a page-local React Query client, applied filters and request lifecycle. `AnalyticsFilters` owns accessible native branch/date/category/grouping controls. `AnalyticsPanel` displays one authorized module's metrics, status/branch bars and time series. `AnalyticsTable` paginates the same aggregate rows used by CSV export. `AnalyticsLoading` matches filters, KPI cards and panels. Existing PageHeader, PageHeading, Skeleton and theme tokens remain shared primitives.

## Contracts and state

GET `/analytics/context?mode=...` returns authorized active branches and permitted categories. GET `/analytics/data` accepts mode, optional branch ID, inclusive Manila dates, category and daily/weekly/monthly/yearly grouping. It returns generated timestamp, effective scope/filter metadata and independently authorized module panels. Each panel has numeric metrics with definitions, grouped rows, optional bounded people/reservation previews and an allowed drill-down URL. GET `/analytics/export` runs the same server query and emits formula-safe aggregate CSV with filters and scope; export is audited. Requests reject invalid dates, ranges over 366 days and unauthorized branches/categories. Aggregate row counts are bounded. No sensitive narratives, salary, government identifiers or account contact details enter these contracts.

Server data uses page-local query cache and cancellation. Draft native form values become applied filters on submit; branch/category/group changes apply immediately. Refresh refetches the applied query. Filter changes reset pagination. Query keys include all filters; old results must not be exportable under a newer filter. Initial loading, background refresh, empty data, no authorized modules/branches, unauthorized response, unavailable source and retryable failure are distinct. No write or destructive interaction exists.

## Visual system and accessibility

Compact header, wrapping filter panel, responsive KPI grid, paired chart panels and horizontally scrollable report tables use existing surface, text, border and accent variables. Four columns collapse to two and one on phones. Native selects/buttons/date inputs retain keyboard behavior and visible focus. Labels identify every control. Errors use alerts; refresh/loading use polite status announcements. Charts expose numeric labels and accessible descriptions; tables contain exact values and headers. Native buttons/links need no custom keyboard or focus interception. No focus moves on refresh. CSS transitions respect reduced motion and content can zoom/wrap without fixed page width.

## File plan

- `application/api/src/reporting/analytics.*`: validated filters, permission resolution, scoped aggregation, HTTP and export contracts, focused tests.
- `application/api/src/reporting/analytics-sources.ts`: verified business SQL and bounded source transforms.
- `application/api/src/work/work.service.ts`: reuse the existing visibility predicate for aggregate work reporting.
- `application/api/src/foundation/permissions/module-registry.ts`: register Reports access, without granting source-module rights.
- `application/web/app/analytics/*`: typed fetch contract, workspace orchestration, filters, panel/chart/table rendering, styles, loading and tests.
- Protected overview/HR/reports routes and API proxy: integrate with existing authentication.
- Sidebar and workspace-access mappings: activate Reports while retaining current permissions.

## Verification

Backend tests cover date boundaries, explicit branch denial, finite and global scope, module and parent denial, aggregate definitions and export parity/formula escaping. PostgreSQL checks exercise actual source queries where local infrastructure is available. Frontend checks cover API-driven values, empty/loading/error states, filters, CSV URLs and pagination. Type checks, production builds, focused lint and responsive browser fixtures complete verification. Existing HRIS Phase 1 remains active; unsupported metrics are documented rather than inferred.
