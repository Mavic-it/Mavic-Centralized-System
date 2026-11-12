import type { EntityManager } from 'typeorm';

export type Occupancy = { start: Date; end: Date; guests: number };
export type BookingSchedule = { type: string; capacity: number; buffer: number; bookings: Occupancy[]; blocks: { start: Date; end: Date }[] };

export function scheduleConflict(schedule: BookingSchedule, start: Date, end: Date, guests = 1, exclusive = false): boolean {
  const a = new Date(+start - schedule.buffer * 60000), b = new Date(+end + schedule.buffer * 60000);
  if (schedule.blocks.some(r => r.start < b && r.end > a)) return true;
  if (exclusive || schedule.type !== 'COWORKING_DESK') return schedule.bookings.some(r => r.start < b && r.end > a);
  return peakOccupancy(schedule.bookings.map(r => ({ ...r,
    start: new Date(+r.start - schedule.buffer * 60000), end: new Date(+r.end + schedule.buffer * 60000) })), start, end) + guests > schedule.capacity;
}

/** Half-open intervals: departures free seats before arrivals at the same instant. */
export function peakOccupancy(items: Occupancy[], start: Date, end: Date): number {
  const events = items.flatMap((item) => item.start < end && item.end > start
    ? [{ time: Math.max(+item.start, +start), delta: item.guests },
       { time: Math.min(+item.end, +end), delta: -item.guests }]
    : []);
  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0, peak = 0;
  for (const event of events) { current += event.delta; peak = Math.max(peak, current); }
  return peak;
}

export async function bookingConflict(m: EntityManager, roomId: string, start: Date,
  end: Date, exclude?: string, guests = 1, exclusive = false): Promise<boolean> {
  const rooms = await m.query<Array<{ type: string; capacity: number; buffer_minutes: number }>>(
    'SELECT type,capacity,buffer_minutes FROM rooms WHERE id=$1', [roomId]);
  const room = rooms[0];
  if (!room) return true;
  const a = new Date(+start - room.buffer_minutes * 60000);
  const b = new Date(+end + room.buffer_minutes * 60000);
  const blocked = await m.query<Array<{ id: string }>>(
    'SELECT id FROM reservation_space_blocks WHERE room_id=$1 AND start_at<$3 AND end_at>$2 LIMIT 1', [roomId, a, b]);
  if (blocked.length) return true;
  const bookings = await m.query<Array<{ start: Date; end: Date; guests: number }>>(
    `SELECT start_date_time AS start,end_date_time AS end,COALESCE(guest_count,$5)::int AS guests
     FROM reservations WHERE room_id=$1 AND id<>COALESCE($4::varchar,'')
     AND status IN ('PENDING','CONFIRMED','CHECKED_IN') AND NOT (status='PENDING' AND manual_payment_required AND payment_hold_until<=now()) AND start_date_time<$3 AND end_date_time>$2`,
    [roomId, a, b, exclude ?? null, room.capacity]);
  if (exclusive || room.type !== 'COWORKING_DESK') return bookings.length > 0;
  // Expand each existing booking's interval, rather than the requested interval,
  // so peaks include seats reserved during room cleanup buffers.
  const occupied = bookings.map((r) => ({ guests: r.guests,
    start: new Date(+new Date(r.start) - room.buffer_minutes * 60000),
    end: new Date(+new Date(r.end) + room.buffer_minutes * 60000) }));
  return peakOccupancy(occupied, start, end) + guests > room.capacity;
}
