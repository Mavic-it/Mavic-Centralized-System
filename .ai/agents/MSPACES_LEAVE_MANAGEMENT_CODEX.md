# MSPACES HRIS — Simple Leave Management Implementation Prompt for Codex

> **How to use:** Save this file in your project (for example, `docs/MSPACES_LEAVE_MANAGEMENT_CODEX.md`). Open your Mspaces repository in VS Code and ask Codex: **“Read `docs/MSPACES_LEAVE_MANAGEMENT_CODEX.md`, inspect the existing codebase, and implement the leave module incrementally according to this guide. Preserve existing functionality.”**

## 1. Mission

Implement a **simple, centralized, branch-aware Leave Management module** in the existing Mspaces HRIS.

Employees must be able to see leave credits, request leave, and follow request status. Authorized managers and HR users must be able to approve or reject leave, view and adjust balances, configure leave types, and review simple dashboards/reports.

**Important:** This is an enhancement to the **existing** application, **not a new project**. Inspect and reuse current authentication, authorization, employee profiles, branch relationships, navigation, API patterns, ORM/migrations, components, styling, and notifications. Do not introduce a duplicate auth system, duplicate employee table, or unrelated architecture.

### Existing technology context

- Frontend: **Next.js**, using the current application's routing conventions.
- Backend: **NestJS REST API**.
- Database: **PostgreSQL**, using the ORM/migration system already in the repository.
- UI: reuse existing **shadcn/ui** components where present; preserve established app design tokens and patterns.
- Scope: multiple branches, including **Makati** and **Ortigas**; support future branches dynamically.

Before changing files, briefly report what already exists, what will be reused, and any unavoidable assumptions. Then implement rather than stopping at planning.

## 2. Keep navigation minimal

### Employee portal

**My Leave** — one page with:
- Cards showing available, used, pending/reserved, and allocated days per eligible leave type.
- **Request Leave** button opening a dialog/sheet or simple form.
- Request history table with status, requested dates, number of days, leave type, and action to view details/cancel if allowed.

### Admin/HR/Manager portal

**Leave Management** with exactly four primary navigation items:
1. **Requests & Approvals** — request queue, filtering, details, decisions.
2. **Leave Balances** — employee-by-employee credits, history, authorized adjustments.
3. **Leave Settings** — leave type definitions and annual credit policies.
4. **Reports & Analytics** — aggregate counts, graphs, breakdowns, export.

Respect role permissions: a Branch Manager may not have access to every admin page. Do not render navigation entries to roles that lack access. Do not add separate top-level pages for each small action if a dialog, sheet, or tabs suffice.

## 3. Roles and scope

Reuse the **actual role enum, permissions, and branch ownership** in the repository. Map the following conceptual roles to existing ones:

| Role | Scope and capabilities |
|---|---|
| `SUPER_ADMIN` | Across all branches: manage settings, balances, requests, and reports. |
| `HR_ADMIN` | HR-authorized branch(es) or organization-wide scope as currently configured: view requests/balances, approve/reject when authorized, adjust credits, view reports, manage settings only when permission explicitly allows. |
| `BRANCH_MANAGER` | Assigned branch only: view relevant team balances and requests, approve/reject team requests, view branch reports when permitted; cannot edit global policy or grant credits unless explicitly authorized. |
| `STAFF` / `EMPLOYEE` | Own profile only: view own balance/history, file a leave request, cancel qualifying requests. |
| `IT_ADMIN` | No leave personnel data or approval/credit permissions by default; only existing technical administration permissions. |

- **Enforce all permissions on NestJS endpoints and database queries**, not just by hiding buttons.
- Avoid self-approval. An HR employee or manager requesting their own leave must be routed to a different authorized approver.
- Use existing account ↔ employee profile linking. An unlinked employee account must see a clear message, not another employee's data.
- A `SUPER_ADMIN` without a linked employee profile can administer leave but cannot file personal leave or receive credits until properly linked, consistent with existing system conventions.
- Keep audit trails with actor, employee, branch, timestamps, and action.

## 4. Leave types and example defaults

Store leave types and credit rules in database tables/configuration, **not hardcoded frontend constants**.

| Type | Code | Initial demonstration policy | Paid? |
|---|---|---:|---|
| Vacation Leave | `VL` | 10 days/year | Yes |
| Sick Leave | `SL` | 5 days/year | Yes |
| Service Incentive Leave | `SIL` | 5 days/year **for eligible employees** | Yes |
| Emergency Leave | `EL` | 3 days/year | Configurable |
| Leave Without Pay | `LWOP` | No credit requirement | No |

