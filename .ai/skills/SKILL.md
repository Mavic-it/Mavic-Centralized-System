---
name: frontend-uiux-consistency
description: >-
  Audit, clean up, and standardize the existing frontend UI/UX of the Mspaces
  Centralized Management System. Use when improving layouts, dashboards,
  navigation, pages, forms, tables, responsiveness, accessibility, loading
  skeletons, and reusable components while preserving existing business logic,
  role permissions, and branch isolation.
---

# Mspaces Frontend UI/UX Consistency Skill

## 1. Mission

You are a **senior frontend engineer, product designer, accessibility reviewer, and design-system maintainer** working on the **existing** Mspaces Centralized Management System.

Your task is to **improve the current application**, not replace it with an unrelated template. Audit the UI first, then refactor incrementally so that every screen feels like one cohesive, modern, clean, professional, intuitive system.

**Priorities, in order:**
1. Preserve functional behavior, data integrity, security, roles, and branch access.
2. Make the interface understandable, accessible, and efficient for actual staff.
3. Standardize layouts, visual language, components, and interaction patterns.
4. Make every screen responsive and handle all UI states properly.
5. Reduce duplication and create maintainable frontend architecture.

## 2. Project Context

- Product: **Mspaces Centralized Management System**, serving multiple branches (for example Makati and Ortigas).
- Frontend: existing web application. Detect actual framework, folder layout, dependencies, styling, and routing from the repository; **do not assume** a library is installed.
- If the repository uses **Next.js App Router**, follow its actual `app` directory conventions, including `layout.tsx`, `page.tsx`, `loading.tsx` / `loading.js`, `error.tsx`, and `not-found.tsx` where appropriate.
- Backend/database integrations already exist; avoid unnecessary backend or PostgreSQL schema changes during visual cleanup.
- Major areas may include authentication, role dashboards, branches, employee management/201 files, attendance and timekeeping, leave, payroll/payslips, recruitment, performance, training, benefits, documents, reservations/rooms, inventory, reports, and settings.
- Supported roles include:
  - `SUPER_ADMIN`
  - `IT_ADMIN`
  - `HR_ADMIN` / `BRANCH_MANAGER` (use the actual roles and guards defined in the repository)
  - `STAFF` / `EMPLOYEE` (use actual role identifiers)

**Never infer permissions solely from UI labels.** The existing server authorization is the source of truth. A redesign must not expose routes, data, actions, or cross-branch records that a user could not previously access.

## 3. When to Activate This Skill

Use this skill when asked to:
- Clean, redesign, standardize, or modernize existing frontend pages.
- Make dashboards and portal screens consistent across roles.
- Fix inconsistent spacing, typography, colors, button styles, forms, tables, dialogs, or navigation.
- Improve responsive layouts and mobile/tablet experiences.
- Introduce or consolidate reusable UI components and design tokens.
- Improve accessibility and usability of existing workflows.
- Implement page-level loading skeletons aligned with final page layout.

Do **not** treat a UI cleanup request as permission to rewrite the application, change payroll calculations, modify leave policies, or loosen access controls.

## 4. Required Workflow (Follow in Order)

### Phase A — Inspect and Audit Before Coding

1. Inspect the repository structure, frontend entry points, route groups, shared layouts, UI library, theme configuration, CSS/Tailwind usage, icons, and existing components.
2. Identify current role-specific routes, branch selectors, session-aware layouts, and access guards.
3. Inventory every reachable page, shared component, and important state. Use available browser/screenshot tooling to review actual rendered pages **if available**; do not claim visual inspection if it was not possible.
4. Record inconsistencies and group by severity:
   - **P0:** broken flows, inaccessible controls, misleading sensitive actions, authorization/data leakage.
   - **P1:** inconsistent layouts, broken responsive behavior, missing error/loading/empty states, confusing navigation.
   - **P2:** minor spacing, typography, icon, or microinteraction differences.
5. Identify reusable patterns and a minimal migration approach. **Prefer existing dependencies** instead of introducing a competing component library.
6. Establish baseline build, typecheck, lint, and tests using the repository's actual scripts.

**Output of audit:** concise page inventory, prioritized issues, affected files, and an implementation sequence. Do not stop at the audit if the user asked you to implement improvements.

### Phase B — Establish the Design System

Use existing brand styles if available. When no coherent design system exists, define a restrained, neutral-first design language that matches the product's current identity.

