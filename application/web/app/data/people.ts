export type WorkspaceRole =
  | "SUPER_ADMIN"
  | "IT_ADMIN"
  | "HR_ADMIN"
  | "BRANCH_MANAGER"
  | "STAFF"
  | "EMPLOYEE";

export type WorkspaceEmployee = {
  id: string;
  employeeNumber: string;
  name: string;
  email: string;
  hasUserAccount?: boolean;
  branchId?: string;
  workBranchIds?: string[];
  workBranches?: { id: string; name: string }[];
  allWorkBranches?: boolean;
  profilePictureUpdatedAt?: string | null;
  phone: string;
  position: string;
  department: string;
  branch: string;
  status: "ACTIVE" | "INACTIVE" | "RESIGNED" | "RETIRED" | "TERMINATED";
  employmentType:
    | "PROBATIONARY"
    | "REGULAR"
    | "PROJECT_BASED"
    | "CONTRACTUAL"
    | "FULL_TIME"
    | "PART_TIME"
    | "CONTRACT";
  probationEndDate?: string | null;
  evaluationDueDate?: string | null;
  hiredOn: string;
  manager: string;
  managerEmployeeId?: string | null;
  emergencyContact: { name: string; relationship: string; phone: string };
  governmentIds: { label: string; maskedNumber: string }[];
  documents: { label: string; kind: string; updated: string }[];
  attendance: {
    date: string;
    shift: string;
    timeIn: string;
    timeOut: string;
  }[];
};

export type WorkspaceAccount = {
  id: string;
  employeeId?: string | null;
  profilePictureUpdatedAt?: string | null;
  name: string;
  email: string;
  role: WorkspaceRole;
  branch: string;
  branchAccessMode?: "ASSIGNED" | "SELECTED" | "ALL";
  accessibleBranches?: { id: string; name: string }[];
  branchId?: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED" | "PENDING";
  mfa: "READY" | "NOT_CONFIGURED";
  activeSessions: number;
  lastSignIn: string;
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  credentialEmailStatus?:
    | "NOT_REQUIRED"
    | "PENDING"
    | "PROCESSING"
    | "ACCEPTED_BY_PROVIDER"
    | "FAILED";
  credentialEmailSentAt?: string | null;
};

