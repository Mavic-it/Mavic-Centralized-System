# UI/UX modernization tracker

This tracks **redesign progress**, independently of backend/feature completion. Attendance, Employee Directory/201 Files, User Access, Branches/Departments, My Profile, My Portal, My Leave and Leave Management are complete. Operations Overview is next in the inventory. The active HRIS phase remains unchanged.

Account credential email follow-up (2026-10-20): User Access now uses API-generated initial credentials without a password field or browser generator. The account table shows persisted delivery/first-login status; authorized admins have a shared-modal Regenerate & email action for accounts awaiting their first password change. Creation and retries display provider acceptance or actionable failure without exposing a temporary password. See [ACCOUNT_CREDENTIAL_EMAIL_DESIGN.md](ACCOUNT_CREDENTIAL_EMAIL_DESIGN.md).

| Order | System module | Existing screen / availability | Redesign status |
| --- | --- | --- | --- |
| 1 | Attendance & timekeeping | `/attendance`: overview, schedules, weekly roster, history, biometric import, DTR review, summary/export, settings | **Done** — modernized in this pass; verification notes below |
| 2 | Employee directory & 201 files | `/employees`, `/employees/[id]` | **Done**; verification below |
| 3 | Leave management | `/leave` | **Done**; verification below |
| 4 | My leave | `/my-leave` | **Done**; verification below |
| 5 | My Portal for users and linked admins | `/me`; independent Super Admins retain `/my-profile` | **Done**; verification below |
| 6 | Personal profile | `/my-profile` | **Done**; verification below |
| 7 | Branches & departments | `/branches` | **Done**; verification below |
| 8 | User access & account administration | `/system/users`, `/system/password-reset-requests` | **Done** — recovery queue includes filtered summaries, responsive list and request-details drawer; verification below |
| 9 | Operations overview | `/` | Pending |
| 10 | HR dashboard | `/hr` | Pending |
| 11 | Employee documents | Within employee/201 file screens and portal | **Done** within both existing routes |
| 12 | Login & authentication screens | `/login`, `/forgot-password` | **In progress** — recovery form hierarchy, format examples, field guidance and submission feedback implemented; login and remaining authentication screens pending |
| 13 | Shared sidebar, top bar, dialogs & notifications | Existing shared shell/components | Pending full redesign; reusable opt-in Attendance theme is ready |
| 14 | Reservations | Navigation label; no dedicated linked route | Not started — dedicated screen unavailable |
| 15 | Rooms | Navigation label; dashboard/underlying operations exist | Not started — dedicated screen unavailable |
| 16 | Inquiries / CRM | Navigation label; underlying CRM module exists | Not started — dedicated screen unavailable |
| 17 | Inventory | Navigation label; underlying module exists | Not started — dedicated screen unavailable |
| 18 | Reports & analytics | Navigation label; partial reporting foundations | Not started — dedicated screen unavailable |
| 19 | System settings | Navigation label; partial system foundations | Not started — dedicated screen unavailable |
| 20 | Payroll & payslips | Full feature not implemented; DTR attendance input/export exists | Not started — future HRIS phase |
| 21 | Benefits | Feature not implemented | Not started — future HRIS phase |
| 22 | Recruitment & onboarding | Feature not implemented | Not started — future HRIS phase |
| 23 | Performance management | Feature not implemented | Not started — future HRIS phase |
| 24 | Training & development | Feature not implemented | Not started — future HRIS phase |
| 25 | Compliance monitoring | Document foundations exist; broader monitoring incomplete | Not started — future HRIS phase |

## Attendance changes

- Full-width content with reusable, icon-supported section navigation and explicit branch context.
- Opt-in semantic theme tokens, readable typography, consistent 42px controls, 12px cards, clear focus and restrained brand/status colors.
- Consistent schedule forms, history tables, weekly roster, DTR/import/settings/review surfaces. Roster remains an editable seven-day grid with contained horizontal scrolling.
- Six primary DTR metrics; supporting employee-day, OT and source-matching metrics remain available in an expandable group. All values still come from the existing saved ledger.
- Status pills, labeled keyboard-focusable table regions, helpful empty states and retry action, and loading layouts that follow the final cards/table structure.
- API contracts, attendance/payroll calculations, authorization, branch isolation, approvals, locks, audit and source retention are unchanged.
- DTR import now uses numbered steps connected by individual progress lines, a drag/drop file card, selectable cutoff period cards and employee match progress counts. A redundant page heading and step description were removed. Existing import, matching and schedule calculation behavior is unchanged.
- Saved Attendance Records use a compact interactive ledger with search, quick review filters, sorting, expandable day details and smaller row actions. Employee totals and exception review remain visible.

