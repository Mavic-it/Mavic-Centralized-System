# MSPACES HRIS — Proposed Module Flows

> User-directed implementation override (2026-10-28): the user explicitly requested implementation of both sidebar modules using `.ai/prompts/feature.md`. The original planning-only restriction below is historical. Reviewer policy confirmed by the user: Super/HR admins and explicitly assigned Branch Managers. Runtime contract, limits and validation are maintained in `docs/TASKS_AND_INCIDENTS.md`. Main HRIS Phase 1 remains active; this request does not start unrelated later phases.

## Proposed Sidebar Names

| Sidebar label | Purpose | Visible to |
|---|---|---|
| **Tasks** | Assign work, track updates, and review completion | Super Admin, HR Admin / Branch Manager, assigned employees |
| **Incidents & Discipline** | Report workplace incidents, review potential violations, and manage disciplinary actions (DA) | Super Admin, authorized HR Admin / Branch Manager, employees (own cases only) |

**Recommended placement:** Sidebar → **Work Management** → **Tasks**; Sidebar → **HR Management** → **Incidents & Discipline**. These labels are for future navigation only.

---

## 1. Tasks

### Purpose
A simple work task module where authorized managers assign tasks and employees update their progress.

### Manager / Super Admin Flow

```text
Open Tasks
   ↓
View All / My Team Tasks (within authorized branches)
   ↓
Create Task
   ↓
Enter Title, Description, Priority, Due Date, Assignee, Branch (optional attachment)
   ↓
Assign Task → Employee receives notification
   ↓
Monitor task status and employee updates
   ↓
Review submitted completion
   ├─ Accept → Completed / Closed
   └─ Request Changes → In Progress
```

### Employee Flow

```text
Open Tasks
   ↓
See My Tasks (assigned to me)
   ↓
Open Task Details
   ↓
Start Task → In Progress
   ↓
Post progress update (% complete, comment, optional attachment)
   ↓
Mark Ready for Review
   ↓
Manager reviews
   ├─ Accepted → Completed
   └─ Changes Requested → Continue task and resubmit
```

### Suggested Statuses
`To Do` → `In Progress` → `For Review` → `Completed`

Alternative: `For Review` → `In Progress` when changes are requested. `Cancelled` is available to authorized managers.

### Simple Views
- **My Tasks:** Tasks assigned to the logged-in employee.
- **Team Tasks:** Create, assign, monitor, and review tasks (authorized managers only).
- **Task Details:** Description, assignee, due date, priority, progress timeline, comments, and attachments.

---

## 2. Incidents & Discipline

### Purpose
One confidential module for **incident reporting** and **disciplinary-action case management**. An incident report is **not automatically a proven violation** or a disciplinary action.

### Admin / Manager Flow (Reported Violation)

```text
Open Incidents & Discipline
   ↓
View authorized branch reports / cases
   ↓
Create Incident Report OR Review Submitted Report
   ↓
Record employee concerned, date, incident category,
      factual description, evidence, and reporter
   ↓
Initial Review / Fact-Finding
   ├─ Insufficient information → Request Details
   ├─ No violation / Resolved → Close with documented reason
   └─ Potential policy violation → Start Disciplinary Review
                                  ↓
                          Send Formal Notice (if required)
                                  ↓
                          Employee may submit explanation
                                  ↓
                          Authorized HR / Management Review
                                  ↓
                          Record decision / appropriate action
                                  ↓
                          Notify employee and close case
```

### Employee Flow (Self-Report or Report a Workplace Incident)

```text
Open Incidents & Discipline
   ↓
Choose Report an Incident
   ↓
Enter incident type, date, description, and optional evidence
   ↓
Submit Report
   ↓
Manager / HR receives notification
   ↓
Employee can track own report status and respond to follow-ups
   ↓
Receive outcome or closure notification as appropriate
```

### Employee Flow (When a Notice Is Issued)

```text
Receive private notification
   ↓
Open My Cases / Notice
   ↓
Read allegation or concern and attached details
   ↓
Acknowledge receipt (not an admission of guilt)
   ↓
Submit explanation and supporting documents if requested
   ↓
HR / Management reviews case
   ↓
Receive final decision and case status
```

### Suggested Report / Case Statuses

- **Incident report:** `Submitted` → `Under Review` → `Resolved / Closed` (or `Escalated to Disciplinary Review`).
- **Disciplinary case:** `Under Review` → `Notice Issued` → `Awaiting Response` → `Decision Pending` → `Closed`.

### Suggested Incident Categories
`Attendance / Tardiness`, `Absence / Timekeeping`, `Workplace Conduct`, `Policy / Procedure`, `Safety / Security`, `Other`.

**Important attendance rule:** A late attendance record can be flagged for human review, but it must **not automatically create a confirmed violation or penalty**. HR / management should verify approved leave, schedule adjustments, corrections, and company policy first.

### Simple Views
- **Report an Incident:** Employee incident submission form.
- **My Reports & Cases:** Employee-only reports, notices, responses, and status.
- **Incident Review:** Private inbox for authorized managers / HR.
- **Disciplinary Cases:** Restricted formal notices, explanations, decisions, and case history.

---

## 3. Access and Privacy Rules

| Action | Super Admin | HR Admin / Branch Manager | Employee |
|---|---|---|---|
| Create / assign tasks | Yes | Assigned branch / team | No |
| View tasks | Authorized tasks | Assigned branch / team | Own assigned tasks |
| Update task progress | When assigned | When assigned | Own assigned tasks |
| Review / close tasks | Yes | Assigned branch / team | No |
| Report incident | Yes | Yes | Yes |
| View incident / disciplinary records | Authorized scope only | Authorized branch / assigned cases only | Own submitted reports / own cases only |
| Investigate / issue formal notices / decide action | Authorized designated staff | Authorized designated staff only | No |
| Respond to own notice | If recipient | If recipient | Yes |

- Enforce permissions in the backend as well as in the UI.
- Send private notifications, not public dashboard exposure of disciplinary details.
- Keep an audit history of changes, assignments, progress updates, reports, notices, explanations, and decisions.
- Follow company policies and applicable due-process requirements before issuing disciplinary measures.

---

## 4. Future Sidebar Preview (Names Only)

```text
MSPACES HRIS
├── Dashboard
├── Employee Management
├── Attendance & DTR
├── Leave Management
├── Work Management
│   └── Tasks                       ← NEW
├── HR Management
│   └── Incidents & Discipline      ← NEW
├── Reports
└── Settings
```

**Scope for this plan:** Confirm the two sidebar labels and the high-level flow only. No development or database changes yet.
