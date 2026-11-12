# Leave module removal

At the user's explicit request on 2026-10-22, My Leave and Leave Management are retired. This supersedes the earlier leave implementation and simplification handovers. Main HRIS Phase 1 remains active; no other module or later phase is opened.

## Application changes

- Removed the `/my-leave` and `/leave` route trees, leave API proxies, sidebar entries, workspace modes, employee balance projections, portal credit cards and loading placeholders, and HR/operations leave queues and metrics.
- Removed NestJS leave controllers, services, DTOs, supporting-document endpoints, reports, allocation scheduler and leave permissions. Old return URLs fall back to the user's normal landing page. Old notification destinations no longer link into the removed module.
- Removed live leave-table queries from attendance listing, clock-in validation and DTR calculation. Existing employee schedules, holidays, clock records, imports, corrections, overtime, locked periods and stored DTR calculations remain. Historical attendance may retain its previously calculated leave labels; removal does not silently recalculate those records. New calculations have no live leave source.
- Preserved historical migrations and moved their catalog snapshot beside the migrations so a clean migration replay does not import a deleted runtime service.

## Database and recovery

`1792627201000-RetireLeaveManagement` removes the ten explicit leave tables: supporting documents, request days, credit ledger, requests, policy versions, event entitlement reviews, SIL eligibility, allocation runs, policies and type definitions. It uses no `CASCADE`; unrelated dependencies stop the transaction. It also removes legacy leave balance keys from employee employment JSON, leave-specific settings and obsolete leave notifications. Shared employee/account/branch/attendance/document/audit tables remain.

Before dropping existing leave tables, the migration locks them and writes a JSON recovery file containing their rows and affected employee balance metadata, settings and notifications. The default local directory is `tmp/leave-retirement-backups` at the repository root; it is ignored by Git. `LEAVE_REMOVAL_BACKUP_DIR` can specify a secure backup location in another deployment. Backup write failure prevents deletion. Files contain personnel information and must remain private.

The configured local database has recorded the retirement migration. All ten active leave tables are absent. Its pre-removal backup is `tmp/leave-retirement-backups/leave-public-1792637593903-5c4ef106-983d-4d6e-a7fd-6b6de3340e9a.json`. This backup contains the previous leave records; it is not an active database archive.

The migration is forward-only. Recovery requires the matching pre-removal code/schema and restoration of the JSON data in foreign-key order, including affected metadata/notifications/settings if required. The migration's `down` method intentionally refuses to invent empty replacement history. Do not replay old migrations over the live shared schema as an ad-hoc rollback.

For another environment: stop the old API/allocator, back up the database, build and deploy the removal API/web together, and apply reviewed migrations with a secured backup directory. The local-only helper `node scripts/retire-leave-management.mjs` from `application/api` runs only this retirement migration and verifies shared record preservation and table absence. Historical audit rows are deliberately retained.

## Verification

Validation results are recorded in the final leave-removal entry of `HRIS_IMPLEMENTATION_PLAN.md`. The PostgreSQL regression uses temporary fixture tables, verifies the recovery file, and rolls back its transaction. Production credentials, scheduled email delivery and signed-in employee actions are not used for validation. Unauthenticated requests to removed web pages may still pass through the normal login redirect; the production route manifest is the check that those page/API handlers are absent.

Final validation (2026-10-22): 316 surviving API tests plus seven new removal regressions, 131 frontend tests and the PostgreSQL retirement test passed (455 unique checks); one optional API test was skipped. Both production builds passed (web using Webpack), with no leave routes/proxies in the generated web route list. Web TypeScript and focused ESLint passed; API lint retains existing unrelated warnings. The local health endpoint returned 200. The retirement helper reports migration recorded, zero leave tables, unchanged shared records and three preserved employees. The PostgreSQL fixture also verifies that an external FK prevents deletion and allows transactional rollback. Signed-in browser actions and real employee messaging were not exercised.
