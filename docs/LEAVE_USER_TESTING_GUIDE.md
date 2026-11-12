# Leave Management and My Leave: user and testing guide

Reviewed against the current code and local database on October 26, 2026. This is a source/configuration review, not a claim that the signed-in tests below were executed. No employee records, credits, requests, policies or notifications were changed during this review.

## 1. Your current process

HR/Super Admin sets policy -> confirms employee eligibility where needed -> provides paid credits -> employee files in My Leave -> request becomes PENDING -> authorized reviewer approves OR rejects -> employee sees the result -> balances, history, attendance and reports reflect the decision.

There is **one final approval step**. There is no separate Manager then HR approval chain. An authorized manager, HR Admin or Super Admin can review within their permitted branch scope. A reviewer cannot decide their own employee request. The assigned approver guides notifications; it does not make that person the only authorized reviewer.

| Screen | Purpose | Who uses it |
| --- | --- | --- |
| My Leave (`/my-leave`) | Personal credits, unpaid activity, filing, request history and cancellation | Account linked to an employee; IT Admin excluded |
| Requests & Approvals (`/leave`) | Filter, open and decide employee requests | Super Admin, HR Admin, Branch Manager within scope |
| Leave Balances (`/leave/balances`) | View employee balances and ledger history | Authorized management; only Super Admin/HR Admin can adjust |
| Leave Settings (`/leave/settings`) | Policies, eligibility and annual allocation | Super Admin/authorized HR Admin |
| Reports & Analytics (`/leave/reports`) | Review totals, drill into types/statuses and export | Authorized management within scope |

## 2. What is configured locally now

These are current application settings, not a statement of statutory or company entitlements.

| Leave type | Paid? | Annual policy amount | Eligibility | Automatic allocation |
| --- | --- | --- | --- | --- |
| Vacation Leave | Yes | 10 days | Active employees, subject to employment/policy checks | Off |
| Sick Leave | Yes | 5 days | Active employees, subject to employment/policy checks | Off |
| Emergency Leave | Yes | 3 days | Active employees, subject to employment/policy checks | Off |
| Service Incentive Leave (SIL) | Yes | 5 days | Explicit HR assignment plus SIL verification | Off |
| Leave Without Pay | No | No credits required | Active employees, subject to employment/policy checks | Off |

All five are active. Current policies have optional attachments, half-day requests disabled, approved cancellation disabled, and insufficient paid credits blocked. They have no branch restriction, no employment-type restriction and zero minimum-service months; employment must still be active and have a valid start date covering the requested dates.

The server allocation scheduler is disabled and has no configured actor. There are currently no ALLOCATION ledger entries. Existing history includes two manual adjustment entries and one usage entry, plus one approved request. Do not treat existing employee balances as a fresh zero baseline.

There are two active employee accounts linked to employees, one linked Branch Manager, one unlinked Super Admin, and an IT Admin. No active HR Admin account was found. Use the existing Super Admin for configuration and a different linked employee account for filing. The unlinked Super Admin can manage leave but cannot file personal leave.

No verified SIL eligibility assignment was found. SIL requires both the eligible decision and the additional HR verification before filing is allowed.

**Key distinction:** annual policy days define an amount; eligibility gives permission; ledger credits give spendable days. Saving a policy or eligibility assignment does not grant credits.

## 3. Prepare your test

1. Prefer a test/staging copy. The steps below create real audit/credit/request records if performed in the live system and can send real notifications.
2. Use separate browser profiles: one signed in as Super Admin or an authorized reviewer; one as the employee. This avoids mixing sessions.
3. Pick an employee with an active linked account, correct branch, valid employment start date and a known working schedule.
4. Pick future working dates in the current year. Avoid existing pending/approved leave, holidays, clocked attendance and approved/locked DTR periods.
5. In Leave Balances, select the employee and year, choose **View balances**, and record that type's Available, pending reservations, usage, adjustments and restorations. Use **View history** to capture the starting ledger.
6. Use the same employee, type, year and filters throughout each test. Label test reasons clearly, for example `UAT-LEAVE-01`.

## 4. HR setup: policy and eligibility

### Check the policy

Open Leave Management -> Leave Settings -> edit the chosen type. Check Active policy, effective date, Paid leave, eligibility, annual days, allocation frequency, attachment policy and branch scope. For the first test, use an existing policy without changing it.

Policies are versioned. Existing requests retain the policy they were filed under. A later edit does not change their cancellation, payment or half-day rules retroactively.

### Understand Save assignment

Open **Assign eligibility**, choose the employee and type, enter a reason/reference, then save and confirm.

- **Employee is eligible checked:** records HR confirmation. Other employment/policy checks still apply.
- **Unchecked:** explicitly blocks this employee from that leave type, even when its general eligibility is Active employees.
- **Explicit employee assignments policy:** a positive assignment is necessary.
- **SIL:** positive eligibility AND the SIL verification checkbox are necessary.
- Active-employee types such as Emergency Leave do not require a separate positive assignment for every employee by default. Use assignments for explicit decisions/exceptions; an existing negative assignment still blocks access.

