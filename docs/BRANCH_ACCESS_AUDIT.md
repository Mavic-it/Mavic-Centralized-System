> Latest behavior (2026-11-10): the top-bar branch-view control is removed. Administrative access automatically uses the complete saved employee assignment on every request, including existing sessions. One/multiple/all branches need no self-selection or Apply step. Page-level branch filters affect results only. The legacy switch endpoint cannot narrow stored access; role and ownership restrictions remain. Earlier viewing-selection instructions below are historical.

# Branch access and filtering review — 2026-11-07

Main HRIS Phase 1 remains active. This corrects existing access/filter behavior; it does not start another phase or grant additional role actions.

## Access contract

2026-11-10 unified assignment (latest user override): linked account access now derives from the employee's work branches through employee_branch_access. Both HR employee editing and User Access update the same employee assignment. Primary branch remains authoritative for department and attendance and is synchronized to linked users by database triggers. This supersedes the earlier separation of work locations and account grants. Only Super Admin can change a linked Branch Manager's scope; Super/IT administration is required for linked HR scope changes. Existing role actions and sensitive-field restrictions remain. Original values are backed up by migration 1795132800000-UnifiedEmployeeBranches; existing administrator scope wins during reconciliation without unioning conflicting metadata. See UNIFIED_EMPLOYEE_BRANCHES.md.

- An employee/account home branch is an assignment, not an administrator access grant.
- Linked administrator scope is SELECTED (employee work branches) or ALL (all active branches, including future branches). Primary branch only saves a one-branch selection. Legacy unlinked accounts retain ASSIGNED defaults.
- A session may select a subset of authorized branches for collection views. Selecting a subset must not remove other authorized choices from the branch switcher.
- Switching outside the current session selection uses the existing server-validated branch-switch endpoint and refreshes module state. Direct API requests outside the selected scope remain rejected.
- Branch access does not grant new actions, expose restricted employee fields, remove incident authority rules, or expand personal-record ownership.

## Findings and corrections

1. User Access previously inferred “All branches” from a missing home branch. The account list now returns effective access mode and authorized active branches independently of home assignment. Labels and account branch filters use those results. No saved access settings were changed.
2. Attendance previously populated its local picker from the selected session branches, so an administrator viewing one branch could not select another authorized branch. Choices now come from `/auth/branches`. A scope switch refreshes the page and keeps the active Attendance section. Local filters within an already selected branch set remain local.
3. Reservations had the same session-limited picker. Its filter now offers authorized choices and switches server scope before a newly selected branch is loaded. “Current workspace branches” distinguishes a subset from All authorized branches. Creation controls retain the loaded session's branch options. Authorized branch URLs also establish the matching session before fetching reservation data.
4. Module Access expected `items` from a branch endpoint that returns `data`, producing an empty branch filter. It now uses the existing paginated `/users/branch-options` contract.
5. Employee and account forms fetched only the branch endpoint's default first page. A shared loader now retrieves every active branch page within the current selection.
6. Branch detail/department operations now consistently apply the selected branch boundary even when the role has ALL-scope actions.
7. Wider verification found an existing Reservations PostgreSQL type-inference error in buffer-window overlap checks. Explicit timestamptz casts repair booking/block checks. Existing test-only reservation notification schema and wall-clock-dependent reservation/task fixtures were updated to permit deterministic verification; business hours and recurrence rules were not relaxed.

## Module inventory

| Module | Branch behavior reviewed |
| --- | --- |
| HR overview / employee directory | Shared workspace selector; EmployeeController filters lists by selected branches and limits sensitive fields. Employee form options now paginate. |
| Employee 201 file / workflow / documents / profile pictures | Record routes check authorized selected branches; own-record and salary/document restrictions remain. |
| Branches / departments | Shared selector, paginated lists, selected-set enforcement on record routes. |
| Attendance overview / history / branch schedule / weekly roster | Full authorized local choices, server scope switch where necessary, active section retained. Roster emptiness still reflects actual employees assigned to the selected branch. |
| Attendance & DTR | Existing DtrService branch/action enforcement, scoped imports, writes and exports retained. |
| Official Business | Existing selectedBranchScope/includesBranch enforcement retained for review, filing, decisions and DTR integration; preceding role and self-approval rules unchanged. |
| Leave requests / balances / reports / settings | Shared selector; LeaveService applies selected branch sets. Existing HR-only credit/settings actions retained. Personal leave remains own-record only. |
| Tasks / templates / automation | Shared selector; context, lists, assignees and record actions honor selected branch sets. Existing creator/assignee and recurrence restrictions retained. |
| Incidents / exports | Shared selector plus original/current employee branch checks, reviewer scope and disciplinary authority. Private-report redaction retained. |
| Reservations / spaces / availability / settings / reports | Authorized picker and scope-switch repair; selectedBranchScope and per-record includesBranch enforcement retained. |
| User Access / branch options / password-reset queue | Scoped HR/manager employee-account operations remain; Super/IT global administration remains intentional. Effective-access labels and local account filter corrected. |
| Module Access | Branch-option response corrected; actor branch checks and role/module permission ceilings retained. |
| Personal profile / work schedule / security / notifications | Own-record or fixed-record context, not a management branch collection. No new branch filter added. |

No future-phase or sample-only reporting/room service was expanded into a new module.

## Verification

- Read-only inspection confirmed the screenshot's missing-home-branch account had no saved ALL override and had two active managed branches. No account roles, access grants, assignments, or real records were changed.
- Auth regression exercises saved ALL access for HR Admin and Branch Manager through session validation, secondary branch selection, branch lists/details, employee list, leave scope and DTR permissions; finite selections reject other branches.
- Rollback-only PostgreSQL account-label regression covers assigned managed branches with no home branch, explicit SELECTED access, ALL access with a home branch, inactive exclusion, and employee home-branch isolation.
- Frontend regression covers full branch pagination, authorization choices versus current selection, validated single/All switches, denied switches, and truthful account labels.
- Existing task/incident and reservation rollback-only PostgreSQL suites exercise branch boundaries and workflow permissions. Final check results are recorded in HRIS_IMPLEMENTATION_PLAN.md.
- No live authenticated browser session was used. Temporary PostgreSQL fixtures roll back all changes; no migration is required.