Design: [ATTENDANCE_UI_DESIGN.md](ATTENDANCE_UI_DESIGN.md). Existing feature/operational notes: [DTR_ATTENDANCE_HANDOVER.md](DTR_ATTENDANCE_HANDOVER.md).

## Verification

- 14 focused web tests passed, including section accessibility, authorized navigation items, structural loading, ledger presentation and binary upload/export proxy checks.
- Final changed-file web ESLint, TypeScript and the production web build passed after the label refinements.
- Headless Chrome checked ledger, import and settings fixture layouts at **360, 768, 1024 and 1440px** (12 cases): no document overflow or out-of-bounds form controls. Captured screenshots were inspected at desktop and mobile sizes. The focused navigation button has a visible outline.
- Visual fixtures use real Attendance components with clearly labeled artificial records, outside production pages. They do not establish authenticated workflow or server-permission coverage. API behavior was not changed in this redesign.
- The earlier full web suite had two employee-profile source-string assertion failures, documented in DTR_ATTENDANCE_HANDOVER.md. These assertions were updated during the Employee Directory continuation to reflect the existing multiline fallback and URL section initializer. The current full web suite passes.

## Employee Directory and 201 File changes

- Authorized-record summaries, clearer search/filters/actions, readable six-column employee table, contained horizontal scrolling and profile links with accessible names.
- Full-width wrapping profile section navigation, stronger employee identity, consistent detail/document cards and employee editor controls.
- Matching route/query skeletons, retry on directory fetch errors, separate empty/filtered-empty states and a clear-filters action.
- Opt-in theme and route-scoped subcard styles preserve other modules. Existing permissions, role visibility, API contracts, queries, mutations, branch rules and document storage remain unchanged.

Design: [EMPLOYEE_UI_DESIGN.md](EMPLOYEE_UI_DESIGN.md).

Employee verification: all **83 web tests across 32 files** passed, including six new presentation checks and existing Attendance/employee/document tests. TypeScript, changed-file ESLint and production build passed. Headless Chrome checked directory, profile, documents and editor fixtures at **360, 768, 1024 and 1440px** (16 cases), with no document overflow or out-of-bounds form controls and a visible keyboard focus outline. Desktop/mobile screenshots were inspected. These are isolated rendered fixtures with artificial records, not authenticated end-to-end workflow verification. No backend code changed.

## User Access and Branches changes

- User Access now uses the shared opt-in visual theme, authorized current/active/inactive-pending/archived summaries, readable account tables and role filters, clear Current/Archived controls, matching four-column skeletons, retry and filtered-empty recovery. Removed the unsupported session metric.
- Branch list, filters, pagination, related-record cards, branch details, department management and existing branch dialogs use scoped semantic tokens, consistent controls, spacing and typography. Branch totals remain server-provided filtered totals.
- Both tables have labeled keyboard-focusable scroll regions. Existing account action conditions, role/branch assignments, password/reset/lifecycle workflows, confirmations, branch deletion password checks and server authorization remain intact. No API/schema changes; Phase 1 remains active.
- Implementation and verification: [ADMINISTRATION_UI_DESIGN.md](ADMINISTRATION_UI_DESIGN.md). Browser fixtures use artificial data and real summary/table/branch-detail/delete components; account row action samples are illustrative. These checks do not exercise authenticated mutations or external map behavior.

Administration verification: **90 web tests across 33 files passed**, changed-file ESLint passed without warnings, and the production web build passed including TypeScript. Headless Chrome checked five rendered fixtures at 360/768/1024/1440px (20 cases): no document overflow or out-of-bounds inputs/selects, and visible keyboard focus. Desktop/mobile screenshots were inspected. No live records were modified.

## My Profile changes

- Shared semantic theme, full-width profile cards, stronger identity/photo area, readable personal/emergency/account information, consistent 42px controls and responsive form grids.
- Clear photo requirements and emergency-contact guidance; account information stays read-only. Existing upload/removal, save/cancel, unsaved-change protection, validation and independent/employee redirect rules remain in place.
- Shared structural loading component now serves both route and query loading; errors retain Retry, missing profiles retain setup, and saved profiles retain Edit.
- Design and verification details: [MY_PROFILE_UI_DESIGN.md](MY_PROFILE_UI_DESIGN.md). Fixtures render the actual profile component with artificial query data and mocked navigation. Authenticated saves, photo uploads/removal and redirect effects were not exercised end-to-end. No API, schema or live-record changes.

