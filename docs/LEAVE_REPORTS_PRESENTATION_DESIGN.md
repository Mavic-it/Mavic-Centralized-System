# Leave reports refinement - 2026-10-23

Preserve main HRIS Phase 1 and current leave permissions. Modernize the existing reports workspace without adding navigation or a parallel reporting system.

- Reports owns filters, exports, KPI cards, status chart, type breakdown and underlying records. A reusable TypeBreakdown component renders all permitted configured policies, including inactive and future-effective definitions and scoped historical activity.
- API report returns typeBreakdown alongside balances/requests. Paid credits retain the full-year financial basis. Unpaid approved/pending days use the filtered request set and snapshot paid flag. No credits are fabricated or granted. The same breakdown is included in CSV/XLSX exports.
- Server derives branch scope. Policy definitions from other branches are excluded unless represented by already-authorized historical records. New database types appear without frontend constants.
- Visual hierarchy: compact filter/export header, five summary cards, clear status bars and a larger all-types card with readable per-type metrics, policy-state badges and keyboard-operable drilldown. Neutral surfaces and existing Mavic tokens; stack at narrow widths.
- State: existing React Query loading/error/retry and filtered empty states; zero-activity configured types remain visible. Labels distinguish credit balances from unpaid activity and explain reporting periods. Preserve labels, visible focus and reduced motion.
- Files: leave service/controller, report contracts, reports UI/type-breakdown component, scoped CSS, focused UI/API/PostgreSQL tests and maintained inventory. Verify branch scope, future/custom types, unpaid filtering, exports, builds/lint and mobile/desktop fixtures.
