> Approval/settings override - 2026-10-26: The user explicitly allows SUPER_ADMIN, HR_ADMIN and BRANCH_MANAGER to approve their own leave within authorized branch scope. Self-approval is explicit in request history/audit with actor identity, role snapshot and timestamp. Employee/staff and IT accounts gain no approval rights. The user also enabled half-days, future approved cancellation and policy annual allocation for eligible paid annual types through new versions; existing request snapshots remain. This supersedes blanket no-self-approval requirements below and does not advance the main HRIS phase. See docs/LEAVE_APPROVAL_HISTORY.md.

> Current scope override - 2026-10-22: The latest user request explicitly reintroduces My Leave and Leave Management using `.ai/agents/MSPACES_LEAVE_MANAGEMENT_CODEX.md`. Implement only the simple leave slice: one approval step, employee portal, four management pages, versioned policies, immutable credits and minimal DTR integration. Main HRIS Phase 1 remains active; later phases are not started. Prior removal and leave implementations are historical. See `docs/LEAVE_V1_IMPLEMENTATION_HANDOVER.md` (or `LEAVE_V1_IMPLEMENTATION_HANDOVER.md` from docs).

# MASTER PROMPT — MSPACES CENTRALIZED HRIS SYSTEM

## ROLE

Act as a **Senior Full-Stack Software Engineer, HRIS Solutions Architect, PostgreSQL Database Architect, Security Engineer, and UI/UX Engineer**.

You are working inside my EXISTING Mspaces Centralized Management System repository.

Your task is to transform the existing HR-related functionality into a complete, connected, modular, enterprise-style Human Resource Information System (HRIS).

**DO NOT rebuild the project from scratch. DO NOT replace existing working features unnecessarily.**

You must inspect, understand, improve, and extend the existing system.

The objective is to implement REAL WORKING FEATURES, not just produce architecture documentation, UI mockups, empty pages, or placeholder APIs.

---

# 1. FIRST: ANALYZE MY EXISTING PROJECT

Before writing implementation code, inspect the entire relevant repository.

Identify:

- Current frontend and backend frameworks
- Project and application folder structure
- PostgreSQL database schema and ORM/query layer
- Existing migrations and seeders
- Authentication and authorization architecture
- Current role and permission system
- Existing branch management
- Employee directory and 201-file functionality
- User account creation and employee linking
- Existing attendance and leave functionality
- Existing payroll functionality or integrations
- Employee portal and dashboards
- Reusable UI components
- API endpoints and service layers
- Existing validation, notifications, audit logs, and loading skeletons
- Existing automated tests and available build commands

Classify the 11 requested HRIS modules as:

- EXISTING AND WORKING
- EXISTING BUT NEEDS IMPROVEMENT
- PARTIALLY IMPLEMENTED
- NOT IMPLEMENTED

Identify dependencies, inconsistencies, duplicated records, incomplete workflows, security gaps, and opportunities to reuse existing code.

Do not assume a feature is missing without checking.

Create or update:

`docs/HRIS_IMPLEMENTATION_PLAN.md`

Include:

1. Existing functionality inventory
2. Current architecture and database relationships
3. Missing features and gaps
4. Proposed connected HRIS architecture
5. Module dependencies
6. Database changes and migrations
7. RBAC and branch-scope requirements
8. Implementation phases
9. Risks and compatibility considerations
10. Testing and acceptance criteria

After the analysis, **begin implementing Phase 1**. Do not stop after writing a plan.

---

# 2. MAIN SYSTEM ARCHITECTURE

The system must follow this centralized HRIS architecture:

MSPACES CENTRALIZED SYSTEM

→ Organization Management  
→ Employee Master Records  
→ User Accounts and Role-Based Access  
→ Recruitment and Onboarding  
→ Attendance and Timekeeping  
→ Leave Management  
→ Payroll and Compensation  
→ Benefits Administration  
→ Performance Management  
→ Training and Development  
→ Employee Self-Service  
→ HR Reports and Analytics  
→ Compliance and Documentation  

All modules must share consistent employee identities and communicate through well-defined database relationships, services, and APIs.

## Multi-Branch Support

The system currently supports branches such as:

- Mspaces Makati
- Mspaces Ortigas

It must support future branches without hardcoded branch IDs, names, or locations.

Keep one centralized system while enforcing branch-specific access.

Employee transfers between branches must preserve historical records.

---

# 3. IMPLEMENT THE COMPLETE EMPLOYEE LIFECYCLE

Design and implement the following connected workflow:

Recruitment or Direct Employee Entry  
↓  
Employee Registration  
↓  
Employee Master Record / 201 File  
↓  
Branch, Department and Position Assignment  
↓  
User Account Creation  
↓  
Onboarding and Account Activation  
↓  
Employee Self-Service Portal  
↓  
Attendance and Timekeeping  
↓  
Leave and Overtime Requests  
↓  
Payroll and Benefits  
↓  
Performance Evaluations  
↓  
Training and Development  
↓  
Employee Promotion or Transfer  
↓  
Resignation / Separation / Offboarding  

Every stage must use the same employee identity.

Do not duplicate employee records when transferring branches, creating accounts, processing payroll, or converting applicants into employees.

Support direct employee registration even when the Recruitment module is not used.

---

# 4. MODULE IMPLEMENTATION REQUIREMENTS

## MODULE A — EMPLOYEE INFORMATION MANAGEMENT

Improve the existing Employee Management / 201 File module.

Implement or improve:

- Employee master profile
- Personal and contact information
- Emergency contacts
- Employment information
- Branch assignment
- Department and position
- Reporting manager
- Employment status
- Employment type
- Date hired and regularization
- Employment and assignment history
- Government IDs with protected access
- Contracts and employee documents
- Employee transfer and promotion history
- Salary history with restricted permissions

Employee IDs must be unique and contain 6–10 characters, following the existing project convention.

Use immutable internal database identifiers for relationships.

Employee registration and user account creation must remain separate processes.

A user account must link to an existing employee where required.

SUPER_ADMIN accounts must not require employee or branch assignment.

## MODULE B — RECRUITMENT AND ONBOARDING

Implement:

Job Requisition  
→ Approval  
→ Applicant Registration  
→ Screening  
→ Interview  
→ Assessment  
→ Job Offer  
→ Hired  
→ Employee Record  
→ Onboarding Checklist  

Converting an applicant to an employee must reuse their existing information.

Avoid duplicate employee creation.

## MODULE C — ATTENDANCE AND TIMEKEEPING

Implement:

Work Schedule  
→ Attendance Collection  
→ Time Calculation  
→ Exception Detection  
→ Correction / Overtime Approval  
→ Verified Attendance  
→ Payroll Input  

Support manual attendance, imported records, and future biometric/API integration.

Track regular hours, overtime, lateness, undertime, absences, rest days, and holidays.

Use configurable attendance rules.

Preserve original logs and audit corrections.

## MODULE D — LEAVE MANAGEMENT

Implement:

Leave Policy  
→ Employee Leave Credits  
→ Leave Filing  
→ Validation  
→ Manager Approval  
→ HR Approval When Required  
→ Leave Ledger Update  
→ Attendance Update  
→ Payroll Input  

Support vacation leave, sick leave, service incentive leave, and configurable additional types.

Track:

- Earned credits
- Used credits
- Pending requests
- Approved deductions
- Adjustments
- Reversals
- Expired credits
- Available balances

Prevent duplicate deductions and inconsistent balances.

Use policy-driven leave calculations rather than hardcoded assumptions about Philippine labor rules.

Display the same authoritative leave balance in Leave Management, Employee Profile, and My Portal.

## MODULE E — PAYROLL AND COMPENSATION

Implement a payroll-ready integration architecture.

Workflow:

Payroll Period  
→ Attendance Cutoff  
→ Attendance and Leave Validation  
→ Overtime Validation  
→ Compensation and Deduction Inputs  
→ Payroll Review  
→ Payroll Approval  
→ Locked Payroll Snapshot  
→ External Payroll Integration  
→ Result Reconciliation  
→ Payslip Release  

Support basic salary, allowances, deductions, overtime, payroll periods, and payslip records.

Reuse existing payroll functionality where available.

Do not build a replacement payroll calculation engine unless required by the current project.

External payroll integrations must support safe retries, status tracking, reconciliation, and prevention of duplicate submissions.

Never expose confidential payroll data to unauthorized users.

## MODULE F — BENEFITS ADMINISTRATION

Benefits administration is coordinated by GBR.

Implement the HRIS-side capability for:

- Benefit plans
- Employee eligibility
- Benefit enrollment
- Enrollment status
- Authorized contribution information
- Benefit history
- Payroll-related benefit data
- GBR coordination and reconciliation

Do not invent a GBR API or assume an integration already exists.

Use an adapter or integration interface until a real integration contract is available.

## MODULE G — PERFORMANCE MANAGEMENT

Implement:

Performance Cycle  
→ Goal Setting  
→ Supervisor Evaluation  
→ HR Review  
→ Final Rating  
→ Employee Acknowledgment  
→ Development Plan  

Store evaluations in the employee record with proper access restrictions.

## MODULE H — TRAINING AND DEVELOPMENT

Implement:

Training Needs  
→ Training Assignment  
→ Participation  
→ Completion  
→ Certificate Upload  
→ Skills Record  
→ Expiration Monitoring  

Link development recommendations from performance evaluations to training records.

## MODULE I — EMPLOYEE SELF-SERVICE

Create or improve the employee portal.

Employees must be able to access their authorized:

- My Dashboard
- My Profile
- My 201 File
- My Attendance
- My Leave
- My Leave Balance
- My Payslips
- My Benefits
- My Performance
- My Training
- My Documents
- My Requests
- My Notifications

Employees must only access their own records unless additional permissions are explicitly granted.

Profile edits and sensitive document changes must follow appropriate verification and approval rules.

## MODULE J — HR REPORTS AND ANALYTICS

Implement reports and dashboards for:

- Employee headcount
- Active and inactive employees
- New hires
- Employee turnover
- Attendance
- Absences
- Tardiness
- Overtime
- Leave utilization
- Leave balances
- Payroll summaries
- Benefits
- Training
- Performance
- Missing or expiring documents

Support branch, department, date range, employee, and employment-status filtering where applicable.

Use authorized source data instead of duplicated reporting records.

## MODULE K — COMPLIANCE AND DOCUMENTATION

Implement:

- Employee document requirements
- Secure uploads
- Document verification
- Contract monitoring
- Certification expiration
- Missing document tracking
- Access-controlled downloads
- Document retention policies
- Audit logging
- Authorized document disposal

Follow applicable Philippine labor and privacy requirements, but do not hardcode legal assumptions without verified policy rules.

---

# 5. ROLE-BASED ACCESS CONTROL

Preserve and improve the existing roles:

- SUPER_ADMIN
- HR_ADMIN
- BRANCH_MANAGER
- IT_ADMIN
- STAFF / EMPLOYEE

If HR_ADMIN and BRANCH_MANAGER currently share implementation, retain compatibility while separating their permission scope where appropriate.

## SUPER_ADMIN

Company-wide system administration, including branch management, permissions, integrations, and authorized operational oversight.

No mandatory employee or branch association.

## HR_ADMIN

Authorized employee management, recruitment, leave, attendance, payroll preparation, benefits, performance, training, documentation, and HR reporting.

Company-wide or branch-specific scope must be explicitly configured.

## BRANCH_MANAGER

Access assigned-branch employee operations, schedules, attendance, requests, approvals, and authorized branch reporting.

Do not automatically grant access to confidential salary, medical, or unrelated HR information.

## IT_ADMIN

Manage accounts, technical configuration, integrations, and system security.

Do not automatically grant access to salary, payroll, medical records, or private HR documents.

## STAFF / EMPLOYEE

Access only personal employee services and records.

## Security Rules

Every protected backend operation must enforce:

1. Authentication
2. Role and permission
3. Branch scope
4. Record ownership where applicable
5. Sensitive field-level restrictions
6. Audit logging for sensitive actions

Do not rely only on frontend route guards or hidden buttons.

---

# 6. DATABASE REQUIREMENTS

Use the existing PostgreSQL database and existing ORM/query patterns.

Do not replace the database or introduce a second source of employee identity.

Inspect existing tables before proposing new ones.

Implement appropriate:

- Foreign keys
- Unique constraints
- Indexes
- Effective-dated employment history
- Database transactions
- Audit history
- Approval records
- Leave ledger transactions
- Payroll snapshot/version records
- Soft deletion where appropriate

Migrations must be compatible with existing data.

Do not drop or destructively modify production-related data.

Do not run destructive migrations, resets, or seed scripts without explicit approval.

---

# 7. SHARED WORKFLOW SERVICES

Create reusable services where they improve the architecture:

### Approval Workflow

Support approvals for:

- Leave
- Overtime
- Attendance corrections
- Employee changes
- HR requests

Each workflow must have appropriate permissions, states, timestamps, decision history, and notifications.

### Notification Service

Support notifications for:

- Pending approvals
- Approved/rejected requests
- Expiring documents
- Onboarding tasks
- Payroll availability
- Training and certification reminders

### Employee Lifecycle Service

Coordinate hiring, employee creation, branch transfers, status changes, and offboarding without duplicating employee records.

### Audit Service

Record sensitive operations, who performed them, affected records, timestamps, and relevant changes without exposing confidential data unnecessarily.

Reuse existing services instead of duplicating them.

---

# 8. UI/UX REQUIREMENTS

Preserve the current Mspaces design system and visual identity.

Maintain the existing red, black, white, minimalist business style.

Organize navigation into logical groups:

- Dashboard
- People Management
- Recruitment
- Workforce Management
- Payroll & Benefits
- Talent Management
- Reports & Compliance
- System Administration
- Employee Self-Service

Show navigation based on actual permissions.

Reuse existing:

- Tables
- Forms
- Dialogs
- Status indicators
- Search and filters
- Notifications
- File upload components
- Date pickers
- Dashboard cards
- Layouts

Every new feature must include:

- Responsive design
- Validation
- Loading state
- Empty state
- Error state
- Success feedback
- Confirmation for destructive actions
- Accessible controls

For Next.js App Router pages, implement the appropriate route-level `loading.js` or `loading.tsx` according to the existing project conventions.

Loading skeletons must closely match the actual page structure.

Do not create generic or unrelated loading skeletons.

---

# 9. IMPLEMENTATION PHASES

Follow this dependency-aware sequence:

### PHASE 1 — Foundation and Employee Core

- Audit current architecture
- Improve Employee / 201 File
- Verify employee-to-user relationships
- Normalize branch, department, and position assignments
- Implement employment history and transfers
- Improve authorization and audit foundations

### PHASE 2 — Attendance and Leave

- Attendance schedules and logs
- Attendance corrections
- Overtime approvals
- Leave policies and ledger
- Leave approvals
- Attendance/leave reconciliation

### PHASE 3 — Employee Self-Service

- Employee dashboard
- Personal records
- Attendance and leave views
- Employee requests
- Notifications

### PHASE 4 — Payroll and Benefits

- Compensation history
- Payroll cutoff
- Payroll preparation and approval
- Payroll integration interface
- Benefits and GBR coordination
- Payslip publishing

### PHASE 5 — Recruitment and Onboarding

- Job requisitions
- Applicants and hiring
- Applicant-to-employee conversion
- Onboarding workflow

### PHASE 6 — Performance and Training

- Goals and evaluations
- Development plans
- Training records
- Certifications

### PHASE 7 — Analytics and Compliance

- HR reports
- Company/branch analytics
- Compliance tracking
- Expiration monitoring
- Final cross-module optimization

For each phase, reuse already implemented functionality and complete only missing or incomplete parts.

---

# 10. CODING AGENT EXECUTION RULES

You must make actual code changes in this repository.

Do not respond with only recommendations or sample code.

For each phase:

1. Inspect relevant files.
2. Identify existing functionality.
3. Explain the specific changes to make.
4. Implement backend models, services, APIs, and validation as needed.
5. Implement frontend pages and reusable components.
6. Connect frontend to real backend APIs.
7. Implement authorization and branch scoping.
8. Create safe database migrations where required.
9. Implement loading, empty, and error states.
10. Add or update automated tests.
11. Run available type checks, linting, builds, and tests.
12. Fix introduced errors.
13. Report changed files and completed functionality.

Do not fabricate test results.

Do not use mock data in production features as a substitute for actual database integration.

Do not modify unrelated functionality unnecessarily.

Do not create duplicate APIs, database tables, or UI components.

Preserve existing public contracts unless changes are necessary and documented.

Do not overwrite user data, secrets, or environment configurations.

If a task requires an unavailable external provider, credentials, or policy decision, implement only the safe internal boundary and clearly report what remains blocked.

---

# 11. ACCEPTANCE CRITERIA

Each completed feature must:

- Work with the existing PostgreSQL database
- Use actual application APIs
- Follow existing project conventions
- Respect authentication and RBAC
- Enforce branch and employee-level scope
- Preserve existing employee records
- Maintain audit history
- Handle errors correctly
- Display accurate loading states
- Be responsive
- Include appropriate validation
- Have relevant tests
- Avoid regressions

A page without working backend functionality is NOT considered a completed feature.

A workflow without authorization checks is NOT considered complete.

A payroll integration without reconciliation and error handling is NOT considered complete.

---

# 12. START IMPLEMENTATION NOW

Start by inspecting the existing repository.

Create or update `docs/HRIS_IMPLEMENTATION_PLAN.md`.

Then immediately begin implementing **Phase 1 — Foundation and Employee Core**.

If part of Phase 1 already works correctly, preserve it and focus on the missing functionality.

Do not implement all seven phases in one large uncontrolled change.

When Phase 1 is finished, provide:

- What already existed
- What was implemented or improved
- Database migrations created
- Files modified
- APIs added or changed
- RBAC/security changes
- Tests and checks performed
- Remaining issues
- Recommended next phase

Wait for my instruction before beginning Phase 2.

**FINAL GOAL:** A fully integrated, centralized, secure, multi-branch HRIS for Mspaces where the employee record connects recruitment, onboarding, attendance, leave, payroll, benefits, performance, training, self-service, reporting, and compliance.