My Profile verification: **97 web tests across 34 files passed**, changed-file ESLint passed without warnings, and production build passed including TypeScript. Sixteen actual-component fixture layouts passed at 360/768/1024/1440px, without document overflow or out-of-bounds form controls; keyboard focus was visible. Desktop/mobile screenshots were inspected.

## My Portal changes

- Modern shared theme for employee-linked users and admins, clear identity card, full-width wrapping navigation, five responsive summary cards, readable details/requests/notifications and consistent document/schedule panels.
- Notification count now comes from the unread API response. Metrics distinguish loading, unavailable and successful empty records; failed requests provide Retry. Greeting is time-neutral. Matching hero/summary/seven-section loading serves route and query states.
- Existing six-role own-employee paths, independent Super Admin redirect, read-only portal documents, schedule edit permissions, leave/attendance scopes and all API contracts remain unchanged. Payslips remain unavailable.
- Design and validation scope: [MY_PORTAL_UI_DESIGN.md](MY_PORTAL_UI_DESIGN.md). Fixtures render real portal content for user/admin roles plus actual document/schedule/loading components with artificial data and mocked navigation. They do not exercise authenticated tab transitions, downloads, schedule edits or redirect effects end-to-end. No live data changed.

Portal verification: **111 web tests across 35 files passed**, including 14 portal cases for all six linked roles and preserved document/schedule permissions. Changed-file ESLint and production build/TypeScript passed. Sixteen rendered fixture layouts at 360/768/1024/1440px passed without page overflow or out-of-bounds form controls; desktop/mobile screenshots and keyboard focus were reviewed. The build required network access for the existing Google font.

## My Leave changes

- Modern self-service shell, readable available/used/pending balance cards, Requests/Balances & history navigation, consistent status filter and File leave action, grouped request form, expandable request details and contained history tables.
- Shared structural route/query loading, five-column request skeleton, existing retry/empty states and form policy feedback. Mobile form fields stack so native date controls stay readable.
- Existing own-request edit/cancel conditions, confirmation state, date/reason validation, allowed leave types, credit calculations, approval flow and independent Super Admin redirect remain unchanged. Management styling and policy/credit/payroll actions were handled in the separate Leave Management continuation below.
- Design and verification scope: [MY_LEAVE_UI_DESIGN.md](MY_LEAVE_UI_DESIGN.md). Artificial fixtures render real My Leave content and the extracted request form. Authenticated filing/editing/cancellation, tab transitions and live approval/credit posting were not exercised end-to-end. No API/schema or live-data changes.

My Leave verification: **123 web tests across 36 files passed**, including 12 new self-service cases. Changed-file ESLint passed without warnings; production build passed including TypeScript. Sixteen artificial-fixture layouts passed at 360/768/1024/1440px, with no document overflow or out-of-bounds form controls and visible keyboard focus. Final desktop/mobile screenshots were inspected.

## Leave Management changes

- Shared modern theme and authorized request summaries; full-width section controls, readable request filters, grouped review/credit/policy/SIL/payroll forms, semantic action/status styling and named keyboard-scrollable tables.
- Matching route/query skeletons for requests and wide data tables, and retry actions for credit/policy/SIL/payroll failures. Mobile fields stack; request records now use mobile cards and a separate details drawer. Credit, policy, SIL and payroll tables retain their existing scrolling behavior.
- Existing query scopes, approval stages/roles, rejection requirements, policy and credit calculations, SIL attestation/exceptions and read-only payroll behavior are preserved. No API/schema or live-data changes; main Phase 1 remains active.
- Design and validation: [LEAVE_MANAGEMENT_UI_DESIGN.md](LEAVE_MANAGEMENT_UI_DESIGN.md). **130 web tests across 37 files passed**, including seven new management cases; changed-file ESLint and production build/TypeScript passed.
- An isolated interactive React fixture with artificial data and API network calls disabled passed **28 layouts** (seven states at 360/768/1024/1440px), six interaction checks and HR/Branch Manager role scenarios. Desktop/mobile screenshots were inspected; table focus is visible. Live approvals, transactions, policy/review saves and server authorization were not exercised end-to-end.

