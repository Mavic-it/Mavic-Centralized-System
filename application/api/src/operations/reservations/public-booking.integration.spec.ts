import { ManualReservationRefunds1795046401000 } from '../../database/migrations/1795046401000-ManualReservationRefunds.js';
import { ManualReservationPayments1795046400000 } from '../../database/migrations/1795046400000-ManualReservationPayments.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ReservationsManagement1793404800000 } from '../../database/migrations/1793404800000-ReservationsManagement.js';
import { ReservationBookingHours1793750400000 } from '../../database/migrations/1793750400000-ReservationBookingHours.js';
import { PublicClientBooking1794960000000 } from '../../database/migrations/1794960000000-PublicClientBooking.js';
import { ReservationManagementService } from './reservation-management.service.js';
import { PublicBookingService } from './public-booking.service.js';
import type { PublicBookingDto } from './public-booking.dto.js';

describe.runIf(process.env.PUBLIC_BOOKING_DB_TEST === 'true')('Public booking PostgreSQL integration (isolated schema)', () => {
  let db: DataSource, base: DataSource, service: PublicBookingService, admin: ReservationManagementService;
  const schema = `booking_test_${randomUUID().replaceAll('-','')}`;
  const user = { userId:'mgr',email:'manager@example.invalid',role:'BRANCH_MANAGER' as const,branchId:'a',branchIds:['a'] };
  const input = (overrides: Partial<PublicBookingDto> = {}): PublicBookingDto => ({ branchId:'a',roomId:'room',startAt:'2026-11-09T09:00:00+08:00',endAt:'2026-11-09T10:00:00+08:00',guestCount:2,purpose:'Planning',customerName:'Test Customer',customerEmail:'test@example.invalid',customerPhone:'09171234567',acceptedTerms:true,termsVersion:'2026-11-v1',idempotencyKey:randomUUID(),...overrides });
  beforeAll(async () => {
    process.loadEnvFile('.env');
    const config = { type:'postgres' as const,host:process.env.DB_HOST,port:Number(process.env.DB_PORT ?? 5432),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,synchronize:false };
    base = await new DataSource(config).initialize();
    await base.query(`CREATE SCHEMA "${schema}"`);
    db = await new DataSource({...config,extra:{options:`-c search_path=${schema},public`,max:6}}).initialize();
    await db.query(`CREATE TABLE branches(id varchar(100) PRIMARY KEY,name text,is_active boolean DEFAULT true,manager_user_id varchar(100));
      CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,email text,role text,branch_id varchar(100),status text DEFAULT 'ACTIVE');
      CREATE TABLE user_module_permissions(user_id varchar(100),permission_key text,effect text);
      CREATE TABLE user_branch_access(user_id varchar(100),mode text,branch_ids text[]);
      CREATE VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
      CREATE TABLE employees(id varchar(100) PRIMARY KEY);
      CREATE TABLE rooms(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),name text,floor text,capacity integer,status text,amenities jsonb DEFAULT '[]',image_data text);
      CREATE TABLE reservations(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),room_id varchar(100) REFERENCES rooms(id),employee_id varchar(100) NOT NULL REFERENCES employees(id),status text,start_date_time timestamptz,end_date_time timestamptz,purpose text);
      CREATE TABLE notifications(id varchar(100) PRIMARY KEY,user_id varchar(100),branch_id varchar(100),title text,message text,type text,read boolean,created_at timestamptz,href text,sender_name text);
      INSERT INTO branches(id,name,manager_user_id) VALUES('a','Test branch','mgr');
      INSERT INTO users(id,name,email,role,branch_id) VALUES('mgr','Manager','manager@example.invalid','BRANCH_MANAGER','a');
      INSERT INTO rooms(id,branch_id,name,floor,capacity,status) VALUES('room','a','Test space','1',6,'AVAILABLE');`);
    const runner = db.createQueryRunner();
    await runner.connect();
    try { await new ReservationsManagement1793404800000().up(runner); await new ReservationBookingHours1793750400000().up(runner); await new PublicClientBooking1794960000000().up(runner); await new ManualReservationPayments1795046400000().up(runner);
      await new ManualReservationRefunds1795046401000().up(runner); }
    finally { await runner.release(); }
    admin = new ReservationManagementService(db); service = new PublicBookingService(db,admin);
    vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-11-08T09:00:00+08:00'));
  });
  beforeEach(async () => {
    await db.query('TRUNCATE reservation_customer_mail,reservation_mail_outbox,reservation_events,reservation_payments,reservations,notifications,reservation_space_blocks,reservation_settings CASCADE');
    await db.query("UPDATE rooms SET type='MEETING_ROOM',public_bookable=true,is_active=true,buffer_minutes=0");
  });
  afterAll(async () => { vi.useRealTimers(); await db?.destroy(); if (base?.isInitialized) { await base.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await base.destroy(); } });
  it('serializes competing room bookings and exposes no customer metadata', async () => {
    const result = await Promise.allSettled([service.create(input()),service.create(input())]);
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(result.find(r=>r.status==='rejected')).toMatchObject({reason:{status:409}});
    const publicData = await service.availability({branchId:'a',roomId:'room',date:'2026-11-09',guestCount:1});
    expect(publicData.slots.find(s=>s.startAt.includes('T09:00'))).toBeUndefined();
    expect(JSON.stringify(publicData)).not.toContain('test@example');
    const internal = await admin.list(user,{from:'2026-11-09T00:00:00+08:00',to:'2026-11-10T00:00:00+08:00',page:1,pageSize:20});
    expect(internal.total).toBe(1);
    expect(internal.items[0].source).toBe('PUBLIC_PORTAL');
  });
  it('serializes same-key retries including changed-payload rejection', async () => {
    const d = input(); const [a,b] = await Promise.all([service.create(d),service.create(d)]);
    expect(a.reference).toBe(b.reference);
    expect((await db.query('SELECT count(*)::int AS count FROM reservations'))[0].count).toBe(1);
    await expect(service.create(Object.assign({},d,{guestCount:3}))).rejects.toMatchObject({status:409});
    expect((await db.query('SELECT count(*)::int AS count FROM reservation_customer_mail'))[0].count).toBe(1);
  });
  it('shares capacity across public and admin writers without overselling', async () => {
    await db.query("UPDATE rooms SET type='COWORKING_DESK'");
    const d = input({guestCount:4});
    const result = await Promise.allSettled([service.create(d),admin.create(user,Object.assign({},d,{customerName:'Internal'}))]);
    expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    await service.create(input({guestCount:2}));
    await expect(service.create(input({guestCount:1}))).rejects.toMatchObject({status:409});
  });
  it('honors cancellation, public eligibility, hours, blocks and approval policy', async () => {
    const saved = await service.create(input()); expect(saved.status).toBe('PENDING');
    const [{id}] = await db.query('SELECT id FROM reservations');
    await admin.transition(user,id,'cancel','Test cancellation');
    expect((await service.availability({branchId:'a',roomId:'room',date:'2026-11-09',guestCount:1})).slots.some(s=>s.startAt.includes('T09:00'))).toBe(true);
    await expect(service.create(input({startAt:'2026-11-09T06:00:00+08:00',endAt:'2026-11-09T07:00:00+08:00'}))).rejects.toMatchObject({status:400});
    await expect(service.create(input({startAt:'2026-02-30T09:00:00+08:00'}))).rejects.toMatchObject({status:400});
    await admin.block(user,'room',{startAt:'2026-11-09T11:00:00+08:00',endAt:'2026-11-09T12:00:00+08:00',reason:'Maintenance'});
    await expect(service.create(input({startAt:'2026-11-09T11:00:00+08:00',endAt:'2026-11-09T12:00:00+08:00'}))).rejects.toMatchObject({status:409});
    await db.query("INSERT INTO reservation_settings(branch_id,auto_confirm) VALUES('a',true)");
    expect((await service.create(input())).status).toBe('CONFIRMED');
    await db.query('UPDATE rooms SET public_bookable=false');
    expect(await service.spaces({branchId:'a'})).toEqual([]);
    await expect(service.create(input())).rejects.toMatchObject({status:404});
  });
});