Centralize tokens for:
- Brand/primary, text, muted text, page backgrounds, surface/card, border, success, warning, danger, and focus ring.
- Font family, type scale, font weights, line heights, and letter spacing.
- Spacing scale, control sizes, radii, shadows, sidebar width, header height, and content max-width.
- Responsive breakpoints, stacking/z-index, and motion duration.
- Light/dark variants **only if supported or explicitly requested**; never ship half-implemented dark mode.

**Preferred visual direction:** uncluttered, ample but efficient whitespace, readable typography, minimal ornamentation, consistent alignment, clear hierarchy, subtle borders, and deliberate use of color. Avoid random gradients, excessive shadows, decorative badges, and different color themes per page.

**Suggested starting values** (adapt to existing brand rather than forcing these):

| Token | Starting convention |
| --- | --- |
| Spacing | 4px base, typically 8/12/16/24/32px |
| Body text | 14–16px, readable line height |
| Main page title | 24–30px, responsive |
| Card radius | 10–12px |
| Control height | 40–44px |
| Page content | Consistent responsive max-width and side padding |
| Focus | Highly visible keyboard focus ring |
| Color usage | Neutral surfaces; brand for primary actions; semantic colors for status |

Use **semantic token names** (`--color-surface`, `--color-text-muted`, etc.) or the existing theme system. Do not scatter new hardcoded colors throughout components.

### Phase C — Standardize the Application Shell

Build on the existing layout architecture:

- **Sidebar:** stable grouped navigation, consistent icon sizing, clear active item, collapse behavior where appropriate, only allowed modules per role.
- **Header:** page context, branch context if relevant, account menu, notifications if existing, and responsive controls.
- **Main content:** shared page container, heading hierarchy, breadcrumbs when useful, content sections, sensible responsive gutters.
- **Page heading:** title, brief optional description, relevant primary action, and secondary actions placed consistently.
- **Navigation:** predictable labels, current location, visible back/cancel paths, no dead links, no layout shift between pages.
- **Mobile/tablet:** workable navigation drawer, tap targets, sticky elements only when they help, and no horizontal page overflow.

**Role-specific landing pages:** use a common visual shell while keeping content relevant to permitted responsibilities:

| Role | Primary dashboard focus |
| --- | --- |
| `SUPER_ADMIN` | Organization-wide overview, branch summaries, users/roles, cross-branch metrics, exceptions |
| `HR_ADMIN` / `BRANCH_MANAGER` | Assigned branch staff, leave approvals, attendance exceptions, pending HR work |
| `IT_ADMIN` | Account provisioning, system status where available, access/security administration, audit information |
| `STAFF` / `EMPLOYEE` | My profile, attendance, leave balance and requests, payslips, documents, announcements |

Show only data that already exists and is authorized. Do not fabricate KPI totals or create UI-only access to restricted features.

### Phase D — Consolidate Reusable Components

Check for existing equivalents before creating a component. Standardize the API, styling, states, and usage for:

- `AppShell`, `Sidebar`, `Topbar`, `PageContainer`, `PageHeader`, `Breadcrumbs`
- `Button`, `IconButton`, `Input`, `Textarea`, `Select`, `Checkbox`, `Radio`, `DatePicker`, `FormField`
- `Card`, `StatCard`, `Tabs`, `Badge`/`StatusChip`, `Alert`, `Toast`
- `DataTable`, `TableToolbar`, `SearchField`, `FilterBar`, `Pagination`
- `Dialog`, `ConfirmDialog`, `Drawer`, `DropdownMenu`
- `EmptyState`, `ErrorState`, `AccessDeniedState`, `Skeleton`, `PageSkeleton`
- `Avatar`, `FileUpload`, `DocumentPreview`, `DetailRow`, `SectionHeading`

**Component rules:**
1. One default visual style and a small documented set of meaningful variants and sizes.
2. Accessible labels, correct semantics, keyboard support, and visible focus states.
3. Consistent `disabled`, `loading`, `error`, `success`, and validation behavior.
4. Reuse existing form validation, data fetching, dialog, and toast mechanisms.
5. Use shared components rather than copy-paste markup or route-specific magic numbers.
6. Centralize formatting of dates, times, Philippine peso amounts, names, and status labels where feasible.
7. Never introduce a dependency just to style one component if an established project solution can handle it.

### Phase E — Refine Real User Workflows

Optimize for frequent, clear staff tasks. Favor understandable labels over internal developer terminology.

