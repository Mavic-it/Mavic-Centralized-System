import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { peakOccupancy, scheduleConflict, type BookingSchedule } from './booking-capacity.js';
import { PublicBookingDto } from './public-booking.dto.js';
const at = (hour: number) => new Date(`2026-11-09T${String(hour).padStart(2,'0')}:00:00+08:00`);
describe('Public booking policy', () => {
  it('counts the peak per segment, not the sum of all overlapping guests', () => {
    expect(peakOccupancy([{ start: at(9), end: at(10), guests: 3 }, { start: at(10), end: at(11), guests: 4 }],at(9),at(11))).toBe(4);
  });
  it('distinguishes shared seats, exclusive rooms, blocks and cleanup buffers', () => {
    const schedule: BookingSchedule = { type: 'COWORKING_DESK', capacity: 6, buffer: 0, blocks: [], bookings: [{ start: at(9), end: at(10), guests: 4 }] };
    expect(scheduleConflict(schedule,at(9),at(10),2)).toBe(false);
    expect(scheduleConflict(schedule,at(9),at(10),3)).toBe(true);
    expect(scheduleConflict({...schedule,type:'MEETING_ROOM'},at(9),at(10),1)).toBe(true);
    expect(scheduleConflict(schedule,at(10),at(11),6)).toBe(false);
    expect(scheduleConflict({...schedule,buffer:30},at(10),at(11),3)).toBe(true);
    expect(scheduleConflict({...schedule,blocks:[{start:at(12),end:at(13)}]},at(12),at(13),1)).toBe(true);
  });
  it('normalizes contact details and rejects whitespace, malformed phones and privilege fields', async () => {
    const dto = plainToInstance(PublicBookingDto, {branchId:'a',roomId:'r',startAt:'2026-11-09T09:00:00+08:00',endAt:'2026-11-09T10:00:00+08:00',guestCount:1,purpose:'Planning',customerName:' Alice ',customerEmail:' ALICE@example.com ',customerPhone:'+63 (917) 123-4567',termsVersion:'2026-11-v1',acceptedTerms:true,idempotencyKey:'9b586b72-4d31-4b1d-b5e1-e58ed6db9b9a'});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.customerPhone).toBe('+639171234567');
    expect(dto.customerEmail).toBe('alice@example.com');
    const invalid = plainToInstance(PublicBookingDto,Object.assign({},dto,{customerName:'  ',customerPhone:'abc',status:'CONFIRMED',acceptedTerms:false}));
    expect((await validate(invalid,{whitelist:true,forbidNonWhitelisted:true})).map(e=>e.property)).toEqual(expect.arrayContaining(['customerName','customerPhone','status','acceptedTerms']));
  });
});
