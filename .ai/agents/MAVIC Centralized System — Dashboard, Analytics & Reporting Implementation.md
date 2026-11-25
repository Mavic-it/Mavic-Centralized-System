# MAVIC Centralized System — Dashboard, Analytics & Reporting Implementation

## ROLE

Act as a Senior Full-Stack Engineer, System Architect, Database Engineer, UI/UX Designer, and Data Analytics Developer.

You are working on my existing **MAVIC Centralized System**, which uses:

- Frontend: Next.js, React, TypeScript
- Backend: NestJS REST API
- Database: PostgreSQL
- Architecture: Multi-module, multi-branch management system
- Authentication: Existing authentication, roles, permissions, and branch-access controls

My existing application includes an Operations Overview, an HR Dashboard, and a Reports module that may currently be incomplete.

I want you to **audit, improve, refactor, and implement a fully functional, dynamic Dashboard and Reporting system** using my existing application architecture.

Do not build a separate application or replace the existing system.

Preserve existing working features, authentication flows, permissions, shared layouts, and design conventions.

---

# PHASE 1 — COMPLETE SYSTEM ANALYSIS

Before making changes, inspect the entire relevant codebase.

### 1. Analyze the frontend

Identify and inspect:

- Operations Overview page
- HR Dashboard page
- Reports navigation and pages
- Sidebar navigation and layouts
- Shared UI components
- Dashboard cards and existing statistics
- Existing tables and pagination
- Filtering and search components
- Branch selectors
- Existing charts and visualizations
- Loading states and skeleton components
- API fetching patterns and shared hooks
- Authentication and authorization logic
- Responsive styling and design tokens
- Dark and light theme support, if implemented

Find duplicated components, unnecessary code, hardcoded dashboard values, inconsistent UI elements, and components that should be reusable.

### 2. Analyze the backend

Inspect NestJS modules, controllers, services, repositories, DTOs, guards, and permissions.

Identify data sources from all existing business modules, including where implemented:

1. Employee Management
2. Attendance / DTR
3. Leave Management
4. Reservations and bookings
5. Inventory and stock management
6. Assets and equipment
7. Tasks
8. Incidents and disciplinary actions
9. Inquiries / customers
10. User Management
11. Branch Management
12. Other existing business modules

Determine:

- Which statistics can be calculated from existing records?
- Which data relationships can be reused?
- Which reporting queries already exist?
- Which statistics require new aggregation endpoints?
- Which modules are not yet implemented or lack usable data?
- Which queries require optimization?
- Which information is authorized for each role?

**Do not assume that a module, database table, column, or business status exists. Verify it in the repository.**

### 3. Analyze the database

Inspect PostgreSQL schemas, migrations, indexes, and relationships.

Identify how records connect to:

- Branches
- Employees
- Users
- Reservations
- Attendance
- Leave requests
- Inventory
- Tasks
- Incidents

Recommend necessary improvements to support accurate analytics.

Avoid duplicate tables or unnecessary schema changes.

### 4. Produce an implementation audit

Document findings in:

`docs/dashboard-reporting-audit.md`

Include:

- Existing functionality
- Available data sources
- Missing functionality
- Hardcoded/mock statistics
- Component refactoring opportunities
- Dashboard/reporting data recommendations
- Missing or inefficient queries
- Security and branch-access concerns
- Required frontend/backend changes
- Implementation priority

After identifying the changes, proceed with implementation using the verified repository structure.

---

# PHASE 2 — UNIFIED DASHBOARD ARCHITECTURE

Create a consistent reporting architecture supporting:

**Operations Overview → HR Dashboard → Reports & Analytics**

These three modules must use consistent data definitions, branch permissions, date filters, formatting, and design components.

## Dashboard flow

