# Reservations implementation design

Scope: the user explicitly requested the Reservations module. This is a business-operations addition alongside active HRIS Phase 1; it does not start a later HRIS phase.

## Contract and trust boundary

Authenticated Super Admin and scoped HR Admin, Branch Manager, and Staff may see reservations and spaces in their selected branches. Employees and IT Admin have no reservation access. Management actions belong to Super Admin, HR Admin and Branch Manager within scope; Staff can create and perform front-desk check-in/out. The API determines branch scope, availability, totals, transitions and audit records; the browser supplies only requested inputs. Branches and rooms are read from PostgreSQL. Asia/Manila is the display timezone until branch timezone support exists.

## Component design

1. **Tree:** server route and existing `AuthorizedWorkspacePage` → client `ReservationsWorkspace` → header/navigation, summary cards, calendar/agenda, filter bar, reservation list, detail dialog, creation dialog, spaces, reports and settings panels. Shared status badges, labeled fields, and feedback messages are local presentation primitives.
2. **Responsibilities:** the server route enforces coarse navigation access; `ReservationsWorkspace` owns URL view/date/filter state and fetch orchestration. Calendar presents a bounded date range and emits slot/reservation selections. Detail and creation forms own drafts and submit events. API service owns persistence, scope, conflict and lifecycle rules.
3. **Contracts:** typed reservation, space, branch, summary and error payloads. Mutations return a record or a safe validation/conflict error. All fetches use same-origin cookie proxy; no client-provided role or payment verification is trusted.
4. **State:** server data reloads on range/filter/action changes; URL stores page/view/date. Local state stores open dialog, draft, pending action and feedback. Loading skeletons, empty list, recoverable API errors, disabled pending buttons, success notice and reason-confirmed destructive actions are explicit.
5. **Visual system:** task-first page heading and Create action; compact metrics; one filter rail; calendar with status text and color; responsive list cards. Desktop uses available width and calendar grid; phones use agenda and stacked filters/cards. Spacing follows the existing workspace tokens.
6. **Accessibility:** labeled buttons/fields, semantic headings, dialog focus and Escape handling, visible focus, status text beyond color, aria-live feedback, keyboard-usable day/slot buttons, reduced-motion-safe transitions and no page-wide horizontal overflow.
7. **Files:** additive migration and operations API DTO/service/controller/module for server truth; same-origin web proxy; reservation route, workspace component/CSS/loading; existing sidebar/access map; focused tests and this design/tracker.
8. **Verification:** API build and tests for conflict, branch access, transitions and input validation; web TypeScript/lint and component interaction tests; responsive review where a browser fixture is available. No production data is mutated during validation.

Open policy choice: the prompt asks for pending expiration but gives no duration. Pending reservations hold their slot until an authorized reviewer acts; settings can define expiration later. No automated payment capture or verification is implied.