**Compliance note:** These are *example defaults for configuration*, not a statement that each employee is legally entitled to all five categories simultaneously. Philippine SIL has eligibility and equivalence considerations. Do not automatically stack SIL on top of equivalent VL/SL benefits or auto-grant statutory leave to ineligible staff. HR should approve policy setup before activation. If existing company settings differ, retain them. Additional statutory leave categories (e.g., maternity, paternity, solo-parent leave) should be supported later through extensible policies, not misclassified as the sample annual pool.

### Each leave type must support

- Display name, unique code, description, active/inactive status.
- Default annual credit days (can be zero), paid/unpaid flag.
- Allocation frequency for v1: **annual** or **none/manual**.
- Eligibility policy/employee assignment (reuse applicable employment attributes; do not infer statutory eligibility blindly).
- Whether half days are allowed.
- Attachment requirement: optional/required/none, as configurable.
- Carryover: `none` in v1 (model future policies without implementing complex carryover now).
- Effective date; no retroactive changes to approved transactions without an explicit adjustment.
- Whether insufficient balance blocks paid requests (default **yes**).

## 5. Employee request workflow

```text
Employee logs in
    ↓
My Leave: show current balances + history
    ↓
Request Leave
    ↓
Choose type, start date, end date, optional half-day, reason, attachment
    ↓
Validate employment, policy, eligible working days, overlap, balance
    ↓
Submit → PENDING
    ↓
Notify assigned authorized approver
    ↓
Approver reviews
    ├── APPROVED → consume reserved credit → update balance → notify employee
    └── REJECTED → release reserved credit → notify employee, show reason
```

### Request form

- Leave type dropdown containing only active, eligible leave types.
- Start date and end date/date range.
- Half-day selection only if policy permits (for v1, one-day half-day is sufficient).
- Employee reason; attachment where needed. Follow existing safe upload and storage patterns.
- Calculated **chargeable leave days**, taking the employee's assigned schedule, weekends, and configured holidays/nonworking days into account. **If scheduling/holiday data does not yet exist, use an explicit and documented fallback** (e.g., Mon–Fri; show count before submission) rather than silently treating every calendar day as a working day.
- Display `Available`, `Reserved/Pending`, `Requested days`, and `Balance after approval` before submission.
- Ensure pending requests cannot reserve the same dates or more days than available.
- Unpaid leave has no credit deduction; route to normal approval.

### Statuses

- `PENDING` — submitted and waiting for an authorized decision.
- `APPROVED` — decision recorded; paid credits consumed exactly once.
- `REJECTED` — decision recorded; pending reservation released.
- `CANCELLED` — valid cancellation recorded; pending reservation released or approved credit restored exactly once when policy allows.

Include submitted date, decision date, actor, decision comment, cancellation date/reason as applicable. Avoid ambiguous `IN_PROGRESS` statuses for a single-step process.

## 6. Approval workflow

- **One approval step** in v1. Route to the assigned Branch Manager when appropriate; otherwise to authorized HR/Super Admin, following your existing hierarchy.
- Requests queue with filters: branch, employee, status, leave type, date range.
- Review dialog showing employee, branch, leave type, requested dates/days, reason, attachments, current available and pending balance, conflicting requests, and request history when authorized.
- **Approve** and **Reject** actions. Require a reason/comment for rejection; approval comment optional.
- Only one final decision is possible. Handle concurrent double-clicks/retries with transactions, row locking or concurrency protection, and idempotent state transitions.
- Never allow the employee to approve their own request; hide actions and reject such API calls.
- On decision, notify employee using the existing notification mechanism. If email is supported, reuse existing mail integration; do not block a successful database decision if sending notification fails—queue/retry or log it.

## 7. Credit allocation and adjustments

### Automatic initial/annual allocation

- For eligible employees, grant approved annual credits according to the policy's effective date and credit year.
- On onboarding, grant credits only if eligibility and policy rules are satisfied; do not blindly duplicate annual credits.
- Add a unique logical key for `employee + leave type + policy year + allocation rule/version` to prevent duplicate credit grants from retries or scheduled jobs.
- Run allocation as a scheduled/controlled background job using **existing server-side scheduler**, with an admin-triggerable safe backfill if needed.
- Do **not** overwrite employee-specific adjustments on annual allocation.

### Leave Balances page

Search/filter by branch, employee, leave type, and leave year. Show:

| Employee | Branch | Leave type | Allocated | Adjustments | Used | Reserved | Available |
|---|---|---|---:|---:|---:|---:|---:|
| Maria Santos *(sample)* | Makati | Vacation | 10 | +3 | 5 | 2 | 6 |

**Formula:** `Available = Allocated + Adjustments − Used − Reserved` (plus any correctly modelled expirations/restorations). Show the same values consistently in the employee and admin views. Count only valid and current-year transactions under the applicable credit period.

### Manual adjustment

Authorized HR/Super Admin can select an employee, leave type, and year; enter positive or negative days, a mandatory reason, and optional reference. Show before/after balance and ask for confirmation. Reject invalid amounts and unauthorized negative balances. Record adjustment ledger entry—**never edit historical allocation/usage rows directly**.

