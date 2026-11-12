# My Leave UI modernization

Scope: `/my-leave` only. The shared LeaveManagementWorkspace retains management behavior/styles. Main HRIS Phase 1 stays active; no leave policy, approval, credit, API or schema changes.

## Audit and component tree

PeopleWorkspace owns the route shell. LeaveManagementWorkspace owns own-employee verification, queries, policy/credit rules, request filters, pagination, form/edit/cancel state and mutations. Current My Leave uses small controls, text-only loading and summary cards that emphasize available days but omit used/pending context. Shared table/form styles also serve the management view.

Opt only my-leave into the existing modern workspace theme and a myLeaveWorkspace modifier. Extract typed MyLeaveBalanceSummary and MyLeaveRequestForm presentation components; the parent continues supplying authorized balances, available types, draft values, submit/close handlers, busy flags and availability messages. Share MyLeaveLoading between route/query loading, and a five-column request skeleton for request fetches. Keep query keys, policy validation, form payload creation, mutations and confirmation states where they are.

## State and contracts

Independent Super Admins retain their My Profile redirect. Linked users/admins retain own-employee requests, balances and history. Summaries receive only current employee balances, retain the existing excluded emergency summary, and display server-provided available/used/reserved values. Loading never implies zero credits. Error/retry, no posted balances, no requests and filtered-empty remain distinct states. Personal request forms preserve required type/date/reason fields, allowed leave types, date limits, busy guards and validation; pending own requests retain edit/cancel and confirmation, while approved/other-employee requests retain their existing action restrictions. Management approvals, policy/SIL/payroll screens remain outside this pass.

## Visual/accessibility and file plan

Header context, readable balance cards, Requests/Balances & history navigation, status filter and File leave action, grouped form, expandable request/approval details, and contained history tables. Shared semantic tokens, 12px cards, 42px controls, readable labels/values, visible focus, status feedback and reduced motion. Native labels/buttons/details, form busy/error semantics and named keyboard table regions. Stack controls/grids and contain table scrolling at 360/768/1024/1440px.

Modify only relevant route conditions/styles in people-workspace.tsx/module.css, my-view branches in leave-management-workspace.tsx, and the my-leave loading variant. Add my-leave-presentation.tsx with focused rendered tests/fixtures. Verify existing/full web tests, role/action restrictions, loading/error/empty, form contracts, changed-file lint, TypeScript/production build and browser layouts. Record authenticated workflow gaps explicitly. Update UI tracker and maintained HRIS plan; Leave Management remains pending.

## Verification scope

Final checks passed: **123 web tests across 36 files**, changed-file ESLint without warnings, and the production build including TypeScript and all route generation. Headless Chrome checked requests/form/loading/error fixtures at 360/768/1024/1440px (16 cases): no document overflow or out-of-bounds form controls. Final mobile/desktop screenshots were inspected; keyboard focus had a visible 3px outline.

Baseline: 111 web tests passed. Full suite: **123 tests across 36 files passed**, including 12 new My Leave cases. Tests cover six linked roles, pending own-request actions, approved/other-request restrictions, read-only management boundaries in My Leave, authorized balance summary values, form field/policy/busy contracts, structural loading, independent admin routing presentation and recoverable errors.

Browser fixtures use real My Leave content and the extracted form with artificial records/query data and mocked navigation. Four fixture states (requests, form, loading, error) are reviewed at 360/768/1024/1440px. Native date fields now stack on mobile. Fixtures do not fully represent generated utility styling, authenticated tab transitions, form submission/edit/cancel mutations, actual redirects, credit history interactions or server authorization. Existing handlers/query keys/payloads remain in place; no live records changed.

The production build caught an import before the client directive; the directive was restored to the first statement before the final build. A separate payroll table outside the shared workspace retains its original scope; no management or payroll business logic changed. Main HRIS Phase 1 remains active.
# Request list and drawer continuation

Reuse the management request badges, date formatting, pagination, responsive table/card styling and details drawer. A focused MyLeaveRequestList accepts own requests, an open callback and an action renderer. It displays leave type, readable dates, duration, status and View/Edit/Cancel actions without database IDs or inline details. The parent retains employee-scoped queries, current filters, selected request ID, pending edit/cancel eligibility and existing mutation payloads. The shared drawer receives own-employee metadata and footer actions, with review permission disabled. Editing closes the drawer and opens the existing request form; cancellation retains its confirmation and busy guard. Page sizes are 10/25/50. Loading matches five desktop columns and mobile cards. Native dialog keyboard handling, missing metadata, loading/error/empty states and existing independent-admin routing remain intact. Verify role/status eligibility, compact content, drawer workflow, responsive layouts, keyboard use, lint, tests and production build. No API/schema or HRIS phase changes.


Request-list validation: 142 web tests across 38 files passed, including additional compact-list and terminal/foreign-request eligibility checks. Sixteen interactive artificial-fixture layouts at four viewport widths passed, along with drawer edit/cancel confirmation, page-size, keyboard and self-service role checks. Screenshots were inspected; no live mutations were submitted.

My Leave request-list changed-file ESLint passed without warnings.

My Leave request-list production Next.js build and TypeScript verification passed.
