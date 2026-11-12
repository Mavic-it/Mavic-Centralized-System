import { describe, expect, it } from 'vitest';
import { DataSource, type EntityManager } from 'typeorm';
import { BranchService } from '../branches/branches.service.js';

describe.runIf(process.env.ADMIN_BRANCH_DB_TEST==='true')('PostgreSQL administrator access settings',()=>{
 it('persists audited branch grants without changing employee home branch or management assignments',async()=>{
  process.loadEnvFile('.env');
  const db=new DataSource({type:'postgres',host:process.env.DB_HOST??'localhost',port:Number(process.env.DB_PORT??5432),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,synchronize:false});
  await db.initialize();const runner=db.createQueryRunner();await runner.connect();await runner.startTransaction();
  try{
   await runner.query(`
    CREATE TEMP TABLE users(id text PRIMARY KEY,role text,branch_id text,employee_id text) ON COMMIT DROP;
    CREATE TEMP TABLE branches(id text PRIMARY KEY,name text,status text,manager_user_id text) ON COMMIT DROP;
    CREATE TEMP TABLE user_branch_access(LIKE public.user_branch_access INCLUDING ALL) ON COMMIT DROP;
    CREATE TEMP TABLE audit_logs(id text,user_id text,action text,resource text,details jsonb,created_at timestamptz) ON COMMIT DROP;
    CREATE TEMP VIEW employee_branch_access AS SELECT user_id,mode,branch_ids FROM user_branch_access;
    INSERT INTO users VALUES ('manager','BRANCH_MANAGER','first',NULL),('employee','EMPLOYEE','first',NULL),('actor','SUPER_ADMIN',NULL,NULL);
    INSERT INTO branches VALUES ('first','First','ACTIVE',NULL),('second','Second','ACTIVE','manager'),('third','Third','ACTIVE',NULL),('inactive','Inactive','INACTIVE',NULL);
   `);
   const scoped={query:runner.manager.query.bind(runner.manager),transaction:<T>(fn:(m:EntityManager)=>Promise<T>)=>runner.manager.transaction(fn)} as DataSource;
   const branches=new BranchService(scoped);
   expect((await branches.listAccessibleBranches('manager','first','BRANCH_MANAGER')).map(b=>b.id)).toEqual(['first','second']);
   await branches.saveAdminBranchAccess('manager',{mode:'SELECTED',branchIds:['third']},'actor');
   expect(await branches.getAdminBranchAccess('manager')).toEqual({mode:'SELECTED',branchIds:['third']});
   expect((await branches.listAccessibleBranches('manager','first','BRANCH_MANAGER')).map(b=>b.id)).toEqual(['third']);
   const [home]=await runner.query(`SELECT branch_id FROM users WHERE id='manager'`);expect(home.branch_id).toBe('first');
   const [managed]=await runner.query(`SELECT manager_user_id FROM branches WHERE id='second'`);expect(managed.manager_user_id).toBe('manager');
   await expect(branches.saveAdminBranchAccess('manager',{mode:'SELECTED',branchIds:['inactive']},'actor')).rejects.toThrow('active branches');
   await expect(branches.saveAdminBranchAccess('employee',{mode:'ALL',branchIds:[]},'actor')).rejects.toThrow('HR administrators and branch managers');
   await branches.saveAdminBranchAccess('manager',{mode:'ALL',branchIds:[]},'actor');
   await runner.query(`INSERT INTO branches VALUES ('future','Future','ACTIVE',NULL)`);
   expect((await branches.listAccessibleBranches('manager','first','BRANCH_MANAGER')).map(b=>b.id)).toEqual(['first','future','second','third']);
   await branches.saveAdminBranchAccess('manager',{mode:'ASSIGNED',branchIds:[]},'actor');
   expect((await branches.listAccessibleBranches('manager','first','BRANCH_MANAGER')).map(b=>b.id)).toEqual(['first','second']);
   const audit=await runner.query(`SELECT user_id,details FROM audit_logs WHERE resource='user_branch_access' ORDER BY created_at,id`);
   expect(audit).toHaveLength(3);expect(audit.every((a:{user_id:string})=>a.user_id==='actor')).toBe(true);
   expect(audit.some((a:{details:{after:{mode:string}}})=>a.details.after.mode==='ALL')).toBe(true);
  }finally{await runner.rollbackTransaction();await runner.release();await db.destroy();}
 });
});
