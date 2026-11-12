import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DRAFT_STORAGE_KEY,
  DRAFT_LIFETIME_MS,
  readBookingDraft,
  saveBookingDraft,
  clearBookingDraft,
} from "./booking-draft.ts";
const draft = {
  branchId: "branch",
  roomId: "room",
  date: "2026-11-10",
  startAt: "",
  endAt: "",
  guestCount: 1,
  purpose: "Planning",
  customerName: "Test Customer",
  customerEmail: "client@example.invalid",
  customerPhone: "09171234567",
  companyName: "",
  specialRequests: "Window seat",
  website: "",
};
const space = {
  id: "room",
  branchId: "branch",
  branchName: "Test branch",
  name: "Test space",
  type: "MEETING_ROOM",
  capacity: 10,
  description: null,
  amenities: [],
  minMinutes: 30,
  maxMinutes: 480,
  bufferMinutes: 0,
};
const submission = {
  payload: JSON.stringify(draft),
  key: "8c6ee9dd-cb68-4b0b-8817-cb252b0cf86b",
};
const memory = () => {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
};

test("restores entered fields, chosen space and retry identity after refresh", () => {
  const storage = memory();
  assert.equal(
    saveBookingDraft(storage, draft, space, submission, submission.key, 1000),
    true,
  );
  const restored = readBookingDraft(storage, 2000);
  assert.deepEqual(restored.draft, draft);
  assert.deepEqual(restored.space, space);
  assert.deepEqual(restored.submission, submission);
  assert.equal(restored.attemptedKey, submission.key);
});
test("expires temporary drafts after two hours", () => {
  const storage = memory();
  saveBookingDraft(storage, draft, space, submission, "", 1000);
  assert.equal(readBookingDraft(storage, 1000 + DRAFT_LIFETIME_MS), null);
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);
});
test("discards corrupt or mismatched saved data", () => {
  const storage = memory();
  storage.setItem(DRAFT_STORAGE_KEY, "{bad json");
  assert.equal(readBookingDraft(storage), null);
  saveBookingDraft(
    storage,
    draft,
    { ...space, id: "other-room" },
    submission,
    "",
    1000,
  );
  assert.equal(readBookingDraft(storage, 2000), null);
});
test("does not persist payment access tokens, uploaded proof or large space images", () => {
  const storage = memory();
  saveBookingDraft(
    storage,
    { ...draft, paymentToken: "private-token", proofBase64: "private-proof" },
    { ...space, imageData: "private-image", paymentToken: "private-token" },
    submission,
    "",
    1000,
  );
  const raw = storage.getItem(DRAFT_STORAGE_KEY);
  assert.ok(raw);
  assert.ok(!raw.includes("private-token"));
  assert.ok(!raw.includes("private-proof"));
  assert.ok(!raw.includes("private-image"));
});
test("explicit discard and a completed empty draft remove saved inputs", () => {
  const storage = memory();
  saveBookingDraft(storage, draft, space, submission, "", 1000);
  clearBookingDraft(storage);
  assert.equal(readBookingDraft(storage, 2000), null);
  saveBookingDraft(storage, draft, space, submission, "", 1000);
  saveBookingDraft(
    storage,
    { ...draft, roomId: "" },
    null,
    submission,
    "",
    2000,
  );
  assert.equal(storage.getItem(DRAFT_STORAGE_KEY), null);
});
test("storage restrictions do not crash the booking flow", () => {
  const storage = {
    getItem: () => {
      throw new Error("Blocked");
    },
    setItem: () => {
      throw new Error("Quota exceeded");
    },
    removeItem: () => {
      throw new Error("Blocked");
    },
  };
  assert.equal(
    saveBookingDraft(storage, draft, space, submission, "", 1000),
    false,
  );
  assert.equal(readBookingDraft(storage), null);
  assert.doesNotThrow(() => clearBookingDraft(storage));
});
