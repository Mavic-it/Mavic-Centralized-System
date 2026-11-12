# User Access and Branches UI

Scope: `/system/users` and `/branches`, including branch detail/department management and existing account/branch dialogs. Main HRIS Phase 1 remains active. No backend, schema, authorization or mutation contract changes.

## Audit

User Access has small controls, text-only query loading, misleading zero session totals for unavailable data, and empty-state messaging during failed/loading requests. Branches has a separate dense table/form style and a scroll container without a keyboard focus target. Both already have working permissions, confirmations, request validation and pending guards; preserve those owners.

## Component tree and responsibilities

- PeopleWorkspace continues to own route context and UserAccessContent owns queries, filters, pagination, account view, forms and mutations. Opt this mode into the established employee workspace visual rules, with a separate userWorkspace modifier for account-specific layout.
- AccountAccessSummary receives only authorized WorkspaceAccount records and a loading flag; displays current, active, inactive/pending and archived counts, never unsupported session or MFA statistics. AccountTableSkeleton has the same four columns as the final account table.
- AccountAccessTable owns table headings, caption and scroll semantics; its children slot preserves UserAccessContent's existing account rows and permission-dependent actions.
- BranchesWorkspace keeps its hook and permissions. A branch-specific scoped CSS module reuses semantic workspace tokens and overrides existing global branch class names only under its root. Existing BranchToolbar, BranchTable, BranchDetailPanel and form/delete dialogs retain their props and state owners. Server-paginated branch totals remain labeled as search results rather than invented global metrics.
- BranchesLoading and the users variant of PeopleWorkspaceLoading opt into matching styles and summary/table geometry. Other loading variants retain their current appearance.

## Contracts, state and interactions

No request/query-key/payload changes. Summary counts cover authorized account records independently of filters. Current/Archived buttons keep native aria-pressed semantics. Errors offer existing refetch functions; loading hides invented counts; empty and filtered-empty states appear only after successful queries. Branch search/status/page state remains in useBranchesPage. Account creation, role/branch editing, resets, activation, deactivation, archive and delete retain existing permission and confirmation conditions. Branch delete retains password reconfirmation and linked-record checks. Existing dialogs retain native focus, Escape and pending behavior.

## Visual system and accessibility

Neutral surfaces, restrained brand red, semantic status pills, 12px cards, 42px primary controls, 14px text and 12px labels. Header context precedes filters/table. Branch details group related counts, identity/location and departments. At 360/768/1024/1440px controls wrap and tables scroll inside labeled focusable containers. Long text wraps, focus remains visible and reduced motion is respected. Do not hide account actions or alter role visibility to fit the layout.

## File plan and verification

Add account-access-presentation.tsx; modify people-workspace.tsx and scoped CSS, page-loading.tsx, branch workspace/table/toolbar; add branches/workspace.module.css. Add focused rendered presentation checks and artificial browser fixtures using real summary/table/branch-detail components. Verify existing account/branch behavior tests, all web tests, changed-file lint, TypeScript/production build and responsive/focus checks. Report fixture limitations separately from authenticated end-to-end coverage.

## Verification scope

Final results: **90 web tests across 33 files passed** (seven new administration cases), changed-file `bun run lint` passed without warnings, and `bun run build` passed including TypeScript and route generation. Headless Chrome checked accounts, branches, details, loading and delete layouts at 360, 768, 1024 and 1440px (20 cases): no document overflow or out-of-bounds form controls; the focused button had a visible 3px outline. Desktop/mobile screenshots were inspected.

The baseline web suite passed all 83 tests. New cases check authorized account summaries without unsupported session statistics, loading placeholders, accessible table/action slots, branch deletion visibility, pending/page guards, error/loading distinction, filtered totals and deletion password/pending controls. The browser fixture renders real summary/table/branch-detail/loading/delete components with artificial records; account action samples are illustrative and the delete dialog is displayed statically for layout inspection. Global CSS selectors are preserved when transforming CSS Modules for this fixture. Utility-generated styling is not fully represented.

Authenticated account creation, role/branch changes, resets, lifecycle mutations, branch/department mutations, native dialog focus transitions and external map/geocoding behavior were not exercised end-to-end. Their existing handlers, payloads, server rules and shared dialog implementation were preserved. No live records were modified.