### Employee Requests refinement

- Replaced expanded table-cell details with a compact seven-column list and a right-side details drawer (full screen on phones). Employee number and position replace database IDs; dates are concise, duration is explicit, and badges/actions remain role aware.
- Added filter-scoped Total/Pending/Approved/Rejected cards, employee-number search, Clear filters and 10/25/50 rows per page. Details group employee information, leave reason and recorded approval history, including optional HR review and honest missing timestamps.
- Approval/rejection uses the shared confirmation dialog; rejection requires a trimmed reason. Latest selected-request data is derived from the query rather than a copied snapshot. No API, schema or permission changes.
- Design: [LEAVE_REQUESTS_UI_DESIGN.md](LEAVE_REQUESTS_UI_DESIGN.md). All **137 web tests in 38 files passed**; changed-file ESLint and production build/TypeScript passed. Artificial browser checks passed 12 layouts across 360/768/1024/1440px, required rejection/confirmation controls, filters, page size and HR/manager action restrictions. Screenshots were inspected. Live decisions were not submitted.

Keyboard verification passed: focus remains inside the drawer, Escape closes it and restores focus to the originating request action.

### My Leave request list refinement

- Applied the shared request-list design to `/my-leave`: five compact columns, readable dates/duration, status badges, mobile cards, 10/25/50-row pagination and a separate responsive details drawer. Full reasons and recorded approval history live in the drawer; database IDs and expanded detail blocks no longer appear in list rows.
- Reused the existing own-employee scope and pending request edit/cancel rules for employee-linked users and admins. Editing from the drawer opens the existing form. Cancellation retains explicit Confirm/Keep controls and pending guards. No management approval controls are exposed; no API/schema or Phase 1 changes.
- All **142 web tests across 38 files passed**. An artificial interactive fixture passed 16 layouts at 360/768/1024/1440px for list, drawer, cancellation and edit states, with no document overflow or clipped form controls. Edit/Cancel eligibility, pagination, keyboard containment, Escape/focus restoration and employee/HR/Super Admin self-service scenarios passed. Desktop/mobile screenshots were inspected. No live leave mutations were submitted.

My Leave request-list changed-file ESLint passed without warnings.

My Leave request-list production Next.js build and TypeScript verification passed.

### Leave supporting documents

Optional native upload is available in the new/edit request form, with allowed formats/size guidance and existing-file replacement guidance. Both My Leave and Leave Management drawers provide protected downloads and a no-document state. See [LEAVE_DOCUMENTS.md](LEAVE_DOCUMENTS.md). Existing module completion statuses and the HRIS phase boundary remain unchanged.

My Leave follow-up: replaced the empty required leave-type dropdown with a disabled eligibility/loading/error placeholder and adjacent guidance; policy/balance unavailability also disables submission. Existing eligibility rules remain unchanged.


Leave configuration follow-up (2026-10-20): Leave Management now includes Policy Settings, version history, verified event reviews, scoped credit allocation/exports and team schedule; My Leave uses backend eligibility/projected balance and conditional proof. Direct routes `/leave/policies` and `/leave/credits` reuse authorized workspace controls. Completed request-list/profile/portal/attendance modules retain their existing status; other queued modules remain queued. Feature verification and HR setup: [LEAVE_CONFIGURATION_HANDOVER.md](LEAVE_CONFIGURATION_HANDOVER.md). Main HRIS Phase 1 remains active.


Leave Management navigation (2026-10-20): completed the four-section sidebar and independently addressable Requests & Approvals, Policy Settings, Credit Allocation and Credit Reports pages. Removed the duplicate management tab strip, retained My Leave tabs, separated allocation actions from reports and preserved existing role/backend contracts. See [LEAVE_NAVIGATION_DESIGN.md](LEAVE_NAVIGATION_DESIGN.md). Other queued modules and the main Phase 1 boundary remain unchanged.


Leave sidebar dropdown follow-up (2026-10-20): Leave Management now uses a native expandable details/summary heading with a state chevron and visible keyboard focus. The group opens on active leave routes and starts closed elsewhere; clicking or Enter/Space toggles its children. The compact sidebar keeps its existing accessible module link. Routes, role permissions, page content and main Phase 1 boundary are unchanged.


