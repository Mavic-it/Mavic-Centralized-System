# MSPACES — SHADCN/UI COMPONENT AUDIT, MIGRATION & DESIGN SYSTEM STANDARDIZATION

## ROLE

Act as a **Senior Frontend Architect, UI/UX Designer, React/Next.js Developer, and shadcn/ui Specialist**.

You are working inside my **existing Mspaces Centralized Management System**, which includes HRIS, branch management, employee management, role-based dashboards, and other business operations.

Your responsibility is to **inspect, improve, standardize, and gradually migrate the existing frontend UI to shadcn/ui components**.

**IMPORTANT: This is an existing working project. Do not create a new application, redesign the entire system unnecessarily, or remove working features.**

The goal is to transform existing interfaces into a consistent, modern, professional, responsive, and accessible enterprise UI using shadcn/ui.

---

## OBJECTIVE 1 — ANALYZE MY EXISTING PROJECT

Before modifying any code:

1. Inspect the entire frontend project structure.
2. Identify the current framework, Next.js version, React version, Tailwind CSS configuration, package manager, and existing dependencies.
3. Check whether shadcn/ui is already configured.
4. Inspect existing layouts, pages, components, design tokens, and reusable UI utilities.
5. Identify inconsistent UI implementations and duplicated components.
6. Identify existing functionality that must be preserved.
7. Inspect authentication, authorization, branch context, and protected routes.

Do not assume that all components must be replaced.

Classify each component as:

- **KEEP:** Already meets the system's design and usability standards.
- **MIGRATE:** Can be safely replaced with an equivalent shadcn/ui component.
- **REFACTOR:** Requires combining existing business logic with shadcn/ui.
- **CUSTOM:** Must remain custom because shadcn/ui has no suitable equivalent.
- **REMOVE:** Unused, duplicated, or obsolete components, after verifying that they are not referenced.

Create a migration audit document at:

`docs/UI_SHADCN_AUDIT.md`

Include:

| Current Page/Component | Current Implementation | Proposed shadcn/ui Component | Priority | Risk | Migration Status |
|---|---|---|---|---|---|

Use actual file paths and component names from the repository.

---

## OBJECTIVE 2 — SET UP AND STANDARDIZE SHADCN/UI

If shadcn/ui is not yet installed, configure it using the official installation instructions:

https://ui.shadcn.com/docs

Requirements:

1. Integrate with the existing application, never scaffold a new project.
2. Respect the existing Next.js, Tailwind, TypeScript, and package-manager setup.
3. Use the project's existing aliases and component directories.
4. Preserve existing theme settings and brand identity where appropriate.
5. Use the currently supported shadcn/ui APIs.
6. Choose one compatible component primitive approach and use it consistently.
7. Avoid adding unnecessary dependencies or duplicating installed libraries.
8. Never blindly overwrite existing customized files.

Use `components/ui` for shadcn/ui primitives and feature-specific directories for business components, adapting to the actual repository structure.

Create reusable design tokens for typography, spacing, colors, borders, shadows, radii, and interactive states.

---

## OBJECTIVE 3 — MIGRATE EXISTING COMPONENTS

Review the following areas and apply shadcn/ui where appropriate.

### A. Main Application Layout

Recommended components:

- Sidebar
- SidebarProvider
- SidebarTrigger
- Breadcrumb
- Dropdown Menu
- Avatar
- Separator
- Tooltip
- Scroll Area
- Sheet

Requirements:

- Consistent application shell across pages.
- Collapsible desktop sidebar.
- Responsive mobile navigation.
- Consistent top navigation and page headers.
- Branch and account switchers, if already supported.
- Active route highlighting.
- Navigation filtered by existing role permissions.
- Preserve the current authentication and routing architecture.

### B. Dashboards

For SUPER_ADMIN, IT_ADMIN, HR_ADMIN / BRANCH_MANAGER, and STAFF / EMPLOYEE:

Recommended components:

- Card
- Badge
- Chart
- Tabs
- Separator
- Tooltip
- Skeleton

Requirements:

- Consistent KPI card styling.
- Reusable statistics and summary components.
- Existing dashboard data and API integration must remain intact.
- Role-specific information remains isolated.
- Dashboard layout should respond properly across screen sizes.

### C. Employee Management / Employee 201 File

Recommended components:

