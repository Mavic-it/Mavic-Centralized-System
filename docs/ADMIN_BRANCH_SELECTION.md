> Latest behavior (2026-11-10): the top-bar branch-view control is removed. Administrative access automatically uses the complete saved employee assignment on every request, including existing sessions. One/multiple/all branches need no self-selection or Apply step. Page-level branch filters affect results only. The legacy switch endpoint cannot narrow stored access; role and ownership restrictions remain. Earlier viewing-selection instructions below are historical.

> 2026-11-10 superseding contract: User Access and HR employee work branches now edit one employee assignment. Linked-account access reads employee_branch_access; the employee primary is shared and cannot drift through role editing. Primary branch only, selected work branches and all-active work branches are the available choices. Only Super Admin may change Branch Manager scope, and linked HR scope requires Super/IT administration. Old access-only/home-branch separation described below is historical. Migration 1795132800000-UnifiedEmployeeBranches retains original data and is installed in the configured local database. See UNIFIED_EMPLOYEE_BRANCHES.md.

# Administrator branch access and viewing

Implemented 2026-10-28 within the existing Phase 1 authorization foundation.

## Account access

Super Admin and IT Admin can open **User access**, find an HR Admin or Branch Manager, and choose **Manage branch access** (shield action). The drawer offers:

- **Default role and branch assignments**: retain the prior account behavior (home/managed branches for scoped admins; company-wide scope for an unscoped HR Admin).
- **Selected branches**: authorize an explicit nonempty set of active branches.
- **All branches**: authorize all current and future active branches.

These settings affect access only. Employee home branch, department, supervisor and branch manager assignments are not transferred or rewritten. Role permissions remain authoritative: branch managers do not gain HR-only configuration/salary privileges, and IT admins do not gain HR personnel privileges. Employee/staff accounts cannot use these access settings or the viewing selector.

Saving access is audited with actor, target and before/after values, and revokes the target account's sessions. The target signs in again. Only account administrators who already manage roles (Super Admin/IT Admin) can grant access; HR/Branch Managers cannot grant themselves broader access.

## Viewing

The top-right **Branches** control appears only on supported pages for authorized admin roles. Select one or more checkboxes, or **All authorized branches**, then Apply. Applying rotates the server session and reloads the current page to clear branch-specific cached data. Cancel/Escape discard unapplied changes; keyboard focus returns to the trigger on Escape.

| Page | Branch selector |
| --- | --- |
| HR dashboard, employee directory, branches | Shown when the role can access the page; employee directory has no second branch filter |
| Tasks and Incidents & Discipline | Shown for authorized management roles; filters team/reviewer collections while personal ownership access remains available |
| Attendance | Header selector hidden; retain the page's single branch picker for imports, schedules and other branch-specific tools |
| Leave requests, balances, reports and settings | Shown when the role can access the page; shared leave table filters have no second branch selector. Policy editing still requires an applicable branch |
| User access and password reset requests | Shown for HR Admin/Branch Manager; hidden for Super Admin/IT Admin because their account queues stay global |
| Sample operations overview, personal profile/portal/security, My Leave | Hidden; these pages do not filter their main content by selected branches |
| Individual employee profiles and unknown routes | Hidden; a specific record has a fixed context and new routes must explicitly support branch selection |

Hiding the control does not reset the selected branches or account access. Navigate to a supported collection page to change the selection.

?All authorized branches? follows the account's current accessible active branches. It never expands a selected-access account to unassigned branches. Live session validation rechecks the selected IDs against the account's current grants and active branches. Removed selected access invalidates the session; all-authorized views resolve the current authorized set on each request.

Employee directory, branch collections, attendance record collections and leave management apply selected scope on the server. Employee records, HR profiles, documents, pictures, schedules and DTR actions check the selected branch set while retaining existing role/ownership restrictions. Account administration remains a privileged global function for Super Admin/IT Admin. Own-profile and own-leave workflows retain their ownership checks.

Attendance work tools such as import, roster saving, policy settings and period approvals still target one physical branch. When several branches are selected, the attendance page offers its branch picker restricted to the selected set. This keeps files, employee mappings and payroll periods associated with the correct branch.

Supported pages use a single shared branch selector. The older overview-only sample-data dropdown and its separate Apply button have been removed to avoid competing branch controls. The static example overview dashboard has no branch selector and is not a new aggregated reporting implementation.

## Storage and rollout

Additive migration `1793145600000-AdminBranchAccess` creates `user_branch_access` with constrained mode/branch arrays and audit actor metadata. No row means legacy/default access. The migration is registered locally; no existing account was assigned broader access as part of implementation. Deploy this migration before starting the new API version in another environment. No employee/leave/attendance record migration or reset is required.

Sessions retain the existing single-branch field for compatibility and add selected branch IDs plus an all-authorized flag. All-authorized sessions resolve IDs live instead of placing the entire branch list in a browser cookie; oversized finite selections are rejected with guidance to use All authorized branches. Existing branch-change clients remain supported. The Next.js branch proxy validates and forwards both shapes, retains same-origin checks, forwards the rotated cookie, and does not expose an alternate way to create access grants.

## Verification

- Existing API suite and focused multi-branch tests cover denied foreign branches, multi-selection, legacy defaults, all-authorized resolution, future branches, removed grants, employee/staff denial, collection filtering and role boundaries.
- Rollback-only PostgreSQL fixtures verify stored settings, active-branch validation, audit entries, default restoration and unchanged home/manager assignments. Only temporary tables are written.
- Browser checks and final build/test results are recorded in the implementation plan. Browser requests use artificial accounts and intercepted API responses; no real user access grant or login was performed.

Final verification: API build passed; full API suite passed 412 tests with four opt-in tests skipped, and the isolated PostgreSQL settings test passed separately. Focused frontend proxy tests, TypeScript and lint passed. Actual AppShell/drawer fixtures passed all four widths, selected/all viewing after reload, Escape/focus restoration, selected/all access payloads and restricted-manager visibility. The full web suite has one existing unrelated DTR label expectation failure (No time out versus current Missing); 185 other tests passed.