This action does not add leave days and does not approve any request.

## 5. Provide paid credits

### Recommended first test: targeted manual adjustment

As Super Admin, open Leave Balances -> correct year -> employee -> **View balances** -> chosen paid type -> **Adjust credits**.

Enter a nonzero amount (whole or half days), a required reason, and an optional reference. Review Before/After, then **Post adjustment** and confirm. A positive amount adds days; a negative amount deducts days. A deduction cannot make available credits negative or consume credits already reserved for requests.

Use an authorized amount only. For an isolated example, if the starting available balance is zero, add +3 days for the selected test employee/type. This creates an ADJUSTMENT entry, not an annual allocation. My Leave should show the same resulting available balance.

### Annual allocation: separate test

Current settings mean clicking Run allocation will skip all types because approved annual allocation is disabled for them. This is expected; it is not a broken balance calculation.

To test annual allocation in staging, approve an active paid Annual policy with nonzero annual days and **Enable approved annual allocation** checked, ensure the effective date and employee eligibility apply, then use Annual credit allocation -> Credit year -> Reason -> **Run allocation** and confirm.

Important: this run processes **all qualifying employees and enabled types in the administrator's scope**, not just the employee selected in an eligibility dialog. A year/type/employee grant is recorded once. Repeating the run must not duplicate it. Existing manual adjustments remain; do not grant a manual opening balance and then an annual entitlement unless both are intended. Allocation cannot run for a future year. There is no monthly accrual or carryover workflow in this slice.

The controlled Run allocation button works independently of the server scheduler. Scheduled runs need both server scheduler configuration and approved eligible policies; saving a policy alone does not start a server job.

## 6. Employee: submit the first request

1. Sign in as the linked employee and open My Leave.
2. Select the intended credit year and note the chosen type's available balance.
3. Click **Request Leave**.
4. Choose future start/end dates within one calendar year, then an eligible leave type.
5. Enter the reason and attach a PDF/PNG/JPEG if needed (up to 5 MB).
6. Review Available, Reserved / pending, Requested days and After approval. Days follow the employee schedule and configured holidays. A Monday-Friday fallback is disclosed if a schedule is missing; verify it matches the intended working days.
7. Click **Submit request**. Confirm the success message and a PENDING entry in Request history.
8. Open it and verify employee, branch, dates, chargeable days, type, reason, document and timeline.

For paid leave, submission reserves credits immediately. It does not yet create approved usage. For unpaid leave, no paid credits are reserved or deducted.

## 7. Reviewer: approve

1. Switch to the separate authorized reviewer session.
2. Open Requests & Approvals; select the employee/branch and PENDING status. Use matching date filters.
3. Open the request, verify its details and document, then **Approve** and confirm. Approval comment is optional.
4. Expect APPROVED immediately; no second HR approval is required.
5. Return to My Leave and Leave Balances. Refresh/reopen if necessary. The reservation should be removed and approved usage should appear in credit history.
6. Check the timeline, in-app notification and, if delivered, the branded email. SMTP acceptance does not guarantee inbox delivery. Email failure must not undo the approval.
7. Check the matching date in Attendance/DTR. Approved leave should be represented and saved DTR sources recalculated where applicable. This does not perform payroll valuation.

An approval against existing clocked full-day attendance should fail until attendance is reconciled. A conflicting approved/locked DTR period should block the change; reopen that period through the authorized attendance workflow before retrying.

## 8. Other main test paths

### Reject

File a new request on separate working dates. Reviewer opens it, enters a rejection reason, chooses Reject and confirms. Expect REJECTED, reason in history, reservation released and no new usage deduction.

### Cancel pending

Employee opens their own PENDING request in My Leave, enters a cancellation reason and clicks Cancel request. Expect CANCELLED and reserved paid credits released. Employees cannot cancel another employee's request.

### Cancel approved

With your current policies, the Cancel request action is unavailable for approved requests. That is expected.

To test restoration in staging, first enable **Allow future approved cancellation** on a policy, then file and approve a NEW request under that version on future dates. Before its start date, the employee can cancel with a reason. Expect a RESTORATION ledger entry and attendance updates. An existing request filed under the old policy remains governed by the old policy. Conflicting locked DTR periods still block cancellation.

### Unpaid leave

Use Leave Without Pay. Expect Credit-free/No deduction in the preview. Submit and approve it; paid balances must not change. My Leave tracks unpaid approved/pending days and requests separately. Approval does not calculate payroll deductions.

## 9. Example balance results

Example only: start with 3 paid days available and no other activity. Run each alternative from the stated point, not all as consecutive deductions.

