# Responsive UI audit — 2026-10-26

The existing Next.js App Router UI uses Tailwind 4, CSS modules and a shared global stylesheet. The application shell already provides a collapsible desktop sidebar, a mobile navigation drawer, role-filtered links, route loading skeletons, native modal panels and contained horizontal scrolling for complex tables. Leave, attendance, branch and employee screens already include mobile breakpoints. The overview still uses clearly marked sample data; no new business screen was created for the UI request.

## Issues found and changes made

- The notification trigger was hidden below 640px, leaving the employee inbox inaccessible on a phone. It now stays in the header at every width. The popover fits the viewport, scrolls its content and keeps its filters reachable.
- The header could squeeze long breadcrumb text beside branch selection and actions. Small-screen breadcrumbs now truncate, while branch controls retain bounded widths and the notification and sign-out targets remain visible.
- Shared page content stopped at 1540px and the overview stopped at 1300px, wasting space on wider screens. The main content can now use up to 1920px and the overview fills that space. Padding scales down with the viewport.

Existing contained tables, mobile record presentations, single-column forms and scrolling right-side dialogs were retained because they already solve the corresponding responsive cases. API contracts, permissions, data and workflows are unchanged. The current HRIS Phase 1 boundary remains.

## Verification and remaining work

- TypeScript: `node ../../node_modules/typescript/bin/tsc --noEmit` passed in `application/web`.
- The actual AppShell Chrome fixture passed 320, 375, 390, 430, 640, 768, 1024, 1280, 1440, 1920 and 2560px: no document overflow, notification trigger visible, sign-out interaction and focus restoration, and reduced-motion behavior. Evidence: `tmp/responsive-shell-review/checks.json`.
- The fixture covers the shared shell with artificial notification data. It does not establish that every authenticated module, role, long translated label, browser zoom level or mobile keyboard layout is overflow-free. Those require signed-in device and role walkthroughs.

## Continuation — 2026-10-27

- Mobile navigation now locks background scrolling, moves focus into the open drawer, keeps Tab within its controls and restores focus to the hamburger after Escape. The transition fallback leaves focus alone once the user has moved within the drawer.
- Leave management, people workspaces, branches, attendance and the password-reset queue use the shared content width instead of their older page caps or duplicate padding. Leave loading cards become two columns below 700px and one below 420px. The employee portal summary becomes one column below 420px. The legacy leave review form can use its containing panel width on a phone.
- TypeScript, focused AppShell lint and the complete frontend suite passed (51 files, 175 tests). The shared-shell Chrome fixture passed all 11 requested widths, including focus trap, Escape, scroll restoration, notification visibility, reduced motion and no page-level overflow.
- Existing actual-component Chrome fixtures passed at 390px and 1440px for the employee 201 file, attendance workflows, branch location form, notification inbox and the current leave filing form. All use artificial APIs; no real request, employee, attendance, branch or notification mutation occurred. The older `check-leave-v1.mjs` fixture no longer matches the current request form and failed on a missing select; the current `check-leave-filing.mjs` fixture passed.
- `next build --webpack` compiled the CSS and finished TypeScript, then failed during prerendering with the previously documented Next.js `Expected workStore to be initialized` invariant on `/change-password` and `/leave/balances`. The production build is not marked passing.
- Expanded actual-component fixtures to 320px, 640px, 1024px and 1440px for employee 201, attendance and leave filing. The first 320px attendance run found real page overflow (348px document) and clipped date fields. At widths below 380px, the DTR task controls now form a two-column grid with a full-width Summary & export action, and the period filters use one column. The repeated attendance fixture passed with no page overflow in normal, empty, error and employee views. Employee 201 and leave filing passed the expanded widths as well.
- Branch location and notification inbox fixtures also passed at 320px, 640px, 1024px and 1440px, including viewport containment, focus and the existing fixture interactions.
