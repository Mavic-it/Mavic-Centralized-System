import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserve the original queue stage; never alter approval history or credit rows. */
export class SimpleLeaveWorkflow1792627200000 implements MigrationInterface {
  name = 'SimpleLeaveWorkflow1792627200000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS legacy_pending_status varchar(30), ADD COLUMN IF NOT EXISTS half_day boolean NOT NULL DEFAULT false`);
    await runner.query(`UPDATE leave_requests SET legacy_pending_status=status, status='PENDING' WHERE status IN ('PENDING_MANAGER','PENDING_HR')`);
    await runner.query(`CREATE INDEX IF NOT EXISTS leave_requests_pending_scope_idx ON leave_requests(branch_id,start_date,employee_id) WHERE status='PENDING'`);
  }
  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`UPDATE leave_requests SET status=COALESCE(legacy_pending_status,'PENDING_MANAGER') WHERE status='PENDING'`);
    await runner.query(`DROP INDEX IF EXISTS leave_requests_pending_scope_idx`);
    // Retain additive columns to preserve half-day and original-stage history.
  }
}
