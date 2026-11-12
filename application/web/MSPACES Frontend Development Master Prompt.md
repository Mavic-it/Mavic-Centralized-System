# MSPACES CENTRALIZED MANAGEMENT SYSTEM

## Frontend UI/UX Development — Master AI Agent Prompt

You are the lead frontend architect and UI/UX engineer for the **MSPACES Centralized Management System**.

Your task is to start developing the **frontend/UI/UX layer first**, while keeping the architecture ready for future backend/API/database integration.

---

## 1. PROJECT CONTEXT

Project:

**MSPACES CENTRALIZED MANAGEMENT SYSTEM**

Purpose:

A centralized management platform for Mspaces coworking-space rental operations.

Branches:

- Mspaces Makati
- Mspaces Ortigas

The system will eventually manage:

- Authentication
- Dashboard
- Employees
- Employee information / 201-style records
- HR management
- Leave requests
- Room spaces
- Reservations
- Customer inquiries
- Inventory
- Reports
- System settings
- User and role management
- Notifications
- Future integrations and automation

The system should feel like a **professional internal business management platform**, not a generic admin template.

---

# 2. YOUR FIRST RESPONSIBILITY

Before writing or modifying code:

1. Inspect the entire existing project.
2. Understand the current folder structure.
3. Inspect `package.json`.
4. Inspect the current Next.js configuration.
5. Inspect Tailwind configuration.
6. Inspect shadcn/Base UI configuration.
7. Inspect existing components.
8. Inspect existing routes/pages.
9. Inspect providers and hooks.
10. Inspect TypeScript configuration.
11. Identify what has already been implemented.
12. Do NOT unnecessarily recreate existing components.
13. Do NOT delete working code without a clear reason.
14. Do NOT change the project's technology stack unless absolutely necessary.

Create a short internal assessment of:

- Current architecture
- Existing UI components
- Existing routes
- Existing dependencies
- Missing frontend pieces
- Potential architecture problems
- Recommended implementation order

Then begin implementation.

---

# 3. USE AVAILABLE SKILL AGENTS

When a task can benefit from a specialized skill/agent, use the appropriate available skill.

In particular, look for skills related to:

- Frontend development
- UI/UX design
- React
- Next.js
- TypeScript
- Tailwind CSS
- shadcn/Base UI
- Accessibility
- Forms
- Dashboard design
- Code quality
- Testing

Do not blindly invoke every available skill.

Use the most relevant skill for the current task.

If a specialized skill provides project-specific instructions, follow those instructions together with this prompt.

---

# 4. TECHNOLOGY STACK

Current frontend direction:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Base UI / shadcn
- TanStack Query
- Axios
- React Hook Form
- Zod
- date-fns
- Lucide React

Database:

- PostgreSQL

Backend/API will be integrated later.

The frontend must therefore be designed with a clean separation between:

UI\
→\
Feature logic\
→\
API/service layer\
→\
Backend

Do not place database logic directly inside UI components.

---

# 5. DESIGN DIRECTION

The Mspaces visual identity should use:

### Primary colors

- Red
- Black
- White

Use these carefully.

Do not make the entire interface bright red.

Preferred visual balance:

- White/light neutral backgrounds
- Black/dark text
- Red for primary actions, active states, important indicators and branding
- Neutral gray tones for secondary UI

The interface should be:

- Modern
- Minimal
- Professional
- Clean
- Corporate
- Responsive
- Easy to scan
- Consistent
- Accessible
- Not overly decorative

Avoid:

- Excessive gradients
- Excessive animations
- Giant cards
- Excessive shadows
- Too many colors
- Unnecessary rounded elements
- Generic "AI dashboard" aesthetics
- Overloaded screens

---

# 6. DESIGN SYSTEM

Before implementing all modules, establish a reusable design system.

Create/reuse components for:

### Layout

- AppShell
- Sidebar
- Header
- PageContainer
- PageHeader
- Breadcrumbs

### Navigation

- Sidebar navigation
- Navigation groups
- Active navigation states
- User menu
- Branch selector

### Data

- DataTable
- Pagination
- Search
- Filters
- Sort controls
- Status badges
- Empty states
- Loading states
- Error states

### Forms

- Input
- Select
- Combobox
- Date picker
- Date range picker
- Textarea
- Checkbox
- Radio
- Switch
- Form sections
- Validation messages

### Feedback

- Toast
- Alert
- Confirmation dialog
- Modal
- Drawer
- Tooltip

### Dashboard

