# Attendance UI refresh

Scope: Attendance first. Other modules are inventoried in UI_UX_MODULE_TRACKER.md and remain pending this redesign. Reuse the existing shell and all APIs, calculations, permissions, audit and approval behavior. Main HRIS Phase 1 remains active.

## Audit

P1: the right navigator consumes table width; 8–11px copy and short controls impair scanning/touch use; roster spreadsheet colors differ from DTR; twelve equally prominent KPI cards obscure priorities; generic DTR loading blocks do not match content. P2: inconsistent border radii, button styles, status treatment and empty states. No new authorization or calculation defect is asserted by this visual audit.

## Component tree / responsibilities

- Existing AttendanceContent: owns authenticated session, branch, selected section, schedules, clock actions and history. Keeps inactive sections mounted.
- AttendanceSectionNav: reusable typed section-button navigation. Receives items {id,label,description,icon}, activeId and onChange; owns no server state. Native buttons support Tab/Enter/Space, aria-pressed and visible focus. Horizontal, wrapping on small screens; no custom arrow-key tab contract.
- Existing DtrWorkspace → DtrImport / DtrLedger / DtrSettings / DtrReview: retain state and event/API contracts. DtrLedger groups primary KPIs and expandable supporting metrics without dropping information. DtrLoading mirrors import cards or ledger metrics/table.
- Shared workspace-theme.module.css: opt-in semantic design tokens for subsequent modules, applied only to Attendance and its loading/dialog surfaces.

## State / contracts

No API changes. Branch and date changes retain existing behavior. Loading uses matching structural skeletons; empty/no-results remain distinct from error and denied access. Existing mutations retain disabling, confirmations, messages and form values on failure. DTR errors receive retry buttons; review/lock business rules remain on the API. Section navigation preserves current mounted forms and unsaved inputs. User-facing labels explain recorded time and exclusions without exposing implementation details.

## Visual hierarchy

Page context and selected branch → section navigation → primary task and filters → a small set of primary metrics → ledger and review. Neutral slate surfaces, existing red brand accent, semantic green/amber/red states; 14px body, 12px labels, 28px page title, 42px controls, 12px cards, 8/12/16/24px spacing. Tables have calm headers, readable rows and contained horizontal scroll. Roster uses the same language, retaining its editable seven-day grid. Wide layouts use full content width; 1024/768px controls wrap; 360px form fields stack. No decorative charts, invented KPIs, new fonts or dependencies.

## Accessibility

Semantic headings/forms/tables and row-specific review labels. Native selects/buttons and existing modal focus/Escape restoration. Text status labels accompany color. Focus rings, comfortable targets, adequate contrast, no page-level horizontal overflow, static loading under reduced motion and readable zoom. Tables receive named keyboard-focusable scroll regions. Existing destructive confirmations remain. No new approval requirements.

## Files and verification

Add `app/components/ui/workspace-theme.module.css`, `app/attendance/attendance-section-nav.tsx`, `app/attendance/dtr-loading.tsx`. Update Attendance workspace, both feature stylesheets, DTR workspace/ledger/import/review, and AttendanceLoading in page-loading.tsx. Record module status and HRIS inventory. Run focused web tests, changed-file ESLint, TypeScript and production build. Where possible inspect 360/768/1024/1440px rendering with a local browser; distinguish fixture-based visual checks from authenticated live workflows.


2026-10-23 organization refinement: [ATTENDANCE_ORGANIZATION_DESIGN.md](ATTENDANCE_ORGANIZATION_DESIGN.md) supersedes the earlier dense navigation/metric/action presentation. Top-level navigation now scrolls horizontally on narrow screens, DTR uses three primary tasks plus Tools, and four primary metrics share one surface. API/calculation and permission boundaries remain unchanged.
