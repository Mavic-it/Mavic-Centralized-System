import type { AnalyticsCategory } from './analytics.dto.js';
export type AggregateRow = { period: string; branchId: string; branch: string; status: string; count: number; amount: number; attention: number };
export type AnalyticsMetric = { label: string; value: number; definition: string };
export type AnalyticsPanel = {
  id: AnalyticsCategory; title: string; description: string; snapshot: boolean; href?: string;
  state: 'ready' | 'unavailable'; message?: string; amountLabel?: string; attentionLabel?: string;
  metrics: AnalyticsMetric[]; rows: AggregateRow[];
  breakdown?: { title: string; values: { label: string; value: number }[] };
  people?: { id: string; name: string; position: string; department: string; branch: string; href?: string }[];
  reservations?: { id: string; startAt: string; customer: string; room: string; branch: string; status: string }[];
  reservationTotal?: number;
  reservationPage?: number;
};