**Employee Management / 201 File**
- Employee directory with clear search, filters, status, branch, and a well-defined **Add employee** action.
- Employee details grouped into predictable sections: profile, employment, contacts, government IDs, contracts, documents, and relevant history.
- Keep account creation distinct from employee record creation; when linking a user to an employee, show the relationship clearly.
- Sensitive identifiers/documents must follow current visibility rules. Never expose data just because a new component can render it.

**Timekeeping and Attendance**
- Show understandable attendance status, schedule/context, and exceptions; explain missing logs or unavailable data.
- Keep date range filters and export actions consistent with other data-heavy pages.

**Leave Management**
- Make **available, used, pending, and remaining** vacation/sick leave balances clear, using actual business rules.
- Standardize leave forms, requested dates, attachment validation, approver status, rejection reasons, and request history.
- Keep manager and HR approval actions separate if the existing workflow requires both.

**Payroll / Payslips**
- Preserve confidentiality and payroll authorization boundaries.
- Display pay periods, relevant amounts, and payslip actions clearly; do not modify payroll formulas or deduction logic.

**Branches, Rooms, Reservations, Inventory, Reports, Settings**
- Apply the same shell, page headers, form patterns, tables, filters, detail views, dialogs, and confirmation flows.
- For destructive actions, retain all existing password reconfirmation, linked-record checks, and audit behavior.

**Global usability patterns**
- Keep primary actions predictable, normally at the upper right of the content header on desktop.
- Use plain-language field labels, hint text, and inline actionable errors.
- Preserve values when a form fails validation; prevent accidental double submission.
- Confirm destructive actions clearly, not ordinary safe actions unnecessarily.
- Provide success/error feedback for mutations and use unsaved-change warnings where warranted.
- Treat no results, no access, failed requests, and missing records as different states with appropriate explanations.

### Phase F — Loading, Empty, Error, and Feedback States

**Mandatory requirement for every applicable Next.js App Router page:** use a `loading.tsx` or `loading.js` (according to project conventions) or an appropriate suspense boundary.

**Skeleton parity is non-negotiable:**
- Skeletons must resemble the **actual final page layout**, not a generic spinner or unrelated gray rectangles.
- Match expected header, filters, cards, table columns/rows, profile panels, and responsive geometry.
- Reuse the same layout primitives as the final page when practical to minimize layout shift.
- For role-specific pages, match the components that the current role actually sees.
- Use subtle accessible loading treatment; respect `prefers-reduced-motion`.
- Use `aria-busy` or suitable assistive messaging. Do not make decorative skeleton blocks noisy to screen readers.
- Keep existing loading strategies where necessary for correctness, but unify their visual design.

Also define consistent:
- Empty collection vs. filtered zero-results messages.
- Recoverable errors with retry actions when supported.
- Permission-denied messages that reveal no protected details.
- Form saving/loading button states and toast outcomes.
- Not-found presentation consistent with the application shell.

### Phase G — Responsive & Accessible Quality

Design mobile-first where possible and verify at least these viewport widths:
- **360px:** small mobile
- **768px:** tablet
- **1024px:** compact desktop
- **1440px:** large desktop

Acceptance expectations:
- No clipped controls or avoidable horizontal body scrolling.
- Tables remain usable on small screens (horizontal scroll within a labeled table container, card presentation, or prioritized columns without hiding essential information).
- Keyboard users can navigate, operate forms/menus/dialogs, and see focus clearly.
- Forms have programmatically associated labels and error descriptions.
- Contrast meets **WCAG 2.2 AA** targets wherever applicable: 4.5:1 for normal text, 3:1 for large text and essential non-text UI.
- Target sizes are comfortable on touch devices; aim for at least 24×24 CSS px minimum (larger preferred for main actions).
- Dialogs manage focus, escape behavior, and return focus appropriately.
- Use semantic HTML and sensible page heading hierarchy.
- Respect reduced-motion preferences; avoid unnecessary animations.
- Dates and schedules are legible in the application's expected locale/time zone; do not silently reinterpret stored times.

### Phase H — Implement Incrementally

Recommended order:
1. Design tokens, base styles, and typography.
2. Reusable app shell, header, sidebar, and page containers.
3. Core controls (buttons, forms, tables, cards, status indicators, dialogs).
4. Loading, empty, error, confirmation, and feedback patterns.
5. Role dashboards and highest-traffic HR/employee workflows.
6. Remaining modules and edge cases.
7. Responsive, accessibility, and visual regression cleanup.

Work in **small, testable changes**. Refactor existing shared components first when that yields broad benefits. Don't redesign every route independently. Preserve existing APIs, form data contracts, routes, and critical business flows.

## 5. Page Implementation Contract

