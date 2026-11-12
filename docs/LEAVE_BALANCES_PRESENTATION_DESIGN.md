# Leave balances simplification - 2026-10-23

2026-11-06 terminology refinement: in the employee drawer's Credit breakdown, show the existing `adjustments` amount as **Credits** and use the same term in the explanation below. This changes only presentation; the ledger source, calculation and authorized Adjust credits action stay intact. The single drawer owns the label and has no new props, state, API, loading or error paths. Keep its existing semantic definition list and collapsed disclosure accessible; verify the displayed label in the focused drawer test.

Replace the dense employee/type ledger matrix with one row per employee. Main Phase 1 and API/financial permissions remain unchanged.

- Balances owns existing filters, query, employee grouping, pagination and selected employee. Group only permission-scoped returned rows; pagination counts employees, not type records. Never sum available credits from different leave pools into a misleading balance.
- Main columns: Employee (branch shown once), Available by leave type (compact labelled values), Pending days, View balances. Zero balances remain visible with quieter styling.
- Employee drawer reuses the existing right-side native Modal pattern, with fixed header/footer, dimmed backdrop and independently scrolling content. Per-type cards show available, net used and pending days. A collapsed Credit breakdown reveals allocation/adjustments/gross usage/restoration. History and authorized Adjust actions retain the existing ledger/confirmation dialogs.
- Selection stores identities; derive current rows from fresh query data after mutations. Filters reset paging and selection. Loading, retry, empty results and missing/currently removed selections remain explicit.
- Use existing tokens, Button, IconActionButton, Modal and query invalidation. Label all controls, give View actions employee-specific accessible names, retain keyboard/Escape/focus behavior and responsive internal table scrolling.
- Files: leave balances component, small grouping/presentation helper, scoped CSS and focused UI tests. No database/API/schema changes. Verify grouping, net-use calculation, page units, permission-hidden adjustments, drawer/detail/history/adjust flows, responsive layouts, type/lint/build.
