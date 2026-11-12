import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { SimpleLeaveV11792627202000 } from '../src/database/migrations/1792627202000-SimpleLeaveV1.js';
import { LeaveFilingNotice1792972800000 } from '../src/database/migrations/1792972800000-LeaveFilingNotice.js';
import { LeaveApprovalHistory1792972801000 } from '../src/database/migrations/1792972801000-LeaveApprovalHistory.js';
import type { QueryRunner } from 'typeorm';
import { LeaveService } from '../src/hr/leaves/leave.service.js';
import { AttendanceService } from '../src/hr/attendance/attendance.service.js';
import type { AuthUserContext } from '../src/foundation/auth/auth.context.js';
import type { TypeDto } from '../src/hr/leaves/leave.dto.js';
import { approvedLeave } from '../src/hr/attendance/approved-leave.js';
import { calculateDtr } from '../src/hr/attendance/dtr.calculator.js';
import { DEFAULT_DTR_POLICY } from '../src/hr/attendance/dtr.types.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')(
  'Simple leave on isolated PostgreSQL',
  () => {
    let adminDb: DataSource,
      db: DataSource,
      service: LeaveService,
      typeId: string,
      serial = 0;
    const schema = `simple_leave_test_${randomUUID().replaceAll('-', '')}`;
    const hr: AuthUserContext = {
      userId: 'test-hr',
      role: 'SUPER_ADMIN',
      email: 'hr@fixture.test',
      branchId: null,
      scope: 'ALL',
    };
    const staff: AuthUserContext = {
      userId: 'test-staff',
      role: 'EMPLOYEE',
      email: 'staff@fixture.test',
      branchId: 'test-makati',
      scope: 'OWN',
    };
    const manager: AuthUserContext = {
      userId: 'test-manager',
      role: 'BRANCH_MANAGER',
      email: 'manager@fixture.test',
      branchId: 'test-makati',
      scope: 'BRANCH',
    };
    const other: AuthUserContext = {
      ...manager,
      userId: 'test-other-manager',
      branchId: 'test-ortigas',
    };
    beforeAll(async () => {
      if (existsSync('.env')) process.loadEnvFile('.env');
      const options = {
        type: 'postgres' as const,
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        synchronize: false,
        migrationsRun: false,
        connectTimeoutMS: 5000,
      };
      adminDb = await new DataSource(options).initialize();
      await adminDb.query(`CREATE SCHEMA "${schema}"`);
      const shared = [
        'branches',
        'employees',
        'users',
        'employee_profiles',
        'attendance_schedules',
        'attendance_dtr_settings',
        'employee_work_schedule_history',
        'employee_work_schedule_days',
        'attendance_records',
        'attendance_corrections',
        'attendance_overtime_approvals',
        'attendance_dtr_periods',
        'audit_logs',
        'notifications',
      ];
      for (const table of shared)
        await adminDb.query(
          `CREATE TABLE "${schema}"."${table}" (LIKE public."${table}" INCLUDING ALL)`,
        );
      db = await new DataSource({
        ...options,
        extra: { options: `-c search_path=${schema},public`, max: 2 },
      }).initialize();
      const runner = db.createQueryRunner();
      try {
        await runner.connect();
        await runner.startTransaction();
        await new SimpleLeaveV11792627202000().up(runner);
        await new LeaveApprovalHistory1792972801000().up(runner);
        await runner.commitTransaction();
      } finally {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.release();
      }
      service = new LeaveService(db);
      await db.query(
        `INSERT INTO branches(id,name,code) VALUES('test-makati','Makati fixture','TM'),('test-ortigas','Ortigas fixture','TO')`,
      );
      await db.query(
        `INSERT INTO employees(id,name,employee_number,email,position,department,branch_id,status,employment) VALUES('test-employee','Employee fixture','T000001','employee@fixture.test','Staff','Operations','test-makati','ACTIVE','{"startDate":"2020-01-01","employmentType":"FULL_TIME"}')`,
      );
      await db.query(
        `INSERT INTO users(id,name,email,role,status,branch_id,employee_id) VALUES('test-hr','HR fixture','hr@fixture.test','SUPER_ADMIN','ACTIVE',NULL,NULL),('test-staff','Staff fixture','staff@fixture.test','EMPLOYEE','ACTIVE','test-makati','test-employee'),('test-manager','Manager fixture','manager@fixture.test','BRANCH_MANAGER','ACTIVE','test-makati',NULL),('test-other-manager','Other manager','other@fixture.test','BRANCH_MANAGER','ACTIVE','test-ortigas',NULL)`,
      );
      await db.query(
        `UPDATE branches SET manager_user_id='test-manager' WHERE id='test-makati'`,
      );
    }, 60000);
    afterAll(async () => {
      if (db?.isInitialized) await db.destroy();
      if (adminDb?.isInitialized) {
        if (!/^simple_leave_test_[a-f0-9]{32}$/.test(schema))
          throw new Error('Unexpected test schema');
        await adminDb.query(`DROP SCHEMA "${schema}" CASCADE`);
        await adminDb.destroy();
      }
    }, 60000);
    beforeEach(async () => {
      serial++;
      const input: TypeDto = {
        code: `T${serial}`,
        name: `Test policy ${serial}`,
        description: 'Isolated acceptance fixture',
        active: true,
        version: 1,
        effectiveFrom: '2026-01-01',
        annualDays: 5,
        paid: true,
        eligibility: 'ACTIVE',
        frequency: 'ANNUAL',
        halfDay: true,
        attachmentRule: 'OPTIONAL',
        automaticAllocation: false,
        blockInsufficient: true,
        minimumServiceMonths: 0,
        employmentTypes: [],
        branchId: null,
        allowApprovedCancellation: true,
      };
      typeId = (await service.saveType(hr, input)).id;
      await service.adjust(hr, 'test-employee', {
        typeId,
        year: 2026,
        days: 5,
        key: randomUUID(),
        reason: 'Fixture opening credit',
      });
    });
    const submit = (from: string, to = from) =>
      service.submit(staff, {
        typeId,
        startDate: from,
        endDate: to,
        reason: 'Private acceptance fixture',
        submissionKey: randomUUID(),
      });
    const balance = () =>
      service.balance(db.manager, 'test-employee', typeId, 2026);
    it('appends filing policies without changing existing request snapshots or credits', async () => {
      const requestsBefore = await db.query('SELECT id,policy,status FROM leave_requests ORDER BY id');
      const creditsBefore = await db.query('SELECT * FROM leave_credit_transactions ORDER BY id');
      const versionsBefore = await db.query('SELECT * FROM leave_type_versions ORDER BY type_id,version');
      const migration = new LeaveFilingNotice1792972800000();
      await db.transaction((m) => migration.up(m as unknown as QueryRunner));
      const rules = await db.query(`SELECT t.code,(v.policy->>'minimumNoticeDays')::int AS days FROM leave_types t JOIN leave_type_versions v ON v.type_id=t.id AND v.version=t.version WHERE t.code IN ('VL','SL','EL','SIL','LWOP') ORDER BY t.code`);
      expect(rules).toEqual([{ code: 'EL', days: 0 }, { code: 'LWOP', days: 1 }, { code: 'SIL', days: 1 }, { code: 'SL', days: 0 }, { code: 'VL', days: 1 }]);
      expect(await db.query('SELECT id,policy,status FROM leave_requests ORDER BY id')).toEqual(requestsBefore);
      expect(await db.query('SELECT * FROM leave_credit_transactions ORDER BY id')).toEqual(creditsBefore);
      for (const version of versionsBefore) {
        expect((await db.query('SELECT * FROM leave_type_versions WHERE type_id=$1 AND version=$2', [version.type_id, version.version]))[0]).toEqual(version);
      }
      const versionsAfter = await db.query('SELECT count(*)::int AS count FROM leave_type_versions');
      await db.transaction((m) => migration.up(m as unknown as QueryRunner));
      expect(await db.query('SELECT count(*)::int AS count FROM leave_type_versions')).toEqual(versionsAfter);
    });
    it('names the submitting employee in reviewer notifications without private reasons', async () => {
      const request = await submit('2026-11-09');
      const [employee] = await db.query('SELECT name FROM employees WHERE id=$1', ['test-employee']);
      const notices = await db.query('SELECT user_id,message,href FROM notifications WHERE href=$1', [`/leave?requestId=${request.id}`]);
      expect(notices.length).toBeGreaterThan(0);
      for (const notice of notices) {
        expect(notice.message).toBe(`${employee.name} submitted a leave request for review.`);
        expect(notice.message).not.toContain('Private acceptance fixture');
        expect(notice.user_id).not.toBe(staff.userId);
      }
      await service.cancel(staff, request.id, 'Fixture cleanup');
    });
    it('uses linked identity and rejects other branches, staff management, unlinked and IT access', async () => {
      await expect(
        service.balances(staff, { employeeId: 'other' }, true),
      ).rejects.toThrow('Own leave');
      expect((await service.balances(staff, {}, true))[0]?.employeeId).toBe(
        'test-employee',
      );
      await expect(
        service.balances(other, { branchId: 'test-makati' }),
      ).rejects.toThrow('Branch access');
      await expect(service.requests(staff, {})).rejects.toThrow('management');
      expect((await service.context(hr)).ownEmployee).toBeNull();
      await expect(
        service.submit(hr, {
          typeId,
          startDate: '2026-11-02',
          endDate: '2026-11-02',
          reason: 'x',
          submissionKey: randomUUID(),
        }),
      ).rejects.toThrow('Link');
      await expect(
        service.context({ ...hr, role: 'IT_ADMIN' }),
      ).rejects.toThrow('IT');
    });
    it('excludes weekends and validates half days and duplicate submission keys', async () => {
      const p = await service.preview(staff, {
        typeId,
        startDate: '2026-11-06',
        endDate: '2026-11-09',
      });
      expect(p.days).toBe(2);
      expect(p.fallback).toBe(true);
      const input = {
        typeId,
        startDate: '2026-11-06',
        endDate: '2026-11-06',
        halfDay: true,
        reason: 'Half fixture',
        submissionKey: randomUUID(),
      };
      const r = await service.submit(staff, input);
      expect(r.days).toBe(0.5);
      expect((await service.submit(staff, input)).id).toBe(r.id);
      expect((await balance()).reserved).toBe(0.5);
      await service.cancel(staff, r.id, 'Fixture cleanup');
    });
    it('serializes competing reservations so five credits cannot reserve six days', async () => {
      const results = await Promise.allSettled([
        submit('2026-11-16', '2026-11-18'),
        submit('2026-11-23', '2026-11-25'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await balance()).reserved).toBe(3);
      expect((await balance()).available).toBe(2);
      for (const result of results)
        if (result.status === 'fulfilled')
          await service.cancel(staff, result.value.id, 'Fixture cleanup');
    });
    it('prevents overlapping reservations across leave types', async () => {
      const r = await submit('2026-12-01');
      await expect(submit('2026-12-01')).rejects.toThrow('overlap');
      await service.cancel(staff, r.id, 'Fixture cleanup');
    });
    it('makes repeated approval and restoration idempotent, with DTR leave mapping', async () => {
      const r = await submit('2026-12-02');
      await Promise.all([
        service.decide(manager, r.id, 'APPROVED'),
        service.decide(manager, r.id, 'APPROVED'),
      ]);
      expect((await balance()).used).toBe(1);
      expect((await balance()).reserved).toBe(0);
      expect(
        (
          await approvedLeave(
            db.manager,
            'test-employee',
            'test-makati',
            '2026-12-02',
          )
        ).leaveUnits,
      ).toBe(1);
      const attendance = await new AttendanceService(db).list({
        employeeId: 'test-employee',
        branchId: 'test-makati',
        from: '2026-12-02',
        to: '2026-12-02',
      });
      expect(attendance[0].source).toBe('LEAVE');
      expect(attendance[0].status).toBe('APPROVED_PAID_LEAVE');
      await service.cancel(staff, r.id, 'Plans changed');
      await service.cancel(staff, r.id, 'Retry');
      expect((await balance()).restored).toBe(1);
      expect((await balance()).available).toBe(5);
    });
    it.each(['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const)('allows %s self-approval with immutable actor snapshots and one financial effect', async (role) => {
      await db.query("UPDATE users SET employee_id=NULL WHERE id='test-staff'");
      await db.query("UPDATE users SET employee_id='test-employee',role=$1,branch_id=$2 WHERE id='test-manager'", [role, role === 'SUPER_ADMIN' ? null : 'test-makati']);
      const actor: AuthUserContext = { ...manager, role, branchId: role === 'SUPER_ADMIN' ? null : manager.branchId, scope: role === 'SUPER_ADMIN' ? 'ALL' : 'BRANCH' };
      try {
        const request = await service.submit(actor, { typeId, startDate: '2026-11-10', endDate: '2026-11-10', reason: 'Manager personal request', submissionKey: randomUUID() });
        expect((await service.detail(actor, request.id)).canReview).toBe(true);
        await expect(service.decide(actor, request.id, 'REJECTED', 'Own rejection')).rejects.toThrow('Cancel your own');
        await service.decide(actor, request.id, 'APPROVED', 'Approved under management authority');
        await service.decide(actor, request.id, 'APPROVED', 'Retry');
        expect((await balance()).used).toBe(1);
        await db.query("UPDATE users SET name='Changed display name' WHERE id='test-manager'");
        const detail = await service.detail(actor, request.id);
        const approved = detail.events.filter((e: { action: string }) => e.action === 'SELF_APPROVED');
        expect(approved).toHaveLength(1);
        expect(approved[0]).toMatchObject({ actorId: actor.userId, actor: 'Manager fixture', actorRole: role, comment: 'Approved under management authority' });
        expect(approved[0].createdAt).toBeTruthy();
        expect(detail.request.decidedBy).toBe(actor.userId);
        const [audit] = await db.query("SELECT details FROM audit_logs WHERE action='SELF_APPROVED' AND details::jsonb->>'requestId'=$1", [request.id]);
        const auditDetails = typeof audit.details === 'string' ? JSON.parse(audit.details) : audit.details;
        expect(auditDetails).toMatchObject({ selfApproved: true, actorRole: role });
        await service.cancel(actor, request.id, 'Fixture cleanup');
      } finally {
        await db.query("UPDATE users SET employee_id=NULL,role='BRANCH_MANAGER',branch_id='test-makati',name='Manager fixture' WHERE id='test-manager'");
        await db.query("UPDATE users SET employee_id='test-employee' WHERE id='test-staff'");
      }
    });
    it('does not let ownership bypass branch scope for management self-approval', async () => {
      const request = await submit('2026-11-11');
      await db.query("UPDATE users SET employee_id=NULL WHERE id='test-staff'");
      await db.query("UPDATE users SET employee_id='test-employee' WHERE id='test-other-manager'");
      try {
        expect((await service.detail(other, request.id)).canReview).toBe(false);
        await expect(service.decide(other, request.id, 'APPROVED')).rejects.toThrow('Branch access');
        expect((await balance()).used).toBe(0);
        await service.cancel(other, request.id, 'Fixture cleanup');
      } finally {
        await db.query("UPDATE users SET employee_id=NULL WHERE id='test-other-manager'");
        await db.query("UPDATE users SET employee_id='test-employee' WHERE id='test-staff'");
      }
    });
    it('allows exactly one concurrent final decision and prevents employee self approval', async () => {
      const r = await submit('2026-12-03');
      await expect(service.decide(staff, r.id, 'APPROVED')).rejects.toThrow('Leave management access required');
      const results = await Promise.allSettled([
        service.decide(manager, r.id, 'APPROVED'),
        service.decide(hr, r.id, 'REJECTED', 'Fixture decision'),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await balance()).reserved).toBe(0);
      const detail = await service.detail(staff, r.id);
      if (detail.request.status === 'APPROVED')
        await service.cancel(staff, r.id, 'Fixture cleanup');
    });
    it('releases rejected reservations and enforces append-only adjustments', async () => {
      const r = await submit('2026-12-04');
      await expect(
        service.decide(manager, r.id, 'REJECTED', ' '),
      ).rejects.toThrow('reason');
      await service.decide(manager, r.id, 'REJECTED', 'Not available');
      expect((await balance()).available).toBe(5);
      expect((await balance()).used).toBe(0);
      const input = {
        typeId,
        year: 2026,
        days: 3,
        key: randomUUID(),
        reason: 'Approved extra credits',
      };
      await service.adjust(hr, 'test-employee', input);
      await service.adjust(hr, 'test-employee', input);
      expect((await balance()).available).toBe(8);
      await expect(
        service.adjust(manager, 'test-employee', input),
      ).rejects.toThrow('authorized HR');
      await expect(
        db.query(
          'UPDATE leave_credit_transactions SET signed_days=99 WHERE type_id=$1',
          [typeId],
        ),
      ).rejects.toThrow();
    });
    it('grants a configured annual policy once, preserves adjustments and snapshots', async () => {
      const t = (await service.types(hr)).find((t) => t.id === typeId)!;
      const dto = {
        code: t.code,
        name: t.name,
        description: t.description,
        active: true,
        version: t.version,
        effectiveFrom: '2026-01-01',
        ...t.policy,
        automaticAllocation: true,
      };
      delete (dto as { carryover?: string }).carryover;
      await service.saveType(hr, dto, typeId);
      expect(
        (
          await service.allocate(hr, {
            year: 2026,
            reason: 'Approved fixture policy',
          })
        ).granted,
      ).toBe(1);
      expect(
        (await service.allocate(hr, { year: 2026, reason: 'Retry' })).granted,
      ).toBe(0);
      expect((await balance()).available).toBe(10);
      const latest = (await service.types(hr)).find((t) => t.id === typeId)!;
      await service.saveType(
        hr,
        { ...dto, version: latest.version, annualDays: 20 },
        typeId,
      );
      await service.allocate(hr, {
        year: 2026,
        reason: 'Recheck after amendment',
      });
      expect((await balance()).allocated).toBe(5);
      const report = await service.report(manager, { year: 2026, typeId });
      expect(report.balances[0].available).toBe(10);
      expect(JSON.stringify(report.requests)).not.toContain(
        'Private acceptance',
      );
    });
    it('shows an insufficient-credit preview but refuses the actual submission', async () => {
      await service.adjust(hr, 'test-employee', {
        typeId,
        year: 2026,
        days: -5,
        key: randomUUID(),
        reason: 'Exhaust fixture credits',
      });
      const preview = await service.preview(staff, {
        typeId,
        startDate: '2026-12-07',
        endDate: '2026-12-07',
      });
      expect(preview.days).toBe(1);
      expect(preview.afterApproval).toBe(-1);
      await expect(submit('2026-12-07')).rejects.toThrow('Insufficient');
    });
    it('honors configured holidays and daily roster overrides', async () => {
      await db.query(
        `INSERT INTO attendance_dtr_settings(branch_id,policy,holidays,updated_by) VALUES('test-makati','{}','{"2026-12-08":"Fixture holiday"}','test-hr')`,
      );
      await db.query(
        `INSERT INTO employee_work_schedule_days(id,employee_id,branch_id,work_date,day_type) VALUES('fixture-rest','test-employee','test-makati','2026-12-09','REST_DAY'),('fixture-weekend','test-employee','test-makati','2026-12-12','WORK')`,
      );
      expect(
        (
          await service.preview(staff, {
            typeId,
            startDate: '2026-12-07',
            endDate: '2026-12-12',
          })
        ).days,
      ).toBe(4);
      await db.query(`DELETE FROM employee_work_schedule_days`);
      await db.query(`DELETE FROM attendance_dtr_settings`);
    });
    it('requires explicit eligibility, honors required documents and keeps unpaid leave credit-free', async () => {
      const t = (await service.types(hr)).find((t) => t.id === typeId)!;
      const input = {
        ...t.policy,
        code: t.code,
        name: t.name,
        description: t.description,
        active: true,
        version: t.version,
        effectiveFrom: '2026-01-01',
        eligibility: 'ASSIGNED' as const,
        attachmentRule: 'REQUIRED' as const,
      };
      delete (input as { carryover?: string }).carryover;
      await service.saveType(hr, input, typeId);
      await expect(submit('2026-12-10')).rejects.toThrow('eligibility');
      await service.assign(hr, {
        employeeId: 'test-employee',
        typeId,
        eligible: true,
        silVerified: false,
        reason: 'HR fixture verification',
      });
      await expect(submit('2026-12-10')).rejects.toThrow('document');
      await service.saveType(
        hr,
        {
          ...input,
          version: input.version + 1,
          paid: false,
          attachmentRule: 'NONE',
        },
        typeId,
      );
      const r = await submit('2026-12-10');
      expect((await balance()).reserved).toBe(0);
      await service.decide(manager, r.id, 'APPROVED');
      expect((await balance()).used).toBe(0);
      await service.cancel(staff, r.id, 'Fixture cleanup');
    });
    it('recalculates saved DTR from source and rejects decisions in locked periods atomically', async () => {
      const schedule = {
        timeZone: 'Asia/Manila',
        workDays: [1, 2, 3, 4, 5],
        shiftStart: '08:00',
        shiftEnd: '17:00',
        breakMinutes: 0,
        graceMinutes: 0,
      };
      const calculation = calculateDtr({
        workDate: '2026-10-19',
        sources: [],
        schedule,
        policy: DEFAULT_DTR_POLICY,
        pairing: 'STRICT',
        override: {},
        active: true,
        holiday: null,
        leaveUnits: 0,
      });
      const data = {
        batchId: 'fixture',
        sourceKeys: [],
        source: [],
        override: {},
        calculation,
        policy: DEFAULT_DTR_POLICY,
        pairing: 'STRICT',
        approval: 'DRAFT',
        revision: 1,
      };
      await db.query(
        `INSERT INTO attendance_records(id,employee_id,branch_id,work_date,source,status,dtr_data) VALUES('fixture-dtr','test-employee','test-makati','2026-10-19','IMPORT','ABSENT',$1::jsonb)`,
        [JSON.stringify(data)],
      );
      // Submit before the leave date: backdated filing is now intentionally blocked.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-18T04:00:00Z'));
      let past;
      try {
        past = await submit('2026-10-19');
      } finally {
        vi.useRealTimers();
      }
      await service.decide(manager, past.id, 'APPROVED');
      const [saved] = await db.query(
        'SELECT dtr_data AS data FROM attendance_records WHERE id=$1',
        ['fixture-dtr'],
      );
      expect(saved.data.source).toEqual([]);
      expect(saved.data.calculation.leaveUnits).toBe(1);
      expect(saved.data.calculation.absent).toBe(0);
      expect(saved.data.revision).toBe(2);
      await db.query(
        `INSERT INTO attendance_dtr_periods(id,branch_id,date_from,date_to,state,actor_id) VALUES('fixture-period','test-makati','2026-12-11','2026-12-11','LOCKED','test-hr')`,
      );
      const r = await submit('2026-12-11');
      await expect(service.decide(manager, r.id, 'APPROVED')).rejects.toThrow(
        'Reopen',
      );
      expect((await service.detail(staff, r.id)).request.status).toBe(
        'PENDING',
      );
      expect((await balance()).used).toBe(1);
      await service.cancel(staff, r.id, 'Fixture cleanup');
    });
    it('emails after commit, skips duplicate submissions, and never emails a rolled-back decision', async () => {
      const sendLeaveNotice = vi
        .fn()
        .mockResolvedValue({ status: 'ACCEPTED_BY_PROVIDER', failure: null });
      const mailService = new LeaveService(db, { sendLeaveNotice });
      const input = {
        typeId,
        startDate: '2026-12-14',
        endDate: '2026-12-14',
        reason: 'Private email fixture',
        submissionKey: randomUUID(),
      };
      const r = await mailService.submit(staff, input);
      await vi.waitFor(() => expect(sendLeaveNotice).toHaveBeenCalledTimes(1));
      await mailService.submit(staff, input);
      expect(sendLeaveNotice).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(sendLeaveNotice.mock.calls)).not.toContain(
        'Private email fixture',
      );
      await service.cancel(staff, r.id, 'Fixture cleanup');
      const locked = await submit('2026-12-11');
      await expect(
        mailService.decide(manager, locked.id, 'APPROVED'),
      ).rejects.toThrow('Reopen');
      expect(sendLeaveNotice).toHaveBeenCalledTimes(1);
      await service.cancel(staff, locked.id, 'Fixture cleanup');
    });
    it('monitors unpaid types and real chargeable days without allocating or consuming credits', async () => {
      const t = (await service.types(hr)).find((t) => t.id === typeId)!;
      const unpaidType = (
        await service.saveType(hr, {
          ...t.policy,
          code: `U${serial}`,
          name: 'Unpaid fixture',
          description: 'Unpaid usage acceptance',
          active: true,
          version: 1,
          effectiveFrom: '2026-01-01',
          annualDays: 0,
          paid: false,
          frequency: 'MANUAL',
        })
      ).id;
      const read = async () =>
        (await service.personalOverview(staff, { year: 2026 })).unpaid.find(
          (t) => t.typeId === unpaidType,
        )!;
      expect(await read()).toMatchObject({
        approvedDays: 0,
        pendingDays: 0,
        approvedRequests: 0,
        pendingRequests: 0,
      });
      const concurrent = await Promise.all(
        Array.from({ length: 4 }, () =>
          service.personalOverview(staff, { year: 2026 }),
        ),
      );
      expect(
        concurrent.every((result) =>
          result.unpaid.some((t) => t.typeId === unpaidType),
        ),
      ).toBe(true);
      const first = await service.submit(staff, {
        typeId: unpaidType,
        startDate: '2026-12-16',
        endDate: '2026-12-16',
        halfDay: true,
        reason: 'Unpaid fixture',
        submissionKey: randomUUID(),
      });
      const second = await service.submit(staff, {
        typeId: unpaidType,
        startDate: '2026-12-17',
        endDate: '2026-12-17',
        reason: 'Unpaid fixture',
        submissionKey: randomUUID(),
      });
      await service.decide(manager, first.id, 'APPROVED');
      const future = (
        await service.saveType(hr, {
          ...t.policy,
          code: `F${serial}`,
          name: 'Future report fixture',
          description: 'Future policy',
          active: false,
          version: 1,
          effectiveFrom: '2027-01-01',
          annualDays: 0,
          paid: false,
          frequency: 'MANUAL',
        })
      ).id;
      const otherBranch = (
        await service.saveType(hr, {
          ...t.policy,
          code: `B${serial}`,
          name: 'Other branch policy',
          description: 'Scope fixture',
          active: true,
          version: 1,
          effectiveFrom: '2026-01-01',
          branchId: 'test-ortigas',
        })
      ).id;
      const overview = await service.report(manager, { year: 2026 });
      expect(
        overview.typeBreakdown.find((t) => t.typeId === unpaidType),
      ).toMatchObject({
        approvedUnpaidDays: 0.5,
        pendingUnpaidDays: 1,
        available: 0,
      });
      expect(
        overview.typeBreakdown.find((t) => t.typeId === future),
      ).toMatchObject({
        active: false,
        effectiveFrom: '2027-01-01',
        approvedUnpaidDays: 0,
      });
      expect(overview.typeBreakdown.some((t) => t.typeId === otherBranch)).toBe(
        false,
      );
      const pending = await service.report(manager, {
        year: 2026,
        typeId: unpaidType,
        status: 'PENDING',
      });
      expect(pending.typeBreakdown).toHaveLength(1);
      expect(pending.typeBreakdown[0]).toMatchObject({
        approvedUnpaidDays: 0,
        pendingUnpaidDays: 1,
      });
      expect(await read()).toMatchObject({
        approvedDays: 0.5,
        pendingDays: 1,
        approvedRequests: 1,
        pendingRequests: 1,
      });
      expect(
        (await service.balance(db.manager, 'test-employee', unpaidType, 2026))
          .used,
      ).toBe(0);
      await expect(
        service.personalOverview(staff, { year: 2026, employeeId: 'another' }),
      ).rejects.toThrow('Own leave');
      await service.cancel(staff, first.id, 'Fixture cleanup');
      await service.cancel(staff, second.id, 'Fixture cleanup');
      expect(await read()).toMatchObject({ approvedDays: 0, pendingDays: 0 });
    });
  },
);