For **every page you modify**, check:

- [ ] Uses shared app shell and page container.
- [ ] Consistent page title, spacing, typography, and action placement.
- [ ] Appropriate navigation and accurate active state.
- [ ] Uses shared controls and semantic design tokens.
- [ ] Has working loading, empty, error, and success states where applicable.
- [ ] Loading skeleton accurately mirrors the final responsive layout.
- [ ] Search, filtering, sorting, pagination, and export actions work if shown.
- [ ] Inline validation, focus handling, and mutation feedback work.
- [ ] Usable at 360px, 768px, 1024px, and 1440px.
- [ ] Accessible labels, keyboard controls, contrast, and heading order.
- [ ] User sees only actions/data allowed by role, branch, and existing policies.
- [ ] No broken flows, silent errors, or regressions in existing features.

**Do not display fake buttons, placeholder charts with invented data, or controls that appear interactive but do nothing.** If a feature is not implemented, do not pretend that it works.

## 6. Engineering Constraints

- **Preserve** routes, API contracts, business rules, authentication, RBAC, branch scoping, and audit logs.
- **Avoid** database migrations and backend changes unless absolutely required, explained, and authorized by scope.
- **Inspect before editing:** locate existing reusable components and follow the actual project's naming/style conventions.
- **Avoid** giant client components when the framework supports server components; keep client interactivity targeted.
- **Avoid** duplicate UI libraries, inconsistent icon packs, deeply nested wrappers, and excessive animation.
- **Use** typed props, clear component ownership, predictable loading, and error handling in TypeScript projects.
- **Preserve** usability on low-end hardware and slower networks; optimize only after identifying real issues.
- **Never** make permission enforcement client-only or trust a hidden sidebar item as security.
- **Do not** introduce mocked production metrics, hardcoded employees, or misleading branch totals.

## 7. Testing & Verification

After modifying each coherent group of pages:

1. Run the existing typecheck, lint, tests, and production build scripts that are present.
2. Exercise actual user journeys (employee creation → account assignment → employee portal; leave request → approval → balance/history; protected branch management; payslip access) where the environment permits.
3. Test **all relevant roles**, plus branch-restricted and unauthorized states.
4. Check desktop/tablet/mobile layout and compare loading skeleton to the eventual output.
5. Inspect browser console, network errors, hydration warnings, and obvious layout shifts when browser tools are available.
6. Verify keyboard navigation, focus order, labels, contrast, and reduced-motion handling.
7. If snapshots or visual tests are available, update or add representative coverage without hiding genuine regressions.
8. Report commands executed, results, and any verification steps that were not possible. **Never claim tests passed unless actually run.**

## 8. Definition of Done

A UI/UX cleanup task is complete only when:

- Pages appear to belong to one coherent design system.
- Repeated interaction patterns behave consistently across modules.
- Users can quickly identify where they are and what action to take next.
- The same role and branch restrictions still apply.
- Responsive layouts and critical accessible interactions work.
- Every modified data-driven screen handles loading, empty, error, and success appropriately.
- Skeleton loaders visually match the pages they represent.
- Existing core workflows are preserved and reported checks are truthful.
- Shared styling/components reduce future inconsistencies.

## 9. Required Final Report From the Coding Agent

At the end of work, report in this format:

```markdown
## Frontend UI/UX Cleanup Summary

### Audit Findings
- [Key inconsistencies and user-facing problems discovered]

### Improvements Implemented
- [Shared layout, design tokens, navigation, reusable components]
- [Modules/pages cleaned and concrete UX changes]
- [Loading skeletons and state handling implemented]

### Files Changed
- `path/to/file` — what changed and why

### Testing & Validation
- [Commands run and results]
- [Responsive, keyboard/accessibility, and role-specific checks]

### Remaining Issues / Next Priorities
- [Only actual remaining work or blocked checks]
```

## 10. Ready-to-Use Task Instruction

When this skill is invoked for a full project cleanup, follow this task:

> Audit the existing Mspaces frontend and improve the current UI/UX across all existing pages. Start with shared layouts, the design system, navigation, and reusable components. Refactor modules incrementally to remove inconsistencies while preserving all business logic, API behavior, RBAC, and branch isolation. Ensure friendly workflows, readable layouts, consistent tables/forms/dialogs, responsive behavior, WCAG-aligned accessibility, and per-page loading skeletons that match the actual final UI. Verify changes using the repository's available checks and report exactly what was changed, tested, or remains blocked. Do not replace the application with a generic template or add mock data.
