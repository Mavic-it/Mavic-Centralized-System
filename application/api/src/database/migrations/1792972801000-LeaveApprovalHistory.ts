import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveApprovalHistory1792972801000 implements MigrationInterface {
  name = 'LeaveApprovalHistory1792972801000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE leave_request_events
      ADD COLUMN IF NOT EXISTS actor_name text,
      ADD COLUMN IF NOT EXISTS actor_role varchar(30)`);
    const types: Array<{ id: string; version: number; effectiveFrom: string; policy: Record<string, unknown> }> =
      await r.query(`SELECT t.id,t.version,v.effective_from::text AS "effectiveFrom",v.policy
        FROM leave_types t JOIN leave_type_versions v ON v.type_id=t.id AND v.version=t.version
        WHERE t.code IN ('VL','SL','EL','SIL','LWOP') FOR UPDATE OF t`);
    for (const type of types) {
      const automaticAllocation = type.policy.paid === true && type.policy.frequency === 'ANNUAL';
      if (type.policy.halfDay === true && type.policy.allowApprovedCancellation === true && type.policy.automaticAllocation === automaticAllocation) continue;
      const version = type.version + 1;
      await r.query(`INSERT INTO leave_type_versions(type_id,version,policy,effective_from)
        VALUES($1,$2,$3::jsonb,GREATEST($4::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date))`,
        [type.id, version, JSON.stringify({ ...type.policy, halfDay: true, allowApprovedCancellation: true, automaticAllocation }), type.effectiveFrom]);
      await r.query('UPDATE leave_types SET version=$2 WHERE id=$1', [type.id, version]);
    }
  }
  down(): Promise<void> {
    return Promise.reject(new Error('Retain leave history snapshots; restore policy settings through a new version.'));
  }
}
