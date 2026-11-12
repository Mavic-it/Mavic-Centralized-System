# System clarity pass

1. Component tree: AppShell includes a compact PageHelp disclosure above each existing workspace page. Page modules retain their current actions and forms.
2. Responsibilities: one central registry supplies task-oriented guidance for every current workspace route, including nested modules and employee detail pages. PageHelp owns only presentation.
3. Contracts: pathname string; a guide has a title and three plain-language steps. No account records, new API or permissions.
4. State: a native disclosure starts closed and resets on navigation. Existing loading, errors, confirmations and authorization stay in their modules.
5. Visual system: one small “How to use this page” disclosure, with short ordered steps only when expanded. Responsive width; use established neutral colors and red focus accents. Avoid extra open banners.
6. Accessibility: native details/summary keyboard behavior, visible focus, semantic ordered steps, no animation or focus stealing.
7. File plan: page-help.tsx, page-help.module.css, app-shell.tsx; simplify technical descriptions in leave and attendance pages. Update HRIS inventory.
8. Verification: route-coverage/presentation tests for the shared guide, TypeScript and changed-file lint. No workflows or data changes; HRIS Phase 1 stays active.

Coverage: dashboard, HR overview, employee directory/details, own portal/profile, account security, attendance, tasks, incidents, personal leave and all four leave management destinations, reservations overview/list/spaces/reports/settings, branches, user access, module access and password reset queue.
