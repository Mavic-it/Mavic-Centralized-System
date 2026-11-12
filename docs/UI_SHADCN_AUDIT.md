# Mspaces shadcn/ui Migration Audit

## Scope and stack

- Frontend: Next.js 16.3.6 App Router, React 19.2.8, TypeScript, Tailwind CSS v4, Bun workspaces.
- Existing visual layer: global CSS tokens, a role-aware workspace shell, CSS Modules, and Lucide icons.
- Initial state: no `components.json` or shadcn primitive directory. UI controls, cards, status chips, dialogs, and loading shapes were implemented locally.
- Migration approach: add shadcn source primitives in `application/web/app/components/ui`, map their semantic tokens to the existing Mspaces colors, and migrate feature areas incrementally. Keep route, role, branch, API, and audit behavior in the current owners.

## Component audit

| Current Page/Component | Current Implementation | Proposed shadcn/ui Component | Priority | Risk | Migration Status |
| --- | --- | --- | --- | --- | --- |
| `application/web/app/layout.tsx`, `app/globals.css` | Geist, Tailwind v4, custom neutral/red tokens and global shell styles | CSS-variable theme tokens; preserve existing shell rules | P1 | Low | Foundation configured; brand tokens retained |
| `application/web/app/components/icon-action-button.tsx` | Shared icon buttons/links with custom dimensions, tooltip CSS, and accessible labels | `Button` with icon size; retain the current tooltip adapter until a Tooltip rollout | P1 | Medium: widely reused | Migrated to `Button`; custom icon API and tooltip behavior retained |
| `application/web/app/components/ui/sonner.tsx` and `app/lib/notifications.ts` | Success/error feedback previously appeared as banners or mutation error text across feature areas | shadcn Sonner toast host and shared notification helpers | P1 | Low: presentation-only feedback | Added at the root and applied to mutations; field validation and retryable query errors remain contextual |
| `application/web/app/components/app-shell.tsx` and `workspace-app-shell.tsx` | Custom responsive sidebar, role-filtered routes, branch context, account/logout flows | `Sidebar`, `Sheet`, `DropdownMenu`, `Tooltip`, `Separator` | P2 | High: navigation, focus, and access visibility are cross-cutting | Keep current implementation; planned after primitive adoption |
| `application/web/app/(workspace)/page.tsx` | Role-aware overview with bespoke metric cards and charts | `Card`, `Badge`, `Skeleton`, Tooltip | P2 | Medium: preserve real role-scoped values | Queued |
| `application/web/app/(workspace)/hr/page.tsx` | HR dashboard and summary cards | `Card`, `Badge`, `Skeleton` | P2 | Medium: preserve existing API data | Queued |
| `application/web/app/(workspace)/employees/page.tsx` | Employee directory and custom table/filter controls | `Table`, `Input`, `Select`, `Badge`, `Pagination`, `Skeleton` | P1 | Medium: filters and employee actions | Queued |
| `application/web/app/(workspace)/employees/[id]/page.tsx` and `app/components/people-workspace.tsx` | Employee 201 file, profile, work schedule, assignment history, documents, and portal sections | `Card`, `Button`, `Badge`, `Field`, `Input`, `Select`, `Dialog`, `AlertDialog`, `Skeleton` | P1 | Medium: preserve role, branch, history, and document behavior | Documents section migrated first; remaining employee sections queued |
| `application/web/app/components/employee-documents-section.tsx` | Feature-owned document state with CSS Module card/status/loading styles | `Card`, `Button`, `Badge`, `Input`, `Skeleton` | P1 | Low: API and permissions remain unchanged | Card, actions, status, loading, and upload fields migrated |
| `application/web/app/components/employee-document-checklist.tsx` | Branch requirements, checklist state, upload/attach forms, local card styles | `Card`, `Button`, `Field`, `Input`, `Select`, `Badge`, `Skeleton` | P1 | Medium: requirement and attachment workflow | Card, actions, status, loading, file/date/name inputs migrated; native selects/checkboxes retained |
| `application/web/app/(workspace)/me/page.tsx` | Employee self-service sections and document/attendance/leave panels | `Card`, `Tabs`, `Badge`, `Skeleton` | P2 | Medium: self-access boundary | Shares the migrated Documents section; other panels queued |
| `application/web/app/attendance/workspace.tsx` | Custom attendance tables, schedule summaries, and filters | `Table`, `Card`, `Badge`, `Input`, `Select`, `Skeleton` | P2 | High: calculations and attendance actions | Queued |
| `application/web/app/(workspace)/leave/page.tsx` and `app/components/people-workspace.tsx` | Leave request, approval, balance, and history workflows with custom forms/tables | `Card`, `Calendar`, `DatePicker`, `Badge`, `Dialog`, `Table`, `Skeleton` | P2 | High: approval and balance rules | Queued; preserve business logic |
| `application/web/app/branches/workspace.tsx` and `app/branches/components/*` | Modular branch tables, form dialogs, location picker, and protected deletion flow | `Table`, `Dialog`, `AlertDialog`, `Input`, `Select`, `Badge` | P2 | High: map behavior and password/authorization checks | Queued |
| `application/web/app/(workspace)/system/users/page.tsx` | User access forms, role/branch assignment, account tables | `Table`, `Dialog`, `Select`, `Switch`, `Badge`, `Avatar` | P2 | High: account and RBAC boundaries | Queued |
| `application/web/app/login/*` | Custom branded sign-in form and responsive layout | `Card`, `Field`, `Input`, `Button` | P2 | Medium: preserve authentication and cookie flow | Queued |
| Route `loading.tsx` files under `application/web/app` | Existing route-shaped loading UI, with local skeleton styles | Shared `Skeleton`, then route-specific compositions | P2 | Low | Shared shadcn `Skeleton` adapter now powers the existing shapes; compositions retained and build verified |
| Reservations, rooms, inquiries, inventory, reports, settings navigation entries | No routed implementations found; sidebar entries are non-functional placeholders | None until real routes/workflows exist | — | High if represented as working | Do not create fake routes or controls |

## Initial migration decisions

- Use the Radix primitive base, Lucide icons, the current Geist font, and neutral shadcn tokens mapped onto the existing Mspaces red/neutral palette.
- Keep CSS Modules during migration. Shared primitives own common control behavior; feature modules retain their current layout and domain state until migrated individually.
- Do not replace the role-filtered shell, API calls, authorization, branch scoping, or employee/leave calculations as part of the component migration.
- Use route-specific skeleton compositions from existing loading files; do not replace them with generic placeholders.
