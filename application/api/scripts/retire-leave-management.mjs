import {DataSource} from 'typeorm';
import {RetireLeaveManagement1792627201000,retiredLeaveTables} from '../dist/database/migrations/1792627201000-RetireLeaveManagement.js';
process.loadEnvFile('.env');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST??'localhost'))throw Error('This runner is restricted to the configured local database.');
const db=new DataSource({type:'postgres',host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,synchronize:false,migrationsRun:false,migrations:[RetireLeaveManagement1792627201000]});
const preserved=['users','branches','attendance_records','employee_documents','audit_logs'];
try{
 await db.initialize();
 const snapshot=async()=>Object.fromEntries(await Promise.all(preserved.map(async table=>[table,(await db.query(`SELECT count(*)::int AS count,md5(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text)) AS digest FROM "${table}" t`))[0]])));
 const before=await snapshot();const employeeCount=(await db.query('SELECT count(*)::int AS count FROM employees'))[0].count;
 const applied=await db.runMigrations({transaction:'all'});const after=await snapshot();
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Shared record preservation check failed.');
 const remaining=await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename=ANY($1::text[])",[retiredLeaveTables]);
 if(remaining.length)throw Error('Leave tables remain.');
 if((await db.query('SELECT count(*)::int AS count FROM employees'))[0].count!==employeeCount)throw Error('Employee count changed.');
 const recorded=await db.query('SELECT name FROM migrations WHERE name=$1',['RetireLeaveManagement1792627201000']);if(recorded.length!==1)throw Error('Retirement migration not recorded.');
 console.log(JSON.stringify({applied:applied.map(row=>row.name),migrationRecorded:true,leaveTablesRemaining:0,sharedRecordsPreserved:true,employeesPreserved:employeeCount}));
}finally{if(db.isInitialized)await db.destroy();}