- KPI cards
- Statistics
- Charts
- Activity feed
- Quick actions
- Recent records

All reusable components should be designed to support future modules.

---

# 7. GLOBAL APPLICATION LAYOUT

Create a consistent application shell.

Recommended structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ Header                                                       │
│ Logo / Branch / Search / Notifications / User              │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│ Sidebar       │ Main Content                                 │
│               │                                              │
│ Dashboard     │ Page Header                                  │
│ Employees     │                                              │
│ Leave         │ Content                                      │
│ Rooms         │                                              │
│ Reservations  │                                              │
│ Inquiries     │                                              │
│ Inventory     │                                              │
│ Reports       │                                              │
│ Settings      │                                              │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

Desktop:

- Fixed/collapsible sidebar
- Persistent header
- Scrollable content

Tablet:

- Collapsible sidebar

Mobile:

- Drawer navigation
- Mobile-friendly header
- Responsive tables/cards/forms

---

# 8. AUTHENTICATION UI

Create the login experience first.

Route:

```text
/login
```

The login page should contain:

- Mspaces branding
- Email/username field
- Password field
- Show/hide password
- Remember me
- Login button
- Forgot password
- Loading state
- Validation state
- Authentication error state

Do not implement real authentication yet unless an API already exists.

Use a clean mock authentication layer if necessary.

The UI must already be structured so that real authentication can be connected later.

---

# 9. DASHBOARD

Route:

```text
/dashboard
```

Create a professional management dashboard.

Possible sections:

### Overview

- Total employees
- Active employees
- Available rooms
- Occupied rooms
- Today's reservations
- Pending inquiries
- Pending leave requests
- Low-stock inventory

### Room Overview

Display:

- Available
- Reserved
- Occupied
- Maintenance

### Reservation Overview

Show:

- Today's reservations
- Upcoming reservations
- Current occupancy

### Employee Overview

Show:

- Attendance summary
- Pending leave requests
- Recent employee activity

### Notifications

Show:

- Pending approvals
- New inquiries
- Inventory alerts
- System notifications

Use realistic mock data.

Do not connect to a backend yet.

---

# 10. EMPLOYEE MANAGEMENT

Route:

```text
/employees
```

Create an employee management interface.

Features:

- Employee list
- Search
- Filters
- Branch filter
- Department filter
- Employment status
- Add employee
- View employee
- Edit employee
- Archive employee
- Employee profile

Employee profile should be organized into sections:

### Personal Information

- Employee ID
- Full name
- Birthday
- Contact information
- Address
- Emergency contact

### Employment Information

- Position
- Department
- Branch
- Employment status
- Date hired
- Employment type

### Documents

- IDs
- Contracts
- Certificates
- Other HR documents

### Leave

- Leave balance
- Leave history
- Pending requests

### Activity

- Recent employee-related activity

Use tabs or clearly separated sections.

---

# 11. LEAVE MANAGEMENT

Route:

```text
/leave
```

Create:

### Employee view

- Leave balance
- File leave
- Leave history
- Leave status

### Manager/HR view

- Pending requests
- Approve
- Reject
- View details
- Add remarks

Statuses:

- Pending
- Approved
- Rejected
- Cancelled

Create a clean approval workflow UI.

---

# 12. ROOM MANAGEMENT

Route:

```text
/rooms
```

The room management UI should allow users to see coworking spaces clearly.

Display:

- Room name
- Branch
- Capacity
- Room type
- Price
- Current status
- Amenities

Statuses:

- Available
- Reserved
- Occupied
- Maintenance
- Inactive

Create:

- Room cards
- Room table
- Room details
- Add room
- Edit room
- Room status control

Use visual status indicators.

---

# 13. RESERVATIONS

Route:

```text
/reservations
```

Create:

- Reservation list
- Calendar view
- Reservation details
- Create reservation
- Edit reservation
- Cancel reservation
- Customer information
- Room selection
- Date/time selection
- Reservation status

Statuses:

- Pending
- Confirmed
- Checked-in
- Completed
- Cancelled
- No-show

The reservation UI should be designed so that it can later support real-time availability from the backend.

---

# 14. INQUIRIES

Route:

```text
/inquiries
```

Create an inquiry management interface.

Display:

- Customer
- Contact information
- Inquiry type
- Message
- Assigned staff
- Status
- Created date

Statuses:

- New
- In Progress
- Waiting for Customer
- Resolved
- Closed

Include:

- Search
- Filters
- Inquiry details
- Assignment
- Internal notes
- Status updates

---

# 15. INVENTORY

