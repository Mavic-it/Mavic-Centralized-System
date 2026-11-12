import { describe, it, expect } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as XLSX from 'xlsx';
import { OfficialBusinessRequests1794873600000 } from '../../../database/migrations/1794873600000-OfficialBusinessRequests.js';
import { OfficialBusinessService } from './ob.service.js';
import { DtrService } from '../dtr.service.js';
import { localWallTime } from '../dtr.calculator.js';
import type { AuthUserContext } from '../../../foundation/auth/auth.context.js';
describe.runIf(process.env.DTR_DB_TEST === 'true')(
  'OB PostgreSQL rollback-only lifecycle',
  () => {
    it('enforces scope and independent approval, creates no-punch DTR, preserves locked periods and reviews cancellations', async () => {
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
        transaction: async <T>(fn: (m: EntityManager) => Promise<T>) => {
          const name = `ob_test_${++savepoint}`;
          await runner.query(`SAVEPOINT ${name}`);
          try {
            const r = await fn(runner.manager);
            await runner.query(`RELEASE SAVEPOINT ${name}`);
            return r;
          } catch (e) {
            await runner.query(`ROLLBACK TO SAVEPOINT ${name}`);
            throw e;
          }
        },
      } as unknown as DataSource;
      try {
        const [table] = await runner.query(
          `SELECT to_regclass('attendance_ob_requests') AS name`,
        );
        if (!table.name)
          await new OfficialBusinessRequests1794873600000().up(runner);
        const branch = randomUUID(),
          other = randomUUID(),
          employee = randomUUID(),
          user = randomUUID(),
          admin = randomUUID();
        await runner.query(
          `INSERT INTO branches(id,name,code,status) VALUES($1,'OB test',$1,'ACTIVE'),($2,'Other OB test',$2,'ACTIVE')`,
          [branch, other],
        );
        await runner.query(
          `INSERT INTO employees(id,branch_id,name,email,employee_number,position,department,status,employment) VALUES($1,$2,'OB Employee',$3,$4,'Test','Test','ACTIVE','{"employeeType":"REGULAR","startDate":"2020-01-01"}')`,
          [
            employee,
            branch,
            `${employee}@example.invalid`,
            randomUUID().slice(0, 8),
          ],
        );
        await runner.query(
          `INSERT INTO users(id,email,name,role,status,branch_id,employee_id) VALUES($1,$2,'OB Filer','EMPLOYEE','ACTIVE',$3,$4),($5,$6,'OB Reviewer','SUPER_ADMIN','ACTIVE',NULL,NULL)`,
          [
            user,
            `${user}@example.invalid`,
            branch,
            employee,
            admin,
            `${admin}@example.invalid`,
          ],
        );
        await runner.query(
          `INSERT INTO attendance_schedules(branch_id,time_zone,work_days,shift_start,shift_end,break_minutes,grace_minutes) VALUES($1,'Asia/Manila',ARRAY[0,1,2,3,4,5,6]::smallint[],'09:00','18:00',0,15)`,
          [branch],
        );
        const filer = {
          userId: user,
          email: `${user}@example.invalid`,
          role: 'EMPLOYEE',
          branchId: branch,
        } as AuthUserContext;
        const reviewer = {
          userId: admin,
          email: `${admin}@example.invalid`,
          role: 'SUPER_ADMIN',
          scope: 'ALL',
        } as AuthUserContext;
        const on = localWallTime(new Date(), 'Asia/Manila').slice(0, 10);
        const service = new OfficialBusinessService(
          scoped,
          new DtrService(scoped),
        );
        const input = {
          workDate: on,
          startTime: '09:00',
          endTime: '18:00',
          nextDay: false,
          destination: 'Client visit',
          reason: 'Assigned field work',
          submissionKey: randomUUID(),
        };
        expect((await service.context(reviewer)).canFile).toBe(false);
        await expect(service.preview(reviewer, { ...input, employeeId: employee })).rejects.toThrow('review-only');
        await expect(service.submit(reviewer, { ...input, employeeId: employee })).rejects.toThrow('review-only');
        await expect(service.previewRange(reviewer, { ...input, employeeId: employee, endDate: on })).rejects.toThrow('review-only');
        await expect(service.submitRange(reviewer, { ...input, employeeId: employee, endDate: on })).rejects.toThrow('review-only');
        for (const role of ['HR_ADMIN', 'BRANCH_MANAGER'] as const) {
          await runner.query('SAVEPOINT self_approval_policy');
          await runner.query(`UPDATE users SET role=$2 WHERE id=$1`, [user, role]);
          const manager = { ...filer, role };
          expect((await service.context(manager)).canFile).toBe(true);
          const selfRequest = await service.submit(manager, { ...input, submissionKey: randomUUID() });
          expect((await service.detail(manager, selfRequest.id)).canReview).toBe(true);
          await expect(service.decide({ ...manager, branchId: other, branchIds: [other], scope: 'SELECTED' }, selfRequest.id, { version: 1, action: 'APPROVE', comment: 'Wrong branch' })).rejects.toThrow();
          await service.decide(manager, selfRequest.id, { version: 1, action: 'APPROVE', comment: 'Own field assignment' });
          const approved = await service.detail(manager, selfRequest.id);
          expect(approved.status).toBe('APPROVED');
          expect(approved.events.some((event: {action: string; comment: string}) => event.action === 'SELF_APPROVE' && event.comment === 'Own field assignment')).toBe(true);
          const [audit] = await runner.query(`SELECT details::jsonb AS details FROM audit_logs WHERE user_id=$1 AND action='OB_SELF_APPROVE' ORDER BY created_at DESC LIMIT 1`, [user]);
          expect(audit.details).toMatchObject({ role, selfApproval: true, employeeId: employee, filedBy: user });
          await runner.query('ROLLBACK TO SAVEPOINT self_approval_policy');
          await runner.query('RELEASE SAVEPOINT self_approval_policy');
        }
        // An employee can file and receive approval before DTR setup.
        // Isolate this request so the remaining lifecycle assertions stay independent.
        await runner.query('SAVEPOINT before_cutoff_setup');
        const pastInput = {
          ...input,
          workDate: new Date(Date.parse(`${on}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10),
          submissionKey: randomUUID(),
        };
        expect((await service.preview(filer, pastInput)).calculation.workedMinutes).toBe(540);
        const pastRequest = await service.submit(filer, pastInput);
        await service.decide(reviewer, pastRequest.id, {
          version: 1,
          action: 'APPROVE',
          comment: 'Approved before cutoff setup',
        });
        expect((await service.detail(filer, pastRequest.id)).status).toBe('APPROVED');
        await runner.query('ROLLBACK TO SAVEPOINT before_cutoff_setup');
        await runner.query('RELEASE SAVEPOINT before_cutoff_setup');
        await runner.query('SAVEPOINT multi_day_ob');
        const futureDate = (offset: number) => new Date(Date.parse(`${on}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
        const rangeInput = { ...input, nextDay: undefined, workDate: futureDate(14), endDate: futureDate(16), submissionKey: randomUUID() };
        const rangePreview = await service.previewRange(filer, rangeInput);
        expect('days' in rangePreview && rangePreview.days).toHaveLength(3);
        const rangeResult = await service.submitRange(filer, rangeInput);
        if (!('ids' in rangeResult)) throw new Error('Expected range response');
        expect(rangeResult.ids).toHaveLength(3);
        expect(await service.submitRange(filer, rangeInput)).toEqual(rangeResult);
        await expect(service.submitRange(filer, { ...rangeInput, endDate: futureDate(17) })).rejects.toThrow("Submission key reused");
        for (const id of rangeResult.ids) {
          await service.decide(reviewer, id, { version: 1, action: 'APPROVE', comment: 'Daily assignment approved' });
          expect((await service.detail(filer, id)).preview.obCreditedMinutes).toBe(540);
        }
        await expect(service.submitRange(filer, { ...rangeInput, workDate: futureDate(13), submissionKey: randomUUID() })).rejects.toThrow('overlaps');
        const [partial] = await runner.query(`SELECT count(*)::int AS count FROM attendance_ob_requests WHERE employee_id=$1 AND work_date=$2`, [employee, futureDate(13)]);
        expect(partial.count).toBe(0);
        await expect(service.previewRange(filer, { ...rangeInput, endDate: futureDate(13) })).rejects.toThrow('ordered');
        await runner.query(`UPDATE attendance_schedules SET work_days=ARRAY[1,2,3,4,5]::smallint[] WHERE branch_id=$1`, [branch]);
        const week = await service.previewRange(filer, { ...rangeInput, workDate: futureDate(28), endDate: futureDate(34) });
        expect('days' in week && week.days).toHaveLength(5);
        expect('skipped' in week && week.skipped).toHaveLength(2);
        await runner.query(`INSERT INTO employee_work_schedule_days(id,employee_id,branch_id,work_date,day_type,shift_start,shift_end) VALUES($1,$2,$3,$4,'WORK','22:00','06:00')`, [randomUUID(), employee, branch, futureDate(40)]);
        const overnight = { ...input, nextDay: undefined, workDate: futureDate(40), startTime: '22:00', endTime: '06:00', submissionKey: randomUUID() };
        expect((await service.preview(filer, overnight)).calculation.obCreditedMinutes).toBe(480);
        const nightRequest = await service.submit(filer, overnight);
        expect(await service.submit(filer, overnight)).toEqual(nightRequest);
        await runner.query('ROLLBACK TO SAVEPOINT multi_day_ob');
        await runner.query('RELEASE SAVEPOINT multi_day_ob');
        const preview = await service.preview(filer, input);
        expect(preview.calculation.workedMinutes).toBe(540);
        const request = await service.submit(filer, input);
        expect((await service.list(filer,{})).items.map(r=>r.id)).toContain(request.id);
        await expect(service.list(filer,{view:'review'})).rejects.toThrow('reviewer');
        await expect(service.preview({...filer,userId:admin},input)).rejects.toThrow('Link an employee');
        const dtr=new DtrService(scoped);
        const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Name','In','Out'],['OB Employee','09:00','18:00']]),on);
        const day=Number(on.slice(8));const anchor=new Date(`${on}T00:00:00Z`);
        const dateAt=(month:number,date:number)=>new Date(Date.UTC(anchor.getUTCFullYear(),anchor.getUTCMonth()+month,date)).toISOString().slice(0,10);
        const cutoff=day<=10?{from:dateAt(-1,26),to:dateAt(0,10)}:day<=25?{from:dateAt(0,11),to:dateAt(0,25)}:{from:dateAt(0,26),to:dateAt(1,10)};
        const batch=await dtr.preview(reviewer,branch,{buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'}) as Buffer,originalname:'OB-test.xlsx'},undefined,undefined,cutoff);
        const selection={branchId:branch,...cutoff,mappings:[{key:batch.identities[0].key,employeeId:employee}]};
        const beforeApproval=await dtr.calculateImport(reviewer,batch.id,selection);
        expect((await service.submit(filer, input)).id).toBe(request.id);
        await expect(
          service.detail(
            {
              ...reviewer,
              role: 'BRANCH_MANAGER',
              branchId: other,
              branchIds: [other],
            },
            request.id,
          ),
        ).rejects.toThrow('access denied');
        await expect(
          service.decide(filer, request.id, {
            version: 1,
            action: 'APPROVE',
            comment: 'Self',
          }),
        ).rejects.toThrow('reviewer');
        await expect(
          service.decide({ ...reviewer, userId: user }, request.id, {
            version: 1,
            action: 'APPROVE',
            comment: 'Self',
          }),
        ).rejects.toThrow('independent');
        await service.decide(reviewer, request.id, {
          version: 1,
          action: 'APPROVE',
          comment: 'Authorized field assignment',
        });
        await expect(service.decide(reviewer,request.id,{version:1,action:'APPROVE',comment:'Stale duplicate'})).rejects.toThrow('changed');
        expect((await service.submit(filer,input)).id).toBe(request.id);
        await expect(dtr.commit(reviewer,batch.id,{...selection,overlap:'REPLACE',reason:'Stale OB preview',contextHash:beforeApproval.contextHash})).rejects.toThrow('Recalculate');
        const current=await dtr.calculateImport(reviewer,batch.id,selection);
        expect(current.rows[0].data.calculation.obCreditedMinutes).toBe(540);
        await dtr.commit(reviewer,batch.id,{...selection,overlap:'REPLACE',reason:'OB verified import',contextHash:current.contextHash});
        let [record] = await runner.query(
          `SELECT id,time_in,time_out,dtr_data FROM attendance_records WHERE employee_id=$1 AND work_date=$2`,
          [employee, on],
        );
        expect(record.time_in).not.toBeNull();
        expect(record.time_out).not.toBeNull();
        expect(record.dtr_data.calculation.workedMinutes).toBe(540);
        expect(record.dtr_data.calculation.statuses).toContain('OB');
        expect(record.dtr_data.approval).toBe('DRAFT');
        await expect(
          service.submit(filer, { ...input, submissionKey: randomUUID() }),
        ).rejects.toThrow('overlaps');
        await service.decide(filer, request.id, {
          version: 2,
          action: 'REQUEST_CANCELLATION',
          comment: 'Assignment withdrawn',
        });
        await runner.query(
          `INSERT INTO attendance_dtr_periods(id,branch_id,date_from,date_to,state,actor_id) VALUES($1,$2,$3,$3,'LOCKED',$4)`,
          [randomUUID(), branch, on, admin],
        );
        await expect(
          service.decide(reviewer, request.id, {
            version: 3,
            action: 'APPROVE_CANCELLATION',
            comment: 'Cancel',
          }),
        ).rejects.toThrow('Reopen');
        expect((await service.detail(filer, request.id)).status).toBe(
          'APPROVED',
        );
        await runner.query(
          `UPDATE attendance_dtr_periods SET state='REOPENED' WHERE branch_id=$1`,
          [branch],
        );
        await service.decide(reviewer, request.id, {
          version: 3,
          action: 'APPROVE_CANCELLATION',
          comment: 'Cancelled after reopening',
        });
        [record] = await runner.query(
          `SELECT dtr_data FROM attendance_records WHERE employee_id=$1 AND work_date=$2`,
          [employee, on],
        );
        expect(record.dtr_data.calculation.officialBusiness ?? []).toHaveLength(
          0,
        );
        expect((await service.detail(filer, request.id)).status).toBe(
          'CANCELLED',
        );
        const [events] = await runner.query(
          `SELECT count(*)::int AS count FROM attendance_ob_events WHERE request_id=$1`,
          [request.id],
        );
        expect(events.count).toBe(4);
        const [notifications] = await runner.query(
          `SELECT count(*)::int AS count FROM notifications WHERE href LIKE $1`,
          [`%${request.id}`],
        );
        expect(notifications.count).toBeGreaterThan(0);
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
        await db.destroy();
      }
    }, 60000);
  },
);
