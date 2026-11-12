import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { validate } from 'class-validator';
import { ReservationSpaceDto } from './reservation.dto.js';

const space = { branchId: 'branch-1', name: 'Meeting room', type: 'MEETING_ROOM', floor: '1', capacity: 4 };
describe('space image validation', () => {
  it('accepts unchanged, removed and bounded JPEG images', async () => {
    for (const imageData of [undefined, null, 'data:image/jpeg;base64,/9j/AA==']) {
      expect(await validate(Object.assign(new ReservationSpaceDto(), space, { imageData }))).toEqual([]);
    }
  });
  it('rejects external URLs, active content and oversized images', async () => {
    for (const imageData of ['https://example.com/image.jpg', 'data:image/svg+xml;base64,AAAA', `data:image/jpeg;base64,/9j/${'A'.repeat(65000)}`]) {
      const errors = await validate(Object.assign(new ReservationSpaceDto(), space, { imageData }));
      expect(errors.some((error) => error.property === 'imageData')).toBe(true);
    }
  });
});
