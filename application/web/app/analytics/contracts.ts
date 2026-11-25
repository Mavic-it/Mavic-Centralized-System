import { z } from 'zod';

export type AnalyticsMode = 'overview' | 'hr';
export type Filters = { branchId: string; from: string; to: string; category: string; grouping: string; status: string; reservationPage: number };
const branch = z.object({ id: z.string(), name: z.string() });
export const contextSchema = z.object({ branches: z.array(branch), categories: z.array(z.object({ id: z.string(), title: z.string() })), timeZone: z.string(), today: z.string(), notes: z.array(z.string()) });
const row = z.object({ period: z.string(), branchId: z.string(), branch: z.string(), status: z.string(), count: z.number().finite(), amount: z.number().finite(), attention: z.number().finite() });
const safeHref = z.string().refine(value => /^\/(?:employees|attendance|leave|reservations|inquiries|inventory|tasks|incidents|system\/users|branches)(?:[/?]|$)/.test(value));
export const panelSchema = z.object({
  id: z.string(), title: z.string(), description: z.string(), snapshot: z.boolean(), href: safeHref.optional(),
  state: z.enum(['ready', 'unavailable']), message: z.string().optional(), amountLabel: z.string().optional(), attentionLabel: z.string().optional(),
  metrics: z.array(z.object({ label: z.string(), value: z.number().finite(), definition: z.string() })), rows: z.array(row),
  breakdown: z.object({ title: z.string(), values: z.array(z.object({ label: z.string(), value: z.number().finite() })) }).optional(),
  people: z.array(z.object({ id: z.string(), name: z.string(), position: z.string(), department: z.string(), branch: z.string(), href: safeHref.optional() })).optional(),
  reservations: z.array(z.object({ id: z.string(), startAt: z.string(), customer: z.string().nullable(), room: z.string(), branch: z.string(), status: z.string() })).optional(), reservationTotal: z.number().optional(), reservationPage: z.number().optional(),
});
export const dataSchema = z.object({ generatedAt: z.string(), timeZone: z.string(), filters: z.object({ from: z.string(), to: z.string() }), branches: z.array(branch), panels: z.array(panelSchema) });
export type AnalyticsContext = z.infer<typeof contextSchema>;
export type Panel = z.infer<typeof panelSchema>;
export type ReportData = z.infer<typeof dataSchema>;
export class AnalyticsError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export async function getAnalytics<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/analytics/${path}`, { cache: 'no-store', signal });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message = z.object({ message: z.string() }).safeParse(body);
    throw new AnalyticsError(response.status === 403 ? 'You no longer have access to this report or branch. Reset the filters or refresh your access.' : response.status === 401 ? 'Your session has expired. Sign in again.' : message.success ? message.data.message : 'Reports could not be loaded. Please retry.', response.status);
  }
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new AnalyticsError('The report service returned an invalid response. Please retry.', 502);
  return parsed.data;
}
export function queryString(mode: AnalyticsMode, filters: Filters) {
  const params = new URLSearchParams({ mode });
  for (const [key, value] of Object.entries(filters)) if (value !== '') params.set(key, String(value));
  return params.toString();
}
export function datePreset(preset: string, today: string): Pick<Filters, 'from' | 'to'> {
  const date = new Date(`${today}T00:00:00Z`);
  const shift = (days: number) => new Date(date.getTime() + days * 86400000).toISOString().slice(0, 10);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'yesterday') return { from: shift(-1), to: shift(-1) };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'lastMonth') {
    const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 0)).toISOString().slice(0, 10);
    return { from: `${end.slice(0, 7)}-01`, to: end };
  }
  return { from: shift(preset === 'week' ? -6 : -29), to: today };
}
export const number = (value: number) => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(value);
export const humanize = (value: string) => value.toLowerCase().replaceAll('_', ' ').replace(/^\w/, c => c.toUpperCase());