- Data Table
- Table
- Avatar
- Badge
- Tabs
- Card
- Field
- Input
- Select
- Calendar
- Dialog
- Alert Dialog
- Tooltip
- Pagination

Use them for:

- Employee directory.
- Employee profiles.
- Personal and employment information.
- Emergency contacts.
- Government identification.
- Employee contracts and documents.
- Employee status and assigned branch.

Maintain existing validation, document handling, employee ID generation, and API logic.

### D. Leave Management

Recommended components:

- Card
- Calendar
- Date Picker
- Badge
- Dialog
- Alert Dialog
- Table
- Tabs
- Progress
- Skeleton

Use them for:

- Leave requests.
- Vacation leave and sick leave balances.
- Leave history.
- Manager and HR approvals.
- Request statuses.
- Attachment interfaces.

Preserve existing leave calculation rules, balance records, approval sequences, and access restrictions.

### E. Timekeeping and Attendance

Recommended components:

- Table
- Data Table
- Calendar
- Tabs
- Badge
- Card
- Tooltip
- Skeleton

Apply consistent visual states for attendance, overtime, tardiness, absences, and schedule information.

Preserve actual attendance logic and calculations.

### F. Payroll and Compensation

Recommended components:

- Card
- Table
- Data Table
- Tabs
- Badge
- Dialog
- Alert Dialog
- Tooltip

Maintain all existing financial computations, payroll permissions, payroll processing rules, and payslip visibility.

Do not modify salary calculations as part of a UI migration.

### G. Branch Management

Recommended components:

- Card
- Table
- Dialog
- Alert Dialog
- Input
- Select
- Combobox
- Badge
- Dropdown Menu

Keep the existing Google Maps location picker and branch validation logic.

Preserve the password verification and permission checks required for protected branch deletion.

### H. User Accounts and Role Management

Recommended components:

- Data Table
- Dialog
- Select
- Switch
- Badge
- Avatar
- Alert Dialog

Preserve:

- Employee-account linking.
- Branch assignment rules.
- Optional employee and branch association for SUPER_ADMIN where supported.
- Existing RBAC permissions.
- Role-specific dashboards and routes.
- Server-side authorization.

### I. Other Existing Modules

Inspect recruitment, onboarding, performance, training, benefits, reports, reservations, rooms, inventory, inquiries, announcements, and settings wherever they actually exist.

Recommend appropriate shadcn/ui components based on each module's real purpose.

Do not create unused modules merely to demonstrate components.

---

## OBJECTIVE 4 — CREATE REUSABLE COMPONENTS

Build or refactor reusable application-level components when needed:

- AppSidebar
- AppHeader
- PageHeader
- PageContainer
- StatCard
- DataTable
- DataTableToolbar
- DataTablePagination
- SearchInput
- FilterToolbar
- StatusBadge
- FormSection
- FormActions
- ConfirmDialog
- DeleteConfirmationDialog
- EmptyState
- ErrorState
- LoadingState
- PageSkeleton
- TableSkeleton
- FormSkeleton

Use composition rather than duplicating markup.

Keep business-specific functions separate from generic UI primitives.

Avoid unnecessary abstractions for components used only once.

---

## OBJECTIVE 5 — CONSISTENT UI/UX DESIGN

Apply the following standards across the existing system:

### Visual consistency

- One design system for all modules.
- Consistent button sizes, variants, and interaction states.
- Consistent card styling, padding, and border radii.
- Consistent form spacing and validation messages.
- Consistent table styles and action menus.
- Consistent typography and hierarchy.
- Consistent badge colors for equivalent business statuses.
- Consistent modal, drawer, and confirmation patterns.

### Usability

- Clear action labels.
- Helpful empty states.
- Visible required fields.
- Inline form validation.
- Appropriate success and error notifications.
- Clear destructive-action confirmations.
- Predictable navigation.
- Clear save, cancel, and submit states.
- Prevent duplicate submissions.

### Responsiveness

Test mobile, tablet, laptop, and desktop layouts.

Ensure tables, dialogs, forms, sidebars, and menus remain usable on smaller screens without hiding critical actions.

### Accessibility

- Semantic HTML.
- Keyboard-accessible controls.
- Visible focus indicators.
- Correct field labels.
- Accessible dialog behavior.
- Sufficient color contrast.
- Do not rely on colors alone to communicate statuses.

---

