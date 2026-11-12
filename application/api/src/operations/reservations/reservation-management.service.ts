import { bookingConflict } from './booking-capacity.js';
import { canViewReservations } from './cancellation-recipients.js';
import type { RoleName } from '../../foundation/roles/role.service.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import {
  includesBranch,
  selectedBranchScope,
} from '../../foundation/auth/branch-scope.js';
import type {
  CreateReservationDto,
  ReservationPaymentDto,
  ReservationQueryDto,
  ReservationSettingsDto,
  ReservationSpaceDto,
  SpaceBlockDto,
} from './reservation.dto.js';

type Row = Record<string, unknown>;
const active = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];
const transitions: Record<string, Record<string, string>> = {
  approve: { PENDING: 'CONFIRMED' },
  reject: { PENDING: 'REJECTED' },
  cancel: { PENDING: 'CANCELLED', CONFIRMED: 'CANCELLED' },
  'check-in': { CONFIRMED: 'CHECKED_IN' },
  'check-out': { CHECKED_IN: 'COMPLETED' },
  'no-show': { CONFIRMED: 'NO_SHOW' },
};

@Injectable()
export class ReservationManagementService {
  constructor(private readonly db: DataSource) {}

  private authorize(user: AuthUserContext, branchId?: string, manage = false) {
    const roles = manage
      ? ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER']
      : ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER', 'STAFF'];
    const moduleGrant = user.moduleAccessKey?.startsWith('operations.reservations') &&
      (manage ? user.moduleAccessMode === 'EDIT' : user.moduleAccessMode === 'VIEW' || user.moduleAccessMode === 'EDIT');
    if (
      (!roles.includes(user.role) && !moduleGrant) ||
      (branchId && !includesBranch(user, branchId))
    )
      throw new ForbiddenException('Reservation access denied.');
  }
  private scope(user: AuthUserContext, branchId?: string) {
    this.authorize(user, branchId);
    return branchId ? [branchId] : selectedBranchScope(user);
  }
  private range(from: string, to: string, maxDays = 366): [Date, Date] {
    const a = new Date(from),
      b = new Date(to);
    if (
      !Number.isFinite(a.getTime()) ||
      !Number.isFinite(b.getTime()) ||
      b <= a ||
      b.getTime() - a.getTime() > maxDays * 86400000
    )
      throw new BadRequestException(
        `Choose a valid range of at most ${maxDays} days.`,
      );
    return [a, b];
  }
  enforceBookingWindow(policy: Row | undefined, start: Date, end: Date) {
    const timeSetting = (value: unknown, fallback: string) =>
      typeof value === 'string' ? value.slice(0, 5) : fallback;
    const openTime = timeSetting(policy?.open_time, '07:00');
    const closeTime = timeSetting(policy?.close_time, '19:00');
    const allowedDays = (policy?.allowed_days as number[] | undefined) ?? [1, 2, 3, 4, 5, 6];
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = (value: Date): Record<string, string> =>
      Object.fromEntries(
        formatter
          .formatToParts(value)
          .map(({ type, value: part }) => [type, part]),
      ) as Record<string, string>;
    const startParts = parts(start);
    const endParts = parts(end);
    const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[startParts.weekday] ?? 0;
    const startTime = `${startParts.hour}:${startParts.minute}`;
    const endTime = `${endParts.hour}:${endParts.minute}`;
    if (!allowedDays.includes(weekday))
      throw new BadRequestException('Reservations are not allowed on this day.');
    if (
      startParts.year !== endParts.year ||
      startParts.month !== endParts.month ||
      startParts.day !== endParts.day ||
      startTime < openTime ||
      endTime > closeTime
    )
      throw new BadRequestException(
        `Reservations must be within ${openTime} and ${closeTime} Manila time.`,
      );
  }
  async branches(user: AuthUserContext) {
    const ids = this.scope(user);
    return this.db.query(
      `SELECT id,name FROM branches WHERE is_active AND ($1::varchar[] IS NULL OR id=ANY($1)) ORDER BY name`,
      [ids ?? null],
    );
  }
  async spaces(user: AuthUserContext, branchId?: string) {
    const ids = this.scope(user, branchId);
    return this.db.query(
      `SELECT r.id,r.branch_id AS "branchId",b.name AS "branchName",r.name,r.type,r.floor,
      r.capacity,r.description,r.amenities,r.status,r.image_data AS "imageData",r.hourly_rate::float AS "hourlyRate",
      r.buffer_minutes AS "bufferMinutes",r.is_active AS "isActive",r.public_bookable AS "publicBookable"
      FROM rooms r JOIN branches b ON b.id=r.branch_id
      WHERE ($1::varchar[] IS NULL OR r.branch_id=ANY($1)) ORDER BY b.name,r.name`,
      [ids ?? null],
    );
  }
  async saveSpace(user: AuthUserContext, d: ReservationSpaceDto, id?: string) {
    this.authorize(user, d.branchId, true);
    const branches = await this.db.query<Array<{ is_active: boolean }>>(
      `SELECT is_active FROM branches WHERE id=$1`,
      [d.branchId],
    );
    if (!branches[0]?.is_active)
      throw new BadRequestException('Choose an active branch.');
    if (id) {
      const old = await this.db.query<Row[]>(
        `SELECT branch_id FROM rooms WHERE id=$1`,
        [id],
      );
      if (!old[0]) throw new NotFoundException('Space not found.');
      this.authorize(user, String(old[0].branch_id), true);
      if (old[0].branch_id !== d.branchId)
        throw new BadRequestException('A space cannot move branches.');
    }
    const key = id ?? randomUUID();
    await this.db.transaction(async (m) => {
      if (id) {
        const locked = await m.query<Row[]>(
          `SELECT * FROM rooms WHERE id=$1 FOR UPDATE`,
          [id],
        );
        if (!locked[0]) throw new NotFoundException('Space not found.');
      }
      await m.query(
        `INSERT INTO rooms (id,branch_id,name,floor,capacity,status,amenities,type,description,hourly_rate,buffer_minutes,is_active)
      VALUES ($1,$2,$3,$4,$5,'AVAILABLE','[]',$6,$7,$8,$9,$10)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,floor=EXCLUDED.floor,capacity=EXCLUDED.capacity,
      type=EXCLUDED.type,description=EXCLUDED.description,hourly_rate=EXCLUDED.hourly_rate,
      buffer_minutes=EXCLUDED.buffer_minutes,is_active=EXCLUDED.is_active`,
        [
          key,
          d.branchId,
          d.name.trim(),
          d.floor.trim(),
          d.capacity,
          d.type,
          d.description?.trim() ?? null,
          d.hourlyRate ?? 0,
          d.bufferMinutes ?? 0,
          d.isActive ?? true,
        ],
      );
      if (d.publicBookable !== undefined) await m.query('UPDATE rooms SET public_bookable=$2 WHERE id=$1', [key,d.publicBookable]);
      if (d.imageData !== undefined) await m.query('UPDATE rooms SET image_data=$2 WHERE id=$1', [key, d.imageData]);
    });
    return (await this.spaces(user, d.branchId)).find(
      (s: { id: string }) => s.id === key,
    );
  }
  private async lockRoom(m: EntityManager, id: string) {
    const rows = await m.query<Row[]>(
      `SELECT * FROM rooms WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Space not found.');
    return rows[0];
  }
  async conflict(m: EntityManager, roomId: string, a: Date, b: Date, excludeReservationId?: string, guests = 1, exclusive = false) {
    return bookingConflict(m, roomId, a, b, excludeReservationId, guests, exclusive);
  }
  async availability(
    user: AuthUserContext,
    roomId: string,
    from: string,
    to: string,
  ) {
    const [a, b] = this.range(from, to, 93);
    const rows = await this.db.query<Row[]>(
      `SELECT branch_id,status,is_active FROM rooms WHERE id=$1`,
      [roomId],
    );
    if (!rows[0]) throw new NotFoundException('Space not found.');
    this.authorize(user, String(rows[0].branch_id));
    return {
      available:
        Boolean(rows[0].is_active) &&
        !['MAINTENANCE', 'INACTIVE'].includes(String(rows[0].status)) &&
        !(await this.conflict(this.db.manager, roomId, a, b)),
    };
  }
  async create(user: AuthUserContext, d: CreateReservationDto) {
    this.authorize(user, d.branchId);
    const [a, b] = this.range(d.startAt, d.endAt, 1);
    if (a.getTime() < Date.now() - 60000)
      throw new BadRequestException('Past bookings are not allowed.');
    return this.db.transaction(async (m) => {
      const room = await this.lockRoom(m, d.roomId);
      if (String(room.branch_id) !== d.branchId)
        throw new BadRequestException('Choose a space in the selected branch.');
      if (!room.is_active || ['MAINTENANCE', 'INACTIVE'].includes(String(room.status)))
        throw new BadRequestException('The selected space is not available for reservations.');
      if (d.guestCount > Number(room.capacity))
        throw new BadRequestException('Guest count exceeds the space capacity.');
      if (b.getTime() - a.getTime() < Number(room.min_minutes) * 60000 ||
          b.getTime() - a.getTime() > Number(room.max_minutes) * 60000)
        throw new BadRequestException('Reservation duration is outside the selected space limits.');
      if (await this.conflict(m, d.roomId, a, b, undefined, d.guestCount))
        throw new ConflictException('Space is booked or blocked for this period.');
      const branch = await m.query<Array<{ is_active: boolean }>>(
        `SELECT is_active FROM branches WHERE id=$1`,
        [d.branchId],
      );
      if (!branch[0]?.is_active)
        throw new BadRequestException('Choose an active branch.');
      const settings = await m.query<Row[]>(
        `SELECT * FROM reservation_settings WHERE branch_id=$1`,
        [d.branchId],
      );
      const policy = settings[0];
      this.enforceBookingWindow(policy, a, b);
      if (
        policy &&
        a.getTime() < Date.now() + Number(policy.min_advance_minutes) * 60000
      )
        throw new BadRequestException('More advance notice is required.');
      if (
        policy &&
        a.getTime() > Date.now() + Number(policy.max_advance_days) * 86400000
      )
        throw new BadRequestException('Booking is too far in advance.');
      const id = randomUUID(),
        ref = `RSV-${Date.now().toString(36).toUpperCase()}-${id.slice(0, 4).toUpperCase()}`;
      const status = policy?.auto_confirm ? 'CONFIRMED' : 'PENDING';
      const amount = Math.round(Number(room.hourly_rate) * ((b.getTime() - a.getTime()) / 3600000) * 100) / 100;
      await m.query(
        `INSERT INTO reservations
        (id,reference,branch_id,room_id,employee_id,status,start_date_time,end_date_time,purpose,
         customer_name,customer_email,customer_phone,company_name,guest_count,special_requests,notes,
         amount,created_by,approved_by,approved_at)
        VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          id,
          ref,
          d.branchId,
          d.roomId,
          status,
          a,
          b,
          d.purpose.trim(),
          d.customerName.trim(),
          d.customerEmail.trim(),
          d.customerPhone.trim(),
          d.companyName?.trim() ?? null,
          d.guestCount,
          d.specialRequests?.trim() ?? null,
          d.notes?.trim() ?? null,
          amount,
          user.userId,
          status === 'CONFIRMED' ? user.userId : null,
          status === 'CONFIRMED' ? new Date() : null,
        ],
      );
      await this.event(m, id, 'CREATED', user.userId, null, status);
      if (status === 'PENDING')
        await this.notify(
          m,
          id,
          d.branchId,
          user.userId,
          'MANAGER',
          'Reservation pending approval',
          'PENDING',
        );
      return this.record(m, user, id);
    });
  }
  async update(user: AuthUserContext, id: string, d: CreateReservationDto) {
    this.authorize(user, d.branchId, true);
    const [a, b] = this.range(d.startAt, d.endAt, 1);
    if (a.getTime() < Date.now() - 60000)
      throw new BadRequestException('Past bookings are not allowed.');
    return this.db.transaction(async (m) => {
      const [context] = await m.query<Row[]>('SELECT room_id FROM reservations WHERE id=$1',[id]);
      if(!context)throw new NotFoundException('Reservation not found.');
      await m.query('SELECT id FROM rooms WHERE id=ANY($1::varchar[]) ORDER BY id FOR UPDATE',[[String(context.room_id),d.roomId]]);
      const rows = await m.query<Row[]>(
        `SELECT * FROM reservations WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const previous = rows[0];
      if (!previous) throw new NotFoundException('Reservation not found.');
      this.authorize(user, String(previous.branch_id), true);
      if (!['PENDING', 'CONFIRMED'].includes(String(previous.status)))
        throw new ConflictException(
          'Only pending or confirmed bookings can be edited.',
        );
      if (previous.branch_id !== d.branchId)
        throw new BadRequestException('A booking cannot move branches.');
      const room = await this.lockRoom(m, d.roomId);
      if (String(room.branch_id) !== d.branchId)
        throw new BadRequestException('Choose a space in the selected branch.');
      if (!room.is_active || ['MAINTENANCE', 'INACTIVE'].includes(String(room.status)))
        throw new BadRequestException('The selected space is not available for reservations.');
      if (d.guestCount > Number(room.capacity))
        throw new BadRequestException('Guest count exceeds the space capacity.');
      if (b.getTime() - a.getTime() < Number(room.min_minutes) * 60000 ||
          b.getTime() - a.getTime() > Number(room.max_minutes) * 60000)
        throw new BadRequestException('Reservation duration is outside the selected space limits.');
      if (await this.conflict(m, d.roomId, a, b, id, d.guestCount))
        throw new ConflictException('Space is booked or blocked for this period.');
      const branch = await m.query<Array<{ is_active: boolean }>>(
        `SELECT is_active FROM branches WHERE id=$1`,
        [d.branchId],
      );
      if (!branch[0]?.is_active)
        throw new BadRequestException('The booking branch is inactive.');
      const settings = await m.query<Row[]>(
        `SELECT * FROM reservation_settings WHERE branch_id=$1`,
        [d.branchId],
      );
      const policy = settings[0];
      this.enforceBookingWindow(policy, a, b);
      if (
        policy &&
        a.getTime() < Date.now() + Number(policy.min_advance_minutes) * 60000
      )
        throw new BadRequestException('More advance notice is required.');
      if (
        policy &&
        a.getTime() > Date.now() + Number(policy.max_advance_days) * 86400000
      )
        throw new BadRequestException('Booking is too far in advance.');
      const amount = Math.round(Number(room.hourly_rate) * ((b.getTime() - a.getTime()) / 3600000) * 100) / 100;
      const paymentRows = await m.query<Array<{ total: number }>>(
        `SELECT COALESCE(sum(amount),0)::float AS total FROM reservation_payments WHERE reservation_id=$1`,
        [id],
      );
      const paid = Number(paymentRows[0]?.total ?? 0);
      if (paid > amount + 0.001)
        throw new ConflictException('The updated total would be less than payments already recorded.');
      let paymentStatus = paid === 0 ? (previous.manual_payment_required ? 'NOT_SUBMITTED' : 'UNPAID') : paid >= amount ? (previous.manual_payment_required ? 'VERIFIED' : 'PAID') : 'PARTIALLY_PAID';
      if(previous.manual_payment_required&&paid<amount){
        const pending=await m.query("SELECT id FROM reservation_payment_submissions WHERE reservation_id=$1 AND verification_status='AWAITING_VERIFICATION'",[id]);
        if(pending.length)paymentStatus='AWAITING_VERIFICATION';
      }
      await m.query(
        `UPDATE reservations SET room_id=$2,start_date_time=$3,end_date_time=$4,guest_count=$5,
        purpose=$6,customer_name=$7,customer_email=$8,customer_phone=$9,company_name=$10,
        special_requests=$11,notes=$12,amount=$13,payment_status=$14,
        status=CASE WHEN manual_payment_required AND $15::numeric*100<ceil($13::numeric*payment_deposit_percent) THEN 'PENDING' ELSE status END,
        payment_deadline=CASE WHEN manual_payment_required AND status='CONFIRMED' AND $15::numeric*100<ceil($13::numeric*payment_deposit_percent)
          THEN LEAST($3::timestamptz,now()+make_interval(mins=>COALESCE((SELECT hold_minutes FROM reservation_payment_policy WHERE branch_id=reservations.branch_id),30))) ELSE payment_deadline END,
        payment_hold_until=CASE WHEN manual_payment_required AND status='CONFIRMED' AND $15::numeric*100<ceil($13::numeric*payment_deposit_percent)
          THEN LEAST($3::timestamptz,now()+make_interval(mins=>COALESCE((SELECT hold_minutes FROM reservation_payment_policy WHERE branch_id=reservations.branch_id),30))) ELSE payment_hold_until END,updated_at=now() WHERE id=$1`,
        [
          id,
          d.roomId,
          a,
          b,
          d.guestCount,
          d.purpose.trim(),
          d.customerName.trim(),
          d.customerEmail.trim(),
          d.customerPhone.trim(),
          d.companyName?.trim() ?? null,
          d.specialRequests?.trim() ?? null,
          d.notes?.trim() ?? null,
          amount,
          paymentStatus,
          paid,
        ],
      );
      if(previous.manual_payment_required && Number(previous.amount)!==amount){
        await m.query(`INSERT INTO reservation_payment_mail(reservation_id,event,event_key,message) VALUES($1,'AMOUNT_UPDATED',$2,'Your booking amount changed. Review the current amount, verified balance and deadline using your private payment link.') ON CONFLICT(event_key) DO NOTHING`,[id,`${id}:amount:${amount}:${a.toISOString()}:${b.toISOString()}`]);
      }
      await this.event(
        m,
        id,
        'UPDATED',
        user.userId,
        String(previous.status),
        String(previous.status),
      );
      await this.notify(
        m,
        id,
        d.branchId,
        user.userId,
        'CREATOR',
        'Reservation updated',
        'CONFIRMED',
      );
      return this.record(m, user, id);
    });
  }
  async list(user: AuthUserContext, q: ReservationQueryDto, calendar = false) {
    const ids = this.scope(user, q.branchId);
    const [a, b] = this.range(
      q.from ?? new Date(Date.now() - 86400000).toISOString(),
      q.to ?? new Date(Date.now() + 30 * 86400000).toISOString(),
      calendar ? 93 : 366,
    );
    const args = [
      ids ?? null,
      q.status ?? null,
      q.search?.trim() ?? null,
      a,
      b,
    ];
    const where = `r.start_date_time<$5 AND r.end_date_time>$4 AND ($1::varchar[] IS NULL OR r.branch_id=ANY($1))
      AND ($2::varchar IS NULL OR r.status=$2)
      AND ($3::varchar IS NULL OR r.customer_name ILIKE '%'||$3||'%' OR r.reference ILIKE '%'||$3||'%')`;
    const count = await this.db.query<Array<{ total: number }>>(
      `SELECT count(*)::int AS total FROM reservations r WHERE ${where}`,
      args,
    );
    const items = await this.db.query(
      `SELECT r.id,r.reference,r.branch_id AS "branchId",b.name AS "branchName",
      r.status,r.source,r.room_id AS "roomId",room.name AS "roomName",r.start_date_time AS "startAt",r.end_date_time AS "endAt",
      r.purpose,r.customer_name AS "customerName",r.guest_count AS "guestCount",r.amount::float AS amount,
      r.payment_status AS "paymentStatus" FROM reservations r JOIN branches b ON b.id=r.branch_id LEFT JOIN rooms room ON room.id=r.room_id
      WHERE ${where} ORDER BY r.start_date_time,r.id LIMIT $6 OFFSET $7`,
      [
        ...args,
        calendar ? 500 : q.pageSize,
        calendar ? 0 : (q.page - 1) * q.pageSize,
      ],
    );
    return {
      items,
      total: count[0]?.total ?? 0,
      page: calendar ? 1 : q.page,
      pageSize: calendar ? 500 : q.pageSize,
    };
  }
  private async record(m: EntityManager, user: AuthUserContext, id: string) {
    const rows = await m.query<Row[]>(
      `SELECT r.id,r.reference,r.branch_id,r.employee_id,r.status,
      r.source,r.manual_payment_required,r.payment_deadline,r.payment_hold_until,r.payment_hold_expired_at,r.payment_deposit_percent,
      r.start_date_time,r.end_date_time,r.purpose,r.customer_name,r.customer_email,
      r.customer_phone,r.company_name,r.guest_count,r.special_requests,r.notes,
      r.amount,r.payment_status,r.created_by,r.approved_by,r.approved_at,
      r.cancelled_at,r.cancellation_reason,r.checked_in_at,r.checked_out_at,
      r.created_at,r.updated_at,b.name AS "branchName",room.name AS "roomName"
      FROM reservations r JOIN branches b ON b.id=r.branch_id LEFT JOIN rooms room ON room.id=r.room_id WHERE r.id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Reservation not found.');
    this.authorize(user, String(rows[0].branch_id));
    return rows[0];
  }
  async detail(user: AuthUserContext, id: string) {
    const record = await this.record(this.db.manager, user, id);
    const events = await this.db.query(
      `SELECT action,reason,previous_status AS "previousStatus",new_status AS "newStatus",created_at AS "createdAt" FROM reservation_events WHERE reservation_id=$1 ORDER BY created_at`,
      [id],
    );
    const payments = await this.db.query(
      `SELECT amount::float AS amount,method,reference,note,created_at AS "createdAt" FROM reservation_payments WHERE reservation_id=$1 ORDER BY created_at`,
      [id],
    );
    const customerHistory = record.customer_email
      ? await this.db.query(
          `SELECT reference,status,start_date_time AS "startAt"
        FROM reservations WHERE lower(customer_email)=lower($1) AND id<>$2
        AND ($3::varchar[] IS NULL OR branch_id=ANY($3)) ORDER BY start_date_time DESC LIMIT 10`,
          [record.customer_email, id, selectedBranchScope(user) ?? null],
        )
      : [];
    return { record, events, payments, customerHistory };
  }
  async customerHistory(user: AuthUserContext, email: string) {
    const ids = this.scope(user);
    const normalizedEmail = email.trim();
    if (!normalizedEmail)
      throw new BadRequestException('A customer email is required.');
    return this.db.query(
      `SELECT r.id,r.reference,r.status,r.start_date_time AS "startAt",
      r.end_date_time AS "endAt",r.purpose,r.customer_name AS "customerName",
      r.guest_count AS "guestCount",r.amount::float AS amount,
      r.payment_status AS "paymentStatus",b.name AS "branchName"
      FROM reservations r
      JOIN branches b ON b.id=r.branch_id
      WHERE lower(r.customer_email)=lower($2)
        AND ($1::varchar[] IS NULL OR r.branch_id=ANY($1))
      ORDER BY r.start_date_time DESC,r.id DESC
      LIMIT 50`,
      [ids ?? null, normalizedEmail],
    );
  }
  private async event(
    m: EntityManager,
    id: string,
    action: string,
    actor: string,
    previous: string | null,
    next: string | null,
    reason?: string,
  ) {
    await m.query(
      `INSERT INTO reservation_events (reservation_id,action,actor_id,previous_status,new_status,reason) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, action, actor, previous, next, reason ?? null],
    );
  }
  async notifyCancellation(m: EntityManager, id: string, branchId: string, title: string, actorId: string | null = null) {
    const candidates = await m.query<Array<{ id: string; role: RoleName; overrides: Record<string, string> }>>(`
      SELECT u.id,u.role,COALESCE((SELECT jsonb_object_agg(p.permission_key,p.effect)
        FROM user_module_permissions p WHERE p.user_id=u.id),'{}'::jsonb) AS overrides
      FROM users u LEFT JOIN employee_branch_access a ON a.user_id=u.id
      WHERE u.status='ACTIVE' AND (
        u.role IN ('SUPER_ADMIN','IT_ADMIN')
        OR u.role IN ('HR_ADMIN','BRANCH_MANAGER') AND (
          a.mode='ALL' OR a.mode='SELECTED' AND $1=ANY(a.branch_ids)
          OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (
            u.branch_id=$1 OR u.role='HR_ADMIN' AND u.branch_id IS NULL
            OR EXISTS(SELECT 1 FROM branches b WHERE b.id=$1 AND b.manager_user_id=u.id)))
        OR u.role NOT IN ('SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER') AND u.branch_id=$1
      )`, [branchId]);
    const recipients = candidates.filter(u => canViewReservations(u.role, u.overrides)).map(u => u.id);
    if (!recipients.length) return;
    await m.query(`INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name)
      SELECT gen_random_uuid()::text,u.id,$2,$3,'Open Reservations to review the booking.','INFO',false,now(),
        '/reservations/list',COALESCE((SELECT name FROM users WHERE id=$4),'System')
      FROM users u WHERE u.id=ANY($1::varchar[]) AND EXISTS(SELECT 1 FROM reservations WHERE id=$5)`,
      [recipients,branchId,title,actorId,id]);
  }
  async notify(
    m: EntityManager,
    id: string,
    branchId: string,
    actorId: string | null,
    recipient: 'MANAGER' | 'CREATOR',
    title: string,
    event: string,
    sendMail = true,
  ) {
    const notices = await m.query<Array<{ id: string; user_id: string }>>(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name)
      SELECT gen_random_uuid()::text,u.id,$2,$5,'Open Reservations to review the booking.','INFO',false,now(),'/reservations/list',COALESCE((SELECT name FROM users WHERE id=$3),'System')
      FROM reservations r JOIN branches b ON b.id=r.branch_id JOIN users u ON (u.id=CASE WHEN $4='MANAGER' THEN b.manager_user_id ELSE r.created_by END OR ($6 AND u.role='SUPER_ADMIN'))
      WHERE r.id=$1 AND u.status='ACTIVE' AND u.id IS DISTINCT FROM $3
      AND ($4<>'MANAGER' OR u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER'))
      RETURNING id,user_id`,
      [id, branchId, actorId, recipient, title, !sendMail],
    );
    if (sendMail && notices.length)
      await m.query(
        `INSERT INTO reservation_mail_outbox(notification_id,reservation_id,user_id,audience,event)
      SELECT n.id,$1,n.user_id,$2,$3 FROM notifications n WHERE n.id=ANY($4::varchar[]) ON CONFLICT(notification_id) DO NOTHING`,
        [id, recipient, event, notices.map((n) => n.id)],
      );
  }
  async transition(
    user: AuthUserContext,
    id: string,
    action: string,
    reason?: string,
  ) {
    if (!transitions[action]) throw new BadRequestException('Unknown action.');
    return this.db.transaction(async (m) => {
      const rows = await m.query<Row[]>(
        `SELECT * FROM reservations WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException('Reservation not found.');
      this.authorize(
        user,
        String(r.branch_id),
        !['check-in', 'check-out'].includes(action),
      );
      if (r.manual_payment_required && ['approve','check-in'].includes(action)) {
        const [paid] = await m.query<Array<{ total: number }>>('SELECT COALESCE(sum(amount),0)::float AS total FROM reservation_payments WHERE reservation_id=$1',[id]);
        if (r.payment_hold_expired_at || r.status === 'PENDING' && +new Date(String(r.payment_hold_until))<=Date.now() || Number(paid.total)*100<Math.ceil(Number(r.amount)*Number(r.payment_deposit_percent)))
          throw new ConflictException('Verified payment requirement is not met or the booking hold has expired. Use Payment Verification.');
      }
      const next = transitions[action][String(r.status)];
      if (!next)
        throw new ConflictException('Action unavailable for this status.');
      if (['reject', 'cancel', 'no-show'].includes(action) && !reason?.trim())
        throw new BadRequestException('A reason is required.');
      if (r.source === 'PUBLIC_PORTAL') await m.query(
        'INSERT INTO reservation_customer_mail(reservation_id,event) VALUES($1,$2) ON CONFLICT DO NOTHING', [id,next]);
      const values: unknown[] = [id, next];
      let extra = '';
      if (action === 'approve') {
        extra = ',approved_by=$3,approved_at=now()';
        values.push(user.userId);
      }
      if (action === 'cancel') {
        extra = ',cancelled_at=now(),cancellation_reason=$3';
        values.push(reason?.trim());
      }
      if (action === 'check-in') extra = ',checked_in_at=now()';
      if (action === 'check-out') extra = ',checked_out_at=now()';
      await m.query(
        `UPDATE reservations SET status=$2,updated_at=now()${extra} WHERE id=$1`,
        values,
      );
      await this.event(
        m,
        id,
        action.toUpperCase(),
        user.userId,
        String(r.status),
        next,
        reason?.trim(),
      );
      if (action === 'cancel') await this.notifyCancellation(m,id,String(r.branch_id),`Booking cancelled: ${String(r.reference)}`,user.userId);
      else await this.notify(
        m,
        id,
        String(r.branch_id),
        user.userId,
        'CREATOR',
        `Reservation ${next.toLowerCase().replaceAll('_', ' ')}`,
        next,
      );
      return this.record(m, user, id);
    });
  }
  async payment(user: AuthUserContext, id: string, d: ReservationPaymentDto) {
    return this.db.transaction(async (m) => {
      const r = await m.query<Row[]>(
        `SELECT * FROM reservations WHERE id=$1 FOR UPDATE`,
        [id],
      );
      if (!r[0]) throw new NotFoundException('Reservation not found.');
      this.authorize(user, String(r[0].branch_id), true);
      if (r[0].manual_payment_required) throw new ConflictException('Use Payment Verification for this client booking.');
      if (['CANCELLED', 'REJECTED'].includes(String(r[0].status)))
        throw new ConflictException('Payment cannot be recorded.');
      const paid = await m.query<Array<{ total: number }>>(
        `SELECT COALESCE(sum(amount),0)::float AS total FROM reservation_payments WHERE reservation_id=$1`,
        [id],
      );
      const total = Number(paid[0].total) + d.amount;
      if (total > Number(r[0].amount) + 0.001)
        throw new BadRequestException('Payment exceeds booking total.');
      if(d.reference?.trim()&&['BANK_TRANSFER','GCASH'].includes(d.method.trim().toUpperCase())){
        const method=d.method.trim().toUpperCase(),reference=d.reference.trim();
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${method}:${reference.replace(/[^a-zA-Z0-9]/g,'').toLowerCase()}`]);
        const allocated=await m.query(`SELECT id FROM reservation_payments WHERE method=$1 AND lower(regexp_replace(reference,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace($2,'[^a-zA-Z0-9]','','g'))
          UNION ALL SELECT id FROM reservation_payment_submissions WHERE payment_method=$1 AND lower(regexp_replace(transaction_reference,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace($2,'[^a-zA-Z0-9]','','g')) AND verification_status IN ('AWAITING_VERIFICATION','VERIFIED','REFUNDED')`,[method,reference]);
        if(allocated.length)throw new ConflictException('This external transaction is already allocated to a payment.');
      }
      await m.query(
        `INSERT INTO reservation_payments (reservation_id,amount,method,reference,note,recorded_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          id,
          d.amount,
          d.method.trim(),
          d.reference?.trim() ?? null,
          d.note?.trim() ?? null,
          user.userId,
        ],
      );
      await m.query(
        `UPDATE reservations SET payment_status=$2,updated_at=now() WHERE id=$1`,
        [id, total >= Number(r[0].amount) ? 'PAID' : 'PARTIALLY_PAID'],
      );
      await this.event(
        m,
        id,
        'PAYMENT_RECORDED',
        user.userId,
        String(r[0].status),
        String(r[0].status),
      );
      return this.record(m, user, id);
    });
  }
  async block(user: AuthUserContext, roomId: string, d: SpaceBlockDto) {
    const [a, b] = this.range(d.startAt, d.endAt);
    return this.db.transaction(async (m) => {
      const room = await this.lockRoom(m, roomId);
      this.authorize(user, String(room.branch_id), true);
      if (await this.conflict(m, roomId, a, b, undefined, 1, true))
        throw new ConflictException(
          'An active booking or block overlaps this period.',
        );
      const rows = await m.query(
        `INSERT INTO reservation_space_blocks (room_id,start_at,end_at,reason,created_by)
        VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [roomId, a, b, d.reason.trim(), user.userId],
      );
      return rows[0];
    });
  }
  async settings(user: AuthUserContext, branchId: string) {
    this.authorize(user, branchId);
    const rows = await this.db.query<Row[]>(
      `SELECT auto_confirm AS "autoConfirm",min_advance_minutes AS "minAdvanceMinutes",
      max_advance_days AS "maxAdvanceDays",default_duration_minutes AS "defaultDurationMinutes",
      to_char(open_time,'HH24:MI') AS "openTime",to_char(close_time,'HH24:MI') AS "closeTime",
      allowed_days AS "allowedDays"
      FROM reservation_settings WHERE branch_id=$1`,
      [branchId],
    );
    return (
      rows[0] ?? {
        autoConfirm: false,
        minAdvanceMinutes: 0,
        maxAdvanceDays: 365,
        defaultDurationMinutes: 60,
        openTime: '07:00',
        closeTime: '19:00',
        allowedDays: [1, 2, 3, 4, 5, 6],
      }
    );
  }
  async saveSettings(
    user: AuthUserContext,
    branchId: string,
    d: ReservationSettingsDto,
  ) {
    this.authorize(user, branchId, true);
    await this.db.query(
      `INSERT INTO reservation_settings (branch_id,auto_confirm,min_advance_minutes,max_advance_days,default_duration_minutes,open_time,close_time,allowed_days,updated_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(branch_id) DO UPDATE SET auto_confirm=EXCLUDED.auto_confirm,
      min_advance_minutes=EXCLUDED.min_advance_minutes,max_advance_days=EXCLUDED.max_advance_days,
      default_duration_minutes=EXCLUDED.default_duration_minutes,open_time=EXCLUDED.open_time,
      close_time=EXCLUDED.close_time,allowed_days=EXCLUDED.allowed_days,
      updated_by=EXCLUDED.updated_by,updated_at=now()`,
      [
        branchId,
        d.autoConfirm,
        d.minAdvanceMinutes,
        d.maxAdvanceDays,
        d.defaultDurationMinutes,
        d.openTime,
        d.closeTime,
        d.allowedDays,
        user.userId,
      ],
    );
    return this.settings(user, branchId);
  }
  async summary(user: AuthUserContext, branchId?: string) {
    const ids = this.scope(user, branchId);
    const rows = await this.db.query<Row[]>(
      `SELECT
      count(*) FILTER (WHERE (start_date_time AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date)::int AS today,
      count(*) FILTER (WHERE start_date_time>now() AND status IN ('PENDING','CONFIRMED'))::int AS upcoming,
      count(*) FILTER (WHERE status='PENDING')::int AS pending,
      count(*) FILTER (WHERE status='CHECKED_IN')::int AS "checkedIn",
      count(*) FILTER (WHERE status='COMPLETED')::int AS completed
      FROM reservations WHERE ($1::varchar[] IS NULL OR branch_id=ANY($1))`,
      [ids ?? null],
    );
    const spaces = await this.db.query<Array<{ count: number }>>(
      `SELECT count(*)::int AS count FROM rooms room
      WHERE room.is_active AND room.status NOT IN ('MAINTENANCE','INACTIVE')
        AND ($1::varchar[] IS NULL OR room.branch_id=ANY($1))
        AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.room_id=room.id
          AND r.status=ANY($2::varchar[]) AND r.start_date_time < now() AND r.end_date_time > now())
        AND NOT EXISTS (SELECT 1 FROM reservation_space_blocks b WHERE b.room_id=room.id
          AND b.start_at < now() AND b.end_at > now())`,
      [ids ?? null, active],
    );
    return { ...rows[0], availableSpaces: spaces[0]?.count ?? 0 };
  }
  async report(
    user: AuthUserContext,
    from: string,
    to: string,
    branchId?: string,
  ) {
    const ids = this.scope(user, branchId),
      [a, b] = this.range(from, to);
    return this.db.query(
      `SELECT br.name AS branch,'Reservations' AS category,count(*)::int AS total,
      count(*) FILTER(WHERE r.status='CONFIRMED')::int AS confirmed,
      count(*) FILTER(WHERE r.status='CANCELLED')::int AS cancelled,
      count(*) FILTER(WHERE r.status='NO_SHOW')::int AS "noShow",
      COALESCE(sum(r.amount) FILTER(WHERE r.status NOT IN ('CANCELLED','REJECTED')),0)::float AS "bookedValue",
      (COALESCE(sum(p.paid),0)-COALESCE(sum(f.refunded),0))::float AS "recordedPayments",
      COALESCE(sum(f.refunded),0)::float AS "refundedPayments"
      FROM reservations r JOIN branches br ON br.id=r.branch_id
      LEFT JOIN (SELECT reservation_id,sum(amount) AS paid FROM reservation_payments GROUP BY reservation_id) p ON p.reservation_id=r.id
      LEFT JOIN (SELECT reservation_id,sum(amount) AS refunded FROM reservation_payment_refunds GROUP BY reservation_id) f ON f.reservation_id=r.id
      WHERE r.start_date_time >= $2 AND r.start_date_time < $3 AND ($1::varchar[] IS NULL OR r.branch_id=ANY($1))
      GROUP BY br.name ORDER BY total DESC,br.name`,
      [ids ?? null, a, b],
    );
  }
}
