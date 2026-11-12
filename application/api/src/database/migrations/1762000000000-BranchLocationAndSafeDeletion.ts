import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchLocationAndSafeDeletion1762000000000 implements MigrationInterface {
  name = 'BranchLocationAndSafeDeletion1762000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches
        ADD COLUMN IF NOT EXISTS latitude double precision,
        ADD COLUMN IF NOT EXISTS longitude double precision
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_location_pair_check') THEN
          ALTER TABLE branches ADD CONSTRAINT branches_location_pair_check
            CHECK ((latitude IS NULL) = (longitude IS NULL)
              AND (latitude IS NULL OR latitude BETWEEN -90 AND 90)
              AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
        END IF;
      END $$
    `);
    await queryRunner.query('ALTER TABLE audit_logs ALTER COLUMN branch_id DROP NOT NULL');
  }

  async down(): Promise<void> {
    // Keep location data and detached audit history if this migration is rolled back.
  }
}
