# MSPACES CENTRALIZED MANAGEMENT SYSTEM
## HR Management & Employee Lifecycle Expansion

### Objective

Enhance the existing Mspaces Centralized Management System into a more complete **HR Management and Employee Lifecycle System**.

Do NOT rebuild the existing system from scratch.

First inspect the current application structure, database schema, authentication, RBAC, employee management, branch management, leave management, attendance, dashboard, and existing UI components.

Reuse existing components, services, API patterns, validation, database conventions, authentication, authorization, audit logging, loading states, and design system wherever possible.

The system must remain compatible with the existing:

- SUPER_ADMIN
- HR_ADMIN / BRANCH_MANAGER
- IT_ADMIN
- STAFF / EMPLOYEE

roles and their existing access-control rules.

---

# 1. EMPLOYEE INFORMATION MANAGEMENT

Expand the existing Employee Management / 201 File module.

### Employee Profile

Maintain:

- Employee ID
- First name
- Middle name
- Last name
- Suffix
- Preferred name
- Profile photo
- Date of birth
- Gender
- Civil status
- Nationality
- Contact number
- Personal email
- Company email
- Current address
- Permanent address

### Employment Information

Maintain:

- Employee ID
- Date hired
- Employment status
- Employment type
- Position
- Department
- Branch
- Supervisor / Manager
- Job level
- Salary grade
- Basic salary
- Work schedule
- Shift
- Probationary status
- Regularization date
- Separation date
- Separation reason

### Employee 201 File

Include:

- Personal information
- Employment records
- Emergency contacts
- Government IDs
- Contracts
- Certificates
- Company documents
- Other employee documents

### Employee ID Rule

Employee ID must:

- Be required
- Contain 6–10 characters
- Be unique
- Have server-side validation
- Have database-level uniqueness
- Be searchable

---

# 2. TIMEKEEPING & ATTENDANCE

Create a centralized Attendance / Timekeeping module.

Track:

- Time in
- Time out
- Breaks
- Total working hours
- Overtime
- Tardiness
- Undertime
- Absence
- Holiday
- Rest day
- Work-from-home if applicable
- Attendance status

### Attendance Sources

Design the system so attendance can eventually come from:

- Manual entry
- Biometric device
- Imported attendance logs
- API integration
- Future automated timekeeping integration

Do not tightly couple the system to only one attendance source.

### Attendance Calculation

Calculate:

- Regular hours
- Late minutes
- Undertime minutes
- Overtime hours
- Total hours
- Absence

Use configurable company schedules rather than hardcoding schedules.

The existing attendance rules must remain compatible with the current system.

### Employee View

Employees should be able to see:

- Today's attendance
- Current status
- Time in/out
- Monthly attendance
- Late records
- Undertime
- Overtime
- Absences

### HR / Manager View

HR and managers should be able to:

- View employee attendance
- Filter by branch
- Filter by department
- Filter by employee
- Filter by date range
- Review attendance exceptions
- Correct attendance when authorized
- Review overtime

All manual modifications must be audited.

---

# 3. LEAVE MANAGEMENT

Expand the existing Leave Management module.

Support:

- Vacation Leave
- Sick Leave
- Service Incentive Leave
- Other company-defined leave types

Each leave type must support:

- Leave name
- Description
- Paid / unpaid
- Annual allocation
- Carry-over rules
- Maximum consecutive days
- Eligibility
- Approval workflow
- Active/inactive status

### Employee Leave Portal

Employees can:

- View leave balances
- File leave
- Select leave type
- Select dates
- Add reason
- Upload supporting documents
- View leave status
- Cancel pending requests where permitted
- View leave history

### Approval Workflow

Recommended workflow:

Employee
→ Branch Manager / Authorized Approver
→ HR

For leave requiring additional approval, support configurable approval levels.

Statuses:

- DRAFT
- PENDING
- APPROVED
- REJECTED
- CANCELLED

Every approval/rejection must be logged.

---

# 4. PAYROLL & COMPENSATION

Create a Payroll & Compensation module designed for future payroll automation/integration.

Do not assume that payroll calculations will always happen inside the Mspaces system.

The architecture should support:

### Employee Compensation

Store:

- Basic salary
- Salary type
- Allowances
- Incentives
- Overtime rate
- Holiday rate
- Night differential if applicable
- Other compensation

### Deductions

Support configurable deductions such as:

- Government deductions
- Loans
- Absences
- Undertime
- Other company deductions

### Benefits

Payroll must be capable of receiving benefit/deduction information from the Benefits module.

### Payroll Period

Support:

- Payroll period
- Cutoff
- Pay date
- Employee payroll records
- Gross pay
- Deductions
- Net pay
- Payroll status

Statuses:

- DRAFT
- PROCESSING
- REVIEW
- APPROVED
- RELEASED
- VOIDED

### Payroll Integration

Design an integration layer/API so payroll can eventually connect with:

- External payroll systems
- Accounting systems
- Government contribution systems
- Banking/payment systems

Do NOT hardcode a single third-party payroll provider.

Create clean service interfaces for future integration.

### Employee Self-Service

Employees should be able to view:

- Payslips
- Payroll history
- Earnings
- Deductions
- Net pay

Employees must NOT be able to modify payroll records.

---

# 5. RECRUITMENT & ONBOARDING

Create a Recruitment module.

### Job Requisition

Support:

- Position
- Department
- Branch
- Number of openings
- Employment type
- Salary range
- Job description
- Requirements
- Hiring manager
- Status

### Applicant Management

Track:

- Applicant profile
- Contact information
- Resume
- Application date
- Applied position
- Source
- Interview records
- Assessment
- Hiring status
- Notes
- Documents

Applicant statuses:

- APPLIED
- SCREENING
- INTERVIEW
- ASSESSMENT
- FOR_APPROVAL
- OFFERED
- HIRED
- REJECTED
- WITHDRAWN

### Onboarding

When an applicant is hired:

Applicant
→ Employee Record
→ 201 File
→ Account Creation
→ Branch Assignment
→ Position Assignment
→ Onboarding Checklist

Avoid duplicate employee data.

Use the hired applicant information to pre-populate the employee record.

---

# 6. PERFORMANCE MANAGEMENT

Create a Performance Management module.

### Performance Evaluation

Support:

- Evaluation period
- Employee
- Evaluator
- Goals
- KPIs
- Performance criteria
- Ratings
- Comments
- Overall score
- Recommendations

### Performance Cycle

Example:

Goal Setting
→ Mid-Year Review
→ Final Evaluation
→ Manager Review
→ Employee Acknowledgment
→ Development Plan

### Employee Development Plan

Track:

- Development goal
- Skill gap
- Recommended training
- Target date
- Progress
- Completion status

Employees should be able to view their finalized evaluations.

Employees should not be able to modify submitted evaluations.

---

# 7. TRAINING & DEVELOPMENT

Create a Training & Development module.

### Training Management

Track:

- Training title
- Description
- Provider
- Training type
- Date
- Duration
- Location
- Cost
- Trainer
- Participants
- Status

### Employee Training Record

Maintain:

- Completed training
- Training date
- Certificate
- Expiration date
- Provider
- Result
- Skills acquired

### Certifications

Support:

- Certification name
- Issuing organization
- Issue date
- Expiration date
- Certificate document
- Verification status

Show upcoming certification expirations.

---

# 8. BENEFITS ADMINISTRATION

Create a Benefits Administration module.

This module will support government-mandated and company-provided benefits.

**Benefits administration: c/o GBR**

Support configurable benefits such as:

- Government-mandated contributions
- Company benefits
- Health benefits
- Insurance
- Allowances
- Retirement-related benefits
- Other company benefits

Do not hardcode benefit rules where possible.

### Benefit Enrollment

Track:

- Employee
- Benefit
- Eligibility
- Enrollment date
- Effective date
- End date
- Employee contribution
- Employer contribution
- Status

### Integration

Benefits information must be available to the payroll module when applicable.

---

# 9. EMPLOYEE SELF-SERVICE

Create a complete **My Portal** for employees.

Employees should have access to:

### My Profile

- Personal information
- Contact information
- Emergency contacts
- Employment information

### My 201 File

- Documents
- Contracts
- Government IDs
- Certificates

Sensitive information must be protected.

### Leave

- Leave balances
- File leave
- Leave history
- Approval status

### Attendance

- Daily attendance
- Monthly attendance
- Overtime
- Tardiness
- Absences

### Payroll

- Payslips
- Payroll history
- Compensation summary

### Benefits

- Current benefits
- Benefit enrollment
- Benefit information

### Performance

- Goals
- Completed evaluations
- Development plans

### Training

- Training history
- Certifications
- Expiration dates

### Requests

Create a centralized employee request area for future HR services.

---

# 10. HR REPORTS & ANALYTICS

Create a centralized HR Reports module.

Reports should support filtering by:

- Date
- Branch
- Department
- Position
- Employee
- Employment status

### HR Reports

Include:

- Employee Headcount
- Active Employees
- New Hires
- Resigned Employees
- Employee Turnover
- Attendance
- Absences
- Tardiness
- Overtime
- Leave Utilization
- Leave Balances
- Payroll Summary
- Compensation Summary
- Benefits
- Training
- Certifications
- Performance

### Dashboard KPIs

HR dashboard should display:

- Total Employees
- Active Employees
- New Employees
- Employees on Leave
- Attendance Rate
- Absence Rate
- Late Employees
- Overtime
- Upcoming Birthdays
- Upcoming Contract Expiration
- Upcoming Certification Expiration
- Pending Leave Approvals
- Pending HR Requests

Charts should be useful and not overloaded.

---

# 11. COMPLIANCE & DOCUMENTATION

Create a centralized compliance/document management capability.

Track:

- Employee documents
- Contracts
- Government IDs
- Certificates
- Training certificates
- Company policies
- HR forms
- Employment records

### Document Metadata

Every uploaded document should store:

- Document type
- Employee
- File name
- File size
- Uploaded by
- Upload date
- Expiration date if applicable
- Status
- Version

### Expiration Monitoring

The system should identify:

- Expired documents
- Documents expiring soon
- Expired contracts
- Expiring certifications
- Missing required documents

### Audit Trail

Important HR actions must be recorded:

- Created
- Updated
- Deleted
- Approved
- Rejected
- Uploaded
- Downloaded where appropriate
- Status changed

Audit logs must include:

- User
- Action
- Module
- Record
- Timestamp
- IP/device information where available
- Before/after values for sensitive changes where appropriate

---

# RECOMMENDED EMPLOYEE LIFECYCLE

The system should connect the modules into one employee lifecycle:

Recruitment
↓
Applicant
↓
Hiring
↓
Onboarding
↓
Employee Record / 201 File
↓
User Account
↓
Branch Assignment
↓
Attendance
↓
Leave
↓
Payroll
↓
Benefits
↓
Performance
↓
Training & Development
↓
Promotion / Transfer
↓
Separation
↓
Employee Records Retention

Avoid duplicate records between modules.

The Employee record should become the central source of employee identity.

---

# ROLE-BASED ACCESS

## SUPER_ADMIN

Full system access.

Can manage:

- Users
- Roles
- Branches
- System settings
- Employees
- HR modules
- Payroll
- Reports
- Integrations
- Audit logs
- Security settings

SUPER_ADMIN account does NOT require:

- Employee selection
- Branch assignment

---

## HR_ADMIN / BRANCH_MANAGER

HR-focused access.

Can manage or view depending on authorization:

- Employees
- 201 files
- Recruitment
- Onboarding
- Leave
- Attendance
- Payroll information
- Benefits
- Performance
- Training
- Reports
- HR documents

Branch Managers must only access employees/data within their assigned branch unless explicitly granted broader permissions.

---

## IT_ADMIN

System and technical administration.

Can manage:

- User accounts
- Access control
- System configuration
- Branch technical configuration
- Integrations
- Audit/security information

IT_ADMIN should NOT automatically receive access to sensitive HR information such as:

- Salary
- Payroll details
- Performance evaluations
- Medical/leave details
- Personal HR documents

unless explicitly granted permission.

---

## STAFF / EMPLOYEE

Employee Self-Service only.

Can access:

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
- HR Requests
- Notifications
- Announcements

Employees can only access their own records.

---

# SECURITY REQUIREMENTS

Implement strict authorization on both frontend and backend.

Never rely only on hiding UI buttons.

Every API endpoint must verify:

1. Authentication
2. User role
3. Permission
4. Branch scope
5. Employee ownership where applicable

Sensitive information must have additional protection.

Examples:

- Payroll
- Salary
- Government IDs
- Contracts
- Personal documents
- Performance evaluations

Use secure file storage and never expose private employee documents through predictable public URLs.

---

# DATABASE DESIGN

Extend the existing normalized PostgreSQL database.

Do not create unnecessary duplicate employee tables.

Use relationships such as:

User
→ Employee
→ Branch
→ Department
→ Position

Employee
→ Attendance
→ Leave
→ Payroll
→ Benefits
→ Performance
→ Training
→ Documents

Applicant
→ Recruitment
→ Onboarding
→ Employee

Use:

- Primary keys
- Foreign keys
- Unique constraints
- Indexes
- Appropriate status enums
- Created/updated timestamps
- Soft deletion where appropriate
- Audit history

Do not store calculated values unnecessarily when they can be reliably derived from source records.

---

# UI / UX REQUIREMENTS

Maintain the existing Mspaces visual identity:

- Red
- Black
- White
- Minimalist
- Professional HR/business application

Reuse existing components.

Do not create multiple versions of the same component.

Create reusable components for:

- Data tables
- Search
- Filters
- Forms
- Modals
- Confirmation dialogs
- Status badges
- File upload
- Document preview
- Employee selectors
- Branch selectors
- Date ranges
- Charts
- Empty states
- Error states
- Loading states

---

# LOADING UI

Every page must have a corresponding `loading.js`.

The loading skeleton must closely match the actual page layout.

For example:

Dashboard
→ Dashboard skeleton

