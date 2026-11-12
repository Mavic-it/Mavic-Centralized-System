import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { bookingPaymentToken } from './manual-payment.security.js';
import type { DataSource, EntityManager } from 'typeorm';
import { ReservationManagementService } from './reservation-management.service.js';
import { scheduleConflict, type BookingSchedule, type Occupancy } from './booking-capacity.js';
import type { PublicAvailabilityQuery, PublicBookingDto, PublicSpaceQuery, PublicCancellationDto } from './public-booking.dto.js';

type Row = Record<string, unknown>;
const eligible = `r.public_bookable AND r.is_active AND b.is_active AND r.status NOT IN ('MAINTENANCE','INACTIVE') AND r.type IN ('MEETING_ROOM','CONFERENCE_ROOM','COWORKING_DESK')`;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export class PublicBookingService {
  constructor(private readonly db: DataSource, private readonly reservations: ReservationManagementService) {}
  async requestCancellation(d: PublicCancellationDto) {
    // Use the same response for unknown references and mismatched emails; do not expose bookings.
    const result = { message: 'If the reference and email match an eligible booking, your cancellation request has been sent for admin approval. Your booking remains active until cancellation is approved.' };
    return this.db.transaction(async m => {
      const rows = await m.query<Row[]>(`SELECT id,branch_id,status FROM reservations
        WHERE reference=$1 AND lower(customer_email)=$2 AND source='PUBLIC_PORTAL' FOR UPDATE`, [d.reference,d.customerEmail]);
      const r = rows[0];
      if (!r || !['PENDING','CONFIRMED'].includes(String(r.status))) return result;
      const existing = await m.query<Row[]>(`SELECT 1 FROM reservation_events WHERE reservation_id=$1 AND action='CANCELLATION_REQUESTED' LIMIT 1`, [r.id]);
      if (existing.length) return result;
      await m.query(`INSERT INTO reservation_events(reservation_id,action,actor_id,previous_status,new_status,reason)
        VALUES($1,'CANCELLATION_REQUESTED',NULL,$2,$2,$3)`, [r.id,r.status,d.reason]);
      await this.reservations.notifyCancellation(m,String(r.id),String(r.branch_id),`Cancellation requested: ${d.reference}`);
      return result;
    });
  }
  branches() {
    return this.db.query(`SELECT b.id,b.name FROM branches b WHERE b.is_active AND EXISTS
      (SELECT 1 FROM rooms r WHERE r.branch_id=b.id AND ${eligible}) ORDER BY b.name`);
  }
  async quote(d: {branchId:string;roomId:string;startAt:string;endAt:string;guestCount:number}) {
    const {room,policy}=await this.context(this.db.manager,d.branchId,d.roomId);
    const start=new Date(d.startAt),end=new Date(d.endAt);
    this.validate(room,policy,start,end,d.guestCount);
    const amount=Math.round(Number(room.hourly_rate)*(+end-+start)/3600000*100)/100;
    const [p]=await this.db.query<Row[]>('SELECT deposit_percent FROM reservation_payment_policy WHERE branch_id=$1',[d.branchId]);
    return {amount,requiredAmount:Math.ceil(amount*Number(p?.deposit_percent ?? 100))/100,currency:'PHP'};
  }
  spaces(q: PublicSpaceQuery) {
    return this.db.query(`SELECT r.id,r.branch_id AS "branchId",b.name AS "branchName",r.name,r.type,r.capacity,r.description,r.amenities,r.image_data AS "imageData",
      r.min_minutes AS "minMinutes",r.max_minutes AS "maxMinutes",r.buffer_minutes AS "bufferMinutes"
      FROM rooms r JOIN branches b ON b.id=r.branch_id WHERE ${eligible} AND b.id=$1 AND ($2::varchar IS NULL OR r.type=$2) ORDER BY r.name`, [q.branchId, q.type ?? null]);
  }
  private async context(m: EntityManager, branchId: string, roomId: string, lock = false) {
    const rows = await m.query<Row[]>(`SELECT r.* FROM rooms r JOIN branches b ON b.id=r.branch_id
      WHERE ${eligible} AND r.id=$1 AND r.branch_id=$2 ${lock ? 'FOR UPDATE OF r' : ''}`, [roomId, branchId]);
    if (!rows[0]) throw new NotFoundException('This space is not available for public booking.');
    const policies = await m.query<Row[]>('SELECT * FROM reservation_settings WHERE branch_id=$1', [branchId]);
    return { room: rows[0], policy: policies[0] };
  }
  private validate(room: Row, policy: Row | undefined, start: Date, end: Date, guests: number) {
    if (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start || +end - +start > 86400000)
      throw new BadRequestException('Choose a valid start and end time on the same day.');
    if (start.getUTCMinutes() % 30 || end.getUTCMinutes() % 30 || start.getUTCSeconds() || end.getUTCSeconds())
      throw new BadRequestException('Choose times in 30-minute increments.');
    if (!Number.isInteger(guests) || guests < 1 || guests > Number(room.capacity))
      throw new BadRequestException('Guest count exceeds the space capacity.');
    const minutes = (+end - +start) / 60000;
    if (minutes < Number(room.min_minutes) || minutes > Number(room.max_minutes))
      throw new BadRequestException('Choose a duration within this space’s booking limits.');
    this.reservations.enforceBookingWindow(policy, start, end);
    if (+start < Date.now() + Number(policy?.min_advance_minutes ?? 0) * 60000)
      throw new BadRequestException('This time is in the past or needs more advance notice.');
    if (+start > Date.now() + Number(policy?.max_advance_days ?? 365) * 86400000)
      throw new BadRequestException('This date is beyond the booking window.');
  }
  async availability(q: PublicAvailabilityQuery) {
    const { room, policy } = await this.context(this.db.manager, q.branchId, q.roomId);
    const day = new Date(`${q.date}T00:00:00+08:00`);
    if (!Number.isFinite(+day) || new Date(+day + 8 * 3600000).toISOString().slice(0, 10) !== q.date)
      throw new BadRequestException('Choose a valid calendar date.');
    if (q.guestCount > Number(room.capacity)) throw new BadRequestException('Guest count exceeds capacity.');
    const from = new Date(+day - Number(room.buffer_minutes) * 60000);
    const to = new Date(+day + 86400000 + Number(room.buffer_minutes) * 60000);
    const bookings = await this.db.query<Occupancy[]>(`SELECT start_date_time AS start,end_date_time AS end,
      COALESCE(guest_count,$4)::int AS guests FROM reservations WHERE room_id=$1 AND status IN ('PENDING','CONFIRMED','CHECKED_IN') AND NOT (status='PENDING' AND manual_payment_required AND payment_hold_until<=now())
      AND start_date_time<$3 AND end_date_time>$2`, [q.roomId, from, to, room.capacity]);
    const blocks = await this.db.query<Array<{ start: Date; end: Date }>>(`SELECT start_at AS start,end_at AS end FROM reservation_space_blocks
      WHERE room_id=$1 AND start_at<$3 AND end_at>$2`, [q.roomId, from, to]);
    const schedule: BookingSchedule = { type: String(room.type), capacity: Number(room.capacity), buffer: Number(room.buffer_minutes), bookings, blocks };
    const slots: Array<{ startAt: string; endTimes: string[] }> = [];
    const instant = (minutes: number) => `${q.date}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00+08:00`;
    for (let start = 0; start < 1440; start += 30) {
      const endTimes: string[] = [];
      for (let end = start + 30; end < 1440; end += 30) {
        const a = new Date(instant(start)), b = new Date(instant(end));
        try { this.validate(room, policy, a, b, q.guestCount); }
        catch (error) { if (error instanceof BadRequestException) continue; throw error; }
        if (!scheduleConflict(schedule, a, b, q.guestCount)) endTimes.push(instant(end));
      }
      if (endTimes.length) slots.push({ startAt: instant(start), endTimes });
    }
    return { timezone: 'Asia/Manila', date: q.date, slots,
      policy: { openTime: typeof policy?.open_time === 'string' ? policy.open_time.slice(0,5) : '07:00', closeTime: typeof policy?.close_time === 'string' ? policy.close_time.slice(0,5) : '19:00',
        allowedDays: policy?.allowed_days ?? [1,2,3,4,5,6], minAdvanceMinutes: Number(policy?.min_advance_minutes ?? 0),
        maxAdvanceDays: Number(policy?.max_advance_days ?? 365), autoConfirm: Boolean(policy?.auto_confirm), slotMinutes: 30 } };
  }
  private async receipt(m: EntityManager, id: string) {
    const rows = await m.query<Row[]>(`SELECT r.reference,r.status,r.manual_payment_required AS "paymentRequired",r.amount::float AS amount,
      r.payment_deadline AS "paymentDeadline",r.public_key_hash,r.start_date_time AS "startAt",r.end_date_time AS "endAt",
      r.guest_count AS "guestCount",b.name AS "branchName",s.name AS "spaceName"
      FROM reservations r JOIN branches b ON b.id=r.branch_id JOIN rooms s ON s.id=r.room_id WHERE r.id=$1`, [id]);
    const r=rows[0];
    const { public_key_hash: keyHash,...receipt }=r;
    return {...receipt,...(r.paymentRequired ? {paymentToken:bookingPaymentToken(String(r.reference),String(keyHash))} : {})};
  }
  async create(d: PublicBookingDto) {
    const key = hash(d.idempotencyKey);
    const payload = hash(JSON.stringify([d.branchId,d.roomId,d.startAt,d.endAt,d.guestCount,d.purpose,d.customerName,
      d.customerEmail,d.customerPhone,d.companyName ?? '',d.specialRequests ?? '',d.termsVersion]));
    return this.db.transaction(async m => {
      // Global key lock also serializes retries that change the requested room.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const existing = await m.query<Array<{ id: string; public_payload_hash: string }>>(
        'SELECT id,public_payload_hash FROM reservations WHERE public_key_hash=$1', [key]);
      if (existing[0]) {
        if (existing[0].public_payload_hash !== payload) throw new ConflictException('This submission key was already used for different booking details.');
        return this.receipt(m, existing[0].id);
      }
      const { room, policy } = await this.context(m, d.branchId, d.roomId, true);
      const a = new Date(d.startAt), b = new Date(d.endAt);
      for (const value of [d.startAt, d.endAt]) {
        const parsed = new Date(value);
        if (!Number.isFinite(+parsed) || new Date(+parsed + 8 * 3600000).toISOString().slice(0,19) !== value.slice(0,19))
          throw new BadRequestException('Choose a valid date and time.');
      }
      this.validate(room, policy, a, b, d.guestCount);
      if (await this.reservations.conflict(m, d.roomId, a, b, undefined, d.guestCount))
        throw new ConflictException('This time is no longer available. Please select another slot.');
      const id = randomUUID(), reference = `RSV-${Date.now().toString(36).toUpperCase()}-${id.slice(0,8).toUpperCase()}`;
      const amount=Math.round(Number(room.hourly_rate) * (+b - +a) / 3600000 * 100) / 100;
      const requiresPayment=amount>0;
      if (requiresPayment) {
        bookingPaymentToken(reference,key); // Fail closed when the payment secret is missing.
        const accounts=await m.query('SELECT id FROM reservation_payment_accounts WHERE is_active AND (branch_id=$1 OR branch_id IS NULL) LIMIT 1',[d.branchId]);
        if (!accounts.length) throw new BadRequestException('Online booking payment accounts are not configured for this branch. Please contact the branch.');
      }
      const status = !requiresPayment && policy?.auto_confirm ? 'CONFIRMED' : 'PENDING';
      await m.query(`INSERT INTO reservations(id,reference,branch_id,room_id,status,start_date_time,end_date_time,purpose,
        customer_name,customer_email,customer_phone,company_name,guest_count,special_requests,amount,source,
        public_key_hash,public_payload_hash,terms_version,terms_accepted_at,approved_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'PUBLIC_PORTAL',$16,$17,$18,now(),$19)`,
        [id,reference,d.branchId,d.roomId,status,a,b,d.purpose,d.customerName,d.customerEmail,d.customerPhone,
          d.companyName || null,d.guestCount,d.specialRequests || null,
          amount,key,payload,d.termsVersion,status === 'CONFIRMED' ? new Date() : null]);
      if (requiresPayment) {
        const [paymentPolicy]=await m.query<Row[]>('SELECT * FROM reservation_payment_policy WHERE branch_id=$1',[d.branchId]);
        await m.query(`UPDATE reservations SET manual_payment_required=true,payment_status='NOT_SUBMITTED',
          payment_deadline=LEAST(start_date_time,now()+make_interval(mins=>$2)),payment_hold_until=LEAST(start_date_time,now()+make_interval(mins=>$2)),
          payment_deposit_percent=$3,payment_review_minutes=$4 WHERE id=$1`,[id,Number(paymentPolicy?.hold_minutes ?? 30),Number(paymentPolicy?.deposit_percent ?? 100),Number(paymentPolicy?.review_minutes ?? 1440)]);
        await m.query(`INSERT INTO reservation_payment_mail(reservation_id,event,event_key,message) VALUES($1,'PAYMENT_INSTRUCTIONS',$2,
          'Your temporary booking is awaiting payment. View official Bank Transfer or GCash instructions, the amount and deadline using your private payment link. Staff must verify receipt before confirmation.')`,[id,`${id}:instructions`]);
      }
      await m.query(`INSERT INTO reservation_events(reservation_id,action,actor_id,new_status,reason)
        VALUES($1,'CREATED',NULL,$2,'Client booking portal')`, [id,status]);
      await this.reservations.notify(m,id,d.branchId,null,'MANAGER',status === 'PENDING' ? 'Client reservation pending approval' : 'New client reservation',status);
      if (!requiresPayment) await m.query('INSERT INTO reservation_customer_mail(reservation_id,event) VALUES($1,$2)', [id,status]);
      return this.receipt(m,id);
    });
  }
}
