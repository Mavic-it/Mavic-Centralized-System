import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { randomUUID } from 'node:crypto';
import { DataSource, type QueryRunner } from 'typeorm';
import { InquiryManagement1795910400000 } from '../../database/migrations/1795910400000-InquiryManagement.js';
import { InquiryReservationLinks1795910401000 } from '../../database/migrations/1795910401000-InquiryReservationLinks.js';
import { InquiryEventSequenceRepair1795910402000 } from '../../database/migrations/1795910402000-InquiryEventSequenceRepair.js';
import { InquiryReminderSchemaRepair1795910403000 } from '../../database/migrations/1795910403000-InquiryReminderSchemaRepair.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { InquiryManagementService } from './inquiry-management.service.js';
import { InquiryImportService } from './inquiry-import.service.js';
import { InquiryReminderWorker } from './inquiry-reminder.worker.js';
import { InquiryQueryDto, SaveInquiryDto } from './inquiry.dto.js';
import * as XLSX from 'xlsx';

describe.runIf(process.env.INQUIRY_DB_TEST === 'true')(
  'Inquiry PostgreSQL workflow (isolated schema, rolled back)',
  () => {
    let db: DataSource, runner: QueryRunner, service: InquiryManagementService;
    const actor: AuthUserContext = {
      userId: 'admin',
      email: 'admin@example.invalid',
      role: 'SUPER_ADMIN',
      branchId: 'a',
      branchIds: ['a', 'b'],
    };
    const input = () =>
      Object.assign(new SaveInquiryDto(), {
        branchId: 'a',
        clientName: 'Synthetic client',
        inquiryDate: '2026-11-24',
        preferredBranchIds: ['a', 'b'],
        serviceIds: ['inq-service-0', 'inq-service-1'],
        channelId: 'inq-channel-1',
        assignedStaffId: 'admin',
      });
    beforeAll(async () => {
      process.loadEnvFile('.env');
      if (
        !['localhost', '127.0.0.1', '::1'].includes(
          process.env.DB_HOST ?? 'localhost',
        )
      )
        throw new Error(
          'Inquiry fixture only runs against a local PostgreSQL host.',
        );
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
      const schema = `inquiry_fixture_${randomUUID().replaceAll('-', '')}`;
      await runner.query(`CREATE SCHEMA "${schema}";SET LOCAL search_path TO "${schema}",public;
      CREATE TABLE branches(id varchar(100) PRIMARY KEY,name text,is_active boolean DEFAULT true,status text DEFAULT 'ACTIVE',manager_user_id text);
      CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,email text,role text,branch_id varchar(100),status text DEFAULT 'ACTIVE');
      CREATE TABLE customers(id varchar(100) PRIMARY KEY,branch_id varchar(100),name text,email text,phone text);
      CREATE TABLE branch_settings(branch_id varchar(100),setting_key text,setting_value jsonb,PRIMARY KEY(branch_id,setting_key));
      CREATE TABLE user_module_permissions(user_id varchar(100),permission_key text,effect text);
      CREATE TABLE user_branch_access(user_id varchar(100),mode text,branch_ids text[]);
      CREATE VIEW employee_branch_access AS SELECT * FROM user_branch_access;
      CREATE TABLE audit_logs(id varchar(100) PRIMARY KEY,user_id varchar(100),branch_id varchar(100),action text,resource text,details text,created_at timestamptz);
      CREATE TABLE notifications(id varchar(100) PRIMARY KEY,user_id varchar(100),branch_id varchar(100),title text,message text,type text,read boolean,created_at timestamptz,href text);
      CREATE TABLE inquiries(id varchar(100) PRIMARY KEY,branch_id varchar(100) NOT NULL REFERENCES branches(id),customer_id varchar(100) NOT NULL REFERENCES customers(id),assigned_staff_id varchar(100) NOT NULL,space_interest text NOT NULL,budget numeric NOT NULL,status varchar(30) NOT NULL,notes text NOT NULL,follow_ups jsonb NOT NULL DEFAULT '[]');
      CREATE TABLE reservations(id varchar(100) PRIMARY KEY,status text,created_by varchar(100),approved_by varchar(100),reference text DEFAULT 'Synthetic booking',branch_id varchar(100) DEFAULT 'a',start_date_time timestamptz DEFAULT now(),end_date_time timestamptz DEFAULT now());
      INSERT INTO branches(id,name) VALUES('a','Ortigas'),('b','Makati');
      INSERT INTO users(id,name,email,role,branch_id) VALUES('admin','Synthetic admin','admin@example.invalid','SUPER_ADMIN','a'),('staff','Synthetic staff','staff@example.invalid','STAFF','a');`);
      await new InquiryManagement1795910400000().up(runner);
      await new InquiryReservationLinks1795910401000().up(runner);
      const scoped = {
        query: runner.manager.query.bind(runner.manager),
        transaction: async <T>(fn: (m: typeof runner.manager) => Promise<T>) =>
          fn(runner.manager),
      } as unknown as DataSource;
      service = new InquiryManagementService(scoped);
    });
    afterEach(async () => {
      if (runner) {
        await runner.rollbackTransaction();
        await runner.release();
      }
    });
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
    });
    it('preserves existing legacy records and tolerates invalid historical timestamps', async () => {
      const schema = `inquiry_legacy_${randomUUID().replaceAll('-', '')}`;
      await runner.query(`CREATE SCHEMA "${schema}";SET LOCAL search_path TO "${schema}",public;
        CREATE TABLE branches(id varchar(100) PRIMARY KEY);CREATE TABLE users(id varchar(100) PRIMARY KEY);CREATE TABLE customers(id varchar(100) PRIMARY KEY,name text);
        CREATE TABLE inquiries(id varchar(100) PRIMARY KEY,branch_id varchar(100) NOT NULL REFERENCES branches(id),customer_id varchar(100) NOT NULL REFERENCES customers(id),assigned_staff_id varchar(100) NOT NULL,space_interest text NOT NULL,budget numeric NOT NULL,status varchar(30) NOT NULL,notes text NOT NULL,follow_ups jsonb NOT NULL DEFAULT '[]');
        INSERT INTO branches VALUES('a');INSERT INTO users VALUES('admin');INSERT INTO customers VALUES('customer','Synthetic legacy client');
        INSERT INTO inquiries VALUES('legacy','a','customer','historical-staff','Private Office',100,'UNKNOWN_STAGE','Original remarks','[{"note":"Original follow-up","createdAt":"2026-99-99T99:99:99Z"}]');`);
      await new InquiryManagement1795910400000().up(runner);
      const [row] = await runner.query(
        `SELECT notes,status,legacy_outcome,follow_ups,client_name FROM inquiries WHERE id='legacy'`,
      );
      expect(row).toMatchObject({
        notes: 'Original remarks',
        status: 'NEEDS_REVIEW',
        legacy_outcome: 'UNKNOWN_STAGE',
        client_name: 'Synthetic legacy client',
      });
      expect(row.follow_ups[0].createdAt).toBe('2026-99-99T99:99:99Z');
    });
    it('persists relational selections, unique references and events', async () => {
      const a = await service.save(actor, input()),
        b = await service.save(actor, input());
      expect(a.record.reference).not.toBe(b.record.reference);
      expect(a.record.preferredBranchIds).toHaveLength(2);
      expect(a.record.serviceIds).toHaveLength(2);
      expect(a.events).toHaveLength(1);
      const metrics = await service.analytics(actor, new InquiryQueryDto());
      expect(metrics.totals.total).toBe(2);
    });
    it('repairs event history tables created without their ordering sequence', async () => {
      const inquiry = await service.save(actor, input());
      await runner.query('ALTER TABLE inquiry_events DROP COLUMN sequence');
      await new InquiryEventSequenceRepair1795910402000().up(runner);
      const rows = await runner.query(
        'SELECT id,sequence FROM inquiry_events ORDER BY sequence',
      );
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].sequence)).toBe(1);
      const metrics = await service.analytics(actor, new InquiryQueryDto());
      expect(metrics.totals.total).toBe(1);
      expect((await service.detail(actor, inquiry.record.id)).events).toHaveLength(1);
    });
    it('rejects cross-branch detail and exports despite preferred branch membership', async () => {
      const a = await service.save(actor, input());
      const foreign = { ...actor, branchId: 'b', branchIds: ['b'] };
      await expect(service.detail(foreign, a.record.id)).rejects.toThrow(
        'not found',
      );
      expect((await service.list(foreign, new InquiryQueryDto())).total).toBe(
        0,
      );
      expect(
        await service.export(foreign, new InquiryQueryDto()),
      ).not.toContain('Synthetic client');
    });
    it('preserves immutable history and detects stale writes', async () => {
      const a = await service.save(actor, input());
      const b = await service.action(actor, a.record.id, {
        version: 1,
        status: 'IN_PROGRESS',
      });
      expect(b.record.version).toBe(2);
      await expect(
        service.action(actor, a.record.id, {
          version: 1,
          status: 'NO_RESPONSE',
        }),
      ).rejects.toThrow('changed');
      expect((await service.detail(actor, a.record.id)).events).toHaveLength(2);
    });
    it('groups same-name staff by account identity for accurate report drill-down', async () => {
      await runner.query(
        `INSERT INTO users(id,name,email,role,branch_id) VALUES('same-one','Same staff name','one@example.invalid','STAFF','a'),('same-two','Same staff name','two@example.invalid','STAFF','a')`,
      );
      await service.save(
        actor,
        Object.assign(input(), { assignedStaffId: 'same-one' }),
      );
      await service.save(
        actor,
        Object.assign(input(), { assignedStaffId: 'same-two' }),
      );
      const data = await service.analytics(actor, new InquiryQueryDto());
      const groups = data.groups.staff as { staffId: string; count: number }[];
      expect(new Set(groups.map((g) => g.staffId)).size).toBe(2);
      expect(groups.every((g) => g.count === 1)).toBe(true);
    });
    it('suggests customers by normalized contact details without merging same-name clients', async () => {
      await runner.query(
        `INSERT INTO customers(id,branch_id,name,email,phone) VALUES('one','a','Same synthetic name','client@example.invalid','+63 (917) 123-4567'),('two','a','Same synthetic name','other@example.invalid','09990000000'),('foreign','b','Same synthetic name','client@example.invalid','09170000000')`,
      );
      const email = await service.customers(
        actor,
        'a',
        ' CLIENT@EXAMPLE.INVALID ',
      );
      expect(email).toHaveLength(1);
      expect(email[0].id).toBe('one');
      const phone = await service.customers(actor, 'a', '639171234567');
      expect(phone).toHaveLength(1);
      expect(phone[0].id).toBe('one');
      expect(
        await service.customers(actor, 'a', 'Same synthetic name'),
      ).toHaveLength(2);
    });
    it('validates assignment and follow-up scheduling', async () => {
      await expect(
        service.save(
          actor,
          Object.assign(input(), { assignedStaffId: 'not-active' }),
        ),
      ).rejects.toThrow('active staff');
      await expect(
        service.save(
          actor,
          Object.assign(input(), { nextAction: 'Follow-up' }),
        ),
      ).rejects.toThrow('date and time');
    });
    it('schedules and completes a task without automatically closing the inquiry', async () => {
      const a = await service.save(actor, input());
      const b = await service.schedule(actor, a.record.id, {
        description: 'Call client',
        dueAt: '2026-01-01T08:00:00Z',
      });
      const task = b.tasks[0] as { id: string };
      const c = await service.complete(actor, a.record.id, task.id, {
        status: 'COMPLETED',
        version: 1,
        result: 'No reply',
      });
      expect(c.record.status).toBe('NEW');
      await expect(
        service.complete(actor, a.record.id, task.id, {
          status: 'COMPLETED',
          version: 1,
          result: 'Retry',
        }),
      ).rejects.toThrow('already completed');
    });
    it('reschedules with history and rejects stale task completion', async () => {
      const a = await service.save(actor, input());
      const b = await service.schedule(actor, a.record.id, {
        description: 'Call',
        dueAt: '2026-01-01T08:00:00Z',
      });
      const task = b.tasks[0] as { id: string };
      const c = await service.reschedule(actor, a.record.id, task.id, {
        version: 1,
        dueAt: '2026-01-02T08:00:00Z',
        reason: 'Client requested another day',
      });
      expect(
        c.events.some(
          (e: { type: string }) => e.type === 'FOLLOW_UP_RESCHEDULED',
        ),
      ).toBe(true);
      await expect(
        service.complete(actor, a.record.id, task.id, {
          version: 1,
          status: 'COMPLETED',
          result: 'Stale schedule',
        }),
      ).rejects.toThrow('already completed');
      await expect(
        service.complete(actor, a.record.id, task.id, {
          version: 2,
          status: 'COMPLETED',
          result: 'Reached client',
        }),
      ).resolves.toBeDefined();
    });
    it('deduplicates reminder notifications across worker runs', async () => {
      const a = await service.save(actor, input());
      await service.schedule(actor, a.record.id, {
        description: 'Call',
        dueAt: '2026-01-01T08:00:00Z',
      });
      const worker = new InquiryReminderWorker(service);
      await worker.run();
      await worker.run();
      const [count] = await runner.query(
        `SELECT count(*)::int AS total FROM notifications`,
      );
      expect(count.total).toBe(1);
    });
    it('repairs missing task fields and reminder history before processing an existing follow-up', async () => {
      const inquiry = await service.save(actor, input());
      await service.schedule(actor, inquiry.record.id, {
        description: 'Call client',
        dueAt: '2026-01-01T08:00:00Z',
      });
      await runner.query(`DROP TABLE inquiry_task_reminders;
        ALTER TABLE inquiry_tasks
          DROP COLUMN action_type,
          DROP COLUMN priority,
          DROP COLUMN version,
          DROP COLUMN reminder_checked_at`);

      const repair = new InquiryReminderSchemaRepair1795910403000();
      await repair.up(runner);
      await repair.up(runner);
      const [task] = await runner.query(
        `SELECT action_type,priority,version FROM inquiry_tasks`,
      );
      expect(task).toMatchObject({
        action_type: 'FOLLOW_UP',
        priority: 'NORMAL',
        version: 1,
      });

      const worker = new InquiryReminderWorker(service);
      await worker.run();
      await worker.run();
      const [notifications] = await runner.query(
        `SELECT count(*)::int AS total FROM notifications`,
      );
      const [reminders] = await runner.query(
        `SELECT count(*)::int AS total FROM inquiry_task_reminders`,
      );
      expect(notifications.total).toBe(1);
      expect(reminders.total).toBe(1);
    });
    it('honors disabled reminders and configured manager escalations', async () => {
      await runner.query(
        `INSERT INTO users(id,name,email,role,branch_id) VALUES('manager','Synthetic manager','manager@example.invalid','BRANCH_MANAGER','a'); UPDATE branches SET manager_user_id='manager' WHERE id='a'`,
      );
      const a = await service.save(actor, input());
      await service.schedule(actor, a.record.id, {
        description: 'Call',
        dueAt: '2026-01-01T08:00:00Z',
      });
      await service.reminderPolicy(actor, 'a', {
        enabled: false,
        overdueEnabled: true,
        leadMinutes: 0,
        escalationHours: 1,
      });
      const worker = new InquiryReminderWorker(service);
      await worker.run();
      expect(
        (await runner.query(`SELECT count(*)::int AS n FROM notifications`))[0]
          .n,
      ).toBe(0);
      await service.reminderPolicy(actor, 'a', {
        enabled: true,
        overdueEnabled: true,
        leadMinutes: 0,
        escalationHours: 1,
      });
      await worker.run();
      await worker.run();
      expect(
        (await runner.query(`SELECT count(*)::int AS n FROM notifications`))[0]
          .n,
      ).toBe(2);
    });
    it('previews without writes, imports idempotently and never fabricates a reservation', async () => {
      const w = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        w,
        XLSX.utils.aoa_to_sheet([
          [
            'DATE',
            "CLIENT'S NAME",
            'DETAILS INQUIRY',
            'INQUIRY CHANNEL',
            'INQUIRY STATUS',
          ],
          [
            '2026-11-24',
            'Historical synthetic client',
            'Meeting Rooms',
            'Call',
            'RESERVED',
          ],
        ]),
        'ORTIGAS',
      );
      const buffer = XLSX.write(w, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer;
      const importer = new InquiryImportService(service),
        preview = await importer.run(actor, buffer, 'a', 'admin');
      expect((await service.list(actor, new InquiryQueryDto())).total).toBe(0);
      expect(
        await importer.run(actor, buffer, 'a', 'admin', true, preview.checksum),
      ).toMatchObject({ imported: 1, duplicates: 0 });
      expect(
        await importer.run(actor, buffer, 'a', 'admin', true, preview.checksum),
      ).toMatchObject({ imported: 0, duplicates: 1 });
      const [count] = await runner.query(
        `SELECT count(*)::int AS total FROM reservations`,
      );
      expect(count.total).toBe(0);
    });
    it('synchronizes confirmation, completion and cancellation through the reservation trigger', async () => {
      const a = await service.save(actor, input());
      await runner.query(
        `INSERT INTO reservations(id,status,created_by,inquiry_id) VALUES('booking','PENDING','admin',$1)`,
        [a.record.id],
      );
      expect((await service.detail(actor, a.record.id)).record.status).toBe(
        'PENDING_RESERVATION',
      );
      await runner.query(
        `UPDATE reservations SET status='CONFIRMED' WHERE id='booking'`,
      );
      expect((await service.detail(actor, a.record.id)).record.status).toBe(
        'RESERVED',
      );
      await runner.query(
        `UPDATE reservations SET status='COMPLETED' WHERE id='booking'`,
      );
      expect((await service.detail(actor, a.record.id)).record.status).toBe(
        'CONVERTED',
      );
      await runner.query(
        `UPDATE reservations SET status='CANCELLED' WHERE id='booking'`,
      );
      expect((await service.detail(actor, a.record.id)).record.status).toBe(
        'IN_PROGRESS',
      );
    });
    it('counts a verified conversion after an imported legacy outcome without double-counting inquiries', async () => {
      const a = await service.save(actor, input());
      await runner.query(
        `UPDATE inquiries SET legacy_outcome='RESERVED' WHERE id=$1`,
        [a.record.id],
      );
      expect(
        (await service.analytics(actor, new InquiryQueryDto())).totals
          .converted,
      ).toBe(0);
      await runner.query(
        `INSERT INTO reservations(id,status,created_by,inquiry_id) VALUES('verified','COMPLETED','admin',$1)`,
        [a.record.id],
      );
      const data = await service.analytics(actor, new InquiryQueryDto());
      expect(data.totals.total).toBe(1);
      expect(data.totals.converted).toBe(1);
    });
    it('retains a completed outcome when a different linked booking is cancelled', async () => {
      const a = await service.save(actor, input());
      await runner.query(
        `INSERT INTO reservations(id,status,created_by,inquiry_id) VALUES('success','COMPLETED','admin',$1),('pending','PENDING','admin',$1)`,
        [a.record.id],
      );
      await runner.query(
        `UPDATE reservations SET status='CANCELLED' WHERE id='pending'`,
      );
      expect((await service.detail(actor, a.record.id)).record.status).toBe(
        'CONVERTED',
      );
    });
    it('generates non-truncated references above a million records', async () => {
      await runner.query(`SELECT setval('inquiry_reference_seq',1000000)`);
      const a = await service.save(actor, input()),
        b = await service.save(actor, input());
      expect(a.record.reference).toMatch(/-1000001$/);
      expect(a.record.reference).not.toBe(b.record.reference);
    });
    it('rejects fabricated conversion and invalid row corrections before writing', async () => {
      const w = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        w,
        XLSX.utils.aoa_to_sheet([
          ['DATE', "CLIENT'S NAME"],
          ['2026-11-24', 'Synthetic'],
        ]),
        'ORTIGAS',
      );
      const buffer = XLSX.write(w, {
        type: 'buffer',
        bookType: 'xlsx',
      }) as Buffer;
      await expect(
        new InquiryImportService(service).run(
          actor,
          buffer,
          'a',
          'admin',
          false,
          undefined,
          {
            mapping: {},
            corrections: { 'ORTIGAS:2': { status: 'CONVERTED' } },
          },
        ),
      ).rejects.toThrow('fabricated');
      expect((await service.list(actor, new InquiryQueryDto())).total).toBe(0);
    });
  },
);