export const workspaceEmployees: WorkspaceEmployee[] = [
  {
    id: "emp-0104",
    employeeNumber: "MS-0104",
    name: "Maya Santos",
    email: "maya.santos@mspaces.example",
    phone: "+63 917 555 0104",
    position: "People Operations Lead",
    department: "Human Resources",
    branch: "Makati",
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    hiredOn: "2022-06-13",
    manager: "Gabriel Lim",
    emergencyContact: {
      name: "Elena Santos",
      relationship: "Parent",
      phone: "+63 917 555 0190",
    },
    governmentIds: [
      { label: "SSS", maskedNumber: "•••-•••-•104" },
      { label: "PhilHealth", maskedNumber: "••••-••••-0104" },
      { label: "TIN", maskedNumber: "•••-•••-104-•••" },
    ],
    documents: [
      {
        label: "Employment contract",
        kind: "Contract",
        updated: "Jun 13, 2022",
      },
      {
        label: "Government ID copy",
        kind: "Identity",
        updated: "Jan 08, 2025",
      },
      {
        label: "Employee handbook acknowledgment",
        kind: "HR form",
        updated: "Jan 08, 2025",
      },
    ],
    attendance: [
      {
        date: "Sep 29",
        shift: "09:00 AM – 06:00 PM",
        timeIn: "08:54 AM",
        timeOut: "—",
      },
      {
        date: "Sep 28",
        shift: "09:00 AM – 06:00 PM",
        timeIn: "08:58 AM",
        timeOut: "06:04 PM",
      },
      {
        date: "Sep 27",
        shift: "09:00 AM – 06:00 PM",
        timeIn: "09:06 AM",
        timeOut: "06:01 PM",
      },
    ],
  },
  {
    id: "emp-0118",
    employeeNumber: "MS-0118",
    name: "Paolo Reyes",
    email: "paolo.reyes@mspaces.example",
    phone: "+63 917 555 0118",
    position: "Community Manager",
    department: "Operations",
    branch: "Ortigas",
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    hiredOn: "2023-02-06",
    manager: "Andrea Cruz",
    emergencyContact: {
      name: "Luis Reyes",
      relationship: "Sibling",
      phone: "+63 917 555 0120",
    },
    governmentIds: [
      { label: "SSS", maskedNumber: "•••-•••-•118" },
      { label: "PhilHealth", maskedNumber: "••••-••••-0118" },
    ],
    documents: [
      {
        label: "Employment contract",
        kind: "Contract",
        updated: "Feb 06, 2023",
      },
      {
        label: "Government ID copy",
        kind: "Identity",
        updated: "Feb 06, 2023",
      },
    ],
    attendance: [
      {
        date: "Sep 29",
        shift: "08:00 AM – 05:00 PM",
        timeIn: "07:53 AM",
        timeOut: "—",
      },
      {
        date: "Sep 28",
        shift: "08:00 AM – 05:00 PM",
        timeIn: "08:03 AM",
        timeOut: "05:01 PM",
      },
    ],
  },
  {
    id: "emp-0132",
    employeeNumber: "MS-0132",
    name: "Bianca Cruz",
    email: "bianca.cruz@mspaces.example",
    phone: "+63 917 555 0132",
    position: "Workplace Associate",
    department: "Member Experience",
    branch: "Makati",
    status: "ACTIVE",
    employmentType: "FULL_TIME",
    hiredOn: "2024-03-18",
    manager: "Gabriel Lim",
    emergencyContact: {
      name: "Ramon Cruz",
      relationship: "Parent",
      phone: "+63 917 555 0133",
    },
    governmentIds: [{ label: "SSS", maskedNumber: "•••-•••-•132" }],
    documents: [
      {
        label: "Employment contract",
        kind: "Contract",
        updated: "Mar 18, 2024",
      },
      {
        label: "Emergency contact form",
        kind: "HR form",
        updated: "Mar 18, 2024",
      },
    ],
    attendance: [
      {
        date: "Sep 29",
        shift: "10:00 AM – 07:00 PM",
        timeIn: "09:51 AM",
        timeOut: "—",
      },
      {
        date: "Sep 28",
        shift: "10:00 AM – 07:00 PM",
        timeIn: "09:59 AM",
        timeOut: "07:07 PM",
      },
    ],
  },
  {
    id: "emp-0141",
    employeeNumber: "MS-0141",
    name: "Jules Navarro",
    email: "jules.navarro@mspaces.example",
    phone: "+63 917 555 0141",
    position: "Facilities Coordinator",
    department: "Operations",
    branch: "Ortigas",
    status: "INACTIVE",
    employmentType: "CONTRACT",
    hiredOn: "2024-09-02",
    manager: "Andrea Cruz",
    emergencyContact: {
      name: "Nina Navarro",
      relationship: "Partner",
      phone: "+63 917 555 0142",
    },
    governmentIds: [{ label: "SSS", maskedNumber: "•••-•••-•141" }],
    documents: [
      {
        label: "Fixed-term agreement",
        kind: "Contract",
        updated: "Sep 02, 2024",
      },
    ],
    attendance: [],
  },
];

export const workspaceAccounts: WorkspaceAccount[] = [
  {
    id: "usr-001",
    name: "Maya Santos",
    email: "maya.santos@mspaces.example",
    role: "SUPER_ADMIN",
    branch: "All branches",
    status: "ACTIVE",
    mfa: "READY",
    activeSessions: 2,
    lastSignIn: "Today, 08:42 AM",
  },
  {
    id: "usr-002",
    name: "Paolo Reyes",
    email: "paolo.reyes@mspaces.example",
    role: "BRANCH_MANAGER",
    branch: "Ortigas",
    status: "ACTIVE",
    mfa: "NOT_CONFIGURED",
    activeSessions: 1,
    lastSignIn: "Today, 07:53 AM",
  },
  {
    id: "usr-003",
    name: "Bianca Cruz",
    email: "bianca.cruz@mspaces.example",
    role: "EMPLOYEE",
    branch: "Makati",
    status: "PENDING",
    mfa: "NOT_CONFIGURED",
    activeSessions: 0,
    lastSignIn: "Never",
  },
  {
    id: "usr-004",
    name: "Jules Navarro",
    email: "jules.navarro@mspaces.example",
    role: "STAFF",
    branch: "Ortigas",
    status: "INACTIVE",
    mfa: "NOT_CONFIGURED",
    activeSessions: 0,
    lastSignIn: "Sep 18, 2026",
  },
];

export const workspaceAnnouncements = [
  {
    title: "Quarterly town hall",
    detail: "Join the team update in the Makati collaboration lounge.",
    date: "Oct 07, 2026",
    category: "Company",
  },
  {
    title: "Updated building access hours",
    detail: "Please review the revised visitor and after-hours process.",
    date: "Sep 24, 2026",
    category: "Operations",
  },
];

export const workspacePayslips = [
  { period: "September 2026", issued: "Sep 25, 2026", amount: "₱ 38,450.00" },
  { period: "August 2026", issued: "Aug 25, 2026", amount: "₱ 38,450.00" },
];

export function roleLabel(role: WorkspaceRole): string {
  if (role === "IT_ADMIN") return "IT Admin";
  if (role === "HR_ADMIN") return "HR Admin";

  return role
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
}