## OBJECTIVE 6 — STANDARDIZE LOADING SKELETONS

Every applicable page must have appropriate loading states.

Use the shadcn/ui Skeleton component.

Important requirements:

1. Respect the existing Next.js routing convention.
2. Use the correct `loading.js`, `loading.jsx`, or `loading.tsx` file based on the project.
3. Skeleton layouts must visually match the actual content layouts.
4. Tables should have table-shaped skeletons.
5. Dashboards should have card-shaped and chart-shaped skeletons.
6. Forms should have input-shaped skeletons.
7. Employee profiles should have profile-shaped skeletons.
8. Minimize layout shifting between loading and loaded states.
9. Cover client-side refetching and mutation loading states where route-level loading files do not apply.
10. Do not display fake business data as a loading placeholder.

Create reusable skeleton components instead of copying placeholder code throughout the project.

---

## OBJECTIVE 7 — PRESERVE FUNCTIONALITY AND SECURITY

**UI migration must never weaken or break existing business operations.**

Do not change the following unless absolutely necessary for compatibility:

- PostgreSQL database models or migrations.
- Backend services.
- API contracts.
- Authentication behavior.
- Permission checks.
- Role-based access control.
- Branch-level data isolation.
- Payroll computations.
- Leave balance calculations.
- Employee records.
- Document upload and storage behavior.
- Existing audit trails.
- Current validation requirements.

Do not expose restricted information through newly introduced UI components.

Do not use frontend-only visibility rules as a substitute for backend authorization.

Do not replace real API data with mock data.

---

## OBJECTIVE 8 — MIGRATION EXECUTION STRATEGY

Work incrementally rather than rewriting the entire frontend in one operation.

### Phase 1 — Audit and Planning

- Review the current implementation.
- Identify all migration candidates.
- Document risks and dependencies.
- Create a prioritized migration checklist.

### Phase 2 — Foundation

- Configure shadcn/ui where necessary.
- Standardize design tokens.
- Improve the global app shell.
- Establish reusable UI primitives.

### Phase 3 — Common Components

- Buttons and form controls.
- Cards and badges.
- Dialogs and confirmation patterns.
- Tables and pagination.
- Notifications and empty states.
- Loading skeletons.

### Phase 4 — Page-by-Page Migration

Migrate actual existing pages, prioritizing frequently used pages and high-impact inconsistencies.

For each page:

1. Inspect the existing implementation.
2. Identify the appropriate shadcn/ui components.
3. Preserve business behavior and API integration.
4. Replace or refactor the UI.
5. Confirm responsive behavior.
6. Verify role permissions and interactions.
7. Run available checks.
8. Mark the migration result in the checklist.

### Phase 5 — Quality Assurance

Execute available:

- TypeScript checks.
- ESLint checks.
- Production build.
- Relevant automated tests.
- Functional regression tests where available.

Where browser or visual testing is available, check the actual rendered interface at common viewport sizes.

Do not claim that a check passed unless it was executed successfully.

---

## OBJECTIVE 9 — DELIVERABLES

Maintain these documents:

`docs/UI_SHADCN_AUDIT.md`

`docs/SHADCN_MIGRATION_CHECKLIST.md`

Report:

1. Existing components identified.
2. Components migrated.
3. New reusable components created.
4. Components intentionally kept unchanged.
5. Files modified.
6. Design inconsistencies fixed.
7. Dependencies added.
8. Tests performed and results.
9. Remaining issues and next recommended migration targets.

---

## FINAL INSTRUCTIONS

- Inspect the existing codebase before writing code.
- Use official shadcn/ui documentation.
- Prefer existing code patterns when compatible.
- Preserve the current look and brand identity while improving consistency.
- Do not introduce unnecessary redesigns.
- Do not create a second competing component library.
- Do not remove working features.
- Do not modify unrelated backend functionality.
- Implement safe changes in small, reviewable groups.
- If a migration risks breaking a feature, document the risk and choose the safer implementation.
- Continue applying the approved migration strategy within the scope of the current task rather than stopping after suggestions alone.

**SUCCESS CRITERIA:**

My Mspaces system should have a unified, user-friendly, modern enterprise interface powered primarily by shadcn/ui, while preserving all existing system functionality, security, role-based permissions, and business workflows.

**START NOW:** Analyze the currently open repository, create the component migration inventory, and begin the foundation and highest-priority safe UI migrations.