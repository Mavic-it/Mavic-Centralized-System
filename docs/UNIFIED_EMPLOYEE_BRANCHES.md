> Latest behavior (2026-11-10): the top-bar branch-view control is removed. Administrative access automatically uses the complete saved employee assignment on every request, including existing sessions. One/multiple/all branches need no self-selection or Apply step. Page-level branch filters affect results only. The legacy switch endpoint cannot narrow stored access; role and ownership restrictions remain. Earlier viewing-selection instructions below are historical.

# Shared employee branch assignment

The employee record is authoritative for linked accounts:

- `employees.branch_id`: primary branch for department, supervisor, attendance and transfer history.
- `employees.employment.workBranchIds`: finite work-branch selection.
- `employees.employment.allWorkBranches`: every current/future active branch.

HR employee editing and User Access ? Edit shared work branches both save through EmployeeService. Role editing reads primary branch from the selected employee. Changing role does not create another branch assignment. Employee/profile query caches refresh after either edit path. HR profiles show the actual work-branch names.

`employee_branch_access` is a read-only database view of this employee assignment, joined by `users.employee_id`. Authentication and all existing SQL grant readers use it. The old account grant table remains only as historical data and fallback for unlinked legacy accounts. Changing its rows cannot override a linked employee's assignment. Database triggers keep `users.branch_id` synchronized with the employee primary, including relinking, role changes and transfers. Super Admin has no required primary branch and keeps global access; IT keeps its existing global technical role. A multi-branch assignment does not grant employee/staff management actions or bypass module permissions and sensitive-field restrictions.

Only Super Admin may change a linked Branch Manager's work scope. Existing Super/IT administration is required for linked HR Admin scope changes. These checks run inside the employee update transaction as well as account controller checks. Ordinary HR edits to other employee fields remain available. Finite new selections must contain the primary branch and active authorized branch IDs. Every administrative session resolves the complete database scope live; removed branches are denied on the next request while remaining authorized branches continue to work. Account saves retain session revocation.

## Reconciliation and rollout

Migration `1795132800000-UnifiedEmployeeBranches` retains original employee and account assignments in `employee_branch_unification_backup`. For linked managers/HR it preserves the previously effective account scope, rather than unioning old grants and work metadata. This can replace conflicting employment metadata; its original value is backed up. It initializes missing work selections for other employees without overwriting existing selections. Legacy finite scopes excluding primary remain finite until explicitly corrected by an authorized administrator. The migration holds write locks while reconciling and installs primary synchronization triggers. No records are deleted.

Build the API, then run from `application/api`:

```powershell
node scripts/migrate-unified-employee-branches.mjs
node scripts/migrate-unified-employee-branches.mjs --apply
```

Apply before starting the updated API, since its queries require the view. Other environments need the same normal migration rollout. Reversion requires a reviewed forward migration using the backup and current audit history; automated down intentionally refuses to overwrite subsequent employee edits. HRIS Phase 1 remains active.

## Verification

Rollback-only PostgreSQL coverage checks reconciliation without access expansion, retained originals, editing in both directions, truthful account labels, actual sign-in/scope switching and invalidation after removal, future active branches, self-escalation rejection, legacy-grant isolation and primary synchronization. Existing branch auth/controller/service and Tasks/Reservations suites cover role and branch boundaries. Frontend tests cover filters, shared assignment display and record normalization. No authenticated browser verification is claimed.

Local rollout completed: final migration installed and no pending migration. Four original records retained. Read-only verification confirms the linked administrator has matching employee work branches, account scope and primary branch. Development auto-migrations installed an initial draft before explicit rollout; the final migration preserves that backup and is safe to rerun without reapplying legacy grants. Targeted checks pass; two older profile-navigation source assertions remain failing against unchanged modern navigation. No authenticated browser session was exercised.
