# Leave Management UI modernization

Scope: `/leave` requests/review, credits, policies/SIL and read-only payroll inputs. My Leave remains a separate presentation scope. Main HRIS Phase 1 stays active; no payroll valuation, API/schema, policy, credit or approval-rule changes.

## Audit and component tree

PeopleWorkspace owns the route shell. LeaveManagementWorkspace owns role flags, queries, tabs, filters, pagination, draft forms, validation and mutations. Existing management controls/details are smaller than the updated modules; loading is mostly text; some query errors lack retry; wide tables need named keyboard scroll regions. Preserve those state and business owners.

Opt leave mode into the shared semantic theme with a leaveManagementWorkspace modifier. Add LeaveManagementSummary (typed authorized request statistics), LeaveTableLoading (column-count geometry) and LeaveManagementLoading (summary/navigation/filter/six-column request layout). Reuse them for route/query loading. Existing form/event/query contracts stay in LeaveManagementWorkspace; styling applies to its request review, credit, policy, SIL and payroll children only under the management route class.

## Contracts and states

Summary uses authorized request data, never inferred global totals. Requests, balances, ledger, policies, SIL and payroll queries retain keys, parameters and current role gates. Show loading placeholders and recovery actions for failed queries. Empty/no-match and invalid payroll dates stay distinct. Branch Managers retain manager-stage review; HR retains HR-stage review; Super Admin retains both. Policy/SIL/payroll tabs and credit posting retain current role conditions. Rejection reasons, SIL tenure attestation/notes/exceptions, credit forms, disabled/busy guards and audit handlers stay unchanged. My Leave own-request edit/cancel remains unchanged.

## Visual/accessibility and files

Header context, three request summary cards, full-width section buttons, grouped filter bar and readable tables. Forms use consistent inset groups, 42px controls, 12px labels/14px values, semantic status colors and neutral 12px cards. Keep destructive/review actions distinct. Name scroll regions by contents and expose keyboard focus; retain native inputs/labels/details and visible validation. Stack filters/forms at 360/768/1024/1440px and honor reduced motion.

Modify management conditions in people-workspace.tsx, append route-scoped CSS, update page-loading.tsx, and improve management presentation branches in leave-management-workspace.tsx. Add leave-management-presentation.tsx and focused render tests. Use existing local bundling tools for an isolated interactive React fixture with artificial query data and disabled network requests; verify tab changes, filters, review/form visibility, role gates and responsive layouts. No production test-only props or new runtime dependencies. Run baseline/full tests, changed-file lint and production build/TypeScript. Update UI tracker and maintained HRIS inventory; report authenticated mutation limitations explicitly.

## Verification results

- Baseline: 123 tests passed. Final full web suite: **130 tests across 37 files passed**. The focused management/My Leave run passed 19 cases. New cases cover authorized summaries, Super Admin/HR/Branch Manager stage and tab visibility, structural skeletons, query recovery and read-only payroll/range validation.
- Changed-file lint passed without warnings. Production build passed, including TypeScript and route generation; the existing Google font was available through network-enabled build execution.
- Used the installed Bun bundler to mount real workspace/query/role components in an ignored local fixture, with artificial query data, mocked navigation and API fetch disabled. No production fixture route, test-only props or runtime dependency was added.
- Headless Chrome passed 28 layout cases: requests, inline review, credits, credit form, policy form, SIL review and payroll at 360/768/1024/1440px. No document overflow or out-of-bounds form controls; desktop/mobile screenshots were inspected and the focused table region showed a visible outline. Policy fields stack on mobile; review form width is constrained separately from its wide table.
- Interactive checks passed for status filtering, mandatory rejection reason, SIL-only disabled commutation leave type, policy editing, required SIL tenure/notes and required exception reason. HR and Branch Manager scenarios confirmed stage-specific actions, restricted tabs and credit-post visibility. Super Admin exercised all four sections.
- Generated utility styling/application shell and real authentication are not fully represented by this local fixture. Actual approvals/rejections, credit posting, policy/SIL saves, server branch enforcement, audit persistence and live payroll-input queries were not exercised end-to-end. Existing handlers/payloads/server rules were preserved; no live records changed.
