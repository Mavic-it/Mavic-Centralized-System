# Leave request table and drawer refinement

Implements the attached Employee Leave Request Management brief. Scope: management Requests section of `/leave`; other leave sections and My Leave keep their current workflows. HRIS Phase 1 and all server contracts remain unchanged.

## Components and contracts

LeaveManagementWorkspace retains authorization, scoped queries, filters and decision mutation. Add LeaveRequestList (typed requests/employee metadata, allowed review callback, selected page/page size, open callback), LeaveRequestDrawer (latest request, metadata, review eligibility, pending/decision callback/close), reusable status/type badges, date formatting and a timeline builder. New presentation stylesheet owns table/cards/drawer/filter refinements; existing semantic theme and Modal/confirmation provider are reused.

The parent stores selected request ID, not a copied request. The drawer derives current data after refetch and owns only decision selection, remarks and inline submission error. Existing stage-role checks determine eligible actions. Confirmation precedes every approval/rejection mutation and rejection remarks remain mandatory. Native Modal retains focus isolation, Escape, opener restoration and pending guards.

## Experience and states

Seven desktop columns: Employee (name/employee number/position), Department, Leave Type, Dates, Duration, Status, Actions. Long UUIDs stay out of the list; full details are available in the drawer. Mobile uses request cards rather than a horizontally scrolling table. Desktop drawer docks right; mobile fills the viewport. Separate employee, leave/reason, actual workflow and footer action sections. Show actual recorded events/timestamps/remarks; missing metadata says Not recorded. HR is included only when required or recorded; terminal stages must not imply an unperformed review.

Filters preserve all existing search/employee/department/type/status/date behavior, add employee-number matching and Clear Filters. Summary includes total/pending/approved/rejected within current filters, explicitly labeled. Page sizes 10/25/50 reset page and use a dedicated list pager without altering shared pagination elsewhere. Loading/empty/errors preserve recovery; no fabricated totals or history.

## Visual, accessibility and verification

Reuse semantic theme; compact cells, muted metadata, soft status/type labels, restrained icons with accessible names, visible focus and native controls. Avoid forced desktop minimum width; use mobile cards at narrow widths. Drawer details use readable two-column sections, full-width reasons and a semantic vertical timeline. Verify 360/768/1024/1440px, keyboard/modal behavior, role restrictions, filter/page-size behavior, confirmation/rejection guards and refreshed statuses with isolated artificial React fixtures. No live records or schema changes. Run focused/full tests, lint and production build/TypeScript; update maintained tracker/inventory.

## Validation

All 137 web tests across 38 files passed, including pagination, date ranges, missing identity, optional HR workflow, rejection history, drawer content and review visibility. Changed-file ESLint and production Next.js build/TypeScript passed. An isolated artificial-data React fixture passed 12 list/drawer/review layouts at 360/768/1024/1440px, without document overflow or clipped controls, plus rejection reason/confirmation, clear filters, filtered totals, page-size and role-action checks. Screenshots were inspected. Live decisions and server authorization were not exercised end-to-end.

Keyboard verification passed: focus remains inside the drawer, Escape closes it and restores focus to the originating request action.