User logs in
↓
Existing authentication validates session
↓
System retrieves authenticated user and permissions
↓
Backend determines authorized branch scope
↓
Dashboard initializes authorized branch selection
↓
Frontend requests authorized aggregated data
↓
Backend validates permissions and branch filters
↓
PostgreSQL calculates real statistics
↓
Frontend displays content-matched skeletons while loading
↓
Dashboard displays KPI cards, charts, and actionable information
↓
User changes branch or date range
↓
Affected data automatically refreshes
↓
User can navigate to permitted detailed records or reports

Use the existing API and frontend patterns where possible.

---

# PHASE 3 — OPERATIONS OVERVIEW

Improve the current Overview page into a functional operational dashboard.

The Overview should provide a useful summary of business operations across authorized branches.

## Section A — KPI summary cards

Recommended statistics:

**1. Employees**
- Total employees in scope
- Active employees
- Inactive employees, when supported
- Comparison with previous equivalent period, where meaningful

**2. Reservations**
- Today's reservations
- Upcoming reservations
- Confirmed bookings
- Cancelled bookings
- Reservation trend

**3. Space / Room Utilization**
- Total available bookable spaces
- Currently occupied
- Reserved
- Available
- Under maintenance
- Occupancy / utilization rate

**4. Items Needing Attention**
- Pending inquiries
- Low-stock inventory
- Overdue tasks
- Pending approvals
- Unresolved incidents, where authorized

Only display metrics supported by actual data.

Do not display made-up figures or arbitrary percentage changes.

## Section B — Operational Trends

Add useful interactive visualizations:

- Reservation volume over time — line chart
- Booking status distribution — donut chart
- Space utilization — horizontal stacked bar
- Reservations by branch — bar chart
- Inventory low-stock overview — compact visualization, when supported

Avoid too many charts.

Prioritize readability and operational usefulness.

## Section C — Today's Reservations

Display a responsive reservation table with:

- Reservation time
- Customer or organization
- Space / room
- Branch
- Reservation status
- Check-in status, if supported
- Contextual action

Support pagination, loading, empty states, and appropriate navigation.

## Section D — Needs Attention

Create an actionable summary panel.

Examples:

- Pending customer inquiries
- Low-stock items
- Overdue tasks
- Reservation issues
- Items requiring manager approval

Each item should navigate to the relevant module only if the user has permission.

If the module is unavailable, do not present a broken action.

## Section E — Branch Performance

For users with access to multiple branches, include meaningful per-branch comparison data:

- Reservation volume
- Space utilization
- Employee headcount
- Pending operational items

Only show a comparison when the user has access to at least two branches.

---

# PHASE 4 — HR DASHBOARD

Refactor the current HR Dashboard into a complete workforce and HR management overview.

The dashboard must respect both **HR-related permissions and assigned branch scope**.

## Section A — Workforce Summary

Display:

- Total employees in authorized scope
- Active employees
- Inactive employees
- Employees on approved leave today
- Employees hired within the selected period
- Employee distribution by branch, where permitted

Do not duplicate an employee in consolidated headcount totals merely because they have multiple branch associations.

Use verified employment statuses and employee relationships.

## Section B — Attendance Overview

Use the existing attendance/DTR module.

Recommended metrics:

- Present
- Absent
- Late
- On approved leave
- Attendance records needing review
- Overtime hours, when supported

Recommended charts:

- Daily attendance trend — line or stacked bar
- Attendance status distribution — donut
- Late/absence trend — line chart
- Branch attendance comparison — bar chart

Use the existing attendance rules, shift schedules, holidays, leave rules, and DTR processing logic.

Do not mark an employee absent solely because a punch record is missing without checking whether the employee was expected to work.

## Section C — Leave Management Summary

Display:

- Pending leave requests
- Approved leave requests
- Rejected leave requests
- Employees currently on leave
- Leave usage by type
- Leave request trend

Include quick navigation to approvals for users authorized to process them.

Do not expose sensitive leave reasons to unauthorized users.

## Section D — Team Tasks and HR Actions

Display relevant actions such as:

- Pending leave approvals
- Overdue employee tasks
- Open HR incidents
- Employee records requiring review, if supported

