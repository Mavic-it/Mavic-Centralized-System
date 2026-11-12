import type { MigrationInterface, QueryRunner } from 'typeorm';

/** User-approved initial filing rules; later changes use versioned Leave Settings. */
export class LeaveFilingNotice1792972800000 implements MigrationInterface {
  name = 'LeaveFilingNotice1792972800000';
  async up(r: QueryRunner): Promise<void> {
    const policies: Array<{
        id: string;
        code: string;
        version: number;
        effectiveFrom: string;
        policy: Record<string, unknown>;
      }> = await r.query(`SELECT t.id,t.code,t.version,v.effective_from::text AS "effectiveFrom",v.policy
      FROM leave_types t JOIN leave_type_versions v ON v.type_id=t.id AND v.version=t.version
      WHERE t.code IN ('VL','SL','EL','SIL','LWOP') FOR UPDATE OF t`);
    for (const row of policies) {
      if (row.policy.minimumNoticeDays !== undefined) continue;
      const days = ['SL', 'EL'].includes(row.code) ? 0 : 1;
      const version = row.version + 1;
      await r.query(
        `INSERT INTO leave_type_versions(type_id,version,policy,effective_from)
        VALUES($1,$2,$3::jsonb,GREATEST($4::date,(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::date))`,
        [
          row.id,
          version,
          JSON.stringify({ ...row.policy, minimumNoticeDays: days }),
          row.effectiveFrom,
        ],
      );
      await r.query('UPDATE leave_types SET version=$2 WHERE id=$1', [
        row.id,
        version,
      ]);
    }
  }
  down(): Promise<void> {
    // Published policy history is retained. Revert through a new HR-approved version.
    return Promise.reject(
      new Error(
        'Leave filing policies must be reverted using a new policy version in Leave Settings.',
      ),
    );
  }
}
