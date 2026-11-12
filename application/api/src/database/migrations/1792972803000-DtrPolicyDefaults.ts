import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DtrPolicyDefaults1792972803000 implements MigrationInterface {
  name = 'DtrPolicyDefaults1792972803000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      UPDATE attendance_dtr_settings
      SET policy = jsonb_set(
        jsonb_set(
          jsonb_set(COALESCE(policy, '{}'::jsonb), '{lateGraceMinutes}', '15'::jsonb, true),
          '{minimumOtMinutes}',
          CASE WHEN COALESCE((policy->>'minimumOtMinutes')::int, 0) = 0 THEN '50'::jsonb
               ELSE to_jsonb((policy->>'minimumOtMinutes')::int) END,
          true
        ),
        '{otIncrementMinutes}',
        CASE WHEN COALESCE((policy->>'otIncrementMinutes')::int, 1) = 1 THEN '60'::jsonb
             ELSE to_jsonb((policy->>'otIncrementMinutes')::int) END,
        true
      ), updated_at=now()
      WHERE policy->>'lateGraceMinutes' IS NULL
         OR COALESCE((policy->>'minimumOtMinutes')::int, 0) = 0
         OR COALESCE((policy->>'otIncrementMinutes')::int, 1) = 1
    `);
  }

  async down(): Promise<void> {
    // Keep approved policy values and attendance history intact on rollback.
  }
}
