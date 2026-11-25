import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { AnalyticsService } from './analytics.service.js';
import { AnalyticsQuery } from './analytics.dto.js';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';

describe.runIf(process.env.ANALYTICS_DB_TEST === 'true')('PostgreSQL analytics isolation and calculations', () => {
  it('queries the installed schema, keeps scope and visibility, and exports the same aggregates', async () => {
    process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, synchronize: false });
    await db.initialize();
    const runner = db.createQueryRunner(); await runner.connect(); await runner.startTransaction();
    try {
      // Temporary tables copy installed column types, but never modify business records.
      for (const table of ['user_module_permissions', 'branches', 'employees', 'users', 'departments', 'employee_positions', 'rooms', 'reservations', 'reservation_space_blocks', 'attendance_records', 'leave_types', 'leave_requests', 'leave_request_days', 'attendance_ob_requests', 'inventory_catalog_items', 'inventory_balances', 'inventory_movements', 'assets', 'work_tasks', 'work_task_assignees', 'workplace_incidents', 'work_events', 'audit_logs']) {
        await runner.query(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS SELECT * FROM public.${table} WITH NO DATA`);
      }
      await runner.query(`
        INSERT INTO branches(id,name,status,is_active) VALUES ('a','Alpha','ACTIVE',true),('b','Beta','ACTIVE',true),('inactive','Inactive','INACTIVE',false);
        INSERT INTO employees(id,branch_id,name,position,department,status,employment) VALUES
          ('e1','a','Person One','Engineer','IT','ACTIVE','{"startDate":"2026-11-20","workBranchIds":["a","b"]}'),
          ('e2','a','Person Two','Lead','IT','INACTIVE','{"startDate":"2025-01-01"}'),
          ('e3','b','Person Three','Lead','IT','ACTIVE','{"startDate":"2026-11-20"}');
        INSERT INTO users(id,name,role,branch_id,employee_id,status) VALUES ('admin','Administrator','SUPER_ADMIN','a',NULL,'ACTIVE'),('manager','Manager','BRANCH_MANAGER','a',NULL,'ACTIVE'),('staff','Staff','EMPLOYEE','a','e1','ACTIVE');
        INSERT INTO rooms(id,branch_id,name,status,is_active) VALUES ('room-a','a','Room A','AVAILABLE',true),('room-b','b','Room B','MAINTENANCE',true);
        INSERT INTO reservations(id,branch_id,room_id,customer_name,status,start_date_time,end_date_time) VALUES
          ('r1','a','room-a','Example','CONFIRMED','2026-11-19T16:00:00Z','2026-11-19T17:00:00Z'),
          ('r2','a','room-a','Example','CANCELLED','2026-11-20T15:59:59Z','2026-11-20T16:59:59Z'),
          ('r3','a','room-a','Excluded next day','PENDING','2026-11-20T16:00:00Z','2026-11-20T17:00:00Z'),
          ('r4','b','room-b','Other branch','CONFIRMED','2026-11-20T01:00:00Z','2026-11-20T02:00:00Z');
        INSERT INTO attendance_records(id,employee_id,branch_id,work_date,dtr_stale,dtr_data) VALUES
          ('d1','e1','a','2026-11-20',false,'{"calculation":{"payrollReady":true,"statuses":["Present"],"absent":0,"lateMinutes":20,"approvedOtMinutes":90}}'),
          ('d2','e2','a','2026-11-20',true,'{"calculation":{"payrollReady":true,"statuses":["Absent"],"absent":1,"approvedOtMinutes":90}}');
        INSERT INTO leave_types(id,name) VALUES ('00000000-0000-4000-8000-000000000009','Vacation');
        INSERT INTO leave_requests(id,employee_id,branch_id,type_id,status,start_date,end_date,days) VALUES ('00000000-0000-4000-8000-000000000001','e1','a','00000000-0000-4000-8000-000000000009','APPROVED','2026-11-19','2026-11-21',2.5);
        INSERT INTO leave_request_days(request_id,employee_id,branch_id,work_date,units) VALUES
          ('00000000-0000-4000-8000-000000000001','e1','a','2026-11-19',1),('00000000-0000-4000-8000-000000000001','e1','a','2026-11-20',0.5);
        INSERT INTO attendance_ob_requests(id,employee_id,branch_id,status,work_date) VALUES ('00000000-0000-4000-8000-000000000002','e1','a','PENDING','2026-11-20');
        INSERT INTO inventory_catalog_items(id,status,reorder_threshold) VALUES ('item','ACTIVE',5),('archived','ARCHIVED',5);
        INSERT INTO inventory_balances(item_id,branch_id,storage_location,on_hand,reserved,quarantined) VALUES ('item','a','Shelf',5,1,1),('item','a','Store',0,0,0),('archived','a','Old',0,0,0),('item','b','Shelf',9,0,0);
        INSERT INTO inventory_movements(id,branch_id,movement_type,created_at) VALUES ('move','a','RECEIPT','2026-11-20T01:00:00Z');
        INSERT INTO assets(id,branch_id,status) VALUES ('asset','a','AVAILABLE');
        INSERT INTO work_tasks(id,branch_id,employee_id,created_by,status,due_date,created_at,deleted_at) VALUES
          ('00000000-0000-4000-8000-000000000003','a','e1','admin','TODO','2020-01-01','2026-11-20T01:00:00Z',NULL),
          ('00000000-0000-4000-8000-000000000004','a','e1','admin','TODO','2020-01-01','2026-11-20T01:00:00Z',NULL),
          ('00000000-0000-4000-8000-000000000005','a','e1','admin','TODO','2020-01-01','2026-11-20T01:00:00Z',now());
        INSERT INTO work_task_assignees(task_id,employee_id,branch_id) VALUES
          ('00000000-0000-4000-8000-000000000003','e1','a'),('00000000-0000-4000-8000-000000000003','e2','a'),
          ('00000000-0000-4000-8000-000000000004','e1','a'),('00000000-0000-4000-8000-000000000004','e3','b');
        INSERT INTO workplace_incidents(id,branch_id,employee_id,reporter_id,reviewer_id,status,incident_date) VALUES
          ('00000000-0000-4000-8000-000000000006','a','e1','staff','manager','SUBMITTED','2026-11-20'),
          ('00000000-0000-4000-8000-000000000007','a','e1','staff','someone-else','SUBMITTED','2026-11-20'),
          ('00000000-0000-4000-8000-000000000008','b','e3','staff','manager','SUBMITTED','2026-11-20');
      `);
      const scoped = { query: runner.manager.query.bind(runner.manager), manager: runner.manager } as DataSource;
      const service = new AnalyticsService(scoped);
      const admin: AuthUserContext = { userId: 'admin', email: 'fixture@example.test', role: 'SUPER_ADMIN', branchId: 'a', branchIds: ['a', 'b'], allBranches: true, scope: 'ALL' };
      const manager: AuthUserContext = { ...admin, userId: 'manager', role: 'BRANCH_MANAGER', branchIds: ['a'], allBranches: false, scope: 'BRANCH' };
      const q = Object.assign(new AnalyticsQuery(), { mode: 'overview' as const, from: '2026-11-20', to: '2026-11-20', branchId: 'a' });
      const withQuery = (change: Partial<AnalyticsQuery>) => Object.assign(new AnalyticsQuery(), q, change);
      const data = await service.data(manager, q);
      expect(data.panels.filter(p => p.state !== 'ready').map(p => p.id)).toEqual([]);
      const panel = (id: string) => data.panels.find(p => p.id === id)!;
      expect(panel('workforce').metrics[0].value).toBe(2);
      expect(panel('workforce').breakdown?.values).toEqual([{ label: 'IT', value: 2 }]);
      expect(panel('workforce').metrics.find(m => m.label === 'Hired in period')?.value).toBe(1);
      expect(panel('reservations').metrics[0].value).toBe(2);
      expect(panel('attendance').rows.find(r => r.status === 'NEEDS_REVIEW')?.count).toBe(1);
      expect(panel('attendance').metrics.find(m => m.label === 'Approved overtime hours')?.value).toBe(1.5);
      expect(panel('leave').metrics.find(m => m.label === 'Approved leave days in period')?.value).toBe(0.5);
      expect(panel('leave').breakdown?.values).toEqual([{ label: 'Vacation', value: 0.5 }]);
      expect(panel('inventory').metrics[0].value).toBe(2);
      expect(panel('inventory').metrics.find(m => m.label === 'Low or out of stock')?.value).toBe(2);
      expect(panel('tasks').metrics[0].value).toBe(1); // Shared assignees do not multiply a task; out-of-scope assignees exclude it.
      expect(panel('incidents').metrics[0].value).toBe(1); // Only the designated manager sees this private incident.
      expect(panel('accounts').metrics[0].value).toBe(1);
      expect(data.panels.flatMap(p => p.rows).every(r => r.branchId === 'a')).toBe(true);
      await expect(service.data(manager, withQuery({ branchId: 'b' }))).rejects.toThrow('Branch access denied');
      await expect(service.data(admin, withQuery({ branchId: 'inactive' }))).rejects.toThrow('inactive');
      const all = await service.data(admin, withQuery({ branchId: undefined }));
      expect(all.panels.find(p => p.id === 'workforce')?.metrics[0].value).toBe(3);
      expect(all.panels.find(p => p.id === 'incidents')?.metrics[0].value).toBe(3);
      const empty = await service.data({ ...admin, branchIds: [] }, withQuery({ branchId: undefined }));
      expect(empty.panels.every(p => p.metrics[0].value === 0)).toBe(true);
      await runner.query(`INSERT INTO user_module_permissions(user_id,permission_key,effect) VALUES ('manager','inventory','DENY'),('manager','hr.employees','DENY')`);
      const denied = await service.data(manager, q);
      expect(denied.panels.map(p => p.id)).not.toContain('inventory'); expect(denied.panels.map(p => p.id)).not.toContain('workforce');
      await expect(service.data(manager, withQuery({ category: 'inventory' }))).rejects.toThrow('category access');
    } finally { await runner.rollbackTransaction(); await runner.release(); await db.destroy(); }
  }, 60_000);
});
