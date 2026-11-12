import { existsSync } from 'node:fs';
import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { describe,expect,it } from 'vitest';
import { RetireLeaveManagement1792627201000 } from '../src/database/migrations/1792627201000-RetireLeaveManagement.js';

describe.skipIf(process.env.RUN_DATABASE_MIGRATION_TESTS!=='true')('Leave retirement on PostgreSQL',()=>{
 it('backs up and drops only leave data while preserving employee, attendance and audit records',async()=>{
  if(existsSync('.env'))process.loadEnvFile('.env');
  const db=new DataSource({type:'postgres',host:process.env.DB_HOST??'localhost',port:Number(process.env.DB_PORT??5432),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,synchronize:false,migrationsRun:false,connectTimeoutMS:5000});
  await db.initialize();const runner=db.createQueryRunner();
  try{
   await runner.connect();await runner.startTransaction();
   await runner.query(`CREATE TEMP TABLE employees(id text,employment jsonb); CREATE TEMP TABLE branch_settings(setting_key text,setting_value jsonb); CREATE TEMP TABLE notifications(id text,href text,title text); CREATE TEMP TABLE attendance_records(id text,data jsonb); CREATE TEMP TABLE audit_logs(id text,resource text); CREATE TEMP TABLE leave_requests(id text PRIMARY KEY,reason text); CREATE TEMP TABLE leave_request_days(id text,request_id text REFERENCES leave_requests(id));`);
   await runner.query('SET LOCAL search_path TO pg_temp');
   await runner.query(`INSERT INTO employees VALUES('fixture','{"startDate":"2020-01-01","leaveBalance":{"annual":3}}'); INSERT INTO branch_settings VALUES('leaveApprovalMode','"manager_hr"'),('attendance','true'); INSERT INTO notifications VALUES('leave','/leave?requestId=fixture','Leave request submitted'),('reset','/system/password-reset-requests','Password reset requested'); INSERT INTO attendance_records VALUES('attendance','{"approvedLeaveUnits":1}'); INSERT INTO audit_logs VALUES('audit','leave_requests'); INSERT INTO leave_requests VALUES('fixture','Artificial leave record'); INSERT INTO leave_request_days VALUES('day','fixture');`);
   const [{schema}]=await runner.manager.query<Array<{schema:string}>>('SELECT current_schema() AS schema');
   await new RetireLeaveManagement1792627201000().up(runner);
   expect((await runner.query("SELECT to_regclass('leave_requests') AS table"))[0].table).toBeNull();
   expect((await runner.query('SELECT employment FROM employees'))[0].employment).toEqual({startDate:'2020-01-01'});
   expect(await runner.query('SELECT id FROM attendance_records')).toEqual([{id:'attendance'}]);
   expect(await runner.query('SELECT resource FROM audit_logs')).toEqual([{resource:'leave_requests'}]);
   expect(await runner.query('SELECT id FROM notifications')).toEqual([{id:'reset'}]);
   expect(await runner.query('SELECT setting_key FROM branch_settings')).toEqual([{setting_key:'attendance'}]);
   const directory=resolve('../../tmp/leave-retirement-backups');const file=(await readdir(directory)).filter(name=>name.startsWith(`leave-${schema}-`)).sort().at(-1)!;
   const backup=JSON.parse(await readFile(resolve(directory,file),'utf8'));
   expect(backup.tables.leave_requests[0].row.reason).toBe('Artificial leave record');expect(backup.tables.employeeBalanceMetadata[0].employment.leaveBalance.annual).toBe(3);
   expect(()=>new RetireLeaveManagement1792627201000().down()).toThrow('forward-only');
   await runner.query(`CREATE TEMP TABLE leave_requests(id text PRIMARY KEY,reason text); CREATE TEMP TABLE unrelated_dependency(request_id text REFERENCES leave_requests(id)); INSERT INTO leave_requests VALUES('guarded','Artificial dependent fixture'); INSERT INTO unrelated_dependency VALUES('guarded'); SAVEPOINT guarded_removal`);
   await expect(new RetireLeaveManagement1792627201000().up(runner)).rejects.toThrow('depend');
   await runner.query('ROLLBACK TO SAVEPOINT guarded_removal');
   expect(await runner.query('SELECT request_id FROM unrelated_dependency')).toEqual([{request_id:'guarded'}]);
   expect(await runner.query('SELECT id FROM leave_requests')).toEqual([{id:'guarded'}]);
  }finally{if(runner.isTransactionActive)await runner.rollbackTransaction();if(!runner.isReleased)await runner.release();await db.destroy();}
 });
});
