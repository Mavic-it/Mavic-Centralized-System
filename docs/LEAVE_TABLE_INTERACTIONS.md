# Leave table interaction design

1. Component tree: existing leave page sections retain their tables, filters, pagination and drawers; a shared TableTools component sits between filters and each table.
2. Responsibilities: TableTools owns accessible search/sort controls and clear action. Each owning page derives displayed rows from its authorized query and keeps row actions unchanged.
3. Contracts: TableTools receives search value, sort value/options and change callbacks. Request search/sort applies to the current server page only; balance search/sort applies to authorized loaded employees; policy search/sort applies to loaded types.
4. State model: local search/sort state resets paging to first page where necessary. Server filters and data loading remain intact. Empty search results show a clear message; errors and loading use existing components.
5. Visual system: compact toolbar above each table, row hover/focus treatment, subtle selected/action emphasis, responsive wrapping and horizontal scroll for dense tables.
6. Accessibility: labeled search and sort controls, native keyboard behavior, visible focus, real action buttons, polite result count and no row-only click target. Reduced motion receives no essential animation.
7. File plan: shared toolbar in `leave/table-tools.tsx`; `workspace.tsx`, `balances.tsx`, `settings.tsx` derive visible rows; `leave.module.css` styles controls; focused test and tracker update.
8. Verification: focused table tests, TypeScript and lint. Data permissions and server filtering remain unchanged.

## Table presentation refinement

1. Component tree: the existing request, balance and policy tables share `TableTools`, native tables, status badges and existing row action buttons.
2. Responsibilities: `TableTools` presents search, sort, clear and result feedback; each table keeps its authorized rows and opens its existing detail view.
3. Contracts: search and sort callbacks and the current result count stay unchanged. Request results remain scoped to the current server page.
4. State model: search text and sort choice already live in each parent. Loading, error and empty states stay with the owning page. No new server state.
5. Visual system: a lighter toolbar, clear search/sort affordances, compact result badge, stronger row hierarchy and outlined actions. Table header remains distinct, while mobile balance rows retain their card layout.
6. Accessibility: native labels and controls, real action buttons, visible focus, semantic row headers, and polite result feedback. Do not make entire rows clickable because they contain independent actions.
7. File plan: refine `table-tools.tsx`, `workspace.tsx`, `balances.tsx`, `settings.tsx` and `leave.module.css`; extend focused presentation tests.
8. Verification: run focused leave table tests, frontend TypeScript and changed-file lint. Check narrow layouts and overflow styles in CSS.
