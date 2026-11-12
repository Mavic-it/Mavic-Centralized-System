export type Template = {
  id: string;
  name: string;
  version: number;
  configuration: {
    kind: "AUTO" | "PUNCH" | "DAILY";
    dateOrder: "MDY" | "DMY" | "ISO";
    pairing: "STRICT" | "FIRST_LAST";
    headerRow?: number;
    sheets?: string[];
    fields?: Record<string, string>;
  };
};
export type Employee = { id: string; name: string; employeeNumber: string };
export type SourceRow = {
  kind?: "PUNCH" | "DAILY";
  sheet: string;
  row: number;
  key: string;
  date: string | null;
  name: string;
  identifier: string;
  punch: string | null;
  direction: string;
  actualIn: string | null;
  actualOut: string | null;
  status: string;
  errors: string[];
  raw: Record<string, unknown>;
};
export type Batch = {
  id: string;
  filename: string;
  status: string;
  dates: string[];
  sheets: string[];
  sourceCount: number;
  cutoff?: { from: string; to: string } | null;
  identities: {
    key: string;
    name: string;
    identifier: string;
    device: string;
    employeeId: string | null;
    suggestions: string[];
    matchMethod?: string;
    matchNote?: string | null;
  }[];
  rows: SourceRow[];
  duplicate: boolean;
};
export type Calculation = {
  obCreditedMinutes?: number;
  actualWorkedMinutes?: number;
  attestedOfficeMinutes?: number;
  officialBusiness?: {id:string;destination:string;start:string;end:string}[];
  timeZone: string;
  actualIn: string | null;
  actualOut: string | null;
  schedule: { shiftStart: string; shiftEnd: string } | null;
  lateMinutes: number;
  undertimeMinutes: number;
  potentialOtMinutes: number;
  approvedOtMinutes: number;
  workedMinutes: number;
  absent: number;
  statuses: string[];
  exceptions: string[];
  payrollReady: boolean;
  restDay: boolean;
  holiday: string | null;
  remarks: string;
  sourceStatus: string[];
  decisions: string[];
};
export type Override = {
  actualIn?: string | null;
  actualOut?: string | null;
  shiftStart?: string;
  shiftEnd?: string;
  arrangement?: "NORMAL" | "WFH" | "OB" | "RD";
  remarks?: string;
  noOt?: boolean;
  approvedOtMinutes?: number;
  resolvedExceptions?: string[];
};
export type RecordRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  workDate: string;
  data: {
    batchId: string;
    source: SourceRow[];
    override: Override;
    calculation: Calculation;
    approval: "DRAFT" | "APPROVED";
    revision: number;
  };
};
export type Settings = {
  policy: {
    breakStart: string | null;
    breakEnd: string | null;
    lateGraceMinutes: number;
    minimumOtMinutes: number;
    otIncrementMinutes: number;
  };
  holidays: Record<string, string>;
};
export type Configuration = {
  templates: Template[];
  employees: Employee[];
  settings: Settings;
  mappings: { key: string; employeeId: string }[];
};
export type Ledger = { rows: RecordRow[]; summary: Record<string, number> };
export type ImportCalculation = Ledger & {
  contextHash?: string;
  cutoff: { from: string; to: string };
  sourceCount: number;
  unmappedSourceRows: number;
  outsideCutoffRows: number;
  invalidSourceRows: number;
};
export type History = {
  batches: {
    id: string;
    filename: string;
    status: string;
    dates: string[];
    sourceCount: number;
    createdAt: string;
  }[];
  exports: {
    id: string;
    format: string;
    revision: number;
    generatedBy: string;
    generatedAt: string;
  }[];
  periods: {
    id: string;
    from: string;
    to: string;
    state: string;
    revision: number;
  }[];
};
export async function dtrRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/attendance/dtr/${path}`, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers:
      init?.body instanceof FormData
        ? init.headers
        : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: "Attendance request failed." }));
    throw new Error(
      Array.isArray(error.message)
        ? error.message.join(". ")
        : (error.message ?? "Attendance request failed."),
    );
  }
  return response.json() as Promise<T>;
}
export const jsonBody = (body: unknown, method = "POST"): RequestInit => ({
  method,
  body: JSON.stringify(body),
});
export function displayTime(value: string | null, timeZone: string): string {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(new Date(value))
    : "—";
}