Do not reveal confidential incident information merely because a user has basic dashboard access.

## Section E — Workforce Analytics

Recommended visualizations:

- Employee headcount trend
- Employee distribution by branch
- Employee distribution by department
- Attendance trend
- Leave usage trend

Only implement visualizations with reliable underlying data.

## Section F — People at a Glance

Improve the existing employee preview.

Display a small, useful set of employees based on the current role and branch scope.

Include:

- Employee avatar or initials
- Full name
- Position
- Department
- Branch
- Link to employee details, where permitted

Avoid always loading the entire employee directory.

Use proper pagination or bounded queries.

Add a link to the existing employee directory when authorized.

---

# PHASE 5 — REPORTS & ANALYTICS MODULE

Implement or complete the existing Reports module.

The Reports page should provide historical data, comparisons, charts, tables, and exports.

Do not create a disconnected reporting system.

Reuse existing backend business logic and verified data definitions.

## Recommended report categories

### 1. Operations Reports

- Reservations by period
- Reservations by status
- Reservations by branch
- Space utilization
- Booking trends
- Pending operational items

### 2. HR Reports

- Employee headcount
- Attendance summary
- Late and absence trends
- Overtime summary
- Leave requests
- Leave usage
- Workforce distribution

### 3. Inventory Reports

- Stock balances
- Low-stock items
- Stock movements
- Equipment / asset status
- Inventory distribution by branch

### 4. Task and Incident Reports

- Assigned tasks
- Completed tasks
- Overdue tasks
- Task completion trends
- Incident status summary
- Incident resolution trends

Apply separate permission checks for confidential data.

Only enable report categories that have implemented, supported data sources.

## Report interface

Recommended layout:

Reports & Analytics
- Summary
- Operations
- Workforce / HR
- Reservations
- Inventory
- Tasks / Incidents

These may be tabs or sub-navigation depending on the existing design.

Avoid creating an excessively complex sidebar.

## Report filters

Support applicable filters:

- Branch
- Date range
- Department
- Employee
- Record status
- Report category
- Grouping interval: daily, weekly, monthly, yearly

Only show a filter when it is relevant and authorized.

Provide:

- Apply / refresh behavior
- Reset filters
- Clear date range when appropriate
- Current filter indicator
- Active filter summary

Use reusable filtering components.

## Date presets

Recommended:

- Today
- Yesterday
- Last 7 days
- Last 30 days
- This month
- Last month
- Custom range

Implement correct start/end date boundaries.

Use the company's configured timezone, or Asia/Manila if that is the existing business requirement.

## Reporting charts

Use appropriate chart types:

- Line: trends over time
- Bar: branch or category comparison
- Donut: status distribution
- Stacked bar: attendance/status breakdown
- Area: volume trends where useful

Do not use pie charts for every metric.

Add accessible labels, tooltips, and meaningful legends.

## Exporting reports

Support CSV export as a baseline.

Reuse existing XLSX/PDF export utilities where available and appropriate.

Exports must:

- Reflect current authorized filters
- Match server-side query results
- Include a clear date range
- Include authorized branch scope
- Include appropriate column headings
- Use readable filenames
- Preserve date/number formatting
- Enforce permissions server-side
- Support larger datasets safely

Do not export hidden or unauthorized records.

---

# PHASE 6 — MULTI-BRANCH ACCESS AND FILTERING

This is a critical requirement.

MAVIC supports users assigned to one branch, multiple branches, or all branches, depending on their permissions.

Use existing branch management, roles, user access, and authentication.

## Scenario A — Single authorized branch

Example:

Employee assigned to Mspaces Makati.

Behavior:

- Dashboard automatically loads Makati data.
- Show the current branch as a static label, or disable unnecessary branch selection.
- Do not allow selecting other branches.
- Reports are restricted to Makati.
- API requests for unauthorized branches must be rejected.

## Scenario B — Multiple authorized branches

Example:

Manager assigned to Makati and Ortigas.

Behavior:

