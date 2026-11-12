# Management leave approval and history

## Contract and confirmed scope

On October 26, 2026 the user explicitly authorized SUPER_ADMIN, HR_ADMIN and BRANCH_MANAGER to approve their own leave, and enabled policy annual allocation, half-day requests and future approved cancellation. One final decision remains the workflow. Main HRIS Phase 1 remains active; this is a change to the already authorized leave slice.

Approval is authenticated and authorized by the API. Management role, branch scope, linked employee ownership, active employment, branch consistency, credits, attendance contradictions and DTR locking still apply. Self-approval does not auto-approve at filing. An authorized owner explicitly chooses **Approve my request** and confirms. Employees/staff and IT Admin gain no approval rights; an owner cancels rather than rejects their own request. A management owner can still read their own historical request after transfer, but cannot use that ownership to bypass branch authorization for a decision.

## History

New events snapshot actor name and role alongside the existing immutable actor account ID and database timestamp. A self-decision records request status APPROVED and event/audit action SELF_APPROVED, with selfApproved=true and actorRole in audit details. The original submission and optional comments remain in the timeline. Frontend history now shows full PHT date/time including seconds and role at action. Existing rows without snapshots display the linked account's current name and omit the unavailable historical role; no historical identity or role was invented. Snapshot fields preserve future history if the account name/role changes later.

Decision idempotency, employee/branch locks and stable usage/restoration source keys remain. Repeated approval cannot consume credits or create history twice. Rejection/cancellation retain reason requirements. React renders actor names/comments as text. The browser does not supply actor identity, role, timestamps, status or credit effects.

## Policy rollout

Migration 1792972801000-LeaveApprovalHistory adds nullable actor_name and actor_role event columns, and appends new policy versions for VL, SL, EL, SIL and LWOP. It enables halfDay and allowApprovedCancellation for all five. automaticAllocation is enabled only for paid ANNUAL policies, and remains false for unpaid/manual LWOP. The existing notice periods and other policy fields are retained. Future-effective versions are not activated early; old policy versions, existing request snapshots, credit entries and events are not rewritten. Repeated migration execution does not create redundant policy versions.

**Credit granting remains a separate business action.** Enabling approved annual allocation makes eligible paid annual types qualify for Run allocation. It does not by itself create grants or start the optional server scheduler. The scheduler remains disabled unless configured separately. Running allocation can grant all qualifying employees/types within the administrator's scope and preserves existing adjustments; do not run it on real employees as a casual UI test.

Newly filed requests use the enabled half-day/cancellation settings. An existing approved request still uses its saved policy and cannot acquire cancellation permission retroactively. Cancellation also requires a future start date and unlocked DTR period.

## Deployment and recovery

Build the API, then run application/api/scripts/migrate-leave-approval-history.mjs --apply from application/api before restarting the new API code. Without --apply it only checks pending status. The migration is additive and transactional; preserve its history snapshots. Recover a policy setting using a new version in Leave Settings, not deletion of published records. This change requires no SMTP configuration or scheduler activation.

## Acceptance and focused validation

- All three management roles can explicitly approve their linked own request within scope.
- Staff self-approval and cross-branch decisions remain denied; self-rejection directs the owner to cancellation.
- History distinguishes SELF_APPROVED from APPROVED and retains actor name/role after account changes.
- Repeated decisions consume credits once and write one approval event.
- Existing ordinary review, concurrency, cancellation/restoration, attendance/DTR locks and notification behavior remain intact.
- TypeScript, focused API/web lint, focused leave tests and isolated PostgreSQL workflows must pass.
- Actual-component browser fixtures check confirmation, button visibility, role/name/timestamp history and mobile/desktop bounds without submitting a real employee request.

## Verified outcome

The configured local DB records migration LeaveApprovalHistory1792972801000. Current version-4 policies enable half-days and future approved cancellation for all five known types, and annual allocation eligibility for the four paid annual types; LWOP remains credit-free/manual. Minimum filing notice values remain 0 for SL/EL and 1 for VL/SIL/LWOP. No allocation run, scheduler activation, real approval/cancellation, employee mutation or outgoing notification was performed.

Validation: 20 isolated PostgreSQL workflow tests passed, including all three self-approval roles, denied employee self-approval, denied ownership-based cross-branch approval, actor snapshot retention across name changes, idempotent ledger/history and existing DTR/notification flows. All 23 focused API leave tests and 14 focused frontend leave tests passed. API build, frontend TypeScript and focused API/frontend lint passed. Chrome artificial-data fixtures passed at 390px/1440px for owner approval, explicit confirmation, hidden self-rejection, persisted self-approved actor/role/full PHT timestamp, permission-denied button absence and no overflow/runtime errors. Evidence: tmp/leave-approval-review. Signed-in production approval and real mail delivery were not exercised. The production web build still has the previously documented unrelated Next.js prerender issue; it was not rerun for this focused change.

Local API health returned 200 and direct/proxied anonymous leave checks returned 401. The API is now managed by an existing Nest development watcher; the earlier compiled-process restart guard correctly left that different runtime untouched.

Runtime activation: restarted the identified Nest development watcher after final build validation to ensure the latest corrected query is loaded. The development reload workflow is retained; schema synchronization and startup migrations are disabled for this process. Users may need to sign in again because sessions are process-local.

Final runtime check: the restarted API development watcher reported successful startup, and /health/db returned 200. No real leave decision or credit allocation was used for this check.
