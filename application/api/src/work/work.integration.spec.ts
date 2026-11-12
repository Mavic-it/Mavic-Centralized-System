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
import { DataSource, type QueryRunner, type EntityManager } from 'typeorm';
import { TasksAndIncidents1793232000000 } from '../database/migrations/1793232000000-TasksAndIncidents.js';
import { CompleteWorkHistory1793232001000 } from '../database/migrations/1793232001000-CompleteWorkHistory.js';
import { IncidentWorkflow1793318400000 } from '../database/migrations/1793318400000-IncidentWorkflow.js';
import { TaskCollaboration1793318401000 } from '../database/migrations/1793318401000-TaskCollaboration.js';
import { TaskMailPolicy1793318403000 } from '../database/migrations/1793318403000-TaskMailPolicy.js';
import { TaskReminderAndCreatorDeletion1794096000000 } from '../database/migrations/1794096000000-TaskReminderAndCreatorDeletion.js';
import { TaskAssigneeMailRecovery1794182400000 } from '../database/migrations/1794182400000-TaskAssigneeMailRecovery.js';
import { TaskReassignment1794268800000 } from '../database/migrations/1794268800000-TaskReassignment.js';
import { TaskAutomation1794355200000 } from '../database/migrations/1794355200000-TaskAutomation.js';
import { RepairTaskAutomationTemplateLink1794355201000 } from '../database/migrations/1794355201000-RepairTaskAutomationTemplateLink.js';
import { IncidentReportScope1793318402000 } from '../database/migrations/1793318402000-IncidentReportScope.js';
import { SimpleIncidentWorkflow1794441600000 } from '../database/migrations/1794441600000-SimpleIncidentWorkflow.js';
import { WorkMailService } from './work-mail.service.js';
import { WorkService } from './work.service.js';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import type { WorkActionDto } from './work.dto.js';