| Step | Available | Pending reservation | New approved usage |
| --- | --- | --- | --- |
| Before filing | 3 | 0 | 0 |
| Submit a 1-day request | 2 | 1 | 0 |
| Approve that request | 2 | 0 | 1 |
| Instead, reject/cancel while pending | 3 | 0 | 0 |
| Cancel after approval, where policy/date/DTR allow | 3 | 0 | 1 usage + 1 restoration |

Approval must not deduct the same day twice: the reduction in availability already occurred when it was reserved. Available = allocations + signed adjustments - usage + restorations - pending paid reservations. The UI may show net used after restorations.

## 10. Validation and access checklist

| Test | Expected result |
| --- | --- |
| Paid request exceeds available credits | Preview/submission blocked under current policy |
| Same dates overlap a pending/approved request, even another type | Blocked; use distinct dates |
| Dates cross December/January | Split into two same-year requests |
| Range has no chargeable workdays | Blocked |
| Half-day on current policies | Option unavailable; enable only in a staging policy test, one working date |
| Required-document policy without an attachment | Submission blocked |
| Unsupported file or file over 5 MB | Rejected |
| Empty rejection/cancellation reason | Action blocked |
| Reviewer opens their own request | Cannot approve or reject it |
| Employee accesses another employee's request/document | Denied |
| Manager accesses unrelated branch records | Denied |
| Manager changes policies/credits | Denied |
| IT Admin accesses leave personnel pages/API | Denied |
| Unlinked Super Admin opens My Leave | Linking guidance; management access remains available |
| Repeat same annual allocation | No duplicate annual grant |
| Repeat same completed decision | No duplicate usage/notification; contradictory final decision blocked |
| Refresh after success | Same status/balance/history persists |

## 11. Reports and final reconciliation

Open Reports & Analytics, use the same year/employee/branch/type, and inspect status counts and leave-type totals. Try chart drilldown and CSV/XLSX export. Zero-activity, inactive or future-policy types can still appear in the authorized report; visibility in a report does not mean an employee can currently file that type.

Request date/status filters apply to request records. Paid balance totals cover the selected full credit year and include live reservations; they are not recalculated as a monthly entitlement. Unpaid activity follows the request filters. Compare the same scope in My Leave, Leave Balances, request history and exported reports.

Record each test's request reference, role, dates, expected/actual result and screenshot. Do not delete ledger rows to clean up tests. Use approved cancellation where allowed or documented compensating adjustments for unused test credits. A credit adjustment alone does not cancel approved leave or remove attendance effects. Avoid running lifecycle tests on real employees unless those business actions are intended.

## 12. If something looks wrong

- **No eligible types:** check linked employee, active employment, start date, policy effective date, branch/employment restrictions, negative eligibility assignments and SIL verification.
- **Policy says 10 days but employee has 0:** policy amount is not a posted grant. Check ledger/year; use an authorized adjustment or approved annual allocation.
- **Run allocation adds nothing:** current automatic-allocation flags are off; otherwise check paid/Annual/nonzero days, effective date, eligibility and whether a grant already exists.
- **No approval buttons:** request must be PENDING; reviewer must be an authorized different person with branch access.
- **Approved request has no cancel button:** current policy disables it, request uses an older policy, or its start date is no longer in the future.
- **Request missing from list:** check selected year/date/status/employee/branch, pagination and whether you are in My Leave versus management.
- **Expected email missing:** check in-app history first. Email runs after commit and has no durable retry queue; missing mail alone does not mean filing/approval failed.

Sources reviewed: the leave controller/service/policy/DTOs, current frontend settings/form/drawer/balances/overview/reports, the leave operations handover, and read-only local configuration/ledger aggregates. Shared production deployment state and signed-in browser behavior were not independently verified in this review.

## Filing-date update: October 26, 2026

The current filing rule is one calendar day's advance notice for Vacation Leave, SIL and Leave Without Pay; Sick Leave and Emergency Leave allow same-day filing. Past dates are blocked. My Leave now shows server Philippine time and the chosen type's rule. Choose the type first; dates default to its earliest permitted date as a single-day request, and can be extended. HR can change Minimum advance notice (calendar days) through Leave Settings. Existing requests retain their policy snapshots. See [filing rules and verification](LEAVE_FILING_RULES.md). This supersedes the previous generic future-date defaults; the other test/credit/approval steps above still apply.

## Management and settings update: October 26, 2026

Authorized Super Admin, HR Admin and Branch Manager can now approve their own linked request within branch scope using Approve my request and explicit confirmation. History labels self approved and saves actor name, role and full PHT timestamp. Employees/staff and IT cannot approve. Current known policies enable half-days and future approved cancellation for NEW requests; paid annual policies also enable allocation eligibility. Existing requests retain their saved policy, and grants/server scheduling remain separate actions. This supersedes the older no-self-approval and disabled-setting statements above. See [approval contract and rollout](LEAVE_APPROVAL_HISTORY.md).