Employee table
→ Table skeleton

Employee profile
→ Profile skeleton

Leave page
→ Leave table/card skeleton

Payroll
→ Payroll table/salary skeleton

Reports
→ Chart/report skeleton

Do NOT use one generic loading skeleton for every page.

The skeleton should preserve:

- Approximate spacing
- Component dimensions
- Number of cards
- Table structure
- Header structure
- Tabs
- Filters

This should prevent major layout shifts during loading.

---

# AI ASSISTANT

Expand the existing AI assistant into an HR-aware assistant.

The assistant should be able to help authorized users:

- Search employee information
- Find missing employee documents
- Identify expiring documents
- Summarize attendance
- Summarize leave utilization
- Explain payroll records to authorized users
- Summarize HR reports
- Identify employees with missing requirements
- Help prepare HR reports
- Search training/certification records
- Assist with onboarding checklists

The AI assistant must respect the same RBAC and branch restrictions as the logged-in user.

An HR employee must NEVER be able to ask the AI assistant to bypass permissions.

For example:

If a STAFF user asks:

"Show me another employee's salary."

The AI must refuse because the user does not have permission.

If an HR_ADMIN asks:

"Show employees with contracts expiring within 30 days."

The AI can provide the information allowed by their scope.

---

# IMPLEMENTATION RULES

Before modifying code:

1. Inspect the current repository.
2. Identify existing modules.
3. Identify reusable components.
4. Identify current database entities.
5. Identify existing API/service architecture.
6. Identify current authentication/RBAC.
7. Identify existing loading.js files.
8. Identify existing employee/leave/branch functionality.
9. Reuse existing patterns.
10. Avoid unnecessary rewrites.

Implement the system incrementally.

Recommended implementation order:

### Phase 1
Employee Information
→ Employee 201 File
→ Documents
→ Departments
→ Positions

### Phase 2
Attendance
→ Timekeeping
→ Overtime
→ Tardiness
→ Absences

### Phase 3
Leave
→ Leave Types
→ Leave Balances
→ Leave Filing
→ Approval Workflow

### Phase 4
Employee Self-Service
→ My Portal
→ My Profile
→ My Leave
→ My Attendance
→ My Documents

### Phase 5
Payroll
→ Compensation
→ Deductions
→ Payroll Period
→ Payslips
→ Payroll Integration Layer

### Phase 6
Recruitment
→ Applicants
→ Hiring
→ Onboarding

### Phase 7
Performance
→ Goals
→ Evaluations
→ Development Plans

### Phase 8
Training & Development
→ Training
→ Certifications
→ Skills

### Phase 9
Benefits
→ Benefit Plans
→ Enrollment
→ Contributions
→ Payroll Integration

### Phase 10
Reports & Analytics
→ HR Dashboard
→ Reports
→ Export

### Phase 11
Compliance
→ Documents
→ Expiration Tracking
→ Audit Trail

---

# IMPORTANT IMPLEMENTATION PRINCIPLE

Do not simply add pages.

Build an interconnected HR platform where information flows between modules.

Example:

An employee is hired in Recruitment.

That employee becomes an Employee record.

The Employee record creates the 201 file.

The employee receives a branch and position.

The employee receives a user account.

The employee starts generating attendance.

Attendance affects leave/absence and payroll calculations.

Leave affects leave balances and potentially payroll.

Payroll uses compensation, attendance, overtime, deductions, and benefits.

Training and performance become part of the employee's development record.

Reports aggregate information from these modules.

The Employee Self-Service portal exposes only the employee's own authorized information.

Every sensitive operation is protected by RBAC and recorded in the audit trail.

---

# DEFINITION OF DONE

The implementation is considered complete only when:

- Existing functionality still works.
- No existing RBAC rules are bypassed.
- All new APIs have authorization checks.
- Employee data is normalized.
- Employee records are reused across modules.
- Branch-level access is enforced.
- Sensitive HR information is protected.
- Documents use secure storage.
- Audit logging is implemented for sensitive actions.
- Every page has an appropriate loading.js.
- Loading skeletons match the real page layout.
- Forms have client-side and server-side validation.
- Database constraints protect data integrity.
- Empty states are implemented.
- Error states are implemented.
- Success/error notifications are implemented.
- Mobile/responsive behavior is maintained.
- Existing Mspaces UI design is preserved.
- No unnecessary duplicate components are introduced.
- No unnecessary duplicate database entities are introduced.
- Payroll is designed for future automation/integration.
- AI assistant follows the same authorization rules as the application.
- Existing features are regression-tested after implementation.

Before finishing, run the project's available:

- Type checking
- Linting
- Build
- Database migration checks
- API tests
- Existing tests

Fix all introduced errors before considering the implementation complete.