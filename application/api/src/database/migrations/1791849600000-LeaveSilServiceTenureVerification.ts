import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveSilServiceTenureVerification1791849600000
  implements MigrationInterface
{
  name = 'LeaveSilServiceTenureVerification1791849600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE leave_sil_eligibility
        ADD COLUMN IF NOT EXISTS service_tenure_verified boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE leave_sil_eligibility
      SET service_tenure_verified = true
      WHERE status = 'ELIGIBLE' AND service_tenure_verified = false
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'leave_sil_eligibility_service_check'
        ) THEN
          ALTER TABLE leave_sil_eligibility
            ADD CONSTRAINT leave_sil_eligibility_service_check
            CHECK (status <> 'ELIGIBLE' OR service_tenure_verified = true);
        END IF;
      END $$
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE leave_sil_eligibility
        DROP CONSTRAINT IF EXISTS leave_sil_eligibility_service_check,
        DROP COLUMN IF EXISTS service_tenure_verified
    `);
  }
}
