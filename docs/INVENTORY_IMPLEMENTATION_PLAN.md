# Inventory implementation plan

## Repository findings

- Frontend: Next.js 16 App Router in `application/web/app`, with the shared workspace shell, route-aware module permissions, same-origin API proxy, and existing MAVIC UI components.
- Backend: NestJS 12 in `application/api/src`, with PostgreSQL accessed through TypeORM `DataSource` and parameterized SQL. Schema changes use additive TypeORM migrations; there are no inventory ORM entities.
- Authentication and access: the existing session middleware and global `AuthGuard` protect API routes. Role/action/scope checks live in the authorization service; module page access and per-user overrides live in the module permission registry.
- Branches and employees: the existing `branches`, `users`, and `employees` records are authoritative. Inventory operations must use session branch scope and reference these records when later workflows need them.
- Existing inventory: `inventory_items` stores one branch-owned row per item with a globally unique SKU and mutable `stock_on_hand`; `assets` stores a separate serialized record. Existing services use process memory when constructed without a database outside production. The controllers currently lack DTO validation, action authorization, branch filtering enforcement, and durable movement records.
- Frontend inventory: no inventory route or functional page exists. The workspace sidebar has a non-link Inventory entry. Branch details count legacy `inventory_items` rows.
- Current HRIS tracker: HRIS Phase 1 remains active. Inventory work will not change HRIS workflows or start a later HRIS phase.

## Dependency-ordered milestones

### Inventory milestone 1 — catalog and stock foundation (implemented; migration ready)

1. Add an additive PostgreSQL migration for a shared catalog, branch balances, and immutable stock movements; backfill current item rows into the new tables without deleting legacy records.
2. Replace unsafe inventory writes with transactional catalog creation and idempotent receipt/issue operations. Record actor, branch, reason, before/after quantities, and movement time.
3. Add validated, authenticated, action-authorized, branch-scoped catalog, category, stock, movement, and overview APIs using existing role/module access patterns.
4. Add responsive Overview, Item Catalog, and Stock Management pages using the existing workspace shell and same-origin API proxy.
5. Update branch inventory counts to read distinct catalog items from the new branch-balance model. Add focused migration, service, authorization, and frontend checks.

Acceptance: an authorized user can create a shared catalog item, register it at a permitted branch, receive and issue stock without negative balances, retry a movement idempotently, see its permanent history, and view accurate branch-scoped totals. Existing inventory rows remain represented after migration.

Implemented API routes:

- GET /inventory/overview
- GET|POST /inventory/categories
- GET|POST /inventory/items
- PATCH /inventory/items/:id
- POST /inventory/items/:id/branches
- GET /inventory/stock
- POST /inventory/stock/:id/receive
- POST /inventory/stock/:id/issue
- GET /inventory/movements

The front end exposes Overview, Item Catalog, and Stock Management. The existing authenticated branch list drives filters and writes. Purchase prices and the valuation total require the separate inventory_valuation action in the existing role authorization matrix. Movement updates and deletes are rejected by a PostgreSQL trigger; corrections must be new reversal movements. The migration is forward-only so a rollback cannot erase imported stock or its ledger.

Verification run: 35 focused API tests passed, 3 workspace-access tests passed, API production build passed, frontend TypeScript passed, changed-file frontend lint passed, changed-file API type-aware lint passed, and the Next.js production build passed. The repository-wide API lint still reports pre-existing floating-promise errors in foundation/branches/branches.controller.ts and reporting/reporting.module.spec.ts; no inventory file is reported. The migration has not been applied to a configured database in this work session.

Setup: build the API, then start it once with the existing DB_MIGRATIONS_RUN=true setting to apply InventoryFoundation1795392000000. Keep DB_SYNCHRONIZE=false. Create at least one category from Inventory > Item Catalog as a company-wide inventory editor before adding a new item; legacy categories are copied automatically by the migration.

### Later inventory milestones (not started)

6. Requests, approval/issuance, assignments, returns, and employee custody history.
7. Transfers, purchasing/receiving, and maintenance.
8. Stock counts, reconciliation, loss/disposal, and expanded reporting.
9. Reservations, uploads, configurable branch settings, import/export, and broader integration/verification.

These later milestones depend on the shared catalog/balance/movement foundation and remain not started. Requests, asset assignments, transfers, purchasing, maintenance, counts, and expanded reports are not represented as complete by milestone 1.

## Risks and compatibility

- Existing rows have a branch, SKU, category, unit, and on-hand amount but no provenance timestamps or movement history. Migration records the current amount as an imported opening movement; it cannot invent earlier transaction history.
- The legacy `inventory_items` and `assets` records are retained. The new shared catalog and balances become the source for the new inventory UI and APIs. Existing asset workflows remain a separate later milestone.
- The shared role matrices are duplicated in the current repository. Inventory access must be added consistently to both authorization representations and the module permission registry.
- Inventory API writes must not fall back to in-memory persistence. Test doubles may be used in unit tests, but application module wiring always injects PostgreSQL.

## Verification

Use the repository's Vitest, Nest build/lint, and Next TypeScript/lint conventions. Add tests for migration backfill, balance concurrency/oversell rejection, idempotency, role and branch isolation, and real empty-state behavior. No production seed data or destructive migration is part of this plan.
