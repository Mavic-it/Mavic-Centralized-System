# My Portal UI modernization

Scope: `/me` for employee-linked users and admin accounts. Independent Super Admins retain the existing My Profile redirect. HRIS Phase 1 remains active; this is a frontend presentation change.

## Audit and component boundaries

PeopleWorkspace owns the route shell. EmployeePortalContent owns profile-mode checks, employee-scoped queries, active section and redirects. Existing child components own work schedule/document behavior. Current portal uses narrow side navigation, text-only query loading, small text/controls, a time-specific greeting and a hardcoded notification count. Attendance failures can appear as no record, and leave metric details can show zero while loading.

Opt the portal into the existing workspace theme and modern route styles with a portal modifier. Keep query keys, request scopes, role guards and mutations unchanged. Extract PortalSummary as a typed presentation component receiving already-derived metric values, loading/error flags and retry actions. PortalLoading and PortalSectionLoading share summary/detail geometry between route and query loading. Keep portal sections and active state in EmployeePortalContent; use native buttons with pressed/control semantics above full-width content. Export the existing content component for seeded provider tests without altering production ownership.

## Contracts and states

Summary values originate only from authorized leave balance, own-attendance and unread-notification queries. Loading uses silent placeholders; failures say Unavailable with refetch, and successful empty responses retain honest zero/no-record states. Notification count is the actual unread array length. An absent employee remains distinct from failed employee loading, with Retry for failed requests. Independent Super Admin verification still occurs before own employee content is rendered; no employee data or fabricated records are added to that path.

Profile, work schedule, requests, recent attendance, payslips, documents and announcements remain the existing sections. Personal information and documents retain their existing actions; portal document management remains false. Payslips explicitly remain unavailable. Existing leave calculations, schedule permissions, protected files and branch boundaries remain server-owned. Replace the always-morning greeting with a neutral Welcome.

## Visual, accessibility and file plan

Use existing semantic tokens, 12px cards, 42px controls, readable values/labels, clear identity and responsive metric hierarchy. A wrapping horizontal section navigator precedes content. At 360/768/1024/1440px cards/controls stack and long text wraps. Labeled native controls, visible focus, aria-pressed/controls, busy/status regions, error alerts and reduced motion remain supported. Skeletons have the final hero/five-summary/seven-section geometry.

Modify people-workspace.tsx and scoped CSS, page-loading.tsx, add portal-presentation.tsx and focused tests. Reuse actual document/schedule components without broad stylesheet changes. Verify baseline/full web tests, role/independent/linked/error/loading/summary cases, changed-file lint, TypeScript/production build and artificial browser fixtures. Record fixture limitations separately from authenticated end-to-end coverage. Update the UI tracker and maintained HRIS plan.

## Implementation and validation

- Added typed summary and shared loading components; applied existing modern workspace rules only to the portal mode, with portal-specific hero, compact-list, announcement, document and schedule styling. Weekly schedule scrolling now has an accessible name and keyboard focus target; existing schedule management rules are unchanged.
- Baseline: 97 web tests passed. Full suite: **111 web tests across 35 files passed**, including 14 portal cases. Coverage includes all six linked roles, independent admin data exclusion, live notification/balance values, unavailable/loading states, employee/admin identity recovery, read-only portal documents and existing schedule edit-role visibility.
- Changed-file lint and production build/TypeScript were checked. The initial build failed fetching the existing Google Geist font; retry with network access succeeded without changing font configuration.
- Browser fixtures render actual user/admin portal content, route loading and real read-only documents plus populated weekly schedule components. They use artificial records and mocked navigation; generated utility styling is not fully represented. At 360, 768, 1024 and 1440px, all 16 layouts had no document overflow or out-of-bounds form controls. Desktop/mobile screenshots were inspected and keyboard focus was visible.
- These fixtures do not establish authenticated tab transitions, actual redirects, leave mutations, document downloads, schedule edits, live notification delivery or server permission coverage. Existing handlers/contracts remain in place. Payslips remain unavailable. No API, schema or live-record changes; main HRIS Phase 1 remains active.


Portal simplification requested by the user (2026-10-20): removed My requests and Announcements & notifications tabs and their content from the profile/portal page. Removed the now-unused portal leave-request query and matched the loading navigation to the remaining five sections. The unread-notification overview metric and global notification control are preserved; My Leave remains the request workspace. No backend/schema, permissions or Phase 1 boundary change.


Portal schedule/attendance consolidation (2026-10-20): combined Work schedule and Recent attendance into one Schedule & attendance section, with the schedule above recent actual attendance. Both retain their existing own-employee queries, loading/retry states and permissions. Navigation/loading now have four sections. No backend/schema or main Phase 1 boundary change.


Schedule relocation requested by the user (2026-10-20): removed Schedule & attendance from My Portal, leaving personal/employment details, payslips and documents. Attendance already had manager branch schedules/weekly rosters; added a read-only My work schedule section for employee/staff and employee-linked HR/Branch Manager clock roles. It resolves only `/employees/me`, reuses the canonical employee schedule/week/history card and keeps schedule editing in existing administrative sections. The portal overview metrics remain unchanged. No backend/schema or Phase 1 boundary change.


Portal summary cleanup requested by the user (2026-10-20): removed Latest attendance and Notifications cards, their loading placeholders and unused portal API requests. Only the three leave-balance cards remain. Dedicated Attendance and the global notification control are preserved; no backend/schema or main Phase 1 boundary change.