Example: employee has `0` available Vacation Leave; HR grants `+3` days, producing `3` available before any reservations.

Keep a readable transaction/history tab for: annual credit, manual addition, manual deduction, approved usage, cancellation restoration, expiration (future).

## 8. Simple settings UX

Use a single **Leave Settings** page with searchable type table and **Add Leave Type / Edit** dialogs.

Fields:

- Name, code, description.
- Default annual days; allocation frequency: annual/manual/none.
- Paid, half-day allowed, attachment policy, eligibility scope.
- Carryover (v1 none), credit year/effective date, active flag.

Validate unique code, non-negative numeric credits, sensible bounds, and changes to policies already used by employees. Archive/deactivate a used leave type rather than destructive deletion. A changed policy should affect only new grants/periods unless HR explicitly executes an auditable correction.

## 9. Reports & Analytics

Provide a simple report page with branch (Makati/Ortigas/All according to permissions), year/date range, employee, leave type, and status filters.

### KPI cards

- Pending requests
- Approved requests
- Rejected requests
- Used paid leave days
- Available leave days (all employees in filtered scope)

### Charts

1. **Requests by status** — simple donut/pie or bar chart.
2. **Leave credits by type** — grouped or stacked bar: `Used` vs `Remaining` (optionally `Reserved`).
3. Optional small monthly requests trend only if existing chart support makes it inexpensive.

Click chart/category or table row to inspect underlying filtered records. No fake or hardcoded production metrics; show meaningful empty states when there is no data. Use existing charting package where possible.

### Export

Export the *currently filtered, permission-scoped* report to **CSV**, and **XLSX** only if a maintained spreadsheet library is already present or can be introduced with justification. Never export another branch's private records to a branch-limited manager. Export must match the displayed aggregation rules.

## 10. PostgreSQL data model (adapt to existing ORM)

Reuse existing `users`, `employees`, `branches`, and any existing leave tables. Extend and migrate safely rather than creating duplicates. Suggested concepts (names are illustrative):

| Entity | Main fields / purpose |
|---|---|
| `leave_types` | id, code, name, description, paid, active, annual_default_days, annual/manual allocation, allow_half_day, attachment_rule, effective dates, eligibility settings, timestamps. |
| `leave_policies` *(optional if existing config supports this)* | Config version, effective date, credit year boundary, scope/eligibility; keep v1 simple. |
| `leave_requests` | id, employee_id, branch_id snapshot, leave_type_id, start_date, end_date, chargeable_days, is_half_day, reason, attachment metadata, status, approver_id, decided_at, decision_comment, cancelled_at, timestamps. |
| `leave_credit_transactions` | id, employee_id, leave_type_id, credit_year, transaction_type, signed_days, source_request_id/unique source key, reason, actor_id, created_at. Immutable credit ledger. |
| `leave_request_events` or existing audit trail | request id, actor, from/to status, reason, timestamp. |

### Integrity rules

- Use `NUMERIC` or fixed decimal for days (support 0.5), **not floats**.
- Add indexes for employee/year/type, branch/status/date, and request history.
- Use foreign keys and avoid cascading deletion of historical leave data.
- Enforce unique source references for annual allocations, approvals, and restorations so retries never double-credit/double-debit.
- Prevent overlap and overspend server-side under concurrency. Balance calculations and state changes must be **atomic PostgreSQL transactions**.
- Do not trust employee_id, branch_id, approver permissions, or calculated chargeable days supplied by the browser; derive and validate on server.
- If you retain a cached balance total for performance, derive updates solely from the ledger in transactions and include a reconciliation job/check.

## 11. NestJS REST API (adapt naming to existing conventions)

Use existing controllers, guards, DTO validation, error handling, pagination, and Swagger patterns where available.

### Employee endpoints

```http
GET    /leave/me/balances?year=2026
GET    /leave/me/requests?status=PENDING&page=1
POST   /leave/me/requests
GET    /leave/me/requests/:id
POST   /leave/me/requests/:id/cancel
```

### Authorized admin/manager endpoints

```http
GET    /leave/requests?branchId=&status=&leaveTypeId=&page=
GET    /leave/requests/:id
POST   /leave/requests/:id/approve
POST   /leave/requests/:id/reject
GET    /leave/balances?branchId=&employeeId=&year=
GET    /leave/balances/:employeeId/transactions?year=
POST   /leave/balances/:employeeId/adjustments
GET    /leave/types
POST   /leave/types
PATCH  /leave/types/:id
GET    /leave/reports/overview?branchId=&year=
GET    /leave/reports/export?branchId=&year=&format=csv
```

Endpoint names are suggestions, not a mandate; use the repository's route conventions, DTOs, and authorization semantics. Validate every input. For report exports, stream or paginate safely for large datasets.

