# Employee Directory and 201 File UI

This is the second module in UI_UX_MODULE_TRACKER.md. Reuse the Attendance visual language through opt-in workspace tokens. Keep APIs, query keys, employee/account ownership, branch restrictions, document storage, audit and form/mutation contracts unchanged. Main HRIS Phase 1 remains active.

## Audit and boundaries

The shared people stylesheet also serves HR, Leave, Portal and User Access. Its base styles must not be changed globally. Current directory text/controls are small, the profile navigation occupies a second column, and employee cards/forms use inconsistent sizing. Query loading currently falls back to text despite route skeletons existing. Existing employee-profile tests contain two stale source-string assertions; replace these with behavior checks only where this redesign owns the tested component.

## Component tree and contracts

- PeopleWorkspace remains the route-level owner. Apply theme.scope + employeeWorkspace only for employees and employee-profile modes; other modules retain current styles.
- EmployeeDirectoryContent retains queries, filters, pagination, create form, validation, notifications and navigation. EmployeeDirectorySummary receives the authorized employees array and loading flag; displays total/active/inactive/branches represented, never salary or invented totals. EmployeeDirectoryTable receives current page rows and renderAvatar/renderStatus slots; owns semantic table, links and a named focusable scroll region. A matching skeleton shares table geometry.
- EmployeeProfileContent retains query/role decisions, URL document selection, uploads, editing and removal. Its existing profile hero and native section buttons remain; display full-width wrapping navigation above the content. Subcard roots opt in using data-employee-panel so styling can remain scoped to the employee route.
- Existing HR profile, work schedule, assignment history and document components retain state/props. Only route-scoped styling is applied. Existing dialogs keep busy, confirmation, Escape and focus behavior.

## State and interaction

Server/query, URL section, form and mutation states remain where they are. Loading uses structural skeletons, fetch errors retain retry, and empty directory differs from zero filter matches. Clear filters resets search/branch/status and page together. Create/edit inputs remain mounted with their existing validation and saved payloads. Employee count summaries explicitly cover authorized records, independently of filters. No new permission inference or employee fields are introduced.

## Visual and accessibility

Neutral cards, restrained red accents, 14px body/12px labels, 42px controls and 12px radii. Header context → authorized summary → search/filter/action toolbar → readable directory. Profile identity → section navigation → grouped details. Native links/buttons, meaningful names, aria-pressed and aria-controls, table headers/caption, visible focus and comfortable targets. Document and roster tables scroll within named regions. Long names/emails wrap; inputs/cards stack at 360px, 768px, 1024px and 1440px. Reduced motion is honored. No decorative charts or fake records in production.

## File plan and verification

Add employee-directory-presentation.tsx and focused presentation tests. Update people-workspace.tsx, append employeeWorkspace-scoped rules to its stylesheet, opt in subcard roots, and align only employee route skeleton variants in page-loading.tsx. Record completion in the tracker and maintained HRIS plan. Verify existing employee utilities/services/HR display/document tests, changed-file ESLint, TypeScript, production build and Chrome layout/focus checks with isolated artificial fixtures. Distinguish rendered-fixture checks from authenticated live workflows.

## Verification results

All 83 web tests across 32 files passed, including the six new presentation cases. The test configuration now resolves the existing `@/` alias so tests can render real shared components. Two stale employee-profile source assertions now match the existing editable fallback and documents URL initializer; their implementation behavior was preserved.

TypeScript, changed-file ESLint and production build passed. Chrome checked directory, profile, documents and HR editor at 360, 768, 1024 and 1440px (16 cases). A hidden table label initially caused page overflow; positioning the employee table scroll region contains it. Final checks found no document overflow or out-of-bounds inputs/selects; focused links have a visible outline. Desktop/mobile screenshots were inspected. Fixtures render actual presentation/HR/document components with artificial records; shared utility-class styling and authenticated server workflows are not fully represented. This verification does not establish authenticated create/edit/upload coverage.


Employee 201 file simplification (2026-10-20): removed Available balance and Recent check-ins navigation/content and the unused employee-file balance query. Assignment history is now the final section after Documents. Existing IT Admin section restrictions remain in place; leave/attendance records and their dedicated modules are unchanged. No backend/schema or Phase 1 boundary change.


2026-10-23 profile refinement: [EMPLOYEE_201_REFINEMENT_DESIGN.md](EMPLOYEE_201_REFINEMENT_DESIGN.md) documents the current 201-file presentation. The employee route now has an identity/facts summary, compact scrolling section navigation and collapsible HR details. Shared documents add combined search and a right-side upload drawer. Existing server contracts and field permissions are preserved.
