import { describe, expect, it } from 'vitest';
import { DataSource, type EntityManager, type QueryRunner } from 'typeorm';
import { EmployeeService } from './employee.service.js';
import { UserService } from '../../foundation/users/user.service.js';
import { AuthService } from '../../foundation/auth/auth.service.js';
import { RoleService } from '../../foundation/roles/role.service.js';
import { PermissionService } from '../../foundation/permissions/permission.service.js';
import { SessionService } from '../../foundation/auth/session.service.js';
import { BranchService } from '../../foundation/branches/branches.service.js';
import { UnifiedEmployeeBranches1795132800000 } from '../../database/migrations/1795132800000-UnifiedEmployeeBranches.js';

describe.runIf(process.env.ADMIN_BRANCH_DB_TEST === 'true')(
  'unified branch assignments (rollback-only PostgreSQL)',
  () => {
    it('reconciles safely and shares both edit paths, primary branch, live access and authorization', async () => {
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
      try {
        await runner.query(`
        CREATE TEMP SEQUENCE employee_number_seq;
        CREATE TEMP TABLE branches(id text PRIMARY KEY,name text,status text,manager_user_id text) ON COMMIT DROP;
        CREATE TEMP TABLE departments(id text PRIMARY KEY,name text,branch_id text) ON COMMIT DROP;
        CREATE TEMP TABLE employee_positions(LIKE public.employee_positions INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employees(LIKE public.employees INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_assignment_history(LIKE public.employee_assignment_history INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_work_schedule_history(LIKE public.employee_work_schedule_history INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE employee_profile_pictures(employee_id text,updated_at timestamptz) ON COMMIT DROP;
        CREATE TEMP TABLE users(LIKE public.users INCLUDING DEFAULTS) ON COMMIT DROP;
        CREATE TEMP TABLE user_branch_access(LIKE public.user_branch_access INCLUDING ALL) ON COMMIT DROP;
        CREATE TEMP TABLE audit_logs(id text,user_id text,branch_id text,action text,resource text,details jsonb,created_at timestamptz) ON COMMIT DROP;
        INSERT INTO branches VALUES ('makati','Makati','ACTIVE',NULL),('ortigas','Ortigas','ACTIVE',NULL),('closed','Closed','INACTIVE',NULL);
        INSERT INTO departments VALUES ('operations','Operations','makati'),('operations-o','Operations','ortigas');
        INSERT INTO users(id,name,email,employee_id,role,branch_id,status) VALUES ('admin','Admin','admin@example.invalid',NULL,'SUPER_ADMIN',NULL,'ACTIVE');
      `);
        const scoped = {
          query: runner.manager.query.bind(runner.manager),
          transaction: <T>(fn: (m: EntityManager) => Promise<T>) =>
            runner.manager.transaction(fn),
        } as DataSource;
        const employees = new EmployeeService(scoped),
          branches = new BranchService(scoped);
        const employee = await employees.createEmployee(
          {
            name: 'Manager',
            email: 'manager@example.invalid',
            branchId: 'makati',
            position: 'Manager',
            department: 'Operations',
            status: 'ACTIVE',
            employment: {
              employeeType: 'REGULAR',
              startDate: '2026-01-01',
              workBranchIds: ['makati', 'ortigas'],
              allWorkBranches: false,
            },
            workSchedule: {
              timeZone: 'Asia/Manila',
              workDays: [1, 2, 3, 4, 5],
              shiftStart: '08:00',
              shiftEnd: '17:00',
              breakMinutes: 60,
              graceMinutes: 0,
            },
          },
          { userId: 'admin', role: 'SUPER_ADMIN' },
        );
        await runner.query(
          "INSERT INTO users(id,name,email,employee_id,role,branch_id,status) VALUES ('manager','Manager','manager@example.invalid',$1,'BRANCH_MANAGER','makati','ACTIVE')",
          [employee.id],
        );
        await runner.query(
          "INSERT INTO user_branch_access(user_id,mode,branch_ids,updated_by) VALUES ('manager','SELECTED',ARRAY['makati'],'admin')",
        );
        // Use the actual migration on isolated temporary tables/functions/view.
        const fixtureRunner = {
          query: (sql: string) =>
            runner.query(
              sql
                .replace(
                  "to_regclass('employee_branch_unification_backup') IS NOT NULL",
                  "EXISTS(SELECT 1 FROM pg_class WHERE relname='employee_branch_unification_backup' AND relnamespace=pg_my_temp_schema())",
                )
                .replace(
                  'CREATE TABLE employee_branch_unification_backup',
                  'CREATE TEMP TABLE employee_branch_unification_backup',
                )
                .replace(
                  'CREATE OR REPLACE VIEW',
                  'CREATE OR REPLACE TEMP VIEW',
                )
                .replaceAll(
                  'enforce_employee_primary_branch()',
                  'pg_temp.enforce_employee_primary_branch()',
                )
                .replaceAll(
                  'sync_employee_primary_branch()',
                  'pg_temp.sync_employee_primary_branch()',
                ),
            ),
        } as QueryRunner;
        await new UnifiedEmployeeBranches1795132800000().up(fixtureRunner);
        expect(
          (await employees.findById(employee.id))?.employment.workBranchIds,
        ).toEqual(['makati']);
        expect(
          (
            await runner.query(
              'SELECT employment FROM employee_branch_unification_backup WHERE employee_id=$1',
              [employee.id],
            )
          )[0].employment.workBranchIds,
        ).toEqual(['makati', 'ortigas']);
        await employees.updateEmployee(
          employee.id,
          {
            employment: {
              ...employee.employment,
              workBranchIds: ['makati', 'ortigas'],
            },
          },
          { userId: 'admin', role: 'SUPER_ADMIN' },
        );
        await new UnifiedEmployeeBranches1795132800000().up(fixtureRunner);
        expect(
          (
            await runner.query(
              'SELECT count(*) AS count FROM employee_branch_unification_backup',
            )
          )[0].count,
        ).toBe('1');
        expect(await branches.getAdminBranchAccess('manager')).toEqual({
          mode: 'SELECTED',
          branchIds: ['makati', 'ortigas'],
        });
        expect(
          (
            await branches.listAccessibleBranches(
              'manager',
              'makati',
              'BRANCH_MANAGER',
            )
          ).map((b) => b.id),
        ).toEqual(['makati', 'ortigas']);
        const users = new UserService(scoped),
          roles = new RoleService();
        const auth = new AuthService(
          users,
          roles,
          new PermissionService(roles),
          branches,
          new SessionService(),
        );
        await runner.query(
          "UPDATE users SET password_hash=$1 WHERE id='manager'",
          [auth.hashPassword('KnownTestPassword!')],
        );
        const token = await auth.switchBranch(
          await auth.login({
            email: 'manager@example.invalid',
            password: 'KnownTestPassword!',
          }),
          'ortigas',
        );
        expect((await auth.validateWorkspaceSession(token)).valid).toBe(true);
        expect(
          (await users.list()).find((user) => user.id === 'manager'),
        ).toMatchObject({
          branchAccessMode: 'SELECTED',
          accessibleBranches: [
            { id: 'makati', name: 'Makati' },
            { id: 'ortigas', name: 'Ortigas' },
          ],
        });
        await branches.saveAdminBranchAccess(
          'manager',
          { mode: 'ASSIGNED', branchIds: [] },
          'admin',
        );
        expect((await auth.validateWorkspaceSession(token)).payload?.branchIds).toEqual(['makati']);
        await branches.saveAdminBranchAccess(
          'manager',
          { mode: 'ALL', branchIds: [] },
          'admin',
        );
        expect(
          (await employees.findById(employee.id))?.employment,
        ).toMatchObject({ allWorkBranches: true, workBranchIds: [] });
        await runner.query(
          "INSERT INTO branches VALUES ('future','Future','ACTIVE',NULL)",
        );
        expect(
          (
            await branches.listAccessibleBranches(
              'manager',
              'makati',
              'BRANCH_MANAGER',
            )
          ).map((b) => b.id),
        ).toContain('future');
        await expect(
          employees.updateEmployee(
            employee.id,
            {
              employment: {
                ...employee.employment,
                allWorkBranches: false,
                workBranchIds: ['makati'],
              },
            },
            { userId: 'manager', role: 'BRANCH_MANAGER' },
          ),
        ).rejects.toThrow('authorized account administrator');
        expect(
          (await employees.findById(employee.id))?.employment.allWorkBranches,
        ).toBe(true);
        await branches.saveAdminBranchAccess(
          'manager',
          { mode: 'SELECTED', branchIds: ['makati', 'ortigas'] },
          'admin',
        );
        await runner.query(
          "UPDATE user_branch_access SET mode='ALL',branch_ids='{}' WHERE user_id='manager'",
        );
        expect((await branches.getAdminBranchAccess('manager')).mode).toBe(
          'SELECTED',
        );
        await employees.updateEmployee(
          employee.id,
          { branchId: 'ortigas', department: 'Operations' },
          { userId: 'admin', role: 'SUPER_ADMIN' },
        );
        expect(
          (
            await runner.query("SELECT branch_id FROM users WHERE id='manager'")
          )[0].branch_id,
        ).toBe('ortigas');
        await runner.query(
          "UPDATE users SET branch_id='makati' WHERE id='manager'",
        );
        expect(
          (
            await runner.query("SELECT branch_id FROM users WHERE id='manager'")
          )[0].branch_id,
        ).toBe('ortigas');
      } finally {
        await runner.rollbackTransaction();
        await runner.release();
        await db.destroy();
      }
    });
  },
);