describe.runIf(process.env.WORK_DB_TEST === 'true')(
  'PostgreSQL tasks and confidential cases (rollback-only)',
  () => {
    let db: DataSource, r: QueryRunner, s: WorkService;
    const actor = (
      userId: string,
      role: AuthUserContext['role'],
      branchIds = ['a'],
    ): AuthUserContext => ({
      userId,
      role,
      branchId: branchIds[0],
      branchIds,
      email: `${userId}@example.invalid`,
    });
    const hr = actor('hr', 'HR_ADMIN'),
      mgr = actor('mgr', 'BRANCH_MANAGER'),
      staff = actor('staff', 'EMPLOYEE'),
      other = actor('other', 'EMPLOYEE'),
      reporter = actor('reporter', 'BRANCH_MANAGER');
    const task = () => ({
      submissionKey: randomUUID(),
      employeeId: 'e1',
      title: 'Prepare room',
      description: 'Arrange chairs.',
      priority: 'NORMAL',
      dueDate: '2026-11-01',
    });
    const report = () => ({
      submissionKey: randomUUID(),
      branchId: 'a',
      employeeId: 'e1',
      title: 'Private allegation',
      description: 'Reporter-only factual narrative.',
      category: 'CONDUCT',
      incidentDate: '2026-10-01',
    });
    const act = async (
      id: string,
      user: AuthUserContext,
      action: string,
      message = 'Documented update',
      extra: Partial<WorkActionDto> = {},
    ) => {
      const detail = await s.detail(user, 'incidents', id);
      return s.act(user, 'incidents', id, {
        version: detail.version,
        action,
        message,
        ...(['DECIDE', 'RESOLVE'].includes(action)
          ? {
              findings: 'Documented evidence reviewed.',
              outcome: 'NO_VIOLATION',
              disciplinaryAction: 'NONE',
            }
          : {}),
        ...extra,
      });
    };
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
      r = db.createQueryRunner();
      await r.connect();
      await r.startTransaction();
      const schema = `work_fixture_${randomUUID().replaceAll('-', '')}`;
      await r.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public;
      CREATE TABLE branches(id varchar(100) PRIMARY KEY,name text,is_active boolean DEFAULT true,status text DEFAULT 'ACTIVE',manager_user_id varchar(100));
      CREATE TABLE employees(id varchar(100) PRIMARY KEY,name text,branch_id varchar(100),status text DEFAULT 'ACTIVE',manager_employee_id varchar(100));
      CREATE TABLE employee_profile_pictures(employee_id varchar(100) PRIMARY KEY,updated_at timestamptz);
      CREATE TABLE users(id varchar(100) PRIMARY KEY,name text,email text DEFAULT 'fixture@example.invalid',role text,employee_id varchar(100),branch_id varchar(100),status text DEFAULT 'ACTIVE');
      CREATE TABLE user_branch_access(user_id varchar(100),mode text,branch_ids text[]);
      CREATE VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
      CREATE TABLE notifications(LIKE public.notifications INCLUDING ALL);
      CREATE TABLE audit_logs(id text,user_id text,branch_id text,action text,resource text,details jsonb,created_at timestamptz);
      INSERT INTO branches(id,name) VALUES('a','Branch A'),('b','Branch B');
      INSERT INTO employees(id,name,branch_id) VALUES('e1','Assignee','a'),('e2','Unrelated employee','a'),('er','Reporter','a'),('eh','HR employee','a'),('em','Manager employee','a');
      INSERT INTO users(id,name,role,employee_id,branch_id) VALUES('staff','Assignee','EMPLOYEE','e1','a'),('other','Other','EMPLOYEE','e2','a'),('reporter','Reporter','BRANCH_MANAGER','er','a'),('hr','HR','HR_ADMIN','eh','a'),('mgr','Manager','BRANCH_MANAGER','em','a'),('it','IT','IT_ADMIN',null,null);
      UPDATE users SET email=id || '@example.invalid';
    `);
      await new TasksAndIncidents1793232000000().up(r);
      await new IncidentWorkflow1793318400000().up(r);
      await new TaskCollaboration1793318401000().up(r);
      await new TaskMailPolicy1793318403000().up(r);
      await new TaskReminderAndCreatorDeletion1794096000000().up(r);
      await new TaskAssigneeMailRecovery1794182400000().up(r);
      await new TaskReassignment1794268800000().up(r);
      await new TaskAutomation1794355200000().up(r);
      await new RepairTaskAutomationTemplateLink1794355201000().up(r);
      await new IncidentReportScope1793318402000().up(r);
      await new SimpleIncidentWorkflow1794441600000().up(r);
      await r.query(
        "INSERT INTO incident_disciplinary_authority(user_id,granted_by) VALUES('hr','hr')",
      );
      const scoped = {
        manager: r.manager,
        query: r.manager.query.bind(r.manager),
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      s = new WorkService(scoped);
    });
    afterEach(async () => {
      vi.useRealTimers();
      await r.rollbackTransaction();
      await r.release();
    });
    afterAll(async () => {
      await db?.destroy();
    });
    it('requires explicit disciplinary grants for every role and audits grant/revoke', async () => {
      await r.query(
        "INSERT INTO users(id,name,role) VALUES('root','Super','SUPER_ADMIN')",
      );
      const root = actor('root', 'SUPER_ADMIN');
      const { id } = await s.create(reporter, 'incidents', report());
      await act(id, root, 'REVIEW');
      expect((await s.detail(root, 'incidents', id)).canDiscipline).toBe(false);
      await expect(act(id, root, 'ESCALATE')).rejects.toThrow(
        'disciplinary authority',
      );
      await expect(
        s
          .incidentAuthority()
          .update(hr, { userId: 'mgr', granted: true, reason: 'Unauthorized' }),
      ).rejects.toThrow('Only Super Admin');
      await expect(
        s
          .incidentAuthority()
          .update(root, { userId: 'it', granted: true, reason: 'Wrong role' }),
      ).rejects.toThrow('active authorized');
      await expect(
        s
          .incidentAuthority()
          .update(root, { userId: 'root', granted: true, reason: '  ' }),
      ).rejects.toThrow('reason');
      await s.incidentAuthority().update(
        { ...root, branchIds: undefined, branchId: null },
        {
          userId: 'root',
          granted: true,
          reason: 'Explicit personnel authority',
        },
      );
      expect((await s.detail(root, 'incidents', id)).canDiscipline).toBe(true);
      await act(id, root, 'ESCALATE');
      await s
        .incidentAuthority()
        .update(
          { ...root, branchIds: undefined, branchId: null },
          { userId: 'root', granted: false, reason: 'Revoke authority' },
        );
      await expect(act(id, root, 'NOTICE')).rejects.toThrow(
        'disciplinary authority',
      );
      const audit = await r.query(
        "SELECT details FROM audit_logs WHERE action='INCIDENT_AUTHORITY_CHANGED'",
      );
      expect(
        audit.map(
          (row: { details: { granted: boolean } }) => row.details.granted,
        ),
      ).toEqual([true, false]);
    });
    it('lets an explicitly authorized assigned manager complete one structured decision without leaking it to the reporter', async () => {
      const { id } = await s.create(other, 'incidents', {
        ...report(),
        employeeId: 'e2',
      });
      await act(id, hr, 'SET_SUBJECT', 'Identify employee', {
        employeeId: 'e1',
      });
      await r.query(
        "INSERT INTO incident_disciplinary_authority(user_id,granted_by) VALUES('mgr','hr')",
      );
      await expect(s.detail(mgr, 'incidents', id)).rejects.toThrow('not found');
      await act(id, hr, 'ASSIGN_REVIEWER', 'Independent manager', {
        reviewerId: 'mgr',
      });
      await act(id, mgr, 'REVIEW');
      await act(id, mgr, 'ESCALATE');
      await act(id, mgr, 'NOTICE', 'Allegation and instructions');
      await act(id, staff, 'RESPONSE', 'Employee statement');
      await expect(
        act(id, mgr, 'DECIDE', 'Decision reason', { findings: '  ' }),
      ).rejects.toThrow('findings');
      await expect(
        act(id, mgr, 'DECIDE', 'Decision reason', {
          outcome: 'NO_VIOLATION',
          disciplinaryAction: 'WARNING',
          actionDetails: 'Warning',
        }),
      ).rejects.toThrow('confirmed');
      await act(id, mgr, 'DECIDE', 'Private policy decision', {
        findings: 'Private findings',
        outcome: 'CONFIRMED',
        disciplinaryAction: 'WARNING',
        actionDetails: 'Private warning details',
      });
      const employeeDetail = await s.detail(staff, 'incidents', id);
      expect(employeeDetail).toMatchObject({
        status: 'CLOSED',
        caseStatus: 'CLOSED',
        workflowStatus: 'CLOSED',
      });
      expect(
        employeeDetail.events.find((event) => event.action === 'DECIDE')
          ?.details,
      ).toMatchObject({
        findings: 'Private findings',
        disciplinaryAction: 'WARNING',
      });
      const reporterDetail = await s.detail(other, 'incidents', id);
      expect(JSON.stringify(reporterDetail)).not.toMatch(
        /Private findings|Private policy decision|Private warning details/,
      );
      await expect(act(id, mgr, 'COMMENT')).rejects.toThrow('closed');
      const logs = await r.query(
        "SELECT details FROM audit_logs WHERE action='WORK_DECIDE'",
      );
      expect(JSON.stringify(logs)).not.toContain('Private findings');
    });
    it('does not let a disciplinary grant bypass branch scope or self-review', async () => {
      await r.query(
        "INSERT INTO incident_disciplinary_authority(user_id,granted_by) VALUES('mgr','hr')",
      );
      const { id } = await s.create(reporter, 'incidents', report());
      await act(id, hr, 'ASSIGN_REVIEWER', 'Reviewer', { reviewerId: 'mgr' });
      await expect(
        s.detail({ ...mgr, branchIds: ['b'] }, 'incidents', id),
      ).rejects.toThrow('not found');
      const ownReport = await s.create(mgr, 'incidents', {
        ...report(),
        employeeId: 'em',
      });
      expect(
        (await s.detail(mgr, 'incidents', ownReport.id)).canDiscipline,
      ).toBe(false);
      await expect(act(ownReport.id, mgr, 'ESCALATE')).rejects.toThrow(
        'disciplinary authority',
      );
    });
    it('withdraws only reporter-owned open reports and dismisses with an audited required reason', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await expect(act(id, staff, 'WITHDRAW')).rejects.toThrow(
        'Only the reporter',
      );
      await expect(act(id, reporter, 'WITHDRAW', '  ')).rejects.toThrow();
      await act(id, reporter, 'WITHDRAW', 'Reported in error');
      expect((await s.detail(hr, 'incidents', id)).status).toBe('WITHDRAWN');
      await expect(act(id, hr, 'REVIEW')).rejects.toThrow('closed');
      const second = await s.create(reporter, 'incidents', report());
      await act(second.id, hr, 'ASSIGN_REVIEWER', 'Reviewer', {
        reviewerId: 'mgr',
      });
      await expect(act(second.id, mgr, 'DISMISS')).rejects.toThrow(
        'decision reviewer',
      );
      await act(second.id, hr, 'DISMISS', 'No basis to proceed');
      expect((await s.detail(hr, 'incidents', second.id)).status).toBe(
        'DISMISSED',
      );
      expect(
        (await s.list(hr, 'incidents', { status: 'finished' })).items,
      ).toHaveLength(2);
      const third = await s.create(reporter, 'incidents', report());
      await act(third.id, hr, 'REVIEW');
      await act(third.id, hr, 'ESCALATE');
      await expect(act(third.id, reporter, 'WITHDRAW')).rejects.toThrow(
        'active formal case',
      );
    });
    it('exports only authorized filtered incident metadata and audits downloads', async () => {
      const selected = await s.create(reporter, 'incidents', report());
      await s.create(reporter, 'incidents', {
        ...report(),
        category: 'SAFETY',
      });
      const filters = {
        employeeId: 'e1',
        category: 'CONDUCT',
        branchId: 'a',
        from: '2026-10-01',
        to: '2026-10-01',
      };
      const list = await s.list(hr, 'incidents', filters);
      expect(list.items.map((item) => item.id)).toEqual([selected.id]);
      expect(list.summary?.total).toBe(1);
      const csv = (await s.exportIncidents(hr, filters)).toString('utf8');
      expect(csv.split('\r\n')).toHaveLength(3);
      expect(csv).toContain(selected.id.toUpperCase());
      expect(csv).not.toContain('Reporter-only');
      await expect(s.exportIncidents(staff, {})).rejects.toThrow('managers');
      await expect(s.exportIncidents(hr, { branchId: 'b' })).rejects.toThrow(
        'Branch access',
      );
      expect(
        (await s.exportIncidents(mgr, {})).toString('utf8').split('\r\n'),
      ).toHaveLength(2);
      expect(
        (
          await r.query(
            "SELECT * FROM audit_logs WHERE action='INCIDENT_EXPORT'",
          )
        ).length,
      ).toBe(2);
      await r.query("UPDATE employees SET branch_id='b' WHERE id='e1'");
      expect(
        (await s.exportIncidents(reporter, {})).toString('utf8').split('\r\n'),
      ).toHaveLength(2);
    });
    it('records scoped offense levels, numbers by category, filters employee history and audits corrections', async () => {
      const first = await s.create(reporter, 'incidents', report());
      await expect(
        s.recordOffense(staff, first.id, {
          version: 1,
          offense: '1',
          reason: 'Denied',
        }),
      ).rejects.toThrow();
      await expect(
        s.recordOffense(actor('hr', 'HR_ADMIN', ['b']), first.id, {
          version: 1,
          offense: '1',
          reason: 'Denied',
        }),
      ).rejects.toThrow();
      await s.recordOffense(reporter, first.id, {
        version: 1,
        offense: 'AUTO',
        reason: 'Reviewed facts',
      });
      const second = await s.create(hr, 'incidents', report());
      await s.recordOffense(hr, second.id, {
        version: 1,
        offense: 'AUTO',
        reason: 'Repeated conduct',
      });
      expect(await s.detail(staff, 'incidents', second.id)).toMatchObject({
        offense: '2',
      });
      await expect(
        s.recordOffense(hr, second.id, {
          version: 1,
          offense: '3',
          reason: 'Stale',
        }),
      ).rejects.toThrow();
      const history = await s.list(staff, 'incidents', { employeeId: 'e1' });
      expect(history.items).toHaveLength(2);
      expect(history.items.every((x) => !x.canRecordOffense)).toBe(true);
      expect(
        (await s.list(staff, 'incidents', { employeeId: 'e2' })).items,
      ).toHaveLength(0);
      await s.recordOffense(hr, second.id, {
        version: 2,
        offense: 'NONE',
        reason: 'Corrected after review',
      });
      expect(await s.detail(staff, 'incidents', second.id)).toMatchObject({
        offense: null,
      });
      const third = await s.create(hr, 'incidents', {
        ...report(),
        category: 'SAFETY',
      });
      await s.recordOffense(hr, third.id, {
        version: 1,
        offense: 'AUTO',
        reason: 'Separate category',
      });
      expect(await s.detail(staff, 'incidents', third.id)).toMatchObject({
        offense: '1',
      });
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS n FROM audit_logs WHERE action='WORK_OFFENSE_RECORDED'",
          )
        )[0].n,
      ).toBe(4);
    });
    it('persists task assignment, idempotent retry, progress, change requests and completion', async () => {
      const d = task(),
        { id } = await s.create(hr, 'tasks', d);
      expect(await s.create(hr, 'tasks', d)).toEqual({ id });
      expect((await s.list(staff, 'tasks', {})).items).toHaveLength(1);
      expect((await s.list(other, 'tasks', {})).items).toHaveLength(0);
      await expect(s.detail(other, 'tasks', id)).rejects.toThrow('not found');
      await s.act(staff, 'tasks', id, {
        version: 1,
        action: 'PROGRESS',
        message: 'Half arranged.',
        progress: 50,
      });
      await expect(
        s.act(staff, 'tasks', id, {
          version: 1,
          action: 'SUBMIT',
          message: 'Stale',
        }),
      ).rejects.toThrow('changed');
      await s.act(staff, 'tasks', id, {
        version: 2,
        action: 'SUBMIT',
        message: 'Ready',
      });
      await expect(
        s.act(staff, 'tasks', id, {
          version: 3,
          action: 'ACCEPT',
          message: 'Own acceptance',
        }),
      ).rejects.toThrow('different');
      await s.act(hr, 'tasks', id, {
        version: 3,
        action: 'CHANGES',
        message: 'Add another row.',
      });
      await s.act(staff, 'tasks', id, {
        version: 4,
        action: 'SUBMIT',
        message: 'Updated',
      });
      await s.act(hr, 'tasks', id, {
        version: 5,
        action: 'ACCEPT',
        message: 'Reviewed result.',
      });
      expect(await s.detail(staff, 'tasks', id)).toMatchObject({
        status: 'COMPLETED',
        progress: 100,
        version: 6,
      });
      expect(
        (await r.query('SELECT count(*)::int AS count FROM work_tasks'))[0]
          .count,
      ).toBe(1);
      expect(
        (await r.query('SELECT count(*)::int AS count FROM notifications'))[0]
          .count,
      ).toBeGreaterThan(0);
    });
    it('filters task assignees only inside the manager branch scope', async () => {
      const primary = await s.create(hr, 'tasks', task());
      const shared = await s.create(hr, 'tasks', {
        ...task(),
        employeeId: 'e1',
        employeeIds: ['e1', 'e2'],
      });
      expect(
        (await s.list(hr, 'tasks', { assigneeId: 'e2' })).items.map(
          (x) => x.id,
        ),
      ).toEqual([shared.id]);
      expect(
        (await s.list(staff, 'tasks', { assigneeId: 'e2' })).items.map(
          (x) => x.id,
        ),
      ).toEqual([shared.id]);
      expect(
        (await s.list(staff, 'tasks', { assigneeId: 'e1' })).items.map(
          (x) => x.id,
        ),
      ).toContain(primary.id);

      await r.query(
        "INSERT INTO employees(id,name,branch_id) VALUES('e3','Branch B assignee','b')",
      );
      const hrBothBranches = actor('hr', 'HR_ADMIN', ['a', 'b']);
      const branchBTask = await s.create(hrBothBranches, 'tasks', {
        ...task(),
        employeeId: 'e3',
      });
      expect(
        (await s.list(hr, 'tasks', { assigneeId: 'e3' })).items,
      ).toHaveLength(0);
      expect(
        (await s.list(hrBothBranches, 'tasks', { assigneeId: 'e3' })).items.map(
          (x) => x.id,
        ),
      ).toEqual([branchBTask.id]);
      expect(
        (await s.list(staff, 'tasks', { assigneeId: 'e3' })).items,
      ).toHaveLength(0);
    }, 20000);
    it('allows only the in-scope task creator to soft-delete and keeps audit history', async () => {
      const { id } = await s.create(hr, 'tasks', task());
      expect(await s.detail(hr, 'tasks', id)).toMatchObject({
        canDelete: true,
      });
      await expect(s.deleteTask(mgr, id)).rejects.toThrow(
        'Only the task creator',
      );
      await expect(
        s.deleteTask(actor('hr', 'HR_ADMIN', ['b']), id),
      ).rejects.toThrow('not found');

      await expect(s.deleteTask(hr, id)).resolves.toEqual({
        id,
        deleted: true,
      });
      await expect(s.detail(staff, 'tasks', id)).rejects.toThrow('not found');
      expect((await s.list(staff, 'tasks', {})).items).toHaveLength(0);
      expect(
        (
          await r.query('SELECT deleted_by FROM work_tasks WHERE id=$1', [id])
        )[0].deleted_by,
      ).toBe('hr');
      expect(
        await r.query(
          "SELECT action FROM work_events WHERE task_id=$1 AND action='DELETED'",
          [id],
        ),
      ).toHaveLength(1);
      expect(
        await r.query(
          "SELECT action FROM audit_logs WHERE resource='tasks' AND action='WORK_DELETED'",
        ),
      ).toHaveLength(1);
    });
    it('emails only task decisions and assignment to the affected recipient', async () => {
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        dueDate: '2099-01-01',
      });
      const taskAction = async (
        user: AuthUserContext,
        action: string,
        extra: Partial<WorkActionDto> = {},
      ) => {
        const detail = await s.detail(user, 'tasks', id);
        await s.act(user, 'tasks', id, {
          version: detail.version,
          action,
          message: 'Fixture update',
          ...extra,
        });
      };
      await taskAction(staff, 'COMMENT');
      await taskAction(staff, 'PROGRESS', { progress: 50 });
      await taskAction(staff, 'SUBMIT');
      await taskAction(hr, 'CHANGES');
      await taskAction(staff, 'STATUS', { taskState: 'DONE' });
      await taskAction(hr, 'ACCEPT');
      const queued = await r.query(
        'SELECT user_id,event FROM work_task_mail_outbox WHERE task_id=$1 ORDER BY created_at,id',
        [id],
      );
      const deliveries = queued.map(
        (job: { user_id: string; event: string }) =>
          `${job.user_id}:${job.event}`,
      );
      expect(deliveries.toSorted()).toEqual(
        [
          'staff:ASSIGNED',
          'hr:REVIEW_REQUIRED',
          'staff:CHANGES_REQUESTED',
          'hr:REVIEW_REQUIRED',
          'staff:COMPLETED',
        ].toSorted(),
      );
      const sent: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
        sendTaskNotice: async (_email, _name, _id, event) => {
          sent.push(event);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      }).flush();
      expect(sent).toHaveLength(5);
      expect(
        (
          await r.query(
            'SELECT count(*)::int AS count FROM work_task_mail_outbox WHERE task_id=$1 AND sent_at IS NOT NULL',
            [id],
          )
        )[0].count,
      ).toBe(5);
    }, 20000);
    it('queues cancellation and suppresses task mail after recipient access is revoked', async () => {
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        dueDate: '2099-01-01',
      });
      await s.act(hr, 'tasks', id, {
        version: 1,
        action: 'CANCEL',
        message: 'No longer needed',
      });
      const events = await r.query(
        'SELECT event FROM work_task_mail_outbox WHERE task_id=$1 ORDER BY event',
        [id],
      );
      expect(events.map((row: { event: string }) => row.event)).toEqual([
        'ASSIGNED',
        'CANCELLED',
      ]);
      await r.query("UPDATE users SET status='INACTIVE' WHERE id='staff'");
      const sent: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
        sendTaskNotice: async (_email, _name, _id, event) => {
          sent.push(event);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      }).flush();
      expect(sent).toEqual([]);
      expect(
        (
          await r.query(
            'SELECT DISTINCT failure FROM work_task_mail_outbox WHERE task_id=$1',
            [id],
          )
        ).map((row: { failure: string }) => row.failure),
      ).toEqual(['RECIPIENT_NO_LONGER_AUTHORIZED']);
    }, 20000);
    it('emails each active assignee on creation and sends one reminder the day before due date', async () => {
      const [{ dueDate }] = await r.query<Array<{ dueDate: string }>>(
        'SELECT ((now() AT TIME ZONE \'Asia/Manila\')::date+1)::text AS "dueDate"',
      );
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        dueDate,
        employeeId: 'e1',
        employeeIds: ['e1', 'e2'],
      });
      const sent: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      const mail = new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
        sendTaskNotice: async (email, _name, _taskId, event) => {
          sent.push(`${email}:${event}`);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      });
      await mail.flush();
      await mail.flush();
      expect(sent.toSorted()).toEqual([
        'other@example.invalid:ASSIGNED',
        'other@example.invalid:DUE_TOMORROW',
        'staff@example.invalid:ASSIGNED',
        'staff@example.invalid:DUE_TOMORROW',
      ]);
      const reminders = await r.query(
        "SELECT user_id,event,reminder_for_date::text AS due_date FROM work_task_mail_outbox WHERE task_id=$1 AND event='DUE_TOMORROW' ORDER BY user_id",
        [id],
      );
      expect(reminders).toEqual([
        { user_id: 'other', event: 'DUE_TOMORROW', due_date: dueDate },
        { user_id: 'staff', event: 'DUE_TOMORROW', due_date: dueDate },
      ]);
    }, 20000);
    it('emails an IT Admin who is explicitly assigned a task', async () => {
      await r.query(`
        INSERT INTO employees(id,name,branch_id) VALUES('e3','IT assignee','a');
        INSERT INTO users(id,name,email,role,employee_id,branch_id)
        VALUES('it-assignee','IT assignee','it-assignee@example.invalid','IT_ADMIN','e3','a');
      `);
      const [{ dueDate }] = await r.query<Array<{ dueDate: string }>>(
        'SELECT ((now() AT TIME ZONE \'Asia/Manila\')::date+1)::text AS "dueDate"',
      );
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        dueDate,
        employeeId: 'e3',
        employeeIds: ['e3'],
      });
      await r.query(
        "UPDATE work_task_mail_outbox SET attempts=8,failure='RECIPIENT_NO_LONGER_AUTHORIZED' WHERE task_id=$1 AND event='ASSIGNED'",
        [id],
      );
      await new TaskAssigneeMailRecovery1794182400000().up(r);
      expect(
        await r.query(
          "SELECT attempts,failure FROM work_task_mail_outbox WHERE task_id=$1 AND event='ASSIGNED'",
          [id],
        ),
      ).toEqual([{ attempts: 0, failure: null }]);
      const itAssignee = actor('it-assignee', 'IT_ADMIN');
      expect(await s.detail(itAssignee, 'tasks', id)).toMatchObject({
        isAssignee: true,
      });
      const sent: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
        sendTaskNotice: async (email, _name, _taskId, event) => {
          sent.push(`${email}:${event}`);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      }).flush();
      expect(sent.toSorted()).toEqual([
        'it-assignee@example.invalid:ASSIGNED',
        'it-assignee@example.invalid:DUE_TOMORROW',
      ]);
    }, 20000);
    it('delivers assignment email to every assignee when a full task batch exceeds 20', async () => {
      await r.query(`
        INSERT INTO employees(id,name,branch_id)
        SELECT 'bulk-e' || n,'Bulk assignee ' || n,'a'
        FROM generate_series(3,25) n;
        INSERT INTO users(id,name,email,role,employee_id,branch_id)
        SELECT 'bulk-u' || n,'Bulk user ' || n,'bulk-u' || n || '@example.invalid','EMPLOYEE','bulk-e' || n,'a'
        FROM generate_series(3,25) n;
      `);
      const employeeIds = [
        'e1',
        'e2',
        ...Array.from({ length: 23 }, (_, index) => `bulk-e${index + 3}`),
      ];
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        dueDate: '2099-01-01',
        employeeId: 'e1',
        employeeIds,
      });
      const sent: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
        sendTaskNotice: async (email, _name, taskId, event) => {
          expect(taskId).toBe(id);
          expect(event).toBe('ASSIGNED');
          sent.push(email);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      }).flush();
      const expected = [
        'staff@example.invalid',
        'other@example.invalid',
        ...Array.from(
          { length: 23 },
          (_, index) => `bulk-u${index + 3}@example.invalid`,
        ),
      ];
      expect(sent.toSorted()).toEqual(expected.toSorted());
      expect(
        (
          await r.query(
            'SELECT count(*)::int AS count FROM work_task_mail_outbox WHERE task_id=$1 AND sent_at IS NOT NULL',
            [id],
          )
        )[0].count,
      ).toBe(25);
    }, 20000);
    it('denies foreign branch, inactive assignee and transfer-based scope bypass', async () => {
      await expect(
        s.context(actor('it', 'IT_ADMIN'), 'incidents'),
      ).resolves.toMatchObject({ canManage: false, ownEmployee: null });
      await expect(s.create(staff, 'tasks', task())).rejects.toThrow('denied');
      await expect(
        s.create(actor('hr', 'HR_ADMIN', ['b']), 'tasks', task()),
      ).rejects.toThrow('denied');
      const { id } = await s.create(hr, 'tasks', task());
      await r.query("UPDATE employees SET branch_id='b' WHERE id='e1'");
      await expect(s.detail(hr, 'tasks', id)).rejects.toThrow('not found');
      expect((await s.list(hr, 'tasks', {})).items).toHaveLength(0);
      expect((await s.detail(staff, 'tasks', id)).id).toBe(id);
      await r.query("UPDATE employees SET status='INACTIVE' WHERE id='e1'");
      await expect(s.create(hr, 'tasks', task())).rejects.toThrow(
        'active employee',
      );
    });
    it('shares one task with multiple assignees, dates, status updates and notifications', async () => {
      const input = {
        ...task(),
        employeeId: undefined,
        employeeIds: ['e1', 'e2'],
        startDate: '2026-10-29',
      };
      const { id } = await s.create(hr, 'tasks', input);
      await s.create(hr, 'tasks', input);
      expect(
        (await r.query('SELECT count(*)::int AS count FROM work_tasks'))[0]
          .count,
      ).toBe(1);
      for (const user of [staff, other]) {
        expect(
          (await s.list(user, 'tasks', {})).items.map((x) => x.id),
        ).toContain(id);
        expect(await s.detail(user, 'tasks', id)).toMatchObject({
          isAssignee: true,
          startDate: '2026-10-29',
        });
      }
      expect(
        (await s.detail(staff, 'tasks', id)).assignees?.map((a) => a.id).sort(),
      ).toEqual(['e1', 'e2']);
      const notices = await r.query(
        'SELECT user_id FROM notifications WHERE href=$1',
        [`/tasks?record=${id}`],
      );
      expect(notices.map((n: { user_id: string }) => n.user_id).sort()).toEqual(
        ['other', 'staff'],
      );
      for (const [state, status, progress] of [
        ['STARTED', 'STARTED', 10],
        ['IN_PROGRESS', 'IN_PROGRESS', 50],
        ['STUCK', 'STUCK', 50],
        ['NOT_STARTED', 'TODO', 0],
        ['DONE', 'FOR_REVIEW', 100],
      ] as const) {
        const current = await s.detail(other, 'tasks', id);
        await s.act(other, 'tasks', id, {
          version: current.version,
          action: 'STATUS',
          taskState: state,
          message: 'Shared task status update',
        });
        expect(await s.detail(staff, 'tasks', id)).toMatchObject({
          status,
          progress,
        });
      }
      const current = await s.detail(staff, 'tasks', id);
      await expect(
        s.act(staff, 'tasks', id, {
          version: current.version,
          action: 'ACCEPT',
          message: 'Self approval',
        }),
      ).rejects.toThrow('different authorized manager');
      await s.act(hr, 'tasks', id, {
        version: current.version,
        action: 'ACCEPT',
        message: 'Reviewed independently',
      });
      expect((await s.detail(other, 'tasks', id)).status).toBe('COMPLETED');
    });
    it('reassigns an open task atomically, preserves its workflow and notifies only new assignees', async () => {
      const { id } = await s.create(hr, 'tasks', task());
      await s.act(staff, 'tasks', id, {
        version: 1,
        action: 'STATUS',
        taskState: 'IN_PROGRESS',
        message: 'Started work',
      });
      const current = await s.detail(hr, 'tasks', id);
      expect(current.canReassign).toBe(true);

      await expect(
        s.act(hr, 'tasks', id, {
          version: current.version - 1,
          action: 'REASSIGN',
          employeeIds: ['e2'],
        }),
      ).rejects.toThrow('changed');
      await s.act(hr, 'tasks', id, {
        version: current.version,
        action: 'REASSIGN',
        employeeIds: ['e2'],
      });

      const reassigned = await s.detail(other, 'tasks', id);
      expect(reassigned).toMatchObject({
        status: 'IN_PROGRESS',
        progress: 50,
        version: 3,
        canReassign: false,
        isAssignee: true,
      });
      expect(reassigned.assignees?.map((assignee) => assignee.id)).toEqual([
        'e2',
      ]);
      await expect(s.detail(staff, 'tasks', id)).rejects.toThrow('not found');
      expect(
        await r.query(
          'SELECT status,progress,employee_id AS "employeeId" FROM work_tasks WHERE id=$1',
          [id],
        ),
      ).toEqual([{ status: 'IN_PROGRESS', progress: 50, employeeId: 'e2' }]);
      const events = await r.query<
        Array<{ action: string; details: Record<string, unknown> }>
      >(
        "SELECT action,details FROM work_events WHERE task_id=$1 AND action='REASSIGNED'",
        [id],
      );
      expect(events).toEqual([
        {
          action: 'REASSIGNED',
          details: expect.objectContaining({
            previousAssigneeIds: ['e1'],
            assigneeIds: ['e2'],
            actorRole: 'HR_ADMIN',
          }),
        },
      ]);
      expect(
        await r.query(
          'SELECT action,branch_id AS "branchId",details->>\'recordId\' AS "recordId" FROM audit_logs WHERE action=\'WORK_REASSIGNED\'',
        ),
      ).toEqual([
        {
          action: 'WORK_REASSIGNED',
          branchId: 'a',
          recordId: id,
        },
      ]);
      expect(
        await r.query(
          "SELECT u.id FROM work_task_mail_outbox o JOIN users u ON u.id=o.user_id WHERE o.task_id=$1 AND o.event='ASSIGNED' ORDER BY u.id",
          [id],
        ),
      ).toEqual([{ id: 'other' }, { id: 'staff' }]);
    });
    it('enforces manager scope, independent reassignment and open-task requirements', async () => {
      await r.query(
        "INSERT INTO employees(id,name,branch_id) VALUES('e3','Other branch employee','b')",
      );
      const { id } = await s.create(hr, 'tasks', task());
      await expect(
        s.act(staff, 'tasks', id, {
          version: 1,
          action: 'REASSIGN',
          employeeIds: ['e2'],
        }),
      ).rejects.toThrow('authorized manager');
      await expect(
        s.act(hr, 'tasks', id, {
          version: 1,
          action: 'REASSIGN',
          employeeIds: ['e3'],
        }),
      ).rejects.toThrow('authorized branches');
      expect(
        (await s.detail(hr, 'tasks', id)).assignees?.map((a) => a.id),
      ).toEqual(['e1']);

      const selfAssigned = await s.create(hr, 'tasks', {
        ...task(),
        employeeId: undefined,
        employeeIds: ['eh'],
      });
      expect((await s.detail(hr, 'tasks', selfAssigned.id)).canReassign).toBe(
        false,
      );
      await expect(
        s.act(hr, 'tasks', selfAssigned.id, {
          version: 1,
          action: 'REASSIGN',
          employeeIds: ['e1'],
        }),
      ).rejects.toThrow('different authorized manager');

      await s.act(hr, 'tasks', id, {
        version: 1,
        action: 'CANCEL',
        message: 'No longer needed',
      });
      await expect(
        s.act(hr, 'tasks', id, {
          version: 2,
          action: 'REASSIGN',
          employeeIds: ['e2'],
        }),
      ).rejects.toThrow('Closed tasks');
      expect((await s.detail(hr, 'tasks', id)).status).toBe('CANCELLED');
    });
    it('requires all original/current task assignee branches and prevents co-assignee managers from approving', async () => {
      await r.query("UPDATE employees SET branch_id='b' WHERE id='e2'");
      const { id } = await s.create(
        actor('hr', 'HR_ADMIN', ['a', 'b']),
        'tasks',
        { ...task(), employeeIds: ['e1', 'e2'] },
      );
      await expect(s.detail(hr, 'tasks', id)).rejects.toThrow('not found');
      expect((await s.list(hr, 'tasks', {})).items).toHaveLength(0);
      expect((await s.detail(other, 'tasks', id)).isAssignee).toBe(true);
      await r.query("UPDATE employees SET branch_id='a' WHERE id='e2'");
      await expect(s.detail(hr, 'tasks', id)).rejects.toThrow('not found');
      expect(
        (await s.detail(actor('hr', 'HR_ADMIN', ['a', 'b']), 'tasks', id))
          .canManage,
      ).toBe(true);
      const shared = await s.create(hr, 'tasks', {
        ...task(),
        employeeIds: ['e1', 'eh'],
      });
      await s.act(staff, 'tasks', shared.id, {
        version: 1,
        action: 'STATUS',
        taskState: 'DONE',
        message: 'Ready',
      });
      await expect(
        s.act(hr, 'tasks', shared.id, {
          version: 2,
          action: 'ACCEPT',
          message: 'Own assignment',
        }),
      ).rejects.toThrow('different authorized manager');
    });
    it('rejects invalid multiple assignments and start/due dates without partial tasks', async () => {
      for (const extra of [
        { employeeIds: [] },
        { employeeIds: ['e1', 'e1'] },
        { employeeIds: ['missing'] },
        { startDate: '2026-11-02' },
        { startDate: '2026-02-30' },
      ])
        await expect(
          s.create(hr, 'tasks', { ...task(), ...extra }),
        ).rejects.toThrow();
      expect(
        (await r.query('SELECT count(*)::int AS count FROM work_tasks'))[0]
          .count,
      ).toBe(0);
    });
    it('attaches files to task comments and review submissions atomically, preserving drafts on failure', async () => {
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        employeeIds: ['e1', 'e2'],
      });
      const file = {
        buffer: Buffer.from('%PDF-task action fixture'),
        originalname: 'review.pdf',
      };
      await s.act(
        other,
        'tasks',
        id,
        { version: 1, action: 'COMMENT', message: 'Supporting details' },
        file,
      );
      let detail = await s.detail(staff, 'tasks', id);
      expect(detail.attachments[0].eventId).toBe(detail.events.at(-1)?.id);
      expect(detail.attachments[0].mime).toBe('application/pdf');
      expect(detail.events.at(-1)?.action).toBe('COMMENT');
      await expect(
        s.act(
          staff,
          'tasks',
          id,
          { version: 2, action: 'SUBMIT', message: 'Done' },
          { buffer: Buffer.from('bad'), originalname: 'fake.pdf' },
        ),
      ).rejects.toThrow('Only PDF');
      expect(await s.detail(staff, 'tasks', id)).toMatchObject({
        version: 2,
        status: 'TODO',
      });
      await expect(
        s.act(
          staff,
          'tasks',
          id,
          { version: 1, action: 'SUBMIT', message: 'Stale' },
          file,
        ),
      ).rejects.toThrow('changed');
      await s.act(
        staff,
        'tasks',
        id,
        {
          version: 2,
          action: 'STATUS',
          taskState: 'DONE',
          message: 'Ready for review',
        },
        file,
      );
      detail = await s.detail(other, 'tasks', id);
      expect(detail).toMatchObject({
        version: 3,
        status: 'FOR_REVIEW',
        progress: 100,
      });
      expect(detail.attachments).toHaveLength(2);
      expect(detail.attachments[1].eventId).toBe(detail.events.at(-1)?.id);
      expect(
        (
          await s.download(other, 'tasks', id, detail.attachments[1].id)
        ).content.equals(file.buffer),
      ).toBe(true);
    });
    it('rolls back task status, comment and action evidence if evidence persistence fails', async () => {
      const { id } = await s.create(hr, 'tasks', task());
      await r.query(
        `CREATE FUNCTION reject_task_evidence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture evidence failure'; END $$; CREATE TRIGGER reject_task_evidence BEFORE INSERT ON work_attachments FOR EACH ROW EXECUTE FUNCTION reject_task_evidence()`,
      );
      await expect(
        s.act(
          staff,
          'tasks',
          id,
          {
            version: 1,
            action: 'STATUS',
            taskState: 'DONE',
            message: 'Not committed',
          },
          { buffer: Buffer.from('%PDF-fixture'), originalname: 'test.pdf' },
        ),
      ).rejects.toThrow('fixture evidence failure');
      expect(await s.detail(staff, 'tasks', id)).toMatchObject({
        status: 'TODO',
        version: 1,
        progress: 0,
      });
      expect((await s.detail(staff, 'tasks', id)).events).toHaveLength(1);
      expect((await s.detail(staff, 'tasks', id)).attachments).toHaveLength(0);
    });
    it('backfills existing task participants without inventing dates or changing progress/history', async () => {
      const { id } = await s.create(hr, 'tasks', task());
      await s.act(staff, 'tasks', id, {
        version: 1,
        action: 'PROGRESS',
        progress: 30,
        message: 'Historical progress',
      });
      await r.query(
        'DROP TABLE work_task_assignees; ALTER TABLE work_tasks DROP COLUMN start_date',
      );
      await new TaskCollaboration1793318401000().up(r);
      expect(await s.detail(staff, 'tasks', id)).toMatchObject({
        isAssignee: true,
        startDate: null,
        status: 'IN_PROGRESS',
        progress: 30,
        version: 2,
      });
      expect(
        (await s.detail(staff, 'tasks', id)).events.map((e) => e.message),
      ).toContain('Historical progress');
      expect(
        (await s.detail(staff, 'tasks', id)).assignees?.map((a) => a.id),
      ).toEqual(['e1']);
    });
    it('requires designation for Branch Managers and prevents self-review', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await expect(s.detail(mgr, 'incidents', id)).rejects.toThrow('not found');
      expect((await s.list(mgr, 'incidents', {})).items).toHaveLength(0);
      await act(id, hr, 'ASSIGN_REVIEWER', 'Assign qualified reviewer', {
        reviewerId: 'mgr',
      });
      expect((await s.detail(mgr, 'incidents', id)).canManage).toBe(true);
      await act(id, mgr, 'REVIEW');
      await expect(
        act(id, mgr, 'ASSIGN_REVIEWER', 'Forbidden reassignment', {
          reviewerId: 'hr',
        }),
      ).rejects.toThrow('Only Super/HR');
      await expect(
        act(id, hr, 'ASSIGN_REVIEWER', 'Conflicted reviewer', {
          reviewerId: 'staff',
        }),
      ).rejects.toThrow('authorized reviewer');
      const own = report();
      own.employeeId = 'eh';
      const created = await s.create(reporter, 'incidents', own);
      expect((await s.detail(hr, 'incidents', created.id)).canManage).toBe(
        false,
      );
      await expect(act(created.id, hr, 'REVIEW')).rejects.toThrow('reviewer');
    });
    it('lets a reporting-line manager read a private report without gaining review rights', async () => {
      await r.query(
        `UPDATE employees SET manager_employee_id='em' WHERE id='e1'`,
      );
      const { id } = await s.create(staff, 'incidents', {
        ...report(),
        reportMode: 'SELF',
        reportScope: 'GENERAL',
      });
      expect(
        (await s.list(mgr, 'incidents', {})).items.map((item) => item.id),
      ).toContain(id);
      const managerView = await s.detail(mgr, 'incidents', id);
      expect(managerView).toMatchObject({
        title: 'Private allegation',
        description: 'Reporter-only factual narrative.',
        reportScope: 'GENERAL',
        canManage: false,
      });
      await expect(
        s.act(mgr, 'incidents', id, {
          version: managerView.version,
          action: 'REVIEW',
          message: 'Unauthorized review attempt',
        }),
      ).rejects.toThrow('reviewer');
      expect(
        (await s.list(reporter, 'incidents', {})).items.map((item) => item.id),
      ).not.toContain(id);
    });
    it('allows an assigned manager review response without a message', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await act(id, hr, 'ASSIGN_REVIEWER', 'Assign case reviewer', {
        reviewerId: 'mgr',
      });
      const before = await s.detail(mgr, 'incidents', id);
      await s.act(mgr, 'incidents', id, {
        version: before.version,
        action: 'REVIEW',
        message: '',
      });
      expect(
        (await s.detail(mgr, 'incidents', id)).events.at(-1)?.message,
      ).toBe('');
    });
    it.each(['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const)(
      'shows %s-created tasks and reports to their selected employee immediately',
      async (role) => {
        await r.query('UPDATE users SET role=$1 WHERE id=$2', [
          role,
          'reporter',
        ]);
        const author = actor('reporter', role);
        const file = {
          buffer: Buffer.from('%PDF-shared fixture'),
          originalname: 'brief.pdf',
        };
        for (const kind of ['tasks', 'incidents'] as const) {
          const input = kind === 'tasks' ? task() : report();
          const { id } = await s.create(author, kind, input, file);
          expect(
            (await s.list(staff, kind, { view: 'mine' })).items.map(
              (item) => item.id,
            ),
          ).toContain(id);
          const detail = await s.detail(staff, kind, id);
          expect(detail).toMatchObject({
            title: input.title,
            description: input.description,
            canManage: false,
          });
          expect(detail.attachments).toHaveLength(1);
          expect(
            (
              await s.download(staff, kind, id, detail.attachments[0].id)
            ).content.equals(file.buffer),
          ).toBe(true);
          expect((await s.list(other, kind, {})).items).toHaveLength(0);
          await expect(s.detail(other, kind, id)).rejects.toThrow('not found');
          const notifications = await r.query(
            'SELECT user_id FROM notifications WHERE href=$1',
            [`/${kind}?record=${id}`],
          );
          expect(
            notifications.some(
              (n: { user_id: string }) => n.user_id === 'staff',
            ),
          ).toBe(true);
        }
      },
    );
    it('uses the immutable creation role for existing reports and follows the currently tagged employee', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      // Role changes must not hide an existing management-created report.
      await r.query("UPDATE users SET role='EMPLOYEE' WHERE id='reporter'");
      expect((await s.detail(staff, 'incidents', id)).title).toBe(
        report().title,
      );
      await act(id, hr, 'SET_SUBJECT', 'Correct the concerned employee', {
        employeeId: 'e2',
      });
      await expect(s.detail(staff, 'incidents', id)).rejects.toThrow(
        'not found',
      );
      expect((await s.list(staff, 'incidents', {})).items).toHaveLength(0);
      expect((await s.detail(other, 'incidents', id)).title).toBe(
        report().title,
      );
      const notifications = await r.query(
        'SELECT user_id FROM notifications WHERE href=$1',
        [`/incidents?record=${id}`],
      );
      expect(
        notifications.some((n: { user_id: string }) => n.user_id === 'other'),
      ).toBe(true);
      await act(id, hr, 'COMMENT', 'Internal investigation');
      await act(id, reporter, 'COMMENT', 'Reporter-only follow-up');
      expect(
        (await s.detail(other, 'incidents', id)).events.some((e) =>
          /Internal investigation|Reporter-only/.test(e.message),
        ),
      ).toBe(false);
    });
    it('does not expose a confidential employee report when its reporter is promoted', async () => {
      const { id } = await s.create(other, 'incidents', {
        ...report(),
        employeeId: 'e2',
      });
      await r.query("UPDATE users SET role='HR_ADMIN' WHERE id='other'");
      await act(id, hr, 'SET_SUBJECT', 'Identify concerned employee', {
        employeeId: 'e1',
      });
      expect((await s.list(staff, 'incidents', {})).items).toHaveLength(0);
      await expect(s.detail(staff, 'incidents', id)).rejects.toThrow(
        'not found',
      );
    });
    it('shares a general management report when an employee is later tagged, using their linked identity', async () => {
      const { employeeId: _employee, ...input } = report();
      const { id } = await s.create(reporter, 'incidents', input);
      expect((await s.list(staff, 'incidents', {})).items).toHaveLength(0);
      await act(id, hr, 'SET_SUBJECT', 'Assign the concerned employee', {
        employeeId: 'e1',
      });
      expect(
        (
          await s.list(actor('staff', 'EMPLOYEE', ['b']), 'incidents', {
            view: 'mine',
          })
        ).items.map((item) => item.id),
      ).toContain(id);
      await r.query(
        "INSERT INTO users(id,name,role,branch_id) VALUES('unlinked','Unlinked','EMPLOYEE','a')",
      );
      expect(
        (await s.list(actor('unlinked', 'EMPLOYEE'), 'incidents', {})).items,
      ).toHaveLength(0);
      await expect(
        s.detail(actor('unlinked', 'EMPLOYEE'), 'incidents', id),
      ).rejects.toThrow('not found');
    });
    it('separates reporter narrative, private investigation, notices, explanations and decisions', async () => {
      const { id } = await s.create(other, 'incidents', {
        ...report(),
        employeeId: 'e2',
      });
      await expect(s.detail(staff, 'incidents', id)).rejects.toThrow(
        'not found',
      );
      await act(id, hr, 'SET_SUBJECT', 'Identified concerned employee', {
        employeeId: 'e1',
      });
      await act(id, hr, 'REVIEW', 'Internal fact finding');
      await act(id, hr, 'REQUEST_DETAILS', 'Please clarify the date.');
      await act(id, other, 'COMMENT', 'Additional reporter-only details');
      await act(id, hr, 'ESCALATE', 'Internal review basis');
      await act(id, hr, 'NOTICE', 'Allegation and response instructions');
      let detail = await s.detail(staff, 'incidents', id);
      expect(detail.description).not.toContain('Reporter-only');
      expect(detail.title).toBe('Private notice / case');
      expect(detail.events.map((e) => e.message)).toEqual([
        'Allegation and response instructions',
      ]);
      await act(id, staff, 'ACKNOWLEDGE', 'Receipt only, not admission.');
      await act(id, staff, 'RESPONSE', 'Private employee explanation');
      await act(id, hr, 'DECIDE', 'Documented findings and outcome');
      detail = await s.detail(other, 'incidents', id);
      expect(
        detail.events.some((e) => e.message.includes('employee explanation')),
      ).toBe(false);
      expect(detail.events.some((e) => e.message.includes('Internal'))).toBe(
        false,
      );
      expect(
        (await s.detail(staff, 'incidents', id)).events.map((e) => e.action),
      ).toEqual(['NOTICE', 'ACKNOWLEDGE', 'RESPONSE', 'DECIDE']);
      const audit = await r.query<Array<{ details: object }>>(
        'SELECT details FROM audit_logs',
      );
      expect(JSON.stringify(audit)).not.toContain('explanation');
      expect((await s.detail(hr, 'incidents', id)).caseStatus).toBe('CLOSED');
      expect((await s.detail(hr, 'incidents', id)).status).toBe('CLOSED');
      await expect(act(id, hr, 'COMMENT')).rejects.toThrow('closed');
    });
    it('guards evidence by audience, validates signatures and preserves append-only history', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await expect(
        s.upload(
          reporter,
          'incidents',
          id,
          {
            buffer: Buffer.from('<script>bad</script>'),
            originalname: 'fake.pdf',
          },
          'REPORTER',
        ),
      ).rejects.toThrow('Only PDF');
      const file = await s.upload(
        hr,
        'incidents',
        id,
        {
          buffer: Buffer.from('%PDF-1.7 artificial fixture'),
          originalname: '../private.pdf',
        },
        'INTERNAL',
      );
      expect(
        (await s.detail(reporter, 'incidents', id)).attachments,
      ).toHaveLength(0);
      await expect(
        s.download(reporter, 'incidents', id, file.id),
      ).rejects.toThrow('not found');
      expect((await s.download(hr, 'incidents', id, file.id)).mime).toBe(
        'application/pdf',
      );
      await expect(
        r.manager.transaction((m) =>
          m.query('DELETE FROM work_events WHERE incident_id=$1', [id]),
        ),
      ).rejects.toThrow('append-only');
      expect((await s.detail(hr, 'incidents', id)).events).toHaveLength(2);
    });
    it('attaches action evidence to the incident event and enforces that event audience', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      const before = await s.detail(hr, 'incidents', id);
      await s.act(
        hr,
        'incidents',
        id,
        {
          version: before.version,
          action: 'COMMENT',
          message: 'Private review with evidence',
          audience: 'INTERNAL',
        },
        {
          buffer: Buffer.from('%PDF-1.7 private evidence'),
          originalname: 'review.pdf',
        },
      );
      const reviewerDetail = await s.detail(hr, 'incidents', id);
      expect(reviewerDetail.attachments.map((item) => item.filename)).toContain(
        'review.pdf',
      );
      expect(
        reviewerDetail.events.find(
          (event) => event.message === 'Private review with evidence',
        )?.audience,
      ).toBe('INTERNAL');
      const attachmentId = reviewerDetail.attachments[0].id;
      await expect(
        s.download(reporter, 'incidents', id, attachmentId),
      ).rejects.toThrow('not found');
      expect(
        (await s.download(hr, 'incidents', id, attachmentId)).filename,
      ).toBe('review.pdf');
      const version = reviewerDetail.version;
      await expect(
        s.act(
          hr,
          'incidents',
          id,
          {
            version,
            action: 'COMMENT',
            message: 'Invalid evidence',
            audience: 'INTERNAL',
          },
          { buffer: Buffer.from('not a PDF'), originalname: 'fake.pdf' },
        ),
      ).rejects.toThrow('Only PDF');
      expect((await s.detail(hr, 'incidents', id)).version).toBe(version);
      expect((await s.detail(hr, 'incidents', id)).attachments).toHaveLength(1);
    });
    it('lets an employee report a general incident and a reviewer identify the concerned employee', async () => {
      const reportInput = {
        submissionKey: randomUUID(),
        branchId: 'a',
        title: 'General report',
        description: 'A workplace concern.',
        category: 'SAFETY',
        incidentDate: '2026-10-01',
      };
      const { id } = await s.create(other, 'incidents', reportInput);
      await act(id, hr, 'REVIEW');
      await expect(act(id, hr, 'ESCALATE')).rejects.toThrow(
        'requires a concerned employee',
      );
      await act(id, hr, 'SET_SUBJECT', 'Identified during fact finding', {
        employeeId: 'e1',
      });
      await act(id, hr, 'ESCALATE');
      await act(
        id,
        hr,
        'NOTICE',
        'Specific allegation and request for explanation.',
      );
      expect((await s.detail(staff, 'incidents', id)).isSubject).toBe(true);
      expect((await s.detail(other, 'incidents', id)).isReporter).toBe(true);
      expect(
        (await s.list(other, 'incidents', { view: 'mine' })).items,
      ).toHaveLength(1);
      await expect(
        s.create(staff, 'incidents', {
          ...reportInput,
          submissionKey: randomUUID(),
          branchId: 'b',
        }),
      ).rejects.toThrow('access denied');
    });
    it('aggregates only selected task branches and exposes private files to their intended participant', async () => {
      await r.query(
        "INSERT INTO employees(id,name,branch_id) VALUES('e3','Branch B employee','b')",
      );
      await s.create(hr, 'tasks', task());
      await s.create(actor('hr', 'HR_ADMIN', ['b']), 'tasks', {
        ...task(),
        employeeId: 'e3',
      });
      expect((await s.list(hr, 'tasks', {})).items).toHaveLength(1);
      expect(
        (await s.list(actor('hr', 'HR_ADMIN', ['a', 'b']), 'tasks', {})).items,
      ).toHaveLength(2);
      const { id } = await s.create(reporter, 'incidents', report());
      await act(id, hr, 'REVIEW');
      await act(id, hr, 'ESCALATE');
      await act(id, hr, 'NOTICE');
      const f = await s.upload(
        staff,
        'incidents',
        id,
        {
          buffer: Buffer.from('%PDF-fixture'),
          originalname: 'explanation.pdf',
        },
        'INTERNAL',
      );
      // A subject cannot turn their own upload into hidden reviewer evidence.
      expect((await s.detail(staff, 'incidents', id)).attachments).toHaveLength(
        1,
      );
      await expect(s.download(reporter, 'incidents', id, f.id)).rejects.toThrow(
        'not found',
      );
      expect((await s.download(staff, 'incidents', id, f.id)).filename).toBe(
        'explanation.pdf',
      );
      await expect(
        s.upload(
          staff,
          'incidents',
          id,
          { buffer: Buffer.alloc(5242881), originalname: 'large.pdf' },
          'SUBJECT',
        ),
      ).rejects.toThrow('5 MB');
    });
    it('records self identity, time, source and repeated clarification before resolution and closure', async () => {
      const input = {
        ...report(),
        reportMode: 'SELF',
        employeeId: undefined,
        incidentTime: '08:35',
        remarks: 'Supplementary details',
      };
      const { id } = await s.create(staff, 'incidents', input);
      expect(await s.detail(staff, 'incidents', id)).toMatchObject({
        employeeId: 'e1',
        reportSource: 'SELF_REPORTED',
        incidentTime: '08:35',
        status: 'SUBMITTED',
        caseStatus: null,
      });
      expect((await s.detail(staff, 'incidents', id)).referenceNumber).toBe(
        `INC-${id.toUpperCase()}`,
      );
      const initialVersion = (await s.detail(hr, 'incidents', id)).version;
      await act(id, hr, 'RECEIVE', 'Report received, thank you.');
      await expect(
        s.act(hr, 'incidents', id, {
          version: initialVersion,
          action: 'REQUEST_DETAILS',
          message: 'Stale update',
        }),
      ).rejects.toThrow('changed');
      for (let i = 0; i < 2; i++) {
        await act(id, hr, 'REQUEST_DETAILS', `Clarification ${i}`);
        expect((await s.detail(staff, 'incidents', id)).status).toBe(
          'DETAILS_REQUESTED',
        );
        await act(id, staff, 'CLARIFY', `Employee answer ${i}`);
      }
      await act(id, hr, 'COMMENT', 'Confidential reviewer note');
      expect(
        JSON.stringify(await s.detail(staff, 'incidents', id)),
      ).not.toContain('Confidential reviewer note');
      await expect(act(id, hr, 'CLOSE')).rejects.toThrow('Resolve');
      await act(id, hr, 'RESOLVE', 'Reviewed explanation; no further action.');
      expect(await s.detail(staff, 'incidents', id)).toMatchObject({
        status: 'RESOLVED',
        resolutionSummary: 'Reviewed explanation; no further action.',
        caseStatus: null,
      });
      await expect(act(id, staff, 'COMMENT')).rejects.toThrow();
      await expect(act(id, hr, 'RESOLVE')).rejects.toThrow('resolved');
      await act(id, hr, 'CLOSE', 'Finalized');
      expect((await s.detail(staff, 'incidents', id)).closedAt).toBeTruthy();
      await expect(act(id, staff, 'CLARIFY')).rejects.toThrow('closed');
      expect(
        (await s.detail(staff, 'incidents', id)).events.filter(
          (e) => e.action === 'CLARIFY',
        ),
      ).toHaveLength(2);
      await expect(
        s.create(staff, 'incidents', {
          ...input,
          submissionKey: randomUUID(),
          employeeId: 'e2',
        }),
      ).rejects.toThrow('identity');
      await expect(
        s.create(staff, 'incidents', {
          ...input,
          submissionKey: randomUUID(),
          incidentTime: '25:10',
        }),
      ).rejects.toThrow('time');
    });
    it('lets an affected employee explain an admin report and reply to its clarification', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await act(id, staff, 'EXPLAIN', 'Initial employee explanation');
      await act(id, hr, 'REQUEST_DETAILS', 'Please explain the sequence.');
      await act(id, staff, 'CLARIFY', 'Detailed sequence.');
      expect((await s.detail(staff, 'incidents', id)).status).toBe(
        'UNDER_REVIEW',
      );
      await expect(act(id, other, 'CLARIFY')).rejects.toThrow('not found');
    });
    it('permits assigned managers to refer to HR but only HR can resolve or initiate formal discipline', async () => {
      const { id } = await s.create(staff, 'incidents', {
        ...report(),
        employeeId: 'e1',
      });
      await act(id, hr, 'ASSIGN_REVIEWER', 'Assign manager', {
        reviewerId: 'mgr',
      });
      await act(id, mgr, 'RECEIVE', 'Received.');
      await expect(act(id, mgr, 'ESCALATE')).rejects.toThrow(
        'disciplinary authority',
      );
      await expect(act(id, mgr, 'RESOLVE')).rejects.toThrow('Super/HR');
      await expect(
        act(id, mgr, 'HR_ESCALATE', 'Needs HR', { reviewerId: 'reporter' }),
      ).rejects.toThrow('HR or Super');
      await act(id, mgr, 'HR_ESCALATE', 'Confidential escalation reason', {
        reviewerId: 'hr',
      });
      const detail = await s.detail(staff, 'incidents', id);
      expect(detail.status).toBe('ESCALATED');
      expect(JSON.stringify(detail)).not.toContain(
        'Confidential escalation reason',
      );
      expect(detail.events.some((e) => e.action === 'HR_REFERRED')).toBe(true);
      await expect(act(id, mgr, 'REVIEW')).rejects.toThrow('not found');
      await act(id, hr, 'REVIEW');
      await act(id, hr, 'ESCALATE', 'Formal review justified.');
      expect(await s.detail(hr, 'incidents', id)).toMatchObject({
        status: 'UNDER_REVIEW',
        caseStatus: 'DISCIPLINARY_REVIEW',
      });
      await expect(act(id, hr, 'RESOLVE')).rejects.toThrow('formal case');
    });
    it('filters and counts authorized reports server-side with independent disciplinary queues', async () => {
      const first = await s.create(reporter, 'incidents', report());
      await s.create(reporter, 'incidents', {
        ...report(),
        submissionKey: randomUUID(),
        employeeId: 'e2',
        title: 'Other record',
      });
      const filtered = await s.list(staff, 'incidents', {
        search: 'Private',
        from: '2026-10-01',
        to: '2026-10-01',
      });
      expect(filtered.items.map((x) => x.id)).toEqual([first.id]);
      expect(filtered.summary).toMatchObject({ total: 1, pending: 1 });
      expect(
        (await s.list(staff, 'incidents', { search: 'Other record' })).summary
          ?.total,
      ).toBe(0);
      expect(
        (await s.list(staff, 'incidents', { queue: 'active-cases' })).items,
      ).toHaveLength(0);
      await act(first.id, hr, 'REVIEW');
      await act(first.id, hr, 'ESCALATE');
      expect(
        (await s.list(staff, 'incidents', { queue: 'active-cases' })).items,
      ).toHaveLength(1);
      await expect(
        s.list(staff, 'incidents', { from: '2026-10-02', to: '2026-10-01' }),
      ).rejects.toThrow('start date');
    });
    it('queues private mail atomically and preserves committed workflow data when SMTP fails', async () => {
      const { id } = await s.create(staff, 'incidents', {
        ...report(),
        reportMode: 'SELF',
      });
      const before = await r.query(
        'SELECT count(*)::int AS count FROM work_mail_outbox WHERE incident_id=$1',
        [id],
      );
      expect(before[0].count).toBeGreaterThan(0);
      const transport = {
        sendIncidentNotice: async () => {
          throw Error('artificial SMTP failure');
        },
      };
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, transport).flush();
      expect((await s.detail(staff, 'incidents', id)).status).toBe('SUBMITTED');
      expect(
        (
          await r.query(
            'SELECT attempts,failure FROM work_mail_outbox WHERE incident_id=$1',
            [id],
          )
        )[0],
      ).toMatchObject({ attempts: 1, failure: 'SMTP_UNAVAILABLE' });
      await r.query(
        'UPDATE work_mail_outbox SET available_at=now() WHERE incident_id=$1',
        [id],
      );
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async () => ({
          status: 'ACCEPTED_BY_PROVIDER',
          failure: null,
        }),
      }).flush();
      expect(
        (
          await r.query(
            'SELECT sent_at FROM work_mail_outbox WHERE incident_id=$1',
            [id],
          )
        )[0].sent_at,
      ).toBeTruthy();
    });
    it('does not email a recipient whose personnel role was revoked after enqueueing', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await r.query("UPDATE users SET role='IT_ADMIN' WHERE id='staff'");
      const names: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      await new WorkMailService(dbStub, {
        sendIncidentNotice: async (_email: string, name: string) => {
          names.push(name);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      }).flush();
      expect(names).not.toContain('Assignee');
      expect(
        (
          await r.query(
            "SELECT failure FROM work_mail_outbox WHERE incident_id=$1 AND user_id='staff'",
            [id],
          )
        )[0].failure,
      ).toBe('RECIPIENT_NO_LONGER_AUTHORIZED');
    });
    it('rechecks both original and current employee branches before delivering queued reviewer email', async () => {
      const { id } = await s.create(reporter, 'incidents', report());
      await r.query("UPDATE employees SET branch_id='b' WHERE id='e1'");
      const names: string[] = [];
      const dbStub = {
        transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
          r.manager.transaction(fn),
      } as DataSource;
      const worker = new WorkMailService(dbStub, {
        sendIncidentNotice: async (_email: string, name: string) => {
          names.push(name);
          return { status: 'ACCEPTED_BY_PROVIDER', failure: null };
        },
      });
      await worker.flush();
      expect(names).not.toContain('HR');
      expect(names).toContain('Assignee');
      await r.query(
        "INSERT INTO user_branch_access(user_id,mode,branch_ids) VALUES('hr','SELECTED',ARRAY['a','b'])",
      );
      await r.query(
        "UPDATE work_mail_outbox SET attempts=0,available_at=now() WHERE incident_id=$1 AND user_id='hr'",
        [id],
      );
      await worker.flush();
      expect(names).toContain('HR');
    });
    it('migrates legacy formal states without rewriting evidence or closing the originating report', async () => {
      // Reconstruct the old shape only inside this rollback-only private fixture schema.
      await r.query(`DROP TABLE work_mail_outbox;
        ALTER TABLE workplace_incidents DROP CONSTRAINT workplace_incidents_status_check,
          DROP CONSTRAINT workplace_incidents_case_status_check,DROP CONSTRAINT workplace_incidents_source_check,
          DROP COLUMN reference_number,DROP COLUMN report_source,DROP COLUMN incident_time,DROP COLUMN remarks,
          DROP COLUMN case_status,DROP COLUMN case_started_at,DROP COLUMN resolved_at,DROP COLUMN resolved_by,
          DROP COLUMN resolution_summary,DROP COLUMN closed_at;
        DROP INDEX workplace_incidents_queue;
        ALTER TABLE workplace_incidents ADD CONSTRAINT workplace_incidents_status_check CHECK(status IN ('SUBMITTED','UNDER_REVIEW','DETAILS_REQUESTED','DISCIPLINARY_REVIEW','NOTICE_ISSUED','AWAITING_RESPONSE','DECISION_PENDING','CLOSED'));`);
      const id = randomUUID(),
        closed = randomUUID(),
        event = randomUUID();
      await r.query(
        `INSERT INTO workplace_incidents(id,branch_id,employee_id,reporter_id,title,description,category,incident_date,status) VALUES($1,'a','e1','reporter','Legacy report','Original description','CONDUCT','2026-10-01','NOTICE_ISSUED'),($2,'a','e1','reporter','Closed legacy','Original closed','CONDUCT','2026-10-01','CLOSED')`,
        [id, closed],
      );
      await r.query(
        `INSERT INTO work_events(id,incident_id,actor_id,action,audience,message,details) VALUES($1,$2,'reporter','CREATED','REPORTER','Original submission','{"actorRole":"BRANCH_MANAGER"}'),(gen_random_uuid(),$2,'hr','NOTICE','SUBJECT','Original notice','{}'),(gen_random_uuid(),$3,'hr','NOTICE','SUBJECT','Closed notice','{}')`,
        [event, id, closed],
      );
      await r.query(
        `INSERT INTO work_attachments(id,event_id,filename,mime,content) VALUES(gen_random_uuid(),$1,'original.pdf','application/pdf',$2)`,
        [event, Buffer.from('%PDF-original')],
      );
      await new IncidentWorkflow1793318400000().up(r);
      const rows = await r.query(
        'SELECT status,case_status,description,report_source FROM workplace_incidents WHERE id=$1',
        [id],
      );
      expect(rows[0]).toMatchObject({
        status: 'UNDER_REVIEW',
        case_status: 'NOTICE_ISSUED',
        description: 'Original description',
        report_source: 'MANAGEMENT_REPORTED',
      });
      expect(
        (
          await r.query(
            'SELECT status,case_status FROM workplace_incidents WHERE id=$1',
            [closed],
          )
        )[0],
      ).toMatchObject({ status: 'CLOSED', case_status: 'CLOSED' });
      expect(
        (
          await r.query(
            'SELECT content FROM work_attachments WHERE event_id=$1',
            [event],
          )
        )[0].content.equals(Buffer.from('%PDF-original')),
      ).toBe(true);
      expect(
        (
          await r.query(
            'SELECT message,audience FROM work_events WHERE id=$1',
            [event],
          )
        )[0],
      ).toEqual({ message: 'Original submission', audience: 'REPORTER' });
    });
    it('returns only scoped assignment options and no coworker list to employees', async () => {
      await r.query(`
        INSERT INTO employees(id,name,branch_id) VALUES
          ('e3','No account employee','a'),
          ('e4','Bad email employee','a'),
          ('e5','Unsupported role employee','a');
        INSERT INTO users(id,name,email,role,employee_id,branch_id) VALUES
          ('bad-email','Bad email','not-an-email','EMPLOYEE','e4','a'),
          ('unsupported-role','IT assignee','it@example.invalid','IT_ADMIN','e5','a');
      `);
      await r.query(
        "INSERT INTO employee_profile_pictures(employee_id,updated_at) VALUES('e1','2026-10-30T00:00:00Z')",
      );
      await r.query(
        "INSERT INTO users(id,name,role,branch_id) VALUES('foreign-reviewer','Foreign manager','BRANCH_MANAGER','b')",
      );
      const employeeContext = await s.context(staff, 'incidents');
      expect(employeeContext.employees).toEqual([]);
      expect(employeeContext.reviewers).toEqual([]);
      expect(employeeContext.branches.map((b) => b.id)).toEqual(['a']);
      const hrContext = await s.context(hr, 'incidents');
      expect(
        hrContext.employees.find((e) => e.id === 'e1')?.profilePictureUpdatedAt,
      ).toBeTruthy();
      expect(
        hrContext.employees.find((e) => e.id === 'e1')?.taskEmailReady,
      ).toBe(true);
      expect(
        hrContext.employees.find((e) => e.id === 'e3')?.taskEmailReady,
      ).toBe(false);
      expect(
        hrContext.employees.find((e) => e.id === 'e4')?.taskEmailReady,
      ).toBe(false);
      expect(
        hrContext.employees.find((e) => e.id === 'e5')?.taskEmailReady,
      ).toBe(true);
      expect(JSON.stringify(hrContext.employees)).not.toContain(
        'staff@example.invalid',
      );
      expect(hrContext.reviewers.some((u) => u.id === 'mgr')).toBe(true);
      expect(hrContext.reviewers.some((u) => u.id === 'foreign-reviewer')).toBe(
        false,
      );
    });
    it('returns a photo version only with authorized work records', async () => {
      await r.query(
        "INSERT INTO employee_profile_pictures(employee_id,updated_at) VALUES('e1','2026-10-30T00:00:00Z')",
      );
      const created = await s.create(hr, 'tasks', task());
      const visible = await s.list(hr, 'tasks', {});
      const item = visible.items.find((row) => row.id === created.id);
      expect(item?.profilePictureUpdatedAt).toBeTruthy();
      expect(item?.assignees?.[0]?.profilePictureUpdatedAt).toBeTruthy();
      const unrelated = await s.list(other, 'tasks', {});
      expect(unrelated.items).toHaveLength(0);
    });
    it('completes an early development schema and safely repeats the forward migration', async () => {
      // Only this test's rollback-only fixture schema is changed.
      await r.query(
        'ALTER TABLE work_events DROP COLUMN sequence, DROP COLUMN details',
      );
      const repair = new CompleteWorkHistory1793232001000();
      await repair.up(r);
      await repair.up(r);
      const { id } = await s.create(hr, 'tasks', task());
      expect((await s.detail(staff, 'tasks', id)).events).toHaveLength(1);
      const row = await r.query(
        'SELECT sequence,details FROM work_events WHERE task_id=$1',
        [id],
      );
      expect(Number(row[0].sequence)).toBeGreaterThan(0);
      expect(row[0].details.actorRole).toBe('HR_ADMIN');
    });
    it('allows an unlinked Super Admin to review general workplace reports', async () => {
      await r.query(
        "INSERT INTO users(id,name,role) VALUES('root','Super Admin','SUPER_ADMIN')",
      );
      const root: AuthUserContext = {
        userId: 'root',
        role: 'SUPER_ADMIN',
        email: 'root@example.invalid',
        branchId: null,
      };
      const { id } = await s.create(staff, 'incidents', {
        submissionKey: randomUUID(),
        branchId: 'a',
        title: 'Workplace report',
        description: 'General concern, no named subject.',
        category: 'OTHER',
        incidentDate: '2026-10-01',
      });
      expect(
        (await s.list(root, 'incidents', {})).items.map((r) => r.id),
      ).toContain(id);
      await act(id, hr, 'ASSIGN_REVIEWER', 'Designate Super Admin', {
        reviewerId: 'root',
      });
      expect((await s.detail(root, 'incidents', id)).canManage).toBe(true);
      await act(id, root, 'REVIEW');
      await act(id, root, 'RESOLVE', 'Resolved after fact finding.');
      await act(id, root, 'CLOSE', 'Finalize resolved report.');
    });
    it('submits reports with production notification column types', async () => {
      const columns = await r.query(
        "SELECT data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='notifications' AND column_name='branch_id'",
      );
      expect(columns[0].data_type).toBe('character varying');
      const { id } = await s.create(staff, 'incidents', {
        submissionKey: randomUUID(),
        branchId: 'a',
        title: 'Report submission regression',
        description: 'A private factual report.',
        category: 'OTHER',
        incidentDate: '2026-10-01',
      });
      expect((await s.detail(staff, 'incidents', id)).status).toBe('SUBMITTED');
      const notices = await r.query(
        'SELECT user_id,href FROM notifications WHERE href=$1',
        [`/incidents?record=${id}`],
      );
      expect(notices.some((n: { user_id: string }) => n.user_id === 'hr')).toBe(
        true,
      );
    });
    it.each(['tasks', 'incidents'] as const)(
      'creates %s and an optional file atomically and retries without duplicate evidence',
      async (kind) => {
        const author = kind === 'tasks' ? hr : reporter;
        const input = kind === 'tasks' ? task() : report();
        const file = {
          buffer: Buffer.from('%PDF-1.7 initial supporting file'),
          originalname: 'support.pdf',
        };
        const { id } = await s.create(author, kind, input, file);
        await s.create(author, kind, input, file);
        const detail = await s.detail(author, kind, id);
        expect(detail.attachments).toHaveLength(1);
        expect(detail.version).toBe(1);
        expect(detail.events.map((e) => e.action)).toEqual([
          'CREATED',
          'ATTACHMENT',
        ]);
        const attachment = await s.download(
          kind === 'tasks' ? staff : reporter,
          kind,
          id,
          detail.attachments[0].id,
        );
        expect(attachment.content.equals(file.buffer)).toBe(true);
        if (kind === 'incidents') {
          expect(detail.events[1].audience).toBe('PARTICIPANTS');
          expect(
            (
              await s.download(staff, kind, id, detail.attachments[0].id)
            ).content.equals(file.buffer),
          ).toBe(true);
          expect((await s.detail(hr, kind, id)).attachments).toHaveLength(1);
        }
      },
    );
    it.each(['tasks', 'incidents'] as const)(
      'rejects invalid initial files before creating %s',
      async (kind) => {
        const author = kind === 'tasks' ? hr : reporter,
          input = kind === 'tasks' ? task() : report();
        for (const buffer of [
          Buffer.from('not a PDF'),
          Buffer.alloc(5242881),
          Buffer.alloc(0),
        ]) {
          await expect(
            s.create(author, kind, input, { buffer, originalname: 'bad.pdf' }),
          ).rejects.toThrow();
        }
        expect(
          (
            await r.query(
              `SELECT count(*)::int AS count FROM ${kind === 'tasks' ? 'work_tasks' : 'workplace_incidents'}`,
            )
          )[0].count,
        ).toBe(0);
        expect(
          (
            await r.query('SELECT count(*)::int AS count FROM work_attachments')
          )[0].count,
        ).toBe(0);
      },
    );
    it.each(['tasks', 'incidents'] as const)(
      'rolls back %s and evidence when attachment persistence fails',
      async (kind) => {
        await r.query(
          `CREATE FUNCTION reject_initial_file() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated attachment failure'; END $$; CREATE TRIGGER reject_file BEFORE INSERT ON work_attachments FOR EACH ROW EXECUTE FUNCTION reject_initial_file()`,
        );
        await expect(
          s.create(
            kind === 'tasks' ? hr : reporter,
            kind,
            kind === 'tasks' ? task() : report(),
            {
              buffer: Buffer.from('%PDF-fixture'),
              originalname: 'fixture.pdf',
            },
          ),
        ).rejects.toThrow('simulated attachment failure');
        expect(
          (
            await r.query(
              `SELECT count(*)::int AS count FROM ${kind === 'tasks' ? 'work_tasks' : 'workplace_incidents'}`,
            )
          )[0].count,
        ).toBe(0);
        expect(
          (await r.query('SELECT count(*)::int AS count FROM work_events'))[0]
            .count,
        ).toBe(0);
        expect(
          (await r.query('SELECT count(*)::int AS count FROM notifications'))[0]
            .count,
        ).toBe(0);
      },
    );
    it('rolls back state changes if audit persistence fails', async () => {
      const { id } = await s.create(hr, 'tasks', task());
      await r.query(
        `CREATE FUNCTION reject_work_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END $$; CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_work_audit()`,
      );
      await expect(
        s.act(staff, 'tasks', id, {
          version: 1,
          action: 'START',
          message: 'Start',
        }),
      ).rejects.toThrow('simulated audit failure');
      expect(await s.detail(staff, 'tasks', id)).toMatchObject({
        status: 'TODO',
        version: 1,
      });
    });
    it('repairs an applied automation schema missing the task template column', async () => {
      await r.query('ALTER TABLE work_tasks DROP COLUMN template_id');
      await r.query('SAVEPOINT before_missing_template_check');
      await expect(
        s.list(hr, 'tasks', { view: 'team', page: 1 }),
      ).rejects.toThrow('column t.template_id does not exist');
      await r.query('ROLLBACK TO SAVEPOINT before_missing_template_check');
      await new RepairTaskAutomationTemplateLink1794355201000().up(r);
      await expect(
        s.list(hr, 'tasks', { view: 'team', page: 1 }),
      ).resolves.toMatchObject({
        items: [],
      });
      const constraints = await r.query<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM pg_constraint
         WHERE conrelid='work_tasks'::regclass AND contype='f'
           AND confrelid='work_task_templates'::regclass`,
      );
      expect(constraints[0].count).toBe(1);
    });
    it('creates branch-scoped task templates and includes shared starter examples', async () => {
      const created = await s.createTaskTemplate(hr, {
        branchId: 'a',
        name: 'Front desk opening',
        title: 'Open front desk',
        description: 'Prepare the counter and check supplies.',
        priority: 'NORMAL',
      });
      expect(created.id).toBeTruthy();
      const templates = await s.taskTemplates(hr, { branchId: 'a' });
      expect(templates.map((item) => item.name)).toEqual(
        expect.arrayContaining([
          'Daily office inspection',
          'Room preparation',
          'Front desk opening',
        ]),
      );
      await expect(s.taskTemplates(staff, { branchId: 'a' })).rejects.toThrow();
      await expect(s.taskTemplates(hr, { branchId: 'b' })).rejects.toThrow();
      await expect(
        s.createTaskTemplate(hr, {
          branchId: 'a',
          name: 'front desk opening',
          title: 'Duplicate',
          description: 'Duplicate fixture.',
          priority: 'LOW',
        }),
      ).rejects.toThrow('already exists');
    });
    it('creates recurring tasks atomically with branch, assignee, audit and assignment notifications', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-04T00:00:00+08:00'));
      const id = randomUUID();
      await s.create(hr, 'tasks', {
        ...task(),
        submissionKey: id,
        employeeIds: ['e1'],
        startDate: '2026-11-05',
        dueDate: '2026-11-06',
        recurrence: 'DAILY',
        recurrenceEndDate: '2026-11-07',
      });
      expect(
        await s.processRecurringTasks(new Date('2026-11-05T16:00:00.000Z')),
      ).toBe(1);
      expect(
        await s.processRecurringTasks(new Date('2026-11-06T16:00:00.000Z')),
      ).toBe(1);
      expect(
        await s.processRecurringTasks(new Date('2026-11-06T16:00:00.000Z')),
      ).toBe(0);
      const tasks = await r.query(
        `SELECT id,to_char(occurrence_date,'YYYY-MM-DD') AS date,status,branch_id AS branch FROM work_tasks WHERE series_id IS NOT NULL ORDER BY occurrence_date`,
      );
      expect(tasks).toHaveLength(3);
      expect(tasks.map((item: { date: string }) => item.date)).toEqual([
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
      ]);
      expect(
        tasks.every(
          (item: { branch: string; status: string }) =>
            item.branch === 'a' && item.status === 'TODO',
        ),
      ).toBe(true);
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS count FROM work_task_mail_outbox WHERE event='ASSIGNED'",
          )
        )[0].count,
      ).toBe(3);
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS count FROM audit_logs WHERE action='WORK_CREATED'",
          )
        )[0].count,
      ).toBe(3);
    });
    it('pauses a recurrence when its creator loses current branch authority', async () => {
      await s.create(hr, 'tasks', {
        ...task(),
        submissionKey: randomUUID(),
        employeeIds: ['e1'],
        startDate: '2026-11-05',
        dueDate: '2026-11-05',
        recurrence: 'WEEKLY',
        recurrenceEndDate: '2026-11-19',
      });
      await r.query("UPDATE users SET role='IT_ADMIN' WHERE id='hr'");
      expect(
        await s.processRecurringTasks(new Date('2026-11-12T16:00:00.000Z')),
      ).toBe(1);
      expect(
        (
          await r.query('SELECT is_active,pause_reason FROM work_task_series')
        )[0],
      ).toMatchObject({
        is_active: false,
        pause_reason: 'CREATOR_SCOPE_CHANGED',
      });
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS count FROM audit_logs WHERE action='WORK_TASK_SERIES_PAUSED'",
          )
        )[0].count,
      ).toBe(1);
      expect(
        await r.query('SELECT id FROM work_tasks WHERE series_id IS NOT NULL'),
      ).toHaveLength(1);
    });
    it('lets an authorized manager stop future tasks with version and audit checks', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-04T00:00:00+08:00'));
      const { id } = await s.create(hr, 'tasks', {
        ...task(),
        submissionKey: randomUUID(),
        employeeIds: ['e1'],
        startDate: '2026-11-05',
        dueDate: '2026-11-05',
        recurrence: 'DAILY',
        recurrenceEndDate: '2026-11-07',
      });
      const detail = await s.detail(hr, 'tasks', id);
      expect(detail).toMatchObject({
        canStopRecurrence: true,
        recurrenceActive: true,
      });
      await expect(
        s.stopRecurringTask(hr, id, detail.version - 1),
      ).rejects.toThrow('changed');
      await expect(
        s.stopRecurringTask(staff, id, detail.version),
      ).rejects.toThrow();
      await expect(
        s.stopRecurringTask(hr, id, detail.version),
      ).resolves.toMatchObject({
        id,
        recurrenceActive: false,
        version: detail.version + 1,
      });
      expect(
        await s.processRecurringTasks(new Date('2026-11-06T16:00:00.000Z')),
      ).toBe(0);
      expect(await s.detail(hr, 'tasks', id)).toMatchObject({
        recurrenceActive: false,
        version: detail.version + 1,
      });
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS count FROM work_events WHERE task_id=$1 AND action='SERIES_STOPPED'",
            [id],
          )
        )[0].count,
      ).toBe(1);
      expect(
        (
          await r.query(
            "SELECT count(*)::int AS count FROM audit_logs WHERE action='WORK_SERIES_STOPPED' AND resource='tasks' AND details->>'recordId'=$1",
            [id],
          )
        )[0].count,
      ).toBe(1);
    });
    it('rejects cross-branch recurring assignees and scopes task exports to the selected branch', async () => {
      await r.query(
        "INSERT INTO employees(id,name,branch_id) VALUES('e4','Branch B assignee','b')",
      );
      const multiBranchHr = actor('hr', 'HR_ADMIN', ['a', 'b']);
      await expect(
        s.create(multiBranchHr, 'tasks', {
          ...task(),
          submissionKey: randomUUID(),
          employeeIds: ['e1', 'e4'],
          startDate: '2026-11-05',
          dueDate: '2026-11-05',
          recurrence: 'MONTHLY',
          recurrenceEndDate: '2026-12-05',
        }),
      ).rejects.toThrow('task branch');
      await s.create(multiBranchHr, 'tasks', {
        ...task(),
        submissionKey: randomUUID(),
        employeeId: 'e1',
        title: 'Makati-only report task',
      });
      await s.create(multiBranchHr, 'tasks', {
        ...task(),
        submissionKey: randomUUID(),
        employeeId: 'e4',
        title: 'Ortigas-only report task',
      });
      const report = await s.exportTasks(multiBranchHr, {
        format: 'pdf',
        branchId: 'a',
        view: 'team',
      });
      const pdf = report.content.toString('ascii');
      expect(pdf).toContain('Makati-only report task');
      expect(pdf).not.toContain('Ortigas-only report task');
      await expect(
        s.exportTasks(hr, { format: 'xlsx', branchId: 'b', view: 'team' }),
      ).rejects.toThrow('branch access denied');
    });
  },
);