- Branch selector lists only Makati and Ortigas.
- Allow selecting either authorized branch.
- Allow an "All assigned branches" aggregate option where the user has cross-branch reporting permission.
- Changing the selection refreshes relevant data.
- Charts and tables update consistently.

## Scenario C — All-branch authorized user

Example:

Super Admin with global branch access.

Behavior:

- Allow "All branches".
- Allow selecting an individual branch.
- Allow comparative analytics.
- Aggregated data must cover the correct authorized branch set.

Do not assume that a role name alone grants global data access.

Verify existing permissions and backend policy.

## Security requirements

Branch restrictions must be enforced in NestJS, not only in frontend controls.

Implement:

- Server-side branch access validation
- Permission-specific reporting access
- Authorized aggregation queries
- Unauthorized branch request rejection
- Safe validation of branch IDs
- No cross-branch data leakage
- Appropriate access-denied responses

Additional cases:

- A user has no authorized branch.
- A branch is inactive.
- A user's branch assignments change.
- A previously selected branch is no longer authorized.
- An employee has associations with multiple branches.
- Records have no branch assignment.
- A user can view a dashboard but cannot access sensitive underlying details.

Apply the existing system rules consistently.

## Filter synchronization

Where practical, share the selected branch and reporting period using reusable frontend state or URL query parameters.

Use the project's existing state management patterns.

Do not introduce an unnecessary global state library.

---

# PHASE 7 — REAL DYNAMIC DATA

Remove hardcoded dashboard statistics and production-facing sample data.

All KPI cards, charts, and tables must retrieve real information through validated backend APIs.

Use PostgreSQL as the authoritative data source.

## Backend implementation

Build or extend appropriately named analytics services and controllers.

Possible API concepts:

- GET /dashboard/overview
- GET /dashboard/hr
- GET /dashboard/operations/trends
- GET /reports/summary
- GET /reports/attendance
- GET /reports/reservations
- GET /reports/inventory
- GET /reports/export

These are suggested contracts, not mandatory paths.

First inspect existing endpoints and naming conventions.

Prefer extending existing services rather than duplicating business logic.

Use DTO validation and established authorization guards.

## Data calculation rules

Create a documented metric definition for every implemented KPI.

For each metric, specify:

- Display name
- Definition
- Database source
- Included and excluded statuses
- Applicable date field
- Branch scoping rule
- Aggregation method
- Permission requirement
- Comparison-period rule, if applicable

Examples:

**Employee Headcount**

Count distinct employee records with statuses matching the existing headcount definition.

**Reservation Volume**

Count reservations within the selected date range using a clearly defined booking date, creation date, or occupancy date.

**Attendance Rate**

Define an explicit, policy-compatible numerator and denominator using expected workdays, valid attendance, and approved leave.

**Space Utilization**

Use a consistent, defensible occupancy measure based on available space or bookable capacity over time.

Do not label a count of reserved rooms as an occupancy percentage without a valid denominator.

**Low Stock**

Use existing reorder thresholds and stock balance logic, rather than arbitrary hardcoded limits.

**Percentage Changes**

Use a comparable previous period and handle zero denominators safely.

Do not fabricate trend values.

## Data integrity

Handle:

- Missing data
- Zero records
- Null values
- Deleted or archived records
- Historical data
- Cancelled transactions
- Timezone boundaries
- Invalid status assumptions
- Multiple-branch records
- Duplicate records

Separate these states:

1. Loading
2. Loaded successfully with data
3. Loaded successfully with no data
4. Access denied
5. API/network error
6. Data source unavailable or unsupported

Never silently replace a failed API request with fake statistics.

---

# PHASE 8 — MODERN UI/UX REDESIGN

Use the current MAVIC interface as the design foundation.

My screenshots use:

- Dark sidebar
- Light content background
- White cards
- Thin neutral borders
- Red MAVIC branding
- Compact icons
- Clean typography
- Organized information hierarchy
- Consistent spacing

Preserve this overall identity.

Modernize the page without making it visually inconsistent with other modules.

