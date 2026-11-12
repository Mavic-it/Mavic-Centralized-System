import { describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { UserService } from './user.service.js';

describe.runIf(process.env.ADMIN_BRANCH_DB_TEST === 'true')('account branch access labels (rollback-only)', () => {
  it('returns assigned, selected and all access independently of a nullable employee home branch', async () => {
    process.loadEnvFile('.env');
    const db = new DataSource({ type: 'postgres', host: process.env.DB_HOST ?? 'localhost', port: Number(process.env.DB_PORT ?? 5432), username: process.env.DB_USERNAME, password: process.env.DB_PASSWORD, database: process.env.DB_DATABASE, synchronize: false });
    await db.initialize();
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query(`
        CREATE TEMP TABLE users (LIKE public.users INCLUDING DEFAULTS) ON COMMIT DROP;
        CREATE TEMP TABLE branches (LIKE public.branches INCLUDING DEFAULTS) ON COMMIT DROP;
        CREATE TEMP TABLE user_branch_access (LIKE public.user_branch_access INCLUDING DEFAULTS) ON COMMIT DROP;
        CREATE TEMP VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
        CREATE TEMP TABLE employee_profile_pictures (LIKE public.employee_profile_pictures INCLUDING DEFAULTS) ON COMMIT DROP;
        INSERT INTO users(id,name,email,role,status,branch_id) VALUES
          ('manager','Manager','manager@example.invalid','BRANCH_MANAGER','ACTIVE',NULL),
          ('hr','HR','hr@example.invalid','HR_ADMIN','ACTIVE','a'),
          ('employee','Employee','employee@example.invalid','EMPLOYEE','ACTIVE','a');
        INSERT INTO branches(id,code,name,status,is_active,manager_user_id) VALUES
          ('a','A','Branch A','ACTIVE',true,'manager'),
          ('b','B','Branch B','ACTIVE',true,'manager'),
          ('c','C','Branch C','ACTIVE',true,NULL),
          ('inactive','I','Inactive','INACTIVE',false,'manager');
        INSERT INTO user_branch_access(user_id,mode,branch_ids,updated_by) VALUES ('hr','ALL','{}','hr'),('employee','ALL','{}','hr');
      `);
      const users = new UserService({ query: runner.manager.query.bind(runner.manager) } as DataSource);
      let accounts = await users.list();
      expect(accounts.find(account => account.id === 'manager')).toMatchObject({ branchId: null, branchAccessMode: 'ASSIGNED', accessibleBranches: [{ id: 'a', name: 'Branch A' }, { id: 'b', name: 'Branch B' }] });
      expect(accounts.find(account => account.id === 'hr')).toMatchObject({ branchId: 'a', branchAccessMode: 'ALL' });
      expect(accounts.find(account => account.id === 'hr')?.accessibleBranches).toHaveLength(3);
      expect(accounts.find(account => account.id === 'employee')?.branchAccessMode).toBe('ASSIGNED');
      expect(accounts.find(account => account.id === 'employee')?.accessibleBranches).toEqual([{ id: 'a', name: 'Branch A' }]);
      await runner.query(`INSERT INTO user_branch_access(user_id,mode,branch_ids,updated_by) VALUES ('manager','SELECTED',ARRAY['c'],'hr')`);
      accounts = await users.list();
      expect(accounts.find(account => account.id === 'manager')).toMatchObject({ branchAccessMode: 'SELECTED', accessibleBranches: [{ id: 'c', name: 'Branch C' }] });
      await runner.query(`UPDATE user_branch_access SET mode='ALL',branch_ids='{}' WHERE user_id='manager'`);
      expect((await users.list()).find(account => account.id === 'manager')).toMatchObject({ branchAccessMode: 'ALL', accessibleBranches: [{ id: 'a', name: 'Branch A' }, { id: 'b', name: 'Branch B' }, { id: 'c', name: 'Branch C' }] });
    } finally { await runner.rollbackTransaction(); await runner.release(); await db.destroy(); }
  });
});