Sidebar visual refinement (2026-10-20): removed the Leave Management group border and added consistent background/text hover feedback to all clickable sidebar module links. The disclosure heading retains hover and keyboard focus styling; disabled modules retain their existing appearance. CSS-only change; routes, permissions and the Phase 1 boundary are preserved.


Portal simplification requested by the user (2026-10-20): removed My requests and Announcements & notifications tabs and their content from the profile/portal page. Removed the now-unused portal leave-request query and matched the loading navigation to the remaining five sections. The unread-notification overview metric and global notification control are preserved; My Leave remains the request workspace. No backend/schema, permissions or Phase 1 boundary change.


Employee 201 file simplification (2026-10-20): removed Available balance and Recent check-ins navigation/content and the unused employee-file balance query. Assignment history is now the final section after Documents. Existing IT Admin section restrictions remain in place; leave/attendance records and their dedicated modules are unchanged. No backend/schema or Phase 1 boundary change.


Portal schedule/attendance consolidation (2026-10-20): combined Work schedule and Recent attendance into one Schedule & attendance section, with the schedule above recent actual attendance. Both retain their existing own-employee queries, loading/retry states and permissions. Navigation/loading now have four sections. No backend/schema or main Phase 1 boundary change.


Schedule relocation requested by the user (2026-10-20): removed Schedule & attendance from My Portal, leaving personal/employment details, payslips and documents. Attendance already had manager branch schedules/weekly rosters; added a read-only My work schedule section for employee/staff and employee-linked HR/Branch Manager clock roles. It resolves only `/employees/me`, reuses the canonical employee schedule/week/history card and keeps schedule editing in existing administrative sections. The portal overview metrics remain unchanged. No backend/schema or Phase 1 boundary change.


Portal summary cleanup requested by the user (2026-10-20): removed Latest attendance and Notifications cards, their loading placeholders and unused portal API requests. Only the three leave-balance cards remain. Dedicated Attendance and the global notification control are preserved; no backend/schema or main Phase 1 boundary change.


Password recovery and account security (2026-10-20): added a login recovery link and responsive public request form, a permission-gated admin reset queue with status/search/date filters and identity review actions, and a shared My Portal → Security password-change screen available to every role, including standalone admins. Password forms have accessible show/hide controls and policy feedback; credential issuance has a confirmation step. Temporary-password and email provider states are explicit. The main HRIS phase boundary is unchanged. Design and operational limits are recorded in [PASSWORD_MANAGEMENT_HANDOVER.md](PASSWORD_MANAGEMENT_HANDOVER.md).

Sidebar account navigation (2026-10-20): My Profile/My portal groups Account security, and User access groups Password reset requests, using the existing Leave Management disclosure style. Each group retains its main destination link; collapsed sidebar icons preserve access to both destinations. Role visibility and routes are preserved. Web TypeScript and changed-file ESLint passed.


Password reset requests redesign (2026-10-20): added four filtered summary cards, a compact paginated desktop list, mobile request cards, clearer filters and a responsive details drawer modeled on Leave Management. Account details, full messages, review history, rejection reasons and email/temporary-access details now live in the drawer. Actions retain the existing APIs and use shared confirmations. Route and request loading skeletons, empty/error/retry states and scoped styles are included. Web TypeScript, changed-file ESLint and production build passed. Existing account/branch authorization and main Phase 1 are preserved.


Notification navigation (2026-10-21): notification title/message/timestamp form a keyboard-accessible link to the related request, with hover/focus feedback and View details text. Clicking closes the modal, attempts mark-as-read and opens the existing reset or leave detail drawer. Independent Mark as read remains available. Existing records receive recognized backfills/fallbacks; unavailable records show a clear message. See [NOTIFICATION_NAVIGATION_DESIGN.md](NOTIFICATION_NAVIGATION_DESIGN.md). Focused tests, TypeScript, lint and production builds passed; browser interaction was not exercised.

Recovery request details (2026-10-21): replaced the modal with an inline right-side panel next to the recovery list. The selected row is highlighted; details stack above the list on narrow screens. Notification links open the same panel; review actions and pending-operation guards remain. No API/schema or active Phase 1 boundary change.

Recovery panel validation: web TypeScript passed. Browser interaction and production build were not exercised for this presentation change.

Recovery drawer reference correction (2026-10-21): matched the supplied Leave drawer reference by replacing the inline recovery panel with the existing shared modal shell, styled as a full-height right-edge drawer with a dimmed backdrop, fixed header/footer and independently scrolling details. Removed the split layout so the queue retains its full width behind the drawer. Stronger drawer selector specificity prevents shared modal styles from centering or rounding the drawer. Existing busy guards, Escape/backdrop handling, focus restoration and notification deep links are preserved. Phase 1 remains active.

