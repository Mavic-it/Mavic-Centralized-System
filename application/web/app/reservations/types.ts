export type Branch = { id: string; name: string };
export type Space = {
  imageData?: string | null;
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  type: string;
  floor: string;
  capacity: number;
  description: string | null;
  hourlyRate: number;
  bufferMinutes: number;
  status: string;
  isActive: boolean;
  publicBookable?: boolean;
};
export type Booking = {
  source?: 'INTERNAL' | 'PUBLIC_PORTAL';
  id: string;
  reference: string;
  branchId: string;
  branchName: string;
  roomName: string | null;
  status: string;
  startAt: string;
  endAt: string;
  purpose: string;
  customerName: string;
  guestCount: number;
  amount: number;
  paymentStatus: string;
};
export type Summary = {
  today: number;
  upcoming: number;
  pending: number;
  checkedIn: number;
  completed: number;
  availableSpaces: number;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type Detail = {
  record: Record<string, unknown>;
  events: { action: string; reason: string | null; createdAt: string }[];
  payments: { amount: number; method: string; createdAt: string }[];
  customerHistory: {reference:string;status:string;startAt:string}[];
};

export async function reservationRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/reservations${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = await response
    .json()
    .catch(() => ({ message: "Unable to read the server response." }));
  if (!response.ok)
    throw new Error(
      Array.isArray(body.message)
        ? body.message.join(" ")
        : (body.message ?? "Request failed."),
    );
  return body as T;
}
export const qs = (values: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== undefined && v !== "") params.set(k, String(v));
  });
  return `?${params}`;
};
