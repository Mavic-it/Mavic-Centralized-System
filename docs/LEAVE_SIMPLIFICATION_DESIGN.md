# Simplified leave management

## Component tree and responsibilities
Authorized route > PeopleWorkspace header > existing LeaveManagementWorkspace orchestration. Three management destinations: Requests & Approvals, Policy Settings and Credit Reports. My Leave remains separate. Old allocation/credits URLs redirect into the relevant existing page.

Requests retain the shared responsive request table, stage-aware details drawer and approval history. Policy Settings shows the policy table first, opens the existing form in Modal, and groups allocation rules, type catalog and statutory verification as secondary disclosures. My Leave opens ConfiguredLeaveForm inside the shared Modal. CreditReports owns filters, summary, balance rows, ledger dialog and adjustment dialog; existing APIs own truth and authorization.

## Contracts and state
Use current request/policy/credit mutations and query invalidation. Add a typed report response with year/asOf, balances and scoped ledger entries, including processedBy and running balance. The same query parameters drive table, totals and exports. HR/Super Admin adjustments keep the existing POST credits payload, UUID idempotency key, required reason, effective date, confirmation and audit. Managers have scoped report/read access; IT has no HR access.

Form drafts and modal/disclosure selection are local; React Query owns server loading/error/success state; requestId remains the deep-link URL contract. Pending dialogs cannot be dismissed or submitted twice. Empty, error, unauthorized, pending and success states retain explicit feedback.

## Visual and accessibility
Compact primary tables, four meaningful metrics, six essential request filters, consistent form groups and secondary disclosures. Native labeled controls, table headings, focusable scroll frames, shared modal focus containment/restoration and visible focus. Tables scroll within their own surface on narrow screens; controls stack. No animation required. Branding is Mavic per the latest user instruction.

## Data and trust boundaries
Reuse transactional/idempotent allocation, reservation, approval, cancellation and DTR synchronization. No migration or credit/history rewrite. Year reports use opening ledger balance plus selected-year movements through asOf; live reservations appear only in the current year. Historical pending reservations cannot be reconstructed reliably and are explicitly excluded/labeled. Reports are not historical employment/branch snapshots. Original biometric data remains untouched. Keep statutory rules and evidence checks; do not invent legal entitlements or activate example policies.

## Files and verification
Change leave-sections, legacy route redirect, workspace, summary/request/balance presentation, configuration UI and loading. Add focused report UI/types and report query helper. Extend configuration controller/service for scoped reports and consistent exports. Tests cover navigation/roles, summary/filter math, year ledger reconciliation, export scope and safe cells, adjustment authorization, allocation idempotency, reservations/approvals/cancellation and existing DTR guards. Run focused API/web suites, type/lint and production builds; use temporary PostgreSQL fixtures for report calculations. Browser verification depends on available tooling.
