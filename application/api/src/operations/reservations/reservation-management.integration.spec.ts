import { ManualReservationRefunds1795046401000 } from '../../database/migrations/1795046401000-ManualReservationRefunds.js';
import { ManualReservationPayments1795046400000 } from '../../database/migrations/1795046400000-ManualReservationPayments.js';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm';
import { ReservationsManagement1793404800000 } from '../../database/migrations/1793404800000-ReservationsManagement.js';
import { OcularVisitReservationType1793577600000 } from '../../database/migrations/1793577600000-OcularVisitReservationType.js';
import { ReservationsWithoutRoomAssignment1793664000000 } from '../../database/migrations/1793664000000-ReservationsWithoutRoomAssignment.js';
import { ReservationManagementService } from './reservation-management.service.js';
import { ReservationMailService } from './reservation-mail.service.js';
import { PublicClientBooking1794960000000 } from '../../database/migrations/1794960000000-PublicClientBooking.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

describe.runIf(process.env.RESERVATION_DB_TEST === 'true')(
  'Reservations PostgreSQL transactions (rollback-only)',
  () => {
    let db: DataSource,
      runner: QueryRunner,
      service: ReservationManagementService;
    const manager: AuthUserContext = {
      userId: 'mgr',
      email: 'mgr@example.invalid',
      role: 'BRANCH_MANAGER',
      branchId: 'a',
      branchIds: ['a'],
    };
    const staff: AuthUserContext = {
      userId: 'staff',
      email: 'staff@example.invalid',
      role: 'STAFF',
      branchId: 'a',
      branchIds: ['a'],
    };
    const input = () => ({
      branchId: 'a',
      roomId: 'room-a',
      startAt: new Date(Date.now() + 2 * 86400000).toISOString(),
      endAt: new Date(Date.now() + 2 * 86400000 + 3600000).toISOString(),
      guestCount: 2,
      purpose: 'Planning meeting',
      customerName: 'Customer A',
      customerEmail: 'customer@example.invalid',
      customerPhone: '09170000000',
    });
    beforeAll(async () => {
      process.loadEnvFile('.env');
      db = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        synchronize: false,
        migrationsRun: false,
      });
      await db.initialize();
    });
    beforeEach(async () => {
      runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      const schema = `reservation_fixture_${randomUUID().replaceAll('-', '')}`;
      await runner.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public;
      CREATE TABLE branches(id varchar(100) PRIMARY KEY,name text,is_active boolean DEFAULT true,manager_user_id varchar(100));
      CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,email text,role text,branch_id varchar(100),status text DEFAULT 'ACTIVE');
      CREATE TABLE user_branch_access(user_id varchar(100),mode text,branch_ids text[]);
      CREATE VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
      CREATE TABLE user_module_permissions(user_id varchar(100),permission_key text,effect text);
      CREATE TABLE employees(id varchar(100) PRIMARY KEY);
      CREATE TABLE rooms(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),name text,floor text,
        capacity integer,status text,amenities jsonb DEFAULT '[]');
      CREATE TABLE reservations(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),
        room_id varchar(100) REFERENCES rooms(id),employee_id varchar(100) NOT NULL REFERENCES employees(id),
        status text,start_date_time timestamptz,end_date_time timestamptz,purpose text);
      CREATE TABLE notifications(id varchar(100) PRIMARY KEY,user_id varchar(100),branch_id varchar(100),title text,
        message text,type text,read boolean,created_at timestamptz,href text,sender_name text);
      INSERT INTO branches(id,name,manager_user_id) VALUES ('a','Makati','mgr'),('b','Ortigas',NULL);
      INSERT INTO users(id,name,email,role,branch_id) VALUES ('mgr','Manager','mgr@example.invalid','BRANCH_MANAGER','a'),
        ('staff','Staff','staff@example.invalid','STAFF','a');
      INSERT INTO rooms(id,branch_id,name,floor,capacity,status) VALUES ('room-a','a','Meeting room','2',6,'AVAILABLE');`);
      await new ReservationsManagement1793404800000().up(runner);
      await new OcularVisitReservationType1793577600000().up(runner);
      await new ReservationsWithoutRoomAssignment1793664000000().up(runner);
      await new PublicClientBooking1794960000000().up(runner); await new ManualReservationPayments1795046400000().up(runner);
      await new ManualReservationRefunds1795046401000().up(runner);
      await runner.query(`UPDATE rooms SET hourly_rate=100 WHERE id='room-a'`);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-07T09:00:00+08:00'));
      const scoped = {
        manager: runner.manager,
        query: runner.manager.query.bind(runner.manager),
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          runner.manager.transaction(fn),
      } as DataSource;
      service = new ReservationManagementService(scoped);
    });
    afterEach(async () => {
      vi.useRealTimers();
      await runner.rollbackTransaction();
      await runner.release();
    });
    afterAll(async () => {
      await db?.destroy();
    });
    it('persists a booking, rejects an overlap, records lifecycle and payment history', async () => {
      const first = await service.create(manager, input());
      expect(first.status).toBe('PENDING');
      await expect(service.create(manager, input())).rejects.toThrow(
        'booked or blocked',
      );
      const listed = await service.list(manager, {
        page: 1,
        pageSize: 20,
        from: new Date(Date.now() + 86400000).toISOString(),
        to: new Date(Date.now() + 4 * 86400000).toISOString(),
      });
      expect(listed.total).toBe(1);
      await service.transition(manager, String(first.id), 'approve');
      await service.payment(manager, String(first.id), {
        amount: 0.01,
        method: 'CASH',
      });
      await service.transition(manager, String(first.id), 'check-in');
      await service.transition(manager, String(first.id), 'check-out');
      const detail = await service.detail(manager, String(first.id));
      expect(detail.record.status).toBe('COMPLETED');
      expect(detail.events).toHaveLength(5);
      expect(detail.payments).toHaveLength(1);
    });
    it('blocks maintenance windows and denies cross-branch reads', async () => {
      const slot = input();
      await service.block(manager, 'room-a', {
        startAt: slot.startAt,
        endAt: slot.endAt,
        reason: 'Repairs',
      });
      await expect(service.create(manager, slot)).rejects.toThrow(
        'booked or blocked',
      );
      await expect(
        service.list(
          { ...manager, branchIds: ['b'] },
          { page: 1, pageSize: 20, branchId: 'a' },
        ),
      ).rejects.toThrow('Reservation access denied');
    });
    it('rechecks availability and recalculates the booking price when edited', async () => {
      const firstInput = input();
      const first = await service.create(manager, firstInput);
      const secondInput = {
        ...input(),
        startAt: new Date(
          Date.now() + 2 * 86400000 + 4 * 3600000,
        ).toISOString(),
        endAt: new Date(Date.now() + 2 * 86400000 + 5 * 3600000).toISOString(),
      };
      await service.create(manager, secondInput);
      await expect(
        service.update(manager, String(first.id), secondInput),
      ).rejects.toThrow('booked or blocked');
      const updated = await service.update(manager, String(first.id), {
        ...firstInput,
        startAt: new Date(
          Date.now() + 2 * 86400000 + 1 * 3600000,
        ).toISOString(),
        endAt: new Date(Date.now() + 2 * 86400000 + 3 * 3600000).toISOString(),
      });
      expect(Number(updated.amount)).toBe(200);
    });
    it('queues committed notices and sends only to currently authorized recipients', async () => {
      const reservation = await service.create(staff, input());
      await service.transition(manager, String(reservation.id), 'approve');
      const pending = await runner.query<
        Array<{ event: string; user_id: string }>
      >(`SELECT event,user_id FROM reservation_mail_outbox ORDER BY event`);
      expect(pending).toEqual([
        { event: 'CONFIRMED', user_id: 'staff' },
        { event: 'PENDING', user_id: 'mgr' },
      ]);
      const sent: string[] = [];
      const mail = new ReservationMailService(
        {
          transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
            runner.manager.transaction(fn),
        } as DataSource,
        {
          sendReservationNotice: async (email, _name, _id, event) => {
            sent.push(`${email}:${event}`);
            return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
          },
        },
      );
      await mail.flush();
      expect(sent).toEqual(
        expect.arrayContaining([
          'mgr@example.invalid:PENDING',
          'staff@example.invalid:CONFIRMED',
        ]),
      );
      const remaining = await runner.query<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM reservation_mail_outbox WHERE sent_at IS NULL`,
      );
      expect(remaining[0].count).toBe(0);
    });
    it('suppresses queued email after a recipient loses access', async () => {
      await service.create(staff, input());
      await runner.query(`UPDATE users SET role='IT_ADMIN' WHERE id='mgr'`);
      const sent: string[] = [];
      const mail = new ReservationMailService(
        {
          transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
            runner.manager.transaction(fn),
        } as DataSource,
        {
          sendReservationNotice: async (email) => {
            sent.push(email);
            return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
          },
        },
      );
      await mail.flush();
      expect(sent).toEqual([]);
      const rows = await runner.query<Array<{ failure: string }>>(
        `SELECT failure FROM reservation_mail_outbox`,
      );
      expect(rows[0].failure).toBe('RECIPIENT_NO_LONGER_AUTHORIZED');
    });
    it('does not email a branch manager outside their selected branch scope', async () => {
      await service.create(staff, input());
      await runner.query(
        `INSERT INTO user_branch_access(user_id,mode,branch_ids) VALUES('mgr','SELECTED',ARRAY['b'])`,
      );
      const sent: string[] = [];
      const mail = new ReservationMailService(
        {
          transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
            runner.manager.transaction(fn),
        } as DataSource,
        {
          sendReservationNotice: async (email) => {
            sent.push(email);
            return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
          },
        },
      );
      await mail.flush();
      expect(sent).toEqual([]);
      const rows = await runner.query<
        Array<{ user_id: string; failure: string | null }>
      >(
        `SELECT user_id,failure FROM reservation_mail_outbox WHERE user_id='mgr'`,
      );
      expect(rows[0]).toEqual({
        user_id: 'mgr',
        failure: 'RECIPIENT_NO_LONGER_AUTHORIZED',
      });
    });
  },
);
