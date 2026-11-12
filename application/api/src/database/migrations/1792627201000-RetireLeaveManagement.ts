import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MigrationInterface, QueryRunner } from 'typeorm';

// Explicit table set: do not use CASCADE or drop shared employee/attendance/audit tables.
export const retiredLeaveTables = [
  'leave_request_documents', 'leave_request_days', 'leave_credit_ledger',
  'leave_requests', 'leave_policy_versions', 'leave_entitlement_reviews',
  'leave_sil_eligibility', 'leave_allocation_runs', 'leave_policies', 'leave_type_definitions',
] as const;

export class RetireLeaveManagement1792627201000 implements MigrationInterface {
  name = 'RetireLeaveManagement1792627201000';
  async up(runner: QueryRunner): Promise<void> {
    const [{schema}] = await runner.manager.query<Array<{schema:string}>>('SELECT current_schema() AS schema');
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) throw new Error('Unexpected database schema.');
    const existing = await runner.manager.query<Array<{table_name:string}>>('SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',[retiredLeaveTables]);
    if (existing.length) {
      const tables: Record<string,unknown> = {};
      await runner.query(`LOCK TABLE ${existing.map(row=>'"'+schema+'"."'+row.table_name+'"').join(', ')} IN ACCESS EXCLUSIVE MODE`);
      for (const {table_name:table} of existing) {
        if (!retiredLeaveTables.some(name=>name===table)) throw new Error('Unexpected leave table.');
        tables[table]=await runner.query(`SELECT to_jsonb(record) AS row FROM "${schema}"."${table}" record`);
      }
      tables.employeeBalanceMetadata=await runner.query(`SELECT id,employment FROM employees WHERE employment ? 'leaveBalance' OR employment ? 'leave_balance'`);
      tables.branchSettings=await runner.query(`SELECT * FROM branch_settings WHERE left(setting_key,6)='leave_' OR setting_key IN ('leaveApprovalMode','LEAVE_ALLOCATION_SCHEDULER_ENABLED','LEAVE_ALLOCATION_ACTOR_ID')`);
      tables.notifications=await runner.query(`SELECT * FROM notifications WHERE href ~ '^/(my-leave|leave)([/?#]|$)' OR title LIKE 'Leave request %' OR title IN ('Leave approved','Leave rejected')`);
      const directory=resolve(process.env.LEAVE_REMOVAL_BACKUP_DIR ?? resolve(process.cwd(),'../../tmp/leave-retirement-backups'));
      await mkdir(directory,{recursive:true});
      const backupPath=resolve(directory,`leave-${schema}-${Date.now()}-${randomUUID()}.json`);
      await writeFile(backupPath,JSON.stringify({migration:this.name,schema,createdAt:new Date().toISOString(),tables}),{flag:'wx',mode:0o600});
      console.info(`Leave removal recovery backup: ${backupPath}`);
    }
    await runner.query(`DROP TABLE IF EXISTS ${retiredLeaveTables.map(table => '"'+schema+'"."'+table+'"').join(', ')}`);
    await runner.query(`UPDATE employees SET employment=employment-'leaveBalance'-'leave_balance' WHERE employment ? 'leaveBalance' OR employment ? 'leave_balance'`);
    await runner.query(`DELETE FROM branch_settings WHERE setting_key IN ('leaveApprovalMode','LEAVE_ALLOCATION_SCHEDULER_ENABLED','LEAVE_ALLOCATION_ACTOR_ID') OR left(setting_key,6)='leave_'`);
    await runner.query(`DELETE FROM notifications WHERE href ~ '^/(my-leave|leave)([/?#]|$)' OR title LIKE 'Leave request %' OR title IN ('Leave approved','Leave rejected')`);
  }
  down(): Promise<void> {
    throw new Error('Leave removal is forward-only. Restore the pre-removal backup and matching code/schema to recover leave records.');
  }
}
