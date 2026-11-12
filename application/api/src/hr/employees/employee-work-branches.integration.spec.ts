import { describe, expect, it } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { EmployeeService } from './employee.service.js';

describe.runIf(process.env.ADMIN_BRANCH_DB_TEST === 'true')('work locations (rollback-only PostgreSQL)', () => {
  it('persists selected/all locations, audits changes and rejects inactive locations', async () => {
    process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, synchronize: false });
    await db.initialize();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Every write, including employee numbering, stays in temporary fixtures.
      await runner.query(`
        CREATE TEMP SEQUENCE employee_number_seq;
        CREATE TEMP TABLE branches(id text PRIMARY KEY,name text,status text) ON COMMIT DROP;
        CREATE TEMP TABLE departments(id text PRIMARY KEY,name text,branch_id text) ON COMMIT DROP;
        CREATE TEMP TABLE employee_positions(LIKE public.employee_positions INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employees(LIKE public.employees INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_assignment_history(LIKE public.employee_assignment_history INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_work_schedule_history(LIKE public.employee_work_schedule_history INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_profile_pictures(employee_id text,updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE users(id text,name text,email text,employee_id text,role text,branch_id text) ON COMMIT DROP;
        CREATE TEMP TABLE audit_logs(id text,user_id text,branch_id text,action text,resource text,details jsonb,created_at timestamptz) ON COMMIT DROP;
        INSERT INTO branches VALUES ('makati','Makati','ACTIVE'),('ortigas','Ortigas','ACTIVE'),('closed','Closed','INACTIVE');
        INSERT INTO departments VALUES ('operations','Operations','makati');
      `);
      const scoped = { query: runner.manager.query.bind(runner.manager), transaction: <T>(fn: (m: EntityManager) => Promise<T>) => runner.manager.transaction(fn) } as DataSource;
      const service = new EmployeeService(scoped);
      const employee = await service.createEmployee({
        name: 'Manager', email: 'manager@example.invalid', branchId: 'makati', position: 'Manager', department: 'Operations', status: 'ACTIVE',
        employment: { employeeType: 'REGULAR', startDate: '2026-01-01', workBranchIds: ['makati', 'ortigas'], allWorkBranches: false },
        workSchedule: { timeZone: 'Asia/Manila', workDays: [1, 2, 3, 4, 5], shiftStart: '08:00', shiftEnd: '17:00', breakMinutes: 60, graceMinutes: 0 },
      }, { userId: 'admin' });
      expect((await service.findById(employee.id))?.employment.workBranchIds).toEqual(['makati', 'ortigas']);
      await service.updateEmployee(employee.id, { phone: '09171234567' }, { userId: 'admin' });
      expect((await service.findById(employee.id))?.employment.workBranchIds).toEqual(['makati', 'ortigas']);
      await expect(service.updateEmployee(employee.id, { employment: { ...employee.employment, workBranchIds: ['makati', 'closed'] } })).rejects.toThrow('active work branches');
      await service.updateEmployee(employee.id, { employment: { ...employee.employment, workBranchIds: [], allWorkBranches: true } }, { userId: 'admin' });
      expect((await service.findById(employee.id))?.employment).toMatchObject({ workBranchIds: [], allWorkBranches: true });
      const audit = await runner.query<{ details: { after: { allWorkBranches: boolean } } }[]>("SELECT details FROM audit_logs WHERE resource='employee_assignment_history' AND action='UPDATE'");
      expect(audit[0].details.after.allWorkBranches).toBe(true);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
      await db.destroy();
    }
  });
});
