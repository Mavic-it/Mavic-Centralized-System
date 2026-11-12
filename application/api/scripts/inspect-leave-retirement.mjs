import {DataSource} from 'typeorm';
process.loadEnvFile('.env');
if(!['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST??'localhost'))throw Error('Local database required');
const db=new DataSource({type:'postgres',host:process.env.DB_HOST,port:Number(process.env.DB_PORT??5432),username:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_DATABASE,synchronize:false,migrationsRun:false});
try{await db.initialize();console.log(JSON.stringify({tables:await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'leave_%' ORDER BY tablename"),migration:await db.query('SELECT name FROM migrations WHERE name=$1',['RetireLeaveManagement1792627201000'])}));}finally{if(db.isInitialized)await db.destroy();}
