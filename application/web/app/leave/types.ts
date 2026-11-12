export type Policy = {
  annualDays: number;
  paid: boolean;
  eligibility: "ACTIVE" | "REGULAR" | "ASSIGNED";
  frequency: "ANNUAL" | "MANUAL";
  halfDay: boolean;
  attachmentRule: "OPTIONAL" | "REQUIRED" | "NONE";
  automaticAllocation: boolean;
  blockInsufficient: boolean;
  minimumServiceMonths: number;
  minimumNoticeDays?: number;
  employmentTypes: string[];
  branchId: string | null;
  allowApprovedCancellation: boolean;
  carryover: "NONE";
};
export type LeaveType = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  version: number;
  effectiveFrom: string;
  policy: Policy;
};
export type Context = {
  userId: string;
  ownEmployee: { id: string; name: string; branchId: string } | null;
  canReview: boolean;
  canConfigure: boolean;
  globalScope: boolean;
  branches: Array<{ id: string; name: string }>;
  employees: Array<{ id: string; name: string; branchId: string }>;
};
export type Balance = {
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  typeId: string;
  typeName: string;
  code: string;
  allocated: number;
  adjustments: number;
  used: number;
  restored: number;
  reserved: number;
  available: number;
  year: number;
};
export type UnpaidUsage = {
  typeId: string;
  typeName: string;
  code: string;
  approvedDays: number;
  pendingDays: number;
  approvedRequests: number;
  pendingRequests: number;
};
export type PersonalOverview = {
  year: number;
  balances: Balance[];
  unpaid: UnpaidUsage[];
};
export type Request = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  typeId: string;
  typeName: string;
  typeCode: string;
  creditYear: number;
  startDate: string;
  endDate: string;
  days: number;
  halfDay: boolean;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
  cancellationReviewStatus?: "AWAITING_EMPLOYEE" | "AWAITING_REVIEW" | null;
  policy: Policy;
  submittedAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  fileName: string | null;
};
export type Detail = {
  request: Request;
  cancellationReview: {
    id: string;
    origin: "EMPLOYEE" | "REVIEWER";
    status: "AWAITING_EMPLOYEE" | "AWAITING_REVIEW";
    reason: string;
    response: string | null;
    proposedStart: string | null;
    proposedEnd: string | null;
    createdAt: string;
  } | null;
  balance: Pick<Balance, "available" | "reserved"> | null;
  events: Array<{
    id?: string;
    actorId?: string;
    actorRole?: string | null;
    action: string;
    comment: string | null;
    actor: string;
    createdAt: string;
  }>;
  canReview: boolean;
};
export type Page = {
  items: Request[];
  total: number;
  page: number;
  limit: number;
};
export type Preview = {
  days: number;
  available: number | null;
  reserved: number;
  afterApproval: number | null;
  fallback: boolean;
};
export type TypeBreakdown = {
  typeId: string;
  typeName: string;
  code: string;
  paid: boolean;
  active: boolean;
  effectiveFrom: string;
  used: number;
  available: number;
  reserved: number;
  approvedUnpaidDays: number;
  pendingUnpaidDays: number;
};
export type Report = {
  typeBreakdown: TypeBreakdown[];
  year: number;
  from: string;
  to: string;
  asOf: string;
  basis: string;
  balances: Balance[];
  requests: Array<
    Pick<
      Request,
      | "id"
      | "employeeName"
      | "branchName"
      | "typeName"
      | "typeId"
      | "days"
      | "status"
      | "startDate"
      | "endDate"
    > & { paid: boolean }
  >;
};
export type Section = "mine" | "requests" | "balances" | "settings" | "reports";
