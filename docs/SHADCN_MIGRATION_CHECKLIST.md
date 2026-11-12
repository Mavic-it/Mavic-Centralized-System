# shadcn/ui Migration Checklist

The migration is incremental. A page is marked complete only after its existing interactions and access boundaries are preserved and lint/build checks pass.

## Phase 1 — Foundation

- [x] Audit the real routes, shared shell, styling, roles, and package setup in `docs/UI_SHADCN_AUDIT.md`.
- [x] Add `components.json` for the existing Next.js App Router, Tailwind v4, aliases, Lucide, and Radix base.
- [x] Add the shared semantic CSS-variable tokens while retaining Mspaces colors and existing shell rules.
- [x] Add the `cn` merge utility and install only dependencies required by the primitives.
- [x] Add shadcn `Button`, `Card`, `Badge`, and `Skeleton` source components.
- [x] Add the shadcn Sonner toast host and shared success/error notification helpers.
- [x] Add the shared shadcn `Input` primitive and use it in employee document upload and requirement forms.
- [x] Migrate the shared icon action adapter to `Button` without changing labels, tooltips, or dimensions.
- [x] Migrate the Employee Documents section to shared card, button, badge, and skeleton primitives.
- [x] Migrate the required-document checklist card, upload actions, status badges, and loading state; keep requirement data and upload/attach behavior unchanged.
- [x] Route existing page-loading shapes through shadcn `Skeleton` while keeping page-only layout geometry intact.
- [ ] Review rendered states at 360, 768, 1024, and 1440 pixels and verify keyboard focus in a browser.

## Phase 2 — Shared application shell

- [ ] Decide whether to replace or adapt the existing role-aware mobile sidebar with shadcn `Sheet`/`Sidebar` after a behavior audit.
- [ ] Migrate shell dropdown, tooltip, separator, and page heading patterns without changing role filtering or route access.
- [x] Reuse the shared skeleton primitive in route loading files while preserving each route's layout parity.

## Phase 3 — High-use HR workflows

- [ ] Employee directory: migrate table, filters, pagination, and status chips.
- [ ] Employee 201 file: migrate profile, work-schedule, assignment-history, emergency-contact, and checklist controls.
- [ ] Employee portal: migrate non-document panels while retaining self-only API access.
- [ ] Attendance and leave: migrate view controls only; keep schedule, attendance, balance, approval, and calculation logic unchanged.
- [ ] Branches and users: migrate forms and dialogs while preserving location selection, account linking, password confirmation, RBAC, and branch checks.
- [ ] Sign-in: migrate visual form primitives without changing authentication behavior.

## Phase 4 — Quality and remaining routes

- [ ] Migrate only modules with actual routed implementations; do not fabricate routes for sidebar placeholders.
- [x] Run web package lint and production build for the foundation and employee Documents group.
- [ ] Run relevant tests as allowed for each page group.
- [ ] Exercise role/branch-sensitive interactions and check loading, empty, error, disabled, and success states.
- [ ] Record completed pages, checks, and remaining risks in `docs/UI_SHADCN_AUDIT.md`.