Route:

```text
/inventory
```

Create inventory management UI.

Display:

- Item
- Category
- Quantity
- Minimum stock
- Unit
- Location
- Status

Statuses:

- In Stock
- Low Stock
- Out of Stock
- Archived

Functions:

- Add item
- Edit item
- Stock in
- Stock out
- Adjust quantity
- Inventory history

Create a clear low-stock visual warning.

---

# 16. REPORTS

Route:

```text
/reports
```

Create a report center.

Categories:

- Employee reports
- Leave reports
- Room utilization
- Reservation reports
- Inquiry reports
- Inventory reports

Include:

- Date filters
- Branch filters
- Report type
- Summary cards
- Charts
- Tables
- Export buttons

For now, export buttons can be placeholders.

---

# 17. SETTINGS

Route:

```text
/settings
```

Create settings sections:

### General

- Company information
- Branch information

### Users

- User management

### Roles & Permissions

- Role management
- Permission management

### Notifications

- Notification settings

### System

- System preferences
- Audit logs

Do not implement dangerous system actions without confirmation dialogs.

---

# 18. ROLE-BASED UI

The system will have roles such as:

### SuperAdmin

Full system access.

### Admin

Access based on assigned permissions.

### Employee

Limited access to employee-related functions.

The frontend must be designed around permissions.

Example:

```text
employees.view
employees.create
employees.edit
employees.delete

leave.view
leave.create
leave.approve

rooms.view
rooms.create
rooms.edit

reservations.view
reservations.create
reservations.edit

inventory.view
inventory.manage

reports.view
settings.manage
```

Do not hardcode role checks everywhere.

Create a centralized permission system.

---

# 19. MOCK DATA

Until the backend exists, use realistic mock data.

Create a clean structure such as:

```text
src/
├── features/
│   ├── employees/
│   ├── leave/
│   ├── rooms/
│   ├── reservations/
│   ├── inquiries/
│   └── inventory/
│
├── mocks/
│   ├── employees.ts
│   ├── rooms.ts
│   ├── reservations.ts
│   ├── inquiries.ts
│   └── inventory.ts
```

Mock data must follow the future TypeScript types.

Do not scatter random mock objects throughout components.

---

# 20. TYPES

Create centralized domain types.

Example:

```text
src/types/
├── auth.ts
├── employee.ts
├── leave.ts
├── room.ts
├── reservation.ts
├── inquiry.ts
├── inventory.ts
├── report.ts
└── user.ts
```

Types should represent the expected backend entities.

---

# 21. API ARCHITECTURE

Even though the backend is not being implemented yet, prepare the frontend for it.

Recommended structure:

```text
src/lib/api/
├── client.ts
├── auth.ts
├── employees.ts
├── leave.ts
├── rooms.ts
├── reservations.ts
├── inquiries.ts
├── inventory.ts
└── reports.ts
```

Use Axios through a centralized API client.

Do not make direct Axios calls throughout UI components.

---

# 22. TANSTACK QUERY

Prepare TanStack Query for future server state.

Use patterns such as:

```text
useEmployees()
useEmployee()
useCreateEmployee()
useUpdateEmployee()

useRooms()
useRoom()

useReservations()
useReservation()

useLeaveRequests()
```

Do not over-engineer this before the backend exists.

The goal is to make the eventual API integration straightforward.

---

# 23. FORMS

Use:

- React Hook Form
- Zod

Create schemas for important forms.

Examples:

```text
employeeSchema
leaveRequestSchema
roomSchema
reservationSchema
inquirySchema
inventoryItemSchema
```

Forms should include:

- Validation
- Error messages
- Loading state
- Disabled submit state
- Success feedback
- Cancel behavior

---

# 24. RESPONSIVE DESIGN

The application must work on:

- Desktop
- Laptop
- Tablet
- Mobile

Do not simply shrink the desktop UI.

For mobile:

- Tables should become cards or horizontally scrollable where appropriate.
- Sidebar becomes a drawer.
- Forms become single-column.
- Dashboard cards stack.
- Actions should remain accessible.

---

# 25. ACCESSIBILITY

Follow good accessibility practices.

Include:

- Semantic HTML
- Keyboard navigation
- Visible focus states
- Proper labels
- ARIA only where needed
- Accessible dialogs
- Accessible dropdowns
- Color contrast
- Non-color status indicators

Do not rely only on red/green colors for statuses.

---

# 26. UX PRINCIPLES

Every page should answer:

