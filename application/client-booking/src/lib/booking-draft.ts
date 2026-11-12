import { z } from "zod";
import type { Draft, Space } from "../types/booking";

export const DRAFT_STORAGE_KEY = "mspaces.booking-draft.v1";
export const DRAFT_LIFETIME_MS = 2 * 60 * 60 * 1000;
const text = (max: number) => z.string().max(max);
const draftSchema = z.object({
  branchId: text(100),
  roomId: text(100),
  date: text(10),
  startAt: text(40),
  endAt: text(40),
  guestCount: z.number().int().min(0).max(10000),
  purpose: text(1000),
  customerName: text(200),
  customerEmail: text(320),
  customerPhone: text(50),
  companyName: text(200),
  specialRequests: text(2000),
  website: text(200),
});
const savedSpaceSchema = z.object({
  id: text(100),
  branchId: text(100),
  branchName: text(200),
  name: text(200),
  type: z.enum(["MEETING_ROOM", "CONFERENCE_ROOM", "COWORKING_DESK"]),
  capacity: z.number().int().positive(),
  description: text(10000).nullable(),
  amenities: z.array(text(200)).max(100),
  minMinutes: z.number(),
  maxMinutes: z.number(),
  bufferMinutes: z.number(),
});
const keySchema = z.union([z.uuid(), z.literal("")]);
const savedSchema = z.object({
  version: z.literal(1),
  expiresAt: z.number().finite(),
  draft: draftSchema,
  space: savedSpaceSchema,
  submission: z.object({ payload: text(12000), key: keySchema }),
  attemptedKey: keySchema,
});
export type SavedBookingDraft = z.infer<typeof savedSchema>;
type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function clearBookingDraft(storage: StorageAccess): void {
  try {
    storage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* Storage can be disabled by the browser. */
  }
}
export function readBookingDraft(
  storage: StorageAccess,
  now = Date.now(),
): SavedBookingDraft | null {
  try {
    const raw = storage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    if (raw.length > 50000) {
      clearBookingDraft(storage);
      return null;
    }
    const parsed = savedSchema.safeParse(JSON.parse(raw));
    if (
      !parsed.success ||
      parsed.data.expiresAt <= now ||
      parsed.data.expiresAt > now + DRAFT_LIFETIME_MS ||
      parsed.data.draft.roomId !== parsed.data.space.id ||
      parsed.data.draft.branchId !== parsed.data.space.branchId
    ) {
      clearBookingDraft(storage);
      return null;
    }
    return parsed.data;
  } catch {
    clearBookingDraft(storage);
    return null;
  }
}
export function saveBookingDraft(
  storage: StorageAccess,
  draft: Draft,
  space: Space | null,
  submission: { payload: string; key: string },
  attemptedKey: string,
  now = Date.now(),
): boolean {
  if (!space || !draft.roomId) {
    clearBookingDraft(storage);
    return true;
  }
  const parsed = savedSchema.safeParse({
    version: 1,
    expiresAt: now + DRAFT_LIFETIME_MS,
    draft,
    space,
    submission,
    attemptedKey,
  });
  if (!parsed.success) return false;
  try {
    storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(parsed.data));
    return true;
  } catch {
    return false;
  }
}
