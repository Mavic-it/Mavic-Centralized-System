# Leave Management sections

User reference: a named sidebar group with four indented links. Retain the existing dark sidebar, icons, active indicator, keyboard focus and mobile drawer closing behavior.

`AppShell` owns visibility of the module. `LeaveSidebarGroup` renders accessible nested navigation from `leaveSections`; collapsed navigation retains a named module link. The shared section definitions own titles, descriptions, paths and HR-only metadata. Existing authorized server pages own direct-URL access; the backend remains authoritative for every read/mutation.

Four routes: `/leave` requests/approvals and team schedule; `/leave/policies` catalog, policy configuration/history and event/SIL reviews; `/leave/allocation` automatic allocation and manual credit posting; `/leave/reports` balances, transaction ledger, report export and a collapsed read-only payroll handoff. Legacy `/leave/credits` redirects to reports. My Leave retains its own request/balance tabs.

Management pages use route state instead of a duplicate tab strip. Only Requests shows request statistics. Allocation contains no report exports; Reports contains no allocation/post-credit actions. Existing requests, forms, confirmations, audit contracts and API permissions are reused. Route-specific skeletons match settings/forms/reports. HR and Super Admin can configure; Branch Managers see requests and read-only reports; staff/employee access remains My Leave.

Verification: section/role/active-link assertions, relevant regression suites, TypeScript, changed-file ESLint, production build and artificial responsive fixtures. No database changes or later HRIS phases are authorized by this navigation task.


Validation: 16 artificial-data browser layouts passed at 360/768/1024/1440, including allocation/report content isolation. Narrow allocation screenshot inspected. The 13 focused navigation/configuration/request-presentation tests passed; the other 138 web tests passed in the regression run. Existing tab-strip assertions were updated for the requested sidebar navigation. No authenticated live-account mutations were performed.

Production web build passed, including TypeScript and all four routes. The legacy credits route remains a redirect. The main HRIS phase remains Phase 1.


Leave sidebar dropdown follow-up (2026-10-20): Leave Management now uses a native expandable details/summary heading with a state chevron and visible keyboard focus. The group opens on active leave routes and starts closed elsewhere; clicking or Enter/Space toggles its children. The compact sidebar keeps its existing accessible module link. Routes, role permissions, page content and main Phase 1 boundary are unchanged.

Dropdown verification: focused navigation tests and changed-file ESLint passed. Native mouse collapse and Enter expansion passed at 252, 360 and 1440 pixels with no overflow; screenshots inspected.


Sidebar visual refinement (2026-10-20): removed the Leave Management group border and added consistent background/text hover feedback to all clickable sidebar module links. The disclosure heading retains hover and keyboard focus styling; disabled modules retain their existing appearance. CSS-only change; routes, permissions and the Phase 1 boundary are preserved.
