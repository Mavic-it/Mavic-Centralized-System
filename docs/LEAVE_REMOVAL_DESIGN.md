# Leave removal design

User request (2026-10-22) supersedes the leave implementation requirements for the current application. Remove My Leave and Leave Management through UI, API and database without opening another HRIS phase.

Component tree: AppShell retains its existing navigation primitives with leave entries removed. PeopleWorkspace retains HR overview, employee records, personal profile/documents/payslips and account management. HR overview owns only employee metrics and directory links. EmployeePortalContent and PortalLoading omit leave cards and their requests/skeletons. Existing contracts lose leave modes/types; no new UI state or interactions. Shared component styles, keyboard navigation, focus, responsive behavior and loading/error states remain. Deleted URLs and API proxies cease to exist; old notification links are inert.

Backend: unregister/delete leave controllers, services and allocator. Remove leave permissions, employee balance projections and live attendance/DTR table reads. Retain stored attendance calculations, source records and audit history. Historical migrations become self-contained and remain replayable.

Database: forward-only retirement migration drops the explicit leave table set in dependency order without CASCADE, removes module permissions/settings/notifications and legacy employee balance JSON. Shared tables remain. Local controlled runner takes a private ignored JSON recovery backup before transactionally running the migration. A schema dependency check will fail rather than silently delete unrelated objects. Rollback requires restoring the backup and pre-removal code/schema.

Verification: builds, types/lint, surviving module tests, retirement migration/permission/navigation/attendance regressions and searches for active table/API dependencies. Database runner verifies leave tables absent and shared tables preserved.
