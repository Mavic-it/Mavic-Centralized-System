export type ObCalculation = {
  actualIn: string | null;
  actualOut: string | null;
  workedMinutes: number;
  obCreditedMinutes?: number;
  actualWorkedMinutes?: number;
  exceptions: string[];
  statuses: string[];
  payrollReady: boolean;
  schedule: {
    shiftStart: string;
    shiftEnd: string;
    breakMinutes: number;
  } | null;
};
export type ObRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  workDate: string;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  destination: string;
  destinationBranchId: string | null;
  reason: string;
  retrospectiveReason: string;
  status: string;
  version: number;
  cancellationPending: boolean;
  officeContinuity: boolean;
  createdAt: string;
  canReview?: boolean;
  isOwner?: boolean;
  preview: ObCalculation;
  continuityPreview: ObCalculation;
  events?: {
    action: string;
    comment: string;
    createdAt: string;
    actor: string;
  }[];
};
export type ObContext = {
  ownEmployee: { id: string; name: string } | null;
  canReview: boolean;
  canFile: boolean;
  employees: { id: string; name: string; branchId: string }[];
  branches: { id: string; name: string }[];
};
export type ObRangePreview = {
  calculation: ObCalculation;
  days?: { workDate: string; calculation: ObCalculation }[];
  skipped?: string[];
};
export type ObDraft = {
  employeeId?: string;
  workDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  nextDay?: boolean;
  destination: string;
  destinationBranchId?: string;
  reason: string;
  retrospectiveReason?: string;
  submissionKey: string;
};
