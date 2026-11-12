import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createBookingKey } from './booking-key.ts';

test('generates valid UUIDv4 booking keys without crypto.randomUUID on HTTP origins', () => {
  const source = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) };
  const keys = Array.from({ length: 100 }, () => createBookingKey(source));
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(new Set(keys).size, keys.length);
});

test('uses native randomUUID when available', () => {
  const expected = 'e0be547c-5040-401d-89ad-46b387ef2246';
  assert.equal(createBookingKey({ randomUUID: () => expected, getRandomValues: () => { throw new Error('Unexpected fallback'); } }), expected);
});

test('fails safely when secure randomness is unavailable', () => {
  assert.throws(() => createBookingKey({}), /Secure booking IDs are unavailable/);
});