## Visual requirements

- Professional SaaS dashboard design
- Consistent card radius and borders
- Balanced page padding
- Responsive grids
- Clear heading hierarchy
- Concise labels
- Appropriate whitespace
- Consistent icon sizes
- Subtle hover interactions
- Clear interactive states
- Accessible status indicators
- No unnecessary gradients
- No excessively large cards
- No large empty areas caused by poor grid layout
- No oversized graphs that dominate the page

On large screens, use the available content area effectively.

On small screens, stack content in a logical order.

Keep tables horizontally scrollable when required, without causing the entire page to overflow.

Support the existing theme, font-size preferences, and appearance settings where implemented.

---

# PHASE 9 — REUSABLE COMPONENT REFACTORING

Analyze existing components before creating new ones.

Extract reusable components where doing so meaningfully reduces duplication.

Suggested components:

- DashboardPageHeader
- DashboardKpiCard
- DashboardStatGrid
- DashboardChartCard
- DashboardSection
- DashboardFilterBar
- AuthorizedBranchSelector
- DateRangeFilter
- ReportFilterBar
- AnalyticsChart
- StatusDistributionChart
- TrendChart
- DashboardDataTable
- ReportDataTable
- ReportExportAction
- DashboardEmptyState
- DashboardErrorState
- DashboardSkeleton
- ChartSkeleton
- TableSkeleton

These are suggested responsibilities, not a requirement to create one file for every name.

Reuse or extend existing UI components when possible.

Use strongly typed props, reusable hooks, and shared API response types.

Avoid giant dashboard components with hundreds of lines of mixed logic and JSX.

Separate:

- Data fetching
- Data transformation
- Presentation
- Permissions
- Filtering
- Export logic

Do not over-engineer the architecture or introduce unnecessary abstractions.

---

# PHASE 10 — CONTENT-MATCHED LOADING SKELETONS

Implement consistent loading skeletons across Operations Overview, HR Dashboard, and Reports.

The skeleton must match the actual layout of the content that will appear.

## Operations Overview skeleton

Show placeholders matching:

- Page heading and subtitle
- Branch/date filters
- KPI cards
- Chart panels
- Needs-attention panel
- Reservation table

## HR Dashboard skeleton

Show placeholders matching:

- HR page heading
- Workforce summary cards
- Attendance chart
- Leave overview
- HR actions
- Employee preview

## Reports skeleton

Show placeholders matching:

- Report page heading
- Report navigation
- Report filters
- KPI summaries
- Charts
- Detailed report table

## Skeleton behavior

- Skeleton dimensions match loaded component dimensions.
- Use consistent neutral skeleton colors.
- Support light/dark modes.
- Use subtle pulse or shimmer animation.
- Respect `prefers-reduced-motion`.
- Avoid large layout shifts.
- Avoid flashing the full page during minor filter changes.
- Show independent panel loading where appropriate.
- Use relevant table-row and chart placeholders.
- Provide retry states for failed requests.

Avoid replacing the entire page with a generic spinner.

---

# PHASE 11 — MOTION AND INTERACTIONS

Add restrained, professional animations.

Suggested interactions:

- Gentle KPI card entrance
- Smooth chart transitions
- Hover elevation or border feedback
- Filter dropdown transition
- Table row hover feedback
- Smooth loading-to-content transition
- Animated active navigation indicators
- Subtle tooltip transitions

Use the project's existing motion library, if available.

If no motion library exists, prefer lightweight CSS transitions unless a new dependency is justified.

Requirements:

- Avoid excessive bouncing or dramatic motion.
- Prevent distracting repeated animations.
- Respect reduced-motion accessibility settings.
- Prevent animation-related layout shifts.
- Keep interactions responsive on lower-powered devices.
- Do not sacrifice loading speed for visual effects.

---

# PHASE 12 — CHART IMPLEMENTATION

Inspect the project's existing chart libraries first.

Reuse an installed, maintained chart library if it meets the requirements.

