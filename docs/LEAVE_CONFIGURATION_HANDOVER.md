# Leave configuration handover

Implemented 2026-10-20 for the user-requested leave feature. The main HRIS plan remains **Phase 1**; this authorization does not open unrelated payroll, benefits or integration phases.

## Available workflows

- `/leave/policies`: HR/Super Admin policy settings, eligibility groups, statutory verification, approval/evidence rules, effective dates, immutable version history, verified event entitlements and type definitions. Global type definitions are maintained by Super Admin.
- `/leave/credits`: authorized employee/branch/type filters, opening/earned/used/adjusted/expired/reserved/available balances, reasoned manual credits, allocation/expiry runs and CSV/XLSX exports. Branch Manager access remains read only where permitted.
- `/my-leave`: server-calculated eligibility, scheduled working days/holidays, available/projected balance, evidence requirements and existing protected supporting-document downloads.
- Request snapshots retain the selected policy version, account, approval rules and event entitlement. Pending paid requests reserve credits; final approval posts usage once. Rejection/cancellation releases reservations. Approved cancellation requires explicit policy permission and reverses usage once.
- Self-approval is denied by default, including employee-linked administrators. HR-only or Manager plus optional HR stages are configurable. Authorization and branch scope are checked on the server and again inside decision transactions.
- Approved leave updates saved, unlocked DTR derived data and paid/unpaid/code export columns while retaining source punches and overrides. Affected approved DTR periods return to draft for review. Locked periods must be reopened first. No monetary payroll valuation was added.

## HR setup required

1. Confirm company benefits. VL 5, SL 5, Emergency 3 and Bereavement 3 are **examples**, not activated company policy or opening credit grants. The migration installs eleven type definitions, not employee entitlements.
2. Create a dated policy per applicable benefit/scope/group. Verify service requirements, scheduled versus calendar counting, approval stages, notice, evidence, paid status, negative limits, shared accounts and cash conversion. New policies start inactive.
3. Verify applicable statutory rules and retain a legal reference. SIL requires an explicit coverage decision and individual eligibility review; event-based statutory benefits require HR-verified qualifying facts and event/day limits. Statutory benefits are not treated as ordinary annual credits. Review the official [DOLE handbook](https://nwpc.dole.gov.ph/wp-content/uploads/2024/11/Workers-Statutory-Monetary-Benefits-Handbook-2024-Edition.pdf) and current applicable law before activating a statutory policy.
4. Choose automatic allocation only when desired and set its **explicit start date**. Only periods starting on/after that date and policy/hire eligibility are considered; monthly allocation posts fully closed months and catches up missed periods. Runs are limited to ten years of configuration. Annual/anniversary/monthly grants use stable period keys and overlap checks across revisions/transfers. Changing configuration does not recalculate existing grants. Use dated policies and deliberate start dates for changed benefits; historical catch-up uses the selected current policy configuration, not reconstructed former employee branch/group assignments.
5. Confirm carry-over cap, expiry and approved cancellation. Expiry/carry processing preserves reserved credits. Approved cancellation defaults off; when enabled, a refund uses the original usage effective date plus the snapshotted expiry interval. It does not restore each original grant lot's expiry date. Cash conversion creates a leave/payroll input, not a calculated cash payment.
6. Review legacy opening balances separately before entering adjustments. The existing local approved Sick request has no supporting credit ledger. It remains unchanged; no historical credits or deductions were fabricated.

Automatic scheduling is disabled by default. To opt in, set `LEAVE_ALLOCATION_SCHEDULER_ENABLED=true` and `LEAVE_ALLOCATION_ACTOR_ID` to an active authorized HR/Super Admin user. The hourly scheduler uses that actor's authorized scope and audits each run. Manual allocation requires a reason and confirmation; scheduler failures are logged. Keep startup schema synchronization and automatic migration execution disabled during controlled rollout.

## Database and runtime

Additive migration: `application/api/src/database/migrations/1792454405000-LeaveCreditConfiguration.ts`.

It adds type definitions, policy configurations/revisions, request snapshots, entitlement reviews, allocation audit runs and ledger allocation/expiry/idempotency metadata. Existing records are preserved; rollback intentionally requires a forward migration to retain history.

Applied **only this migration locally**, with `synchronize:false` and `migrationsRun:false`. Before/after digests confirmed the one existing request and zero credit entries were unchanged. Eleven definitions were installed. The local compiled API is running with `DB_SYNCHRONIZE=false` and `DB_MIGRATIONS_RUN=false`. `/health/db` returned 200; unauthenticated auth/configuration routes returned 401. No production deployment, live leave submission or employee grant was performed.

For another environment, back up and apply this specific migration through the controlled TypeORM migration runner; do not enable blanket schema synchronization or unrelated pending migrations. Build API before restart. The migration has already been recorded locally and must not be applied as raw SQL again.

## Implementation ownership

- Backend policy validation/catalog/statutory baselines: `leave-policy-rules.ts`.
- Credit lot consumption and allocation periods: `leave-credit-lots.ts`.
- Scoped configuration, catalog/history, event verification, scheduling/allocation/audits: `leave-configuration.service.ts`, controller and DTO.
- Existing request/policy/credit workflow integration: `leave.service.ts`, `leave.controller.ts`, `leave.dto.ts`, `hr.module.ts`.
- DTR synchronization/export: `leave-dtr-sync.ts`, attendance DTR types/calculation/service/export.
- Settings, history, credit tools, entitlements/calendar UI: `leave-configuration-ui.tsx`.
- Self-service preview/form: `configured-leave-form.tsx`; parent integration: `leave-management-workspace.tsx`, request presentation, workspace mappers/types and new policy/credits routes.
- Design and contracts: [LEAVE_CONFIGURATION_DESIGN.md](LEAVE_CONFIGURATION_DESIGN.md).

## Verification

- Full API unit suite: 275 passed, 1 skipped; database integration is explicitly opt-in.
- PostgreSQL feature suite: 12 passed in an isolated artificial-data schema, including reservations/exact usage, annual duplicate/revision/transfer checks, nine-month catch-up, evidence, event quotas, cancellation/DTR preservation, group conflicts, self-approval, locked DTR, negatives/retroactive usage, rejection, manual retry keys and concurrent requests. It also runs after local migration rollout; fixtures are rolled back/schema removed.
- Full web suite: 148 passed. API and web production builds passed. Web TypeScript and changed-file ESLint passed. API lint completed with existing warnings and a test-only unbound-method warning; no lint errors.
- Browser fixtures: 12 management request/policy/credit layouts and 16 My Leave request/drawer/cancel/edit layouts at 360/768/1024/1440; no page/control overflow. Manager policy actions hidden. Proof multipart payload and empty-file rejection, drawer keyboard containment and Escape focus restoration passed. Desktop/mobile screenshots inspected.
- Browser fixtures use artificial data. Authenticated production-account end-to-end mutations and production deployment were not performed. Legal/company configuration acceptance remains an HR responsibility.

Commands: API `bunx vitest run --maxWorkers=2`, opt-in PostgreSQL `LEAVE_CONFIGURATION_DB_TEST=true bunx vitest run --config vitest.config.e2e.ts test/leave-configuration.e2e-spec.ts --maxWorkers=2`, `bun run build`, `bun run lint`; web `bunx vitest run --maxWorkers=2`, `bunx tsc --noEmit`, changed-file `bunx eslint ...`, `bun run build`.
