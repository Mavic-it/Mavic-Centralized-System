import { existsSync } from 'node:fs';
import { DataSource } from 'typeorm';
import { describe, expect, it } from 'vitest';
import { notifyLeaveReviewers } from '../src/hr/leaves/leave-review-notifications.js';
import { PasswordManagementService } from '../src/foundation/auth/password-management.service.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS !== 'true')('Request notification recipients on PostgreSQL', () => {
  it('limits leave to scoped reviewers and resets to Super Admin/IT, with no duplicate reset alerts', async () => {
    if (existsSync('.env')) process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME ?? 'mspaces_app', password: process.env.DB_PASSWORD ?? '', database: process.env.DB_DATABASE ?? 'mspaces_db', synchronize: false, migrationsRun: false, connectTimeoutMS: 5000 });
    await db.initialize();
    const runner = db.createQueryRunner();
    try {
      await runner.connect();
      await runner.startTransaction();
      await runner.query('CREATE TEMP TABLE notifications (id text,user_id text,branch_id text,title text,message text,type text,read boolean,created_at timestamptz,href text) ON COMMIT DROP');
      await runner.query('CREATE TEMP TABLE employees (id text,name text,employee_number text) ON COMMIT DROP');
      await runner.query('CREATE TEMP TABLE users (id text,email text,name text,role text,status text,branch_id text,employee_id text) ON COMMIT DROP');
      await runner.query('CREATE TEMP TABLE leave_requests (id text,employee_id text,branch_id text,status text) ON COMMIT DROP');
      await runner.query("CREATE TEMP TABLE password_reset_requests (id uuid,user_id text,branch_id text,reason text,status text DEFAULT 'PENDING') ON COMMIT DROP");
      await runner.query("CREATE UNIQUE INDEX ON password_reset_requests(user_id) WHERE status IN ('PENDING','VERIFIED','APPROVED')");
      await runner.query('SET LOCAL search_path TO pg_temp');
      const accounts = [
        ['super', 'SUPER_ADMIN', null, 'ACTIVE'], ['it', 'IT_ADMIN', null, 'ACTIVE'],
        ['hr-all', 'HR_ADMIN', null, 'ACTIVE'], ['hr-local', 'HR_ADMIN', 'branch-1', 'ACTIVE'],
        ['hr-other', 'HR_ADMIN', 'branch-2', 'ACTIVE'], ['manager-local', 'BRANCH_MANAGER', 'branch-1', 'ACTIVE'],
        ['manager-other', 'BRANCH_MANAGER', 'branch-2', 'ACTIVE'], ['manager-none', 'BRANCH_MANAGER', null, 'ACTIVE'],
        ['employee', 'EMPLOYEE', 'branch-1', 'ACTIVE'], ['staff', 'STAFF', 'branch-1', 'ACTIVE'],
        ['inactive-super', 'SUPER_ADMIN', null, 'INACTIVE'], ['inactive-it', 'IT_ADMIN', null, 'INACTIVE'],
        ['inactive-hr', 'HR_ADMIN', 'branch-1', 'INACTIVE'], ['inactive-manager', 'BRANCH_MANAGER', 'branch-1', 'INACTIVE'],
      ];
      for (const [id, role, branch, status] of accounts) {
        await runner.query('INSERT INTO users VALUES ($1,$2,$1,$3,$4,$5,NULL)', [id, `${id}@example.test`, role, status, branch]);
      }
      await runner.query("INSERT INTO employees VALUES ('emp-1','Employee','EMP001')");
      await runner.query("INSERT INTO leave_requests VALUES ('leave-1','emp-1','branch-1','PENDING_MANAGER')");
      await notifyLeaveReviewers(runner.manager, 'leave-1');
      const leaves = await runner.query<Array<{ user_id: string; href: string }>>("SELECT user_id,href FROM notifications WHERE title='Leave request submitted' ORDER BY user_id");
      expect(leaves.map(row => row.user_id)).toEqual(['hr-all', 'hr-local', 'manager-local', 'super']);
      expect(leaves.every(row => row.href === '/leave?requestId=leave-1')).toBe(true);
      await runner.query("UPDATE leave_requests SET status='APPROVED'");
      await notifyLeaveReviewers(runner.manager, 'leave-1');
      expect(await runner.query("SELECT id FROM notifications WHERE title='Leave request submitted'")).toHaveLength(4);
      const passwords = new PasswordManagementService({ query: runner.query.bind(runner) } as never, {} as never, {} as never);
      await passwords.request('employee@example.test', 'Help', 'source-1');
      await passwords.request('employee@example.test', 'Help again', 'source-2');
      const resets = await runner.query<Array<{ user_id: string; href: string }>>("SELECT user_id,href FROM notifications WHERE title='Password reset requested' ORDER BY user_id");
      expect(resets.map(row => row.user_id)).toEqual(['it', 'super']);
      expect(resets.every(row => row.href.startsWith('/system/password-reset-requests?requestId='))).toBe(true);
    } finally {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      if (!runner.isReleased) await runner.release();
      await db.destroy();
    }
  });
});