## 12. UI/UX standards

- Consistent **shadcn/ui** cards, buttons, tables, inputs, dialogs, select, tabs, date pickers, toast, badges, skeletons, pagination, and empty states where installed.
- Mobile-friendly; don't overcrowd employee dashboard or admin tables.
- Use a small status color system: Pending (warning), Approved (success), Rejected (danger), Cancelled (neutral), but **never color alone** to indicate status.
- Loading and error UI for every async operation. Where current Next.js architecture uses `loading.tsx` or `loading.js`, add skeletons that closely match the actual page layout.
- Disable submit buttons while processing; prevent accidental duplicate actions and show success/failure feedback.
- Confirm irreversible actions. Include accessible labels, keyboard operation, readable validation, and date formatting appropriate to your app's timezone (Philippines; avoid date shifting).
- Use existing standard layouts, breadcrumbs, search/filter controls, and responsive patterns.
- Do not expose personally sensitive leave reasons in high-level dashboards, notifications to unintended recipients, or aggregate reports.

## 13. DTR and payroll integration — minimal v1 hook

- Mark **APPROVED** requests as approved leave on the applicable dates in attendance/DTR summaries.
- Do not mark valid approved leave as an unexcused absence.
- Preserve paid vs unpaid information for future payroll integration.
- Avoid double-counting when attendance files are re-imported or reports are recalculated.
- Keep payroll deductions and full payroll integration **out of scope for v1** unless clearly already integrated.

## 14. Implementation order (work incrementally)

1. **Audit the current codebase**: existing leave features, schemas, RBAC, branches, employee linkages, notification service, charts, imports, and frontend navigation. List what will be reused.
2. **Design safe migrations**: preserve all existing leave data and status values; add data migration/backfill only as justified.
3. **Build backend core**: leave types/policies, transaction ledger, balances, chargeable-day validation, requests, and approval/cancellation transitions.
4. **Apply permissions and concurrency protection** to every endpoint and state-changing operation.
5. **Build Employee > My Leave** including request dialog, balances, and history.
6. **Build admin pages**: Requests & Approvals; Leave Balances + Adjust Credits; Leave Settings.
7. **Build Reports & Analytics** with live aggregate queries, graphs, branch filters, and exports.
8. **Integrate notifications** and minimal approved-leave DTR status mapping.
9. **Add tests** and run the project’s existing build/lint/typecheck/migrations/test commands.
10. **Summarize completed work**: changed files, schema migrations, config/seed steps, API endpoints, screens, tests passed, unresolved issues.

Do not delete or rewrite unrelated pages. If there is already a leave module, **refactor and extend it instead of shipping a parallel system**.

## 15. Must-pass acceptance tests

- [ ] An employee sees **only their own** leave balance and request history.
- [ ] Branch Manager cannot access employees or reports from other branches, even by changing URL/API query parameters.
- [ ] HR/Super Admin can view permitted branch records; IT Admin cannot approve leave by default.
- [ ] Ineligible or inactive leave types are not requestable.
- [ ] New employee credits are granted only according to approved policy/eligibility.
- [ ] Annual allocation job is idempotent and does not double-credit on retries.
- [ ] Correct chargeable working/half days are shown and validated on backend.
- [ ] Two pending requests cannot reserve more days than available or overlap.
- [ ] An approved request decreases available credit **exactly once**.
- [ ] Rejection releases reservation without deducting used credit.
- [ ] An authorized cancellation restores/release credits exactly once as appropriate.
- [ ] Employee cannot self-approve, and managers cannot approve outside authorized scope.
- [ ] Concurrent approval/rejection attempts cannot produce two decisions or corrupt the balance.
- [ ] HR can add +3 credits with a reason; ledger and available balance reflect adjustment.
- [ ] Existing policy amendments never retroactively alter past approved balances silently.
- [ ] Dashboard cards, charts, and exports show **real, consistently calculated** filtered records.
- [ ] Approved leave dates appear correctly in DTR without double-counting absences.
- [ ] Loading skeletons, empty states, validation, accessibility, and responsive layout work.
- [ ] Existing employee management, authentication, other HRIS modules, and migrations still work.

## 16. Keep out of scope for the first release

- Multi-level approval chains, delegate approvals, complicated accrual schedules, automatic carryover/expiration schemes, advanced holiday calendars not present in current app, payroll calculation, statutory leave entitlement engines, and AI approvals.
- Avoid adding unnecessary settings panels or many extra routes.

## 17. Final Codex instruction

**Implement working changes in this repository, not merely a design document.** Start by inspecting the existing code structure, then follow the implementation order. Favor the simplest secure solution compatible with this project's standards. Use real PostgreSQL-backed data, not hardcoded arrays in production components. Preserve current routes and data. Explain any decisions that materially affect existing workflows.
