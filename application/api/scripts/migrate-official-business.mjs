import {existsSync} from 'node:fs';
import {DataSource} from 'typeorm';
import {OfficialBusinessRequests1794873600000} from '../dist/database/migrations/1794873600000-OfficialBusinessRequests.js';
if(existsSync('.env'))process.loadEnvFile('.env');
const db=new DataSource({type:'postgres',host:process.env.DB_HOST??'localhost',port:Number(process.env.DB_PORT??5432),username:process.env.DB_USERNAME??'mspaces_app',password:process.env.DB_PASSWORD??'',database:process.env.DB_DATABASE??'mspaces_db',ssl:process.env.DB_SSL==='true'?{rejectUnauthorized:false}:false,synchronize:false,migrationsRun:false,migrations:[OfficialBusinessRequests1794873600000]});
try{await db.initialize();if(process.argv.includes('--apply')){const result=await db.runMigrations({transaction:'all'});console.log(JSON.stringify({applied:result.map(m=>m.name)}));}console.log(JSON.stringify({pending:await db.showMigrations()}));}finally{if(db.isInitialized)await db.destroy();}
