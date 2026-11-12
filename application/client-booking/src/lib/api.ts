import { z } from 'zod';
import { availabilitySchema, branchSchema, receiptSchema, spaceSchema, type Draft } from '@/types/booking';
const base = '/api';
export class BookingError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`${base}/public/booking/${path}`, { method: body ? 'POST' : 'GET', credentials: 'omit', cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) }); }
  catch { throw new BookingError('We couldn’t reach the booking service. Please try again.', 0); }
  if (!response.ok) {
    const data: unknown = await response.json().catch(() => null);
    const message = data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' ? data.message : 'Please check your details and try again.';
    throw new BookingError(response.status >= 500 ? 'The booking service is temporarily unavailable. Please try again.' : message, response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new BookingError('We couldn’t load the booking details. Please try again.', 502);
  return parsed.data;
}
export const api = {
  quote: (d: Draft) => request('quote',z.object({amount:z.number(),requiredAmount:z.number(),currency:z.literal('PHP')}),{branchId:d.branchId,roomId:d.roomId,startAt:d.startAt,endAt:d.endAt,guestCount:d.guestCount}),
  requestCancellation: (body: { reference: string; customerEmail: string; reason: string }) => request('cancellation-requests', z.object({ message: z.string() }), body),
  branches: () => request('branches', z.array(branchSchema)),
  spaces: (branchId: string) => request(`spaces?${new URLSearchParams({ branchId })}`, z.array(spaceSchema)),
  availability: (d: Pick<Draft,'branchId'|'roomId'|'date'|'guestCount'>) => request(`availability?${new URLSearchParams({ branchId: d.branchId, roomId: d.roomId, date: d.date, guestCount: String(d.guestCount) })}`, availabilitySchema),
  submit: (d: Draft, idempotencyKey: string) => {
    const { date: _date, ...input } = d;
    void _date;
    return request('reservations', receiptSchema, { ...input, idempotencyKey, acceptedTerms: true, termsVersion: '2026-11-v1' });
  },
};