Simplified recovery approval (2026-10-21): removed the separate Verify identity action/API and verification prerequisite. Authorized administrators approve pending requests directly, then generate and email temporary access. Legacy VERIFIED requests remain approvable and display as pending; historical verification data is retained. Removed the verification filter/timeline step. Self-review restrictions, branch permissions, audit, approval-before-issuance and expiry remain. No schema or active Phase 1 boundary change.

Employee creation form consistency (2026-10-21): scoped text/select/file and native radio/checkbox layout to the creation modal. Fixed inherited full-width/min-height choice controls and later grid-label overrides, standardized field spacing, added schedule choice selection surfaces and a responsive day grid, and clarified required-field guidance. Existing payloads, branch/schedule queries, validation and modal guards remain. Design: [EMPLOYEE_CREATE_FORM_DESIGN.md](EMPLOYEE_CREATE_FORM_DESIGN.md). No API/schema or Phase 1 boundary change.

Workspace access error design (2026-10-21): replaced the plain unavailable-session text with a responsive centered card, connection icon, concise recovery guidance and a keyboard-accessible Try again button. A small client component uses router.refresh with transition feedback to rerun the existing server-side access check; pending retries are disabled. Authorization, redirects and Phase 1 boundary remain unchanged.

Static product branding (2026-10-21): changed visible Mspaces/MSPACES product copy to Mavic/MAVIC in navigation, login/recovery pages, metadata, sample branch labels, leave policy guidance and account emails. Session cookie/storage keys, email addresses, persisted branch records, technical identifiers and historical documentation remain unchanged. No schema or Phase 1 boundary change.

Simplified leave management (2026-10-22): applied the supplied leave UI/workflow request using three management destinations and separate My Leave. Moved allocation into Policy Settings, extracted the policy editor, changed filing to a shared dialog, added year-filtered ledger-derived reports/exports, scoped ledger dialogs and confirmed adjustments. Existing approval, allocation, reservation, evidence and DTR rules remain. A read-only audit found one legacy four-day approved SICK request without policy/usage history; reports flag it for HR reconciliation rather than inventing credits. No schema migration, historical rewrite or actual allocation was performed. Design: [LEAVE_SIMPLIFICATION_DESIGN.md](LEAVE_SIMPLIFICATION_DESIGN.md). Rollout, scheduling setup, reporting basis, data gap and validation limits: [LEAVE_SIMPLIFICATION_HANDOVER.md](LEAVE_SIMPLIFICATION_HANDOVER.md). Phase 1 remains active.


Attendance refinement (2026-10-23): compact section navigation and branch control; consolidated DTR task/filter toolbar; four shared primary metrics with interactive Needs review; collapsed secondary metrics/basis; conditional exclusion notice; clean search row; grouped period/export controls and secondary Tools. Existing calculations, API, permissions and Phase 1 boundary remain. Design: [ATTENDANCE_ORGANIZATION_DESIGN.md](ATTENDANCE_ORGANIZATION_DESIGN.md). Eighteen attendance tests, focused ESLint and TypeScript passed; actual-component browser fixtures cover narrow/wide layouts and task interactions.


Employee 201 file refinement (2026-10-23): modern identity/facts hierarchy, compact icon navigation, opt-in collapsible HR sections, searchable documents and an accessible right-side upload drawer. Thirty focused tests, ESLint, TypeScript and 390/1440px actual-component browser fixtures passed. Existing role/field boundaries remain; no live employee upload or edit was performed. Design: [EMPLOYEE_201_REFINEMENT_DESIGN.md](EMPLOYEE_201_REFINEMENT_DESIGN.md).


Shared modal presentation (2026-10-23): form/information modals across modules now use the shared right-side panel default, dimmed backdrop and mobile full-width sizing. Input-free confirmations opt into center; password-requiring branch deletion stays in a panel. Existing notification dropdown and modal behavior guards remain. Full web suite (158 tests) plus the additional branch-input regression, focused lint/typecheck and 390/1440px real-component fixture interactions passed. Design: [SHARED_MODAL_PANEL_DESIGN.md](SHARED_MODAL_PANEL_DESIGN.md). No API/schema/phase change.
