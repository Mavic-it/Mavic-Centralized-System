import { z } from 'zod';
export const branchSchema = z.object({ id: z.string(), name: z.string() });
export const spaceSchema = z.object({ id: z.string(), branchId: z.string(), branchName: z.string(), name: z.string(),
  imageData: z.string().nullable().optional(),
  type: z.enum(['MEETING_ROOM','CONFERENCE_ROOM','COWORKING_DESK']), capacity: z.number().int().positive(),
  description: z.string().nullable(), amenities: z.array(z.string()).catch([]), minMinutes: z.number(), maxMinutes: z.number(), bufferMinutes: z.number() });
export const availabilitySchema = z.object({ timezone: z.literal('Asia/Manila'), date: z.string(),
  slots: z.array(z.object({ startAt: z.string(), endTimes: z.array(z.string()) })),
  policy: z.object({ openTime: z.string(), closeTime: z.string(), allowedDays: z.array(z.number()), minAdvanceMinutes: z.number(), maxAdvanceDays: z.number(), autoConfirm: z.boolean(), slotMinutes: z.number() }) });
export const receiptSchema = z.object({ paymentRequired:z.boolean().optional(),paymentToken:z.string().optional(),amount:z.number().optional(),paymentDeadline:z.string().nullable().optional(), reference: z.string(), status: z.enum(['PENDING','CONFIRMED','REJECTED','CANCELLED','CHECKED_IN','COMPLETED','NO_SHOW']),
  startAt: z.string(), endAt: z.string(), guestCount: z.number(), branchName: z.string(), spaceName: z.string() });
export type Branch = z.infer<typeof branchSchema>;
export type Space = z.infer<typeof spaceSchema>;
export type Availability = z.infer<typeof availabilitySchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type Draft = { branchId: string; roomId: string; date: string; startAt: string; endAt: string; guestCount: number;
  purpose: string; customerName: string; customerEmail: string; customerPhone: string; companyName: string; specialRequests: string; website: string };
