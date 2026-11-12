import { ManualReservationRefunds1795046401000 } from '../../database/migrations/1795046401000-ManualReservationRefunds.js';
import 'reflect-metadata';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  it,
  expect,
  vi,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ReservationsManagement1793404800000 } from '../../database/migrations/1793404800000-ReservationsManagement.js';
import { ReservationBookingHours1793750400000 } from '../../database/migrations/1793750400000-ReservationBookingHours.js';
import { PublicClientBooking1794960000000 } from '../../database/migrations/1794960000000-PublicClientBooking.js';
import { ManualReservationPayments1795046400000 } from '../../database/migrations/1795046400000-ManualReservationPayments.js';
import { ReservationManagementService } from './reservation-management.service.js';
import { PublicBookingService } from './public-booking.service.js';
import { ManualPaymentService } from './manual-payment.service.js';
import { ManualPaymentWorker } from './manual-payment.worker.js';
import type { PublicBookingDto } from './public-booking.dto.js';
import type { PaymentProofDto } from './manual-payment.dto.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

describe.runIf(process.env.MANUAL_PAYMENT_DB_TEST === 'true')(
  'manual payments — isolated PostgreSQL schema',
  () => {
    let db: DataSource,
      base: DataSource,
      bookings: PublicBookingService,
      reservations: ReservationManagementService,
      payments: ManualPaymentService,
      worker: ManualPaymentWorker;
    let accountId: string, start: string, end: string;
    const schema = `manual_payment_test_${randomUUID().replaceAll('-', '')}`;
    const secretBefore = process.env.PAYMENT_ACCESS_SECRET;
    const manager: AuthUserContext = {
      userId: 'manager',
      email: 'manager@example.invalid',
      role: 'BRANCH_MANAGER',
      branchId: 'a',
      branchIds: ['a'],
    };
    const viewer: AuthUserContext = {
      userId: 'viewer',
      email: 'viewer@example.invalid',
      role: 'STAFF',
      branchId: 'a',
      branchIds: ['a'],
    };
    const other: AuthUserContext = {
      ...manager,
      userId: 'other',
      branchId: 'b',
      branchIds: ['b'],
    };
    const delivery = vi.fn(async () => ({
      status: 'ACCEPTED_BY_PROVIDER' as const,
      failure: null,
    }));
    const booking = (
      overrides: Partial<PublicBookingDto> = {},
    ): PublicBookingDto => ({
      branchId: 'a',
      roomId: 'room',
      startAt: start,
      endAt: end,
      guestCount: 2,
      purpose: 'Integration test',
      customerName: 'Payment Test',
      customerEmail: 'client@example.invalid',
      customerPhone: '09171234567',
      acceptedTerms: true,
      termsVersion: '2026-11-v1',
      idempotencyKey: randomUUID(),
      ...overrides,
    });
    const proof = (
      overrides: Partial<PaymentProofDto> = {},
    ): PaymentProofDto => ({
      paymentAccountId: accountId,
      transactionReference: `TEST-${randomUUID()}`,
      amount: 1000,
      paymentDateTime: new Date().toISOString(),
      mime: 'image/png',
      fileName: 'receipt.png',
      proofBase64:
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNa8AAAAASUVORK5CYII=',
      ...overrides,
    });
    const create = async () => {
      const r = await bookings.create(booking());
      return { reference: String(r.reference), token: String(r.paymentToken) };
    };
    beforeAll(async () => {
      process.loadEnvFile('.env');
      process.env.PAYMENT_ACCESS_SECRET =
        'test-only-secret-with-at-least-32-characters';
      const config = {
        type: 'postgres' as const,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        synchronize: false,
      };
      base = await new DataSource(config).initialize();
      await base.query(`CREATE SCHEMA "${schema}"`);
      db = await new DataSource({
        ...config,
        extra: { options: `-c search_path=${schema},public`, max: 8 },
      }).initialize();
      await db.query(`CREATE TABLE branches(id varchar(100) PRIMARY KEY,name text,is_active boolean DEFAULT true,manager_user_id varchar(100));
      CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,email text,role text,branch_id varchar(100),status text DEFAULT 'ACTIVE');
      CREATE TABLE user_module_permissions(user_id varchar(100),permission_key text,effect text);
      CREATE TABLE user_branch_access(user_id varchar(100),mode text,branch_ids text[]);
      CREATE VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
      CREATE TABLE employees(id varchar(100) PRIMARY KEY);
      CREATE TABLE rooms(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),name text,floor text,capacity integer,status text,amenities jsonb DEFAULT '[]');
      CREATE TABLE reservations(id varchar(100) PRIMARY KEY,branch_id varchar(100) REFERENCES branches(id),room_id varchar(100) REFERENCES rooms(id),employee_id varchar(100) NOT NULL REFERENCES employees(id),status text,start_date_time timestamptz,end_date_time timestamptz,purpose text);
      CREATE TABLE notifications(id varchar(100) PRIMARY KEY,user_id varchar(100),branch_id varchar(100),title text,message text,type text,read boolean,created_at timestamptz,href text,sender_name text);
      INSERT INTO branches(id,name,manager_user_id) VALUES('a','Test branch','manager'),('b','Other branch','other');
      INSERT INTO users(id,name,email,role,branch_id) VALUES('manager','Manager','manager@example.invalid','BRANCH_MANAGER','a'),('viewer','Viewer','viewer@example.invalid','STAFF','a'),('other','Other','other@example.invalid','BRANCH_MANAGER','b');
      INSERT INTO rooms(id,branch_id,name,floor,capacity,status) VALUES('room','a','Test room','1',6,'AVAILABLE');`);
      const runner = db.createQueryRunner();
      await runner.connect();
      try {
        await new ReservationsManagement1793404800000().up(runner);
        await new ReservationBookingHours1793750400000().up(runner);
        await new PublicClientBooking1794960000000().up(runner);
        await new ManualReservationPayments1795046400000().up(runner);
        await new ManualReservationRefunds1795046401000().up(runner);
      } finally {
        await runner.release();
      }
      reservations = new ReservationManagementService(db);
      bookings = new PublicBookingService(db, reservations);
      payments = new ManualPaymentService(db, reservations);
      worker = new ManualPaymentWorker(db, payments, reservations, {
        sendReservationPaymentNotice: delivery,
      });
      const date = new Date(Date.now() + 2 * 86400000)
        .toISOString()
        .slice(0, 10);
      start = `${date}T09:00:00+08:00`;
      end = `${date}T10:00:00+08:00`;
    });
    beforeEach(async () => {
      await db.query(
        'TRUNCATE reservation_payment_mail,reservation_payment_audit_logs,reservation_payment_submissions,reservation_payment_accounts,reservation_payment_policy,reservation_customer_mail,reservation_mail_outbox,reservation_events,reservation_payments,reservations,notifications,reservation_settings,user_module_permissions CASCADE',
      );
      await db.query(
        "UPDATE rooms SET type='MEETING_ROOM',hourly_rate=1000,public_bookable=true,is_active=true,buffer_minutes=0",
      );
      await db.query(
        "INSERT INTO reservation_settings(branch_id,auto_confirm,allowed_days) VALUES('a',true,ARRAY[1,2,3,4,5,6,7])",
      );
      await db.query(
        "INSERT INTO user_module_permissions VALUES('viewer','operations.reservations.list','VIEW')",
      );
      const a = await payments.saveAccount(manager, {
        branchId: 'a',
        paymentMethod: 'BANK_TRANSFER',
        bankName: 'Test Bank',
        accountName: 'Test Company',
        accountNumber: '0000000000',
        isActive: true,
        isDefault: true,
      });
      accountId = String(a.id);
      delivery.mockClear();
    });
    afterAll(async () => {
      if (secretBefore === undefined) delete process.env.PAYMENT_ACCESS_SECRET;
      else process.env.PAYMENT_ACCESS_SECRET = secretBefore;
      await db?.destroy();
      if (base?.isInitialized) {
        await base.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await base.destroy();
      }
    });
    it('creates a temporary hold with a private token and backend-calculated amount, overriding auto-confirm', async () => {
      const d = booking(),
        r = await bookings.create(d);
      expect(r.status).toBe('PENDING');
      expect(r.amount).toBe(1000);
      expect(r.paymentToken).toHaveLength(64);
      expect(r.paymentDeadline).toBeTruthy();
      expect((await bookings.create(d)).paymentToken).toBe(r.paymentToken);
      const info = await payments.payment(
        String(r.reference),
        String(r.paymentToken),
      );
      expect(info.paymentStatus).toBe('NOT_SUBMITTED');
      expect(info.accounts).toHaveLength(1);
      await expect(
        payments.payment(String(r.reference), ''),
      ).rejects.toMatchObject({ status: 404 });
      const [{ id }] = await db.query('SELECT id FROM reservations');
      await expect(
        reservations.transition(manager, id, 'approve'),
      ).rejects.toMatchObject({ status: 409 });
    });
    it('stores private proof and confirms only after independent verification, including concurrent retries', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      expect(
        (await payments.payment(r.reference, r.token)).reservationStatus,
      ).toBe('PENDING');
      expect(
        JSON.stringify(await payments.detail(manager, String(s.id))),
      ).not.toContain('proof_data');
      expect(
        (await payments.proof(viewer, String(s.id))).proof_data,
      ).toBeInstanceOf(Buffer);
      await expect(
        payments.decide(manager, String(s.id), 'verify', {
          notes: 'Not checked',
          verifiedAmount: 1000,
        }),
      ).rejects.toMatchObject({ status: 400 });
      const results = await Promise.all(
        [1, 2].map(() =>
          payments.decide(manager, String(s.id), 'verify', {
            notes: 'Checked actual bank transaction',
            verifiedAmount: 1000,
            independentlyChecked: true,
          }),
        ),
      );
      expect(results.every((v) => v.status === 'VERIFIED')).toBe(true);
      expect(
        (
          await db.query('SELECT count(*)::int AS n FROM reservation_payments')
        )[0].n,
      ).toBe(1);
      expect(
        (await payments.payment(r.reference, r.token)).reservationStatus,
      ).toBe('CONFIRMED');
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM reservation_customer_mail WHERE event='CONFIRMED'",
          )
        )[0].n,
      ).toBe(1);
    });
    it('enforces view-only, branch scope and receiving-account management permissions', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      expect((await payments.queue(viewer, { page: 1 })).length).toBe(1);
      await expect(
        payments.decide(viewer, String(s.id), 'verify', {
          notes: 'Trying edit',
          verifiedAmount: 1000,
          independentlyChecked: true,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(payments.proof(other, String(s.id))).rejects.toMatchObject({
        status: 403,
      });
      await expect(
        payments.saveAccount(viewer, {
          branchId: 'a',
          paymentMethod: 'GCASH',
          accountName: 'Personal',
          accountNumber: '09171234567',
          isActive: true,
          isDefault: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        payments.saveAccount(manager, {
          paymentMethod: 'GCASH',
          accountName: 'Global',
          accountNumber: '09171234567',
          isActive: true,
          isDefault: false,
        }),
      ).rejects.toMatchObject({ status: 403 });
    });
    it('rejects unsupported file bytes, oversize files and inactive or cross-branch accounts', async () => {
      const r = await create();
      await expect(
        payments.submit(
          r.reference,
          r.token,
          proof({
            proofBase64: Buffer.from('not an image').toString('base64'),
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        payments.submit(
          r.reference,
          r.token,
          proof({
            proofBase64: Buffer.alloc(6 * 1024 * 1024, 1).toString('base64'),
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
      await db.query(
        'UPDATE reservation_payment_accounts SET is_active=false WHERE id=$1',
        [accountId],
      );
      await expect(
        payments.submit(r.reference, r.token, proof()),
      ).rejects.toMatchObject({ status: 400 });
      await db.query(
        "UPDATE reservation_payment_accounts SET is_active=true,branch_id='b' WHERE id=$1",
        [accountId],
      );
      await expect(
        payments.submit(r.reference, r.token, proof()),
      ).rejects.toMatchObject({ status: 400 });
    });
    it('permits corrected evidence after rejection without cancelling or extending the bounded hold', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      const before = await payments.payment(r.reference, r.token);
      await payments.decide(manager, String(s.id), 'reject', {
        notes: 'Unreadable proof. Please resubmit.',
      });
      const rejected = await payments.payment(r.reference, r.token);
      expect(rejected.reservationStatus).toBe('PENDING');
      expect(rejected.paymentStatus).toBe('REJECTED');
      await payments.submit(r.reference, r.token, proof());
      expect((await payments.payment(r.reference, r.token)).holdUntil).toEqual(
        before.holdUntil,
      );
    });
    it('prevents simultaneous duplicate transaction allocation across different bookings', async () => {
      const a = await create();
      const b = await bookings.create(
        booking({
          startAt: start.replace('09:', '11:'),
          endAt: end.replace('10:', '12:'),
        }),
      );
      const d = proof();
      const result = await Promise.allSettled([
        payments.submit(a.reference, a.token, d),
        payments.submit(String(b.reference), String(b.paymentToken), d),
      ]);
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(result.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { status: 409 },
      });
    });
    it('honors partial deposits and recalculates the verified balance', async () => {
      await payments.savePolicy(manager, 'a', {
        holdMinutes: 30,
        reviewMinutes: 60,
        reminderMinutes: 10,
        depositPercent: 50,
      });
      const r = await create();
      const s = await payments.submit(
        r.reference,
        r.token,
        proof({ amount: 250 }),
      );
      await payments.decide(manager, String(s.id), 'verify', {
        notes: 'Actual first transfer checked',
        verifiedAmount: 250,
        independentlyChecked: true,
      });
      expect(
        (await payments.payment(r.reference, r.token)).reservationStatus,
      ).toBe('PENDING');
      const second = await payments.submit(
        r.reference,
        r.token,
        proof({ amount: 250 }),
      );
      await payments.decide(manager, String(second.id), 'verify', {
        notes: 'Actual second transfer checked',
        verifiedAmount: 250,
        independentlyChecked: true,
      });
      const info = await payments.payment(r.reference, r.token);
      expect(info.reservationStatus).toBe('CONFIRMED');
      expect(info.paymentStatus).toBe('PARTIALLY_PAID');
      expect(info.paidAmount).toBe(500);
    });
    it('expires bounded holds and never restores an expired booking over a new customer', async () => {
      const a = await create(),
        s = await payments.submit(a.reference, a.token, proof());
      await db.query(
        "UPDATE reservations SET payment_hold_until=now()-interval '1 minute' WHERE reference=$1",
        [a.reference],
      );
      await worker.flush();
      const b = await create();
      expect(b.reference).not.toBe(a.reference);
      await payments.decide(manager, String(s.id), 'verify', {
        notes: 'Late received funds recorded for reconciliation',
        verifiedAmount: 1000,
        independentlyChecked: true,
      });
      const old = await payments.payment(a.reference, a.token);
      expect(old.reservationStatus).toBe('CANCELLED');
      expect(old.expired).toBe(true);
      expect(old.paidAmount).toBe(1000);
      await expect(
        payments.submit(a.reference, a.token, proof()),
      ).rejects.toMatchObject({ status: 409 });
      expect(
        (await payments.payment(b.reference, b.token)).reservationStatus,
      ).toBe('PENDING');
    });
    it('holds a submitted payment only through the configured review window and sends truthful email', async () => {
      const r = await create();
      await payments.submit(r.reference, r.token, proof());
      await worker.flush();
      expect(delivery.mock.calls.length).toBeGreaterThan(0);
      const messages = await db.query(
        'SELECT message FROM reservation_payment_mail',
      );
      expect(
        messages.some((m: { message: string }) =>
          m.message.includes('awaiting verification'),
        ),
      ).toBe(true);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM reservation_payment_mail WHERE sent_at IS NULL AND attempts<8',
          )
        )[0].n,
      ).toBe(0);
      const [{ payment_deadline, payment_hold_until }] = await db.query(
        'SELECT payment_deadline,payment_hold_until FROM reservations',
      );
      expect(+payment_hold_until - +payment_deadline).toBe(1440 * 60000);
    });
    it('allows a verified balance top-up on a confirmed booking after its initial hold deadline', async () => {
      await payments.savePolicy(manager, 'a', {
        holdMinutes: 30,
        reviewMinutes: 60,
        reminderMinutes: 10,
        depositPercent: 50,
      });
      const r = await create(),
        first = await payments.submit(
          r.reference,
          r.token,
          proof({ amount: 500 }),
        );
      await payments.decide(manager, String(first.id), 'verify', {
        notes: 'Actual deposit transaction checked',
        verifiedAmount: 500,
        independentlyChecked: true,
      });
      const second = await payments.submit(
        r.reference,
        r.token,
        proof({ amount: 500 }),
      );
      await db.query(
        "UPDATE reservations SET payment_hold_until=now()-interval '1 minute' WHERE reference=$1",
        [r.reference],
      );
      const result = await payments.decide(
        manager,
        String(second.id),
        'verify',
        {
          notes: 'Actual balance transaction checked',
          verifiedAmount: 500,
          independentlyChecked: true,
        },
      );
      expect(result.needsReconciliation).toBe(false);
      expect((await payments.payment(r.reference, r.token)).paidAmount).toBe(
        1000,
      );
      expect(
        (await payments.payment(r.reference, r.token)).reservationStatus,
      ).toBe('CONFIRMED');
    });
    it('sends rejection email for a later proof when an earlier payment was partially verified', async () => {
      const r = await create();
      const first = await payments.submit(
        r.reference,
        r.token,
        proof({ amount: 250 }),
      );
      await payments.decide(manager, String(first.id), 'verify', {
        notes: 'First transfer independently checked',
        verifiedAmount: 250,
        independentlyChecked: true,
      });
      const second = await payments.submit(
        r.reference,
        r.token,
        proof({ amount: 750 }),
      );
      await payments.decide(manager, String(second.id), 'reject', {
        notes: 'Second transaction not found. Please resubmit.',
      });
      expect((await payments.payment(r.reference, r.token)).paymentStatus).toBe(
        'PARTIALLY_PAID',
      );
      await worker.flush();
      const [notice] = await db.query(
        "SELECT sent_at,failure FROM reservation_payment_mail WHERE event='PAYMENT_REJECTED'",
      );
      expect(notice.sent_at).toBeTruthy();
      expect(notice.failure).toBeNull();
    });
    it('serializes competing reservations without double booking', async () => {
      const result = await Promise.allSettled([create(), create()]);
      expect(result.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
    });
    it('preserves account snapshots after edits and audits activation/default changes', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      await payments.saveAccount(
        manager,
        {
          branchId: 'a',
          paymentMethod: 'BANK_TRANSFER',
          bankName: 'Updated Test Bank',
          accountName: 'Updated Company',
          accountNumber: '1111111111',
          isActive: false,
          isDefault: false,
        },
        accountId,
      );
      const detail = await payments.detail(manager, String(s.id));
      expect((detail.account as { accountNumber: string }).accountNumber).toBe(
        '0000000000',
      );
      expect(await payments.publicAccounts('a')).toHaveLength(0);
      expect(
        (
          await db.query(
            "SELECT count(*)::int AS n FROM reservation_payment_audit_logs WHERE action='ACCOUNT_UPDATED'",
          )
        )[0].n,
      ).toBe(1);
    });
    it('recalculates balances and requires additional verified payment after a price increase', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      await payments.decide(manager, String(s.id), 'verify', {
        notes: 'Actual bank receipt checked',
        verifiedAmount: 1000,
        independentlyChecked: true,
      });
      const [{ id }] = await db.query('SELECT id FROM reservations');
      await reservations.update(
        manager,
        id,
        booking({ endAt: end.replace('10:', '11:') }),
      );
      const info = await payments.payment(r.reference, r.token);
      expect(info.amount).toBe(2000);
      expect(info.reservationStatus).toBe('PENDING');
      expect(info.paidAmount).toBe(1000);
      expect(info.paymentStatus).toBe('PARTIALLY_PAID');
    });
    it('records refunds only after independent confirmation and never marks requested refunds complete', async () => {
      const r = await create(),
        s = await payments.submit(r.reference, r.token, proof());
      await payments.decide(manager, String(s.id), 'verify', {
        notes: 'Actual bank receipt checked',
        verifiedAmount: 1000,
        independentlyChecked: true,
      });
      const [{ id }] = await db.query('SELECT id FROM reservations');
      await reservations.transition(
        manager,
        id,
        'cancel',
        'Customer cancellation approved',
      );
      await expect(
        payments.decide(manager, String(s.id), 'confirm-refund', {
          notes: 'Requested a refund',
          refundReference: 'TEST-REFUND-1',
        }),
      ).rejects.toMatchObject({ status: 400 });
      expect((await payments.payment(r.reference, r.token)).paidAmount).toBe(
        1000,
      );
      const d = {
        notes: 'Actual completed refund checked in bank records',
        refundReference: 'TEST-REFUND-1',
        independentlyChecked: true,
      };
      await payments.decide(manager, String(s.id), 'confirm-refund', d);
      await payments.decide(manager, String(s.id), 'confirm-refund', d);
      const info = await payments.payment(r.reference, r.token);
      expect(info.paymentStatus).toBe('REFUNDED');
      expect(info.paidAmount).toBe(0);
      expect(info.reservationStatus).toBe('CANCELLED');
      const report = await reservations.report(
        manager,
        new Date(+new Date(start) - 86400000).toISOString(),
        new Date(+new Date(end) + 86400000).toISOString(),
      );
      expect(report[0].recordedPayments).toBe(0);
      expect(report[0].refundedPayments).toBe(1000);
      expect(
        (
          await db.query(
            'SELECT count(*)::int AS n FROM reservation_payment_refunds',
          )
        )[0].n,
      ).toBe(1);
    });
  },
);
