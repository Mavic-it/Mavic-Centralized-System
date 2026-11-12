import type { WorkScheduleDefinition } from './attendance.types.js';

export type DtrTemplate = {
  kind: 'AUTO' | 'PUNCH' | 'DAILY';
  headerRow?: number;
  sheets?: string[];
  dateOrder: 'MDY' | 'DMY' | 'ISO';
  date?: string;
  pairing: 'STRICT' | 'FIRST_LAST';
  fields?: Partial<
    Record<
      | 'date'
      | 'timestamp'
      | 'identifier'
      | 'name'
      | 'lastName'
      | 'device'
      | 'in'
      | 'out'
      | 'direction'
      | 'status'
      | 'shiftStart'
      | 'shiftEnd',
      string
    >
  >;
};
export type DtrSource = {
  sheet: string;
  row: number;
  kind: 'PUNCH' | 'DAILY';
  key: string;
  identifier: string;
  name: string;
  device: string;
  date: string | null;
  punch: string | null;
  direction: 'IN' | 'OUT' | 'UNKNOWN';
  actualIn: string | null;
  actualOut: string | null;
  shiftStart: string | null;
  shiftEnd: string | null;
  status: string;
  raw: Record<string, unknown>;
  errors: string[];
};
export type DtrPolicy = {
  breakStart: string | null;
  breakEnd: string | null;
  lateGraceMinutes: number;
  minimumOtMinutes: number;
  otIncrementMinutes: number;
};
export const DEFAULT_DTR_POLICY: DtrPolicy = {
  breakStart: null,
  breakEnd: null,
  lateGraceMinutes: 15,
  minimumOtMinutes: 50,
  otIncrementMinutes: 60,
};
export type DtrOverride = {
  actualIn?: string | null;
  actualOut?: string | null;
  shiftStart?: string;
  shiftEnd?: string;
  arrangement?: 'NORMAL' | 'WFH' | 'OB' | 'RD';
  remarks?: string;
  noOt?: boolean;
  approvedOtMinutes?: number;
  resolvedExceptions?: string[];
};
export type DtrCalculation = {
  officialBusiness?: import('./official-business/ob.types.js').ApprovedOb[];
  obCreditedMinutes?: number;
  actualWorkedMinutes?: number;
  attestedOfficeMinutes?: number;
  version: 'DTR-1';
  timeZone: string;
  actualIn: string | null;
  actualOut: string | null;
  schedule: WorkScheduleDefinition | null;
  lateMinutes: number;
  undertimeMinutes: number;
  potentialOtMinutes: number;
  approvedOtMinutes: number;
  workedMinutes: number;
  absent: number;
  scheduled: boolean;
  statuses: string[];
  exceptions: string[];
  payrollReady: boolean;
  restDay: boolean;
  holiday: string | null;
  leaveUnits: number;
  leaveTypes?: string[];
  paidLeaveUnits?: number;
  remarks: string;
  sourceStatus: string[];
  decisions: string[];
};
export type DtrData = {
  batchId: string;
  sourceKeys: string[];
  source: DtrSource[];
  override: DtrOverride;
  calculation: DtrCalculation;
  policy: DtrPolicy;
  pairing: DtrTemplate['pairing'];
  approval: 'DRAFT' | 'APPROVED';
  revision: number;
};
export type DtrRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  workDate: string;
  data: DtrData;
};
