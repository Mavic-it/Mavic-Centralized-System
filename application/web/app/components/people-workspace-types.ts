import type { WorkspaceAccount, WorkspaceEmployee } from "../data/people";

export type PeopleWorkspaceMode =
  "hr" | "employees" | "employee-profile" | "me" | "users";

export type PeopleWorkspaceProps = {
  mode: PeopleWorkspaceMode;
  employeeId?: string;
};

export type UserApiRecord = {
  id: string;
  lastLoginAt?: string | null;
  employeeId?: string | null;
  profilePictureUpdatedAt?: string | null;
  name: string;
  email: string;
  role: WorkspaceAccount["role"];
  branchAccessMode?: "ASSIGNED" | "SELECTED" | "ALL";
  accessibleBranches?: { id: string; name: string }[];
  branchId?: string | null;
  branchName?: string | null;
  status: WorkspaceAccount["status"];
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: string | null;
  credentialEmailStatus?: WorkspaceAccount["credentialEmailStatus"];
  credentialEmailSentAt?: string | null;
};

export type EmployeeApiRecord = {
  id: string;
  employeeNumber: string;
  name: string;
  email: string;
  hasUserAccount?: boolean;
  branchId: string;
  branchName?: string | null;
  workBranches?: { id: string; name: string }[];
  profilePictureUpdatedAt?: string | null;
  position: string;
  department: string;
  status: WorkspaceEmployee["status"];
  employment?: {
    workBranchIds?: string[];
    allWorkBranches?: boolean;
    employeeType?: WorkspaceEmployee["employmentType"];
    startDate?: string;
    endDate?: string;
    probationEndDate?: string | null;
    evaluationDueDate?: string | null;
  };
  emergencyContact?: WorkspaceEmployee["emergencyContact"];
  governmentIds?: Array<{ label?: string; maskedNumber?: string } | string>;
  documents?: Array<
    { label?: string; kind?: string; updated?: string } | string
  >;
  phone?: string | null;
  manager?: string | null;
  managerEmployeeId?: string | null;
  attendance?: WorkspaceEmployee["attendance"];
};

export type EmployeeAssignmentHistoryApiRecord = {
  id: string;
  employeeId: string;
  branchId: string;
  branchName: string;
  departmentId: string | null;
  department: string;
  positionId: string | null;
  position: string;
  manager: string | null;
  managerEmployeeId: string | null;
  employmentType: NonNullable<WorkspaceEmployee["employmentType"]>;
  status: WorkspaceEmployee["status"];
  eventType:
    | "INITIAL"
    | "TRANSFER"
    | "PROMOTION"
    | "STATUS_CHANGE"
    | "ASSIGNMENT_CHANGE";
  effectiveDate: string | null;
  changedBy: string | null;
  changedByName?: string | null;
  recordedAt: string;
};

export type EmployeeDocumentApiRecord = {
  id: string;
  employeeId: string;
  category: "GOVERNMENT_ID" | "CONTRACT_RECORD";
  requirementId?: string | null;
  documentType: string;
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  hasFile: boolean;
  uploadedBy: string;
  expirationDate: string | null;
  status: "ACTIVE" | "EXPIRED" | "ARCHIVED";
  version: number;
  createdAt: string;
};

export type EmployeeDocumentCategory = EmployeeDocumentApiRecord["category"];

export type EmployeeHrProfileApiRecord = {
  employeeId: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  civilStatus: string | null;
  nationality: string | null;
  personalEmail: string | null;
  currentAddress: string | null;
  permanentAddress: string | null;
  jobLevel: string | null;
  salaryGrade: string | null;
  basicSalary: number | null;
  workSchedule: string | null;
  shift: string | null;
  probationary: boolean | null;
  regularizationDate: string | null;
  separationDate: string | null;
  separationReason: string | null;
};

export type AttendanceApiRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string | null;
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  source: "MANUAL" | "BIOMETRIC" | "IMPORT" | "API" | "LEAVE";
  status: string;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
};