Otherwise, choose a compatible React chart solution such as Recharts when justified.

Implement reusable chart wrappers with:

- Responsive sizing
- Loading skeletons
- Empty-data messages
- Tooltip formatting
- Legends
- Date formatting
- Number formatting
- Accessible descriptions
- Theme-aware colors
- Appropriate status colors
- No-data handling

Avoid charts with unnecessary 3D styling or visual clutter.

Charts should answer specific business questions, not merely decorate the interface.

---

# PHASE 13 — PERFORMANCE AND API OPTIMIZATION

Optimize for multi-branch usage and growing datasets.

Backend:

- Prefer database aggregation over fetching every row.
- Avoid N+1 queries.
- Review relevant PostgreSQL indexes.
- Use pagination for large tables.
- Validate date-range parameters.
- Prevent expensive unbounded report queries.
- Reuse shared aggregation logic.
- Avoid exposing raw sensitive records unnecessarily.
- Preserve database connection and query safety.

Frontend:

- Avoid duplicate API requests.
- Cancel stale requests when filters change.
- Prevent stale responses from overwriting newer filter results.
- Reuse the existing query/cache infrastructure.
- Cache where appropriate without leaking data across users or branch scopes.
- Lazy-load large chart/report sections where appropriate.
- Avoid unnecessary re-renders.
- Keep component loading independent when useful.

If caching is introduced, authorization changes must invalidate or re-scope cached data.

---

# PHASE 14 — RESPONSIVE EXPERIENCE

Test layouts at representative sizes:

- 360px mobile
- 390px mobile
- 768px tablet
- 1024px laptop/tablet
- 1366px laptop
- 1920px desktop

Expected behavior:

Mobile:
- KPI cards stack appropriately.
- Filters remain accessible.
- Charts fit the screen.
- Tables scroll safely.
- No clipped text or buttons.

Tablet:
- Use balanced two-column layouts where practical.
- Avoid excessive empty space.

Desktop:
- Use an effective three- or four-column KPI layout when suitable.
- Balance charts and actionable panels.
- Maximize available content space without stretching content excessively.

Maintain compatibility with the existing collapsible sidebar.

---

# PHASE 15 — SECURITY AND ACCESS CONTROL

Follow existing system security architecture.

Requirements:

- Protected API endpoints
- Server-enforced role permissions
- Server-enforced branch restrictions
- Safe query parameter validation
- No unauthorized report exports
- No bypass through modified API parameters
- Sensitive data masking where appropriate
- No confidential data in frontend logs
- No unnecessary personally identifiable information in charts
- No sensitive values embedded in client bundles

Check that the dashboard does not introduce new authorization vulnerabilities.

Use the existing audit logging mechanism for sensitive report exports or access events if one is available.

Do not weaken authentication or modify unrelated authorization behavior.

---

# PHASE 16 — TESTING AND VALIDATION

Implement relevant automated tests.

## Backend tests

Verify:

1. Single-branch users only receive their branch data.
2. Multi-branch users only receive authorized data.
3. Global users receive the expected aggregated data.
4. Unauthorized branch IDs are rejected.
5. Dashboard endpoints enforce relevant permissions.
6. Reports use correct date boundaries.
7. Empty datasets return valid results.
8. Aggregations avoid double-counting.
9. Report exports match authorized filters.
10. Missing or incomplete data is handled safely.

## Frontend tests

Verify:

1. KPI cards render real API data.
2. Loading skeletons match their intended content.
3. Empty states appear correctly.
4. Error states support recovery.
5. Branch selection refreshes data.
6. Date filters refresh relevant charts and tables.
7. Single-branch users cannot select unauthorized branches.
8. Multi-branch users see only authorized options.
9. Charts update with new data.
10. Report exports use the selected filters.
11. Dashboard links respect permissions.
12. No horizontal page overflow occurs on mobile.

Run existing lint, type-check, build, and test commands.

Do not claim a test passed unless it actually ran successfully.

---

