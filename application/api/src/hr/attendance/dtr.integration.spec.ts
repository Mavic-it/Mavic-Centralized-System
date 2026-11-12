import { describe, it, expect } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { RestoreAttendanceDtrWorkflow1792454400000 } from '../../database/migrations/1792454400000-RestoreAttendanceDtrWorkflow.js';
import { AttendanceDtrIntegrity1792454401000 } from '../../database/migrations/1792454401000-AttendanceDtrIntegrity.js';
import { DtrSourceRevisions1792454402000 } from '../../database/migrations/1792454402000-DtrSourceRevisions.js';
import { DtrDraftCutoffs1792454403000 } from '../../database/migrations/1792454403000-DtrDraftCutoffs.js';
import { DtrService } from './dtr.service.js';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';

// Explicit opt-in; every fixture and the trial migration are rolled back.
describe.runIf(process.env.DTR_DB_TEST === 'true')(
  'DTR PostgreSQL rollback-only workflow',
  () => {
    it('migrates, persists, revisits, corrects, approves, exports, locks and reopens with retained sources', async () => {
      process.loadEnvFile('.env');
      const db = new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        synchronize: false,
      });
      await db.initialize();
      const runner = db.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      let savepoint = 0;
      const scoped = {
        manager: runner.manager,
        query: runner.manager.query.bind(runner.manager),
        transaction: async <T>(
          fn: (manager: EntityManager) => Promise<T>,
        ): Promise<T> => {
          const name = `dtr_test_${++savepoint}`;
          await runner.query(`SAVEPOINT ${name}`);
          try {
            const result = await fn(runner.manager);
            await runner.query(`RELEASE SAVEPOINT ${name}`);
            return result;
          } catch (error) {
            await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
            throw error;
          }
        },
      } as unknown as DataSource;
      try {
        const installed = await runner.query(
          `SELECT to_regclass('public.biometric_format_templates') AS name`,
        );
        if (!installed[0].name)
          await new RestoreAttendanceDtrWorkflow1792454400000().up(runner);
        const guards = await runner.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name='attendance_records' AND column_name='dtr_stale'`,
        );
        if (!guards.length)
          await new AttendanceDtrIntegrity1792454401000().up(runner);
        const revisions = await runner.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name='attendance_import_batches' AND column_name='template_hash'`,
        );
        if (!revisions.length)
          await new DtrSourceRevisions1792454402000().up(runner);
        const drafts = await runner.query(
          `SELECT 1 FROM pg_constraint WHERE conname='attendance_dtr_periods_state_check' AND pg_get_constraintdef(oid) LIKE '%DRAFT%'`,
        );
        if (!drafts.length) await new DtrDraftCutoffs1792454403000().up(runner);
        const branch = randomUUID(),
          other = randomUUID(),
          employee = randomUUID(),
          actor = randomUUID();
        await runner.query(
          `INSERT INTO branches(id,name,code,status) VALUES($1,'DTR Test Makati',$1,'ACTIVE'),($2,'DTR Other',$2,'ACTIVE')`,
          [branch, other],
        );
        await runner.query(
          `INSERT INTO employees(id,branch_id,name,email,employee_number,position,department,status,employment) VALUES($1,$2,'DTR Lea',$3,'DTR0065','Test','Test','ACTIVE','{"employeeType":"FULL_TIME","startDate":"2020-01-01"}')`,
          [employee, branch, `${employee}@example.test`],
        );
        await runner.query(
          `INSERT INTO users(id,email,name,role,status,branch_id,employee_id) VALUES($1,$2,'DTR Test HR','HR_ADMIN','ACTIVE',$3,$4)`,
          [actor, `${actor}@example.test`, branch, employee],
        );
        await runner.query(
          `INSERT INTO attendance_schedules(branch_id,time_zone,work_days,shift_start,shift_end,break_minutes,grace_minutes) VALUES($1,'Asia/Manila',ARRAY[1,2,3,4,5],'08:00','17:00',0,0)`,
          [branch],
        );
        const service = new DtrService(scoped),
          user: AuthUserContext = {
            userId: actor,
            email: 'hr@example.test',
            role: 'HR_ADMIN',
            branchId: branch,
          };
        const book = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          book,
          XLSX.utils.aoa_to_sheet([
            ['Name', 'Dept', 'Shift Start', 'Shift End', 'In', 'Out', 'Status'],
            ['DTR Lea', 'Test', '08:00', '17:00', '08:10', '18:03', 'Late'],
          ]),
          '2026-09-28',
        );
        const file = {
          buffer: XLSX.write(book, {
            type: 'buffer',
            bookType: 'xlsx',
          }) as Buffer,
          originalname: 'Attendance.xlsx',
        };
        const batch = await service.preview(user, branch, file);
        expect(batch.rows).toHaveLength(1);
        expect(batch.identities[0].employeeId).toBeNull();
        const duplicatePreview = await service.preview(user, branch, file);
        expect(duplicatePreview.id).toBe(batch.id);
        const revisedTemplate = await service.saveTemplate(user, {
          branchId: branch,
          name: 'Date mapping revision',
          configuration: { kind: 'DAILY', dateOrder: 'MDY', pairing: 'STRICT' },
        });
        const revisedPreview = await service.preview(
          user,
          branch,
          file,
          revisedTemplate.id,
        );
        expect(revisedPreview.id).not.toBe(batch.id);
        expect(revisedPreview.rows).toHaveLength(1);
        const committed = await service.commit(user, batch.id, {
          branchId: branch,
          mappings: [{ key: batch.identities[0].key, employeeId: employee }],
          overlap: 'REJECT',
          reason: 'Reviewed identity',
        });
        expect(committed.saved).toBe(1);
        const query = {
          branchId: branch,
          from: '2026-09-28',
          to: '2026-09-28',
        };
        await service.period(user, {
          ...query,
          action: 'SAVE',
          reason: 'Saved payroll attendance cutoff',
        });
        expect((await service.history(user, branch)).periods[0].state).toBe(
          'DRAFT',
        );
        let ledger = await new DtrService(scoped).ledger(user, query);
        expect(ledger.summary.employees).toBe(1);
        expect(ledger.summary.lateMinutes).toBe(10);
        expect(ledger.summary.potentialOtMinutes).toBe(63);
        expect(ledger.summary.approvedOtMinutes).toBe(0);
        expect(
          (
            await service.commit(user, batch.id, {
              branchId: branch,
              mappings: [],
              overlap: 'REJECT',
              reason: 'Duplicate',
            })
          ).duplicate,
        ).toBe(true);
        await expect(
          service.ledger(user, { ...query, branchId: other }),
        ).rejects.toThrow('Branch access');
        const own = { ...user, role: 'EMPLOYEE' as const };
        expect((await service.ledger(own, query)).rows).toHaveLength(0);
        const row = ledger.rows[0];
        await service.correct(user, row.id, {
          branchId: branch,
          revision: row.data.revision,
          reason: 'Verified corrected clock and approved overtime',
          override: {
            actualIn: '2026-09-28T00:00:00.000Z',
            approvedOtMinutes: 63,
            resolvedExceptions: [
              'Source status disagrees with calculated attendance',
            ],
          },
        });
        ledger = await service.ledger(user, query);
        expect(ledger.summary.lateMinutes).toBe(0);
        expect(ledger.summary.approvedOtMinutes).toBe(63);
        await expect(
          service.correct(user, row.id, {
            branchId: branch,
            revision: 1,
            reason: 'Stale browser edit',
            override: { remarks: 'stale' },
          }),
        ).rejects.toThrow('Reload');
        await service.period(user, {
          ...query,
          action: 'APPROVE',
          reason: 'Verified attendance',
        });
        expect((await service.ledger(own, query)).rows).toHaveLength(1);
        const exported = await service.export(user, {
          ...query,
          format: 'xlsx',
        });
        expect(exported.bytes.subarray(0, 2).toString()).toBe('PK');
        expect(exported.filename).toContain('2026-09-28');
        await expect(
          service.correct(user, row.id, {
            branchId: branch,
            revision: 2,
            reason: 'Attempt locked edit',
            override: { remarks: 'blocked' },
          }),
        ).rejects.toThrow('Reopen');
        await expect(
          scoped.transaction(async (m) =>
            m.query(
              `INSERT INTO employee_work_schedule_days(id,employee_id,branch_id,work_date,day_type,shift_start,shift_end,updated_by) VALUES($1,$2,$3,'2026-09-28','WORK','09:00','18:00',$4)`,
              [randomUUID(), employee, branch, actor],
            ),
          ),
        ).rejects.toThrow('Reopen');
        await expect(
          scoped.transaction(async (m) =>
            m.query(
              `UPDATE attendance_source_rows SET normalized='{}' WHERE batch_id=$1`,
              [batch.id],
            ),
          ),
        ).rejects.toThrow('immutable');
        await service.period(user, {
          ...query,
          action: 'REOPEN',
          reason: 'Controlled correction',
        });
        await runner.query(
          `UPDATE attendance_schedules SET grace_minutes=10 WHERE branch_id=$1`,
          [branch],
        );
        expect((await service.ledger(user, query)).summary.excludedDays).toBe(
          1,
        );
        await service.period(user, {
          ...query,
          action: 'RECALCULATE',
          reason: 'Changed grace recalculation',
        });
        ledger = await service.ledger(user, query);
        expect(ledger.summary.excludedDays).toBe(0);
        expect(ledger.summary.approvedOtMinutes).toBe(0);
        const history = await service.history(user, branch);
        expect(history.exports).toHaveLength(1);
        const raw = await runner.query(
          `SELECT count(*)::int AS count FROM attendance_source_rows WHERE batch_id=$1`,
          [batch.id],
        );
        expect(raw[0].count).toBe(1);
        const detail = await service.detail(user, branch, row.id);
        expect(detail.audit.length).toBeGreaterThanOrEqual(3);
        const remappedEmployee = randomUUID();
        await runner.query(
          `INSERT INTO employees(id,branch_id,name,email,employee_number,position,department,status,employment) VALUES($1,$2,'DTR Correct Identity',$3,'DTR0066','Test','Test','ACTIVE','{"employeeType":"FULL_TIME","startDate":"2020-01-01"}')`,
          [remappedEmployee, branch, `${remappedEmployee}@example.test`],
        );
        await service.commit(user, batch.id, {
          branchId: branch,
          mappings: [
            { key: batch.identities[0].key, employeeId: remappedEmployee },
          ],
          overlap: 'REPLACE',
          reprocess: true,
          reason: 'Verified corrected biometric identity',
        });
        const remapped = await service.ledger(user, query);
        expect(remapped.rows).toHaveLength(1);
        expect(remapped.rows[0].employeeId).toBe(remappedEmployee);
        expect(remapped.rows[0].id).toBe(row.id);
        await runner.query(
          `INSERT INTO employee_work_schedule_days(id,employee_id,branch_id,work_date,day_type,shift_start,shift_end,updated_by) VALUES($1,$2,$3,'2026-09-29','WORK','22:00','06:00',$4)`,
          [randomUUID(), employee, branch, actor],
        );
        const punchBook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(
          punchBook,
          XLSX.utils.aoa_to_sheet([
            ['Date And Time', 'Personnel ID', 'First Name', 'In/Out Status'],
            ['9/30/2026 07:00', 'night-65', 'DTR Lea', 'Check-Out'],
            ['9/29/2026 22:00', 'night-65', 'DTR Lea', 'Check-In'],
          ]),
          'Punches',
        );
        const punchTemplate = await service.saveTemplate(user, {
          branchId: branch,
          name: 'Night device',
          configuration: { kind: 'PUNCH', dateOrder: 'MDY', pairing: 'STRICT' },
        });
        const punches = await service.preview(
          user,
          branch,
          {
            buffer: XLSX.write(punchBook, {
              type: 'buffer',
              bookType: 'biff8',
            }) as Buffer,
            originalname: 'night.xls',
          },
          punchTemplate.id,
        );
        await service.commit(user, punches.id, {
          branchId: branch,
          mappings: [{ key: punches.identities[0].key, employeeId: employee }],
          overlap: 'REJECT',
          reason: 'Verified overnight identity',
        });
        const night = await service.ledger(user, {
          branchId: branch,
          from: '2026-09-29',
          to: '2026-09-30',
        });
        expect(night.rows).toHaveLength(1);
        expect(night.rows[0].workDate).toBe('2026-09-29');
        expect(night.rows[0].data.calculation.potentialOtMinutes).toBe(60);
        expect(night.rows[0].data.calculation.payrollReady).toBe(true);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
        await db.destroy();
      }
    }, 60000);
  },
);