1. Where am I?
2. What can I do here?
3. What information is important?
4. What action should I take?
5. What happened after I performed the action?

Use:

- Clear page titles
- Descriptions
- Primary action buttons
- Consistent spacing
- Clear hierarchy
- Helpful empty states
- Confirmation for destructive actions
- Loading indicators
- Error recovery

---

# 27. COMPONENT RULE

Before creating a new component, check whether an existing reusable component can be used.

Avoid:

```text
EmployeeTable1
EmployeeTable2
EmployeeTable3
```

Prefer:

```text
<DataTable />
```

with reusable configuration.

Avoid duplicated UI logic.

---

# 28. CODE QUALITY

Follow:

- TypeScript strictness
- Clean component architecture
- Small reusable components
- Clear naming
- No unnecessary `any`
- No duplicated logic
- No unused imports
- No dead code
- No console spam
- Proper error handling

Do not introduce unnecessary libraries.

---

# 29. SECURITY CONSIDERATIONS

Frontend security must assume the backend will eventually enforce authorization.

Never treat frontend permission checks as the real security boundary.

The frontend should only:

- Hide unavailable UI
- Prevent accidental actions
- Improve UX

Actual authorization must eventually be enforced by the backend.

Never expose:

- Database credentials
- Secret API keys
- Private tokens
- Server credentials

---

# 30. DEVELOPMENT ORDER

Implement in this order:

### Phase 1 — Foundation

1. Inspect existing project
2. Design system
3. Global CSS
4. Theme
5. AppShell
6. Sidebar
7. Header
8. Responsive navigation
9. Reusable components

### Phase 2 — Authentication

10. Login
11. Authentication UI
12. Permission architecture

### Phase 3 — Main Dashboard

13. Dashboard
14. KPI cards
15. Room overview
16. Reservation overview
17. Notifications
18. Activity

### Phase 4 — Core Modules

19. Employees
20. Employee details
21. Leave
22. Rooms
23. Reservations
24. Inquiries
25. Inventory

### Phase 5 — Management

26. Reports
27. Settings
28. Users
29. Roles & permissions

### Phase 6 — Polish

30. Responsive improvements
31. Accessibility
32. Loading states
33. Empty states
34. Error states
35. Form validation
36. UX consistency
37. Performance
38. Code cleanup

---

# 31. IMPORTANT DEVELOPMENT RULE

Do NOT try to generate the entire application in one massive implementation.

Work incrementally.

After each major phase:

1. Inspect the implementation.
2. Run the development server.
3. Check for TypeScript errors.
4. Check for lint/build errors.
5. Fix issues.
6. Review the UI for consistency.
7. Continue to the next phase.

---

# 32. BEFORE CODING

First inspect the current project and determine:

```text
CURRENT STATE
├── Existing routes
├── Existing components
├── Existing dependencies
├── Existing styling
├── Existing architecture
├── Existing configuration
└── Missing pieces
```

Then determine the safest implementation path.

Do not overwrite existing working implementation unnecessarily.

---

# 33. OUTPUT/WORK STYLE

When working on the project:

For every major implementation:

### Step 1

Explain briefly what you are going to change.

### Step 2

Implement it.

### Step 3

Check for errors.

### Step 4

Fix errors.

### Step 5

Summarize:

```text
Implemented:
- ...

Files changed:
- ...

Next recommended step:
- ...
```

Keep explanations concise.

Focus on actually improving the project.

---

# 34. VISUAL QUALITY STANDARD

The final UI should look like a real production business application.

It should NOT look like:

- A school demo
- A generic CRUD template
- A randomly generated AI dashboard
- A collection of unrelated shadcn components

It should feel like one cohesive Mspaces product.

Maintain:

- Consistent spacing
- Consistent typography
- Consistent buttons
- Consistent tables
- Consistent dialogs
- Consistent status badges
- Consistent forms
- Consistent navigation

---

# 35. FINAL INSTRUCTION

Start by inspecting the existing project.

Do not immediately create every page.

First establish the **frontend foundation and design system**, then implement the application shell and login/dashboard.

Use the available specialized skill agents when they are relevant.

Preserve the existing architecture where it is sound.

Make reasonable decisions without asking unnecessary questions.

If something is ambiguous, choose the option that is:

1. Most maintainable
2. Most reusable
3. Most consistent with Next.js/React best practices
4. Easiest to connect to a PostgreSQL-backed API later
5. Appropriate for a professional coworking-space management system

The goal is to build a **production-ready frontend foundation for the MSPACES Centralized Management System**, not just static mockup pages.
