import { validateInquiryResponse } from "./contracts";
export type Lookup = {
  id: string;
  kind: string;
  label: string;
  position: number;
  active: boolean;
  reservable: boolean;
};
export type Metadata = {
  branches: { id: string; name: string }[];
  staff: { id: string; name: string; branchId: string | null }[];
  lookups: Lookup[];
  permissions: Record<string, boolean>;
  userId: string;
};
export type Inquiry = {
  id: string;
  reference: string;
  branchId: string;
  branchName: string;
  customerId: string | null;
  clientName: string;
  client: {
    companyName?: string;
    contactPerson?: string;
    phone?: string;
    email?: string;
  };
  inquiryDate: string | null;
  assignedStaffId: string;
  assignedStaffName: string | null;
  status: string;
  priority: string;
  description: string;
  requirements: string;
  notes: string;
  budget: number | null;
  pax: number | null;
  preferredStart: string | null;
  preferredEnd: string | null;
  channelId: string | null;
  sourceId: string | null;
  nextAction: string | null;
  legacyOutcome: string | null;
  archivedAt: string | null;
  version: number;
  preferredBranchIds: string[];
  serviceIds: string[];
};
export type InquiryTask = {
  version?: number;
  actionType?: string;
  priority?: string;
  id: string;
  inquiryId?: string;
  reference?: string;
  clientName?: string;
  description: string;
  dueAt: string;
  status: string;
  result: string | null;
  assignedStaffId: string;
  assignedStaffName?: string;
};
export type Detail = {
  importSource?: {
    batchId: string;
    worksheet: string;
    rowNumber: number;
    importedAt: string;
    normalized: {
      warnings?: string[];
      raw?: unknown[];
      reservationDate?: string | null;
      followUpDate?: string | null;
    };
  } | null;
  reservations?: {
    id: string;
    reference: string;
    status: string;
    startAt: string;
    endAt: string;
  }[];
  record: Inquiry;
  events: {
    id: string;
    type: string;
    description: string;
    previousStatus: string | null;
    newStatus: string | null;
    occurredAt: string | null;
    createdAt: string;
    actorName: string | null;
  }[];
  tasks: InquiryTask[];
};
export type Collection = {
  items: Inquiry[];
  total: number;
  page: number;
  pageSize: number;
};
export type Analytics = {
  totals: Record<string, number>;
  groups: Record<
    string,
    {
      label: string;
      count: number;
      converted: number;
      staffId?: string | null;
      branchId?: string;
    }[]
  >;
  followups: { today: number; overdue: number; completed: number };
};
export const statuses = [
  "NEW",
  "IN_PROGRESS",
  "FOLLOW_UP",
  "NO_RESPONSE",
  "OCULAR_SCHEDULED",
  "PROPOSAL_SENT",
  "PENDING_RESERVATION",
  "RESERVED",
  "CONVERTED",
  "LOST",
  "CLOSED",
  "NEEDS_REVIEW",
];
export const label = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
export async function inquiryApi<T>(
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(`/api/inquiries${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    ...(body === undefined
      ? {}
      : {
          method,
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
        }),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? data.message
        : null;
    throw new Error(
      Array.isArray(message)
        ? message.join(". ")
        : typeof message === "string"
          ? message
          : "Inquiry service is unavailable.",
    );
  }
  return validateInquiryResponse(path, data, body !== undefined) as T;
}