# PHASE 17 — IMPLEMENTATION STRATEGY

Work in this order:

**Step 1 — Audit**

Inspect the repository and document the verified data sources, page structure, permissions, and identified problems.

**Step 2 — Data contracts**

Define reusable metric definitions, filter DTOs, API responses, and permission rules.

**Step 3 — Backend**

Implement secure dashboard/reporting aggregation services and necessary API endpoints.

**Step 4 — Shared frontend foundation**

Implement reusable filter controls, branch selectors, KPI cards, chart components, tables, and matching skeletons.

**Step 5 — Operations Overview**

Replace incomplete or hardcoded content with authorized live information.

**Step 6 — HR Dashboard**

Connect real workforce, attendance, leave, and HR action statistics.

**Step 7 — Reports & Analytics**

Complete reporting filters, charts, tables, exports, and drill-down navigation.

**Step 8 — Refactoring**

Remove duplicated code and align the UI with existing MAVIC components.

**Step 9 — Quality assurance**

Run tests, verify permissions, check responsiveness, and fix introduced regressions.

Implement incrementally and validate each section before proceeding.

Do not make destructive database changes without a compelling need.

Preserve existing data through safe, additive migrations.

Avoid rewriting unrelated working modules.

---

# PHASE 18 — ACCEPTANCE CRITERIA

The implementation is complete when:

- [ ] Operations Overview displays verified, dynamic data.
- [ ] HR Dashboard displays verified, dynamic data.
- [ ] Reports & Analytics is functional for supported modules.
- [ ] Hardcoded production KPI values are removed.
- [ ] Graphs use actual database-backed aggregations.
- [ ] Branch filtering follows existing user permissions.
- [ ] Single-branch users are restricted correctly.
- [ ] Multi-branch users can filter authorized branches.
- [ ] Global branch access is available only when authorized.
- [ ] Date filters produce accurate results.
- [ ] Shared frontend components are reused consistently.
- [ ] Loading skeletons match their corresponding page content.
- [ ] All pages follow the existing MAVIC design language.
- [ ] Animations are smooth, subtle, and accessible.
- [ ] Charts and tables work on mobile, tablet, and desktop.
- [ ] Report exports are correct and permission-safe.
- [ ] Loading, empty, error, and access-denied states are implemented.
- [ ] Backend data calculations are tested.
- [ ] Cross-branch data leakage is prevented.
- [ ] Existing system functionality is preserved.
- [ ] Relevant build, lint, type-check, and tests pass.

---

# FINAL DELIVERABLE

After implementation, create:

`docs/dashboard-reporting-implementation.md`

Include:

1. System analysis summary
2. Existing issues discovered
3. Completed changes
4. New or modified files
5. New or modified API endpoints
6. Available metrics and their definitions
7. Backend data sources
8. Supported reporting categories
9. Branch-access behavior
10. Reusable components
11. Chart libraries and usage
12. Loading skeleton strategy
13. Performance improvements
14. Security validation
15. Tests executed and their results
16. Unsupported or unavailable metrics
17. Remaining recommendations for future improvements

**IMPORTANT IMPLEMENTATION RULES**

- Analyze actual code rather than assuming implementation details.
- Reuse existing modules and database structures.
- Do not create fake live data.
- Do not invent missing API fields.
- Do not duplicate existing service logic.
- Do not bypass existing access permissions.
- Do not break currently working features.
- Do not create a completely different visual design.
- Do not modify the separate public/client booking frontend unless a shared dependency change strictly requires it.
- Do not hide incomplete functionality behind misleading success states.
- Prefer a smaller, fully working implementation over a large set of nonfunctional placeholders.
- Document any missing data or feature that prevents a metric from being implemented correctly.

**START NOW:**

Inspect the existing MAVIC repository, create the audit, determine the supported metrics and required changes, then proceed through implementation, refactoring, testing, and documentation.

The final result must be a production-oriented, visually consistent, branch-aware dashboard and reporting experience integrated with the existing MAVIC system.