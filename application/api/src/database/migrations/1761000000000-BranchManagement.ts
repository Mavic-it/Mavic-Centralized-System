import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchManagement1761000000000 implements MigrationInterface {
  name = 'BranchManagement1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE branches
        ADD COLUMN IF NOT EXISTS description text,
        ADD COLUMN IF NOT EXISTS address varchar(500),
        ADD COLUMN IF NOT EXISTS city varchar(120),
        ADD COLUMN IF NOT EXISTS province varchar(120),
        ADD COLUMN IF NOT EXISTS postal_code varchar(20),
        ADD COLUMN IF NOT EXISTS phone varchar(30),
        ADD COLUMN IF NOT EXISTS email varchar(320),
        ADD COLUMN IF NOT EXISTS manager_name varchar(200),
        ADD COLUMN IF NOT EXISTS status varchar(20),
        ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
    `);
    await queryRunner.query(`
      UPDATE branches
      SET status = CASE WHEN is_active THEN 'ACTIVE' ELSE 'INACTIVE' END
      WHERE status IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE branches
        ALTER COLUMN status SET DEFAULT 'ACTIVE',
        ALTER COLUMN status SET NOT NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'branches_status_check'
        ) THEN
          ALTER TABLE branches ADD CONSTRAINT branches_status_check
            CHECK (status IN ('ACTIVE', 'INACTIVE'));
        END IF;
        IF EXISTS (
          SELECT 1 FROM branches GROUP BY UPPER(code) HAVING COUNT(*) > 1
        ) THEN
          RAISE EXCEPTION 'Branch codes contain case-insensitive duplicates; resolve them before applying branch management.';
        END IF;
      END $$
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS branches_code_upper_uidx ON branches (UPPER(code))',
    );
    await queryRunner.query(`
      INSERT INTO branches (
        id, code, name, is_active, status, address, city, created_at, updated_at
      )
      SELECT seed.id, seed.code, seed.name, true, 'ACTIVE', '', '', now(), now()
      FROM (VALUES
        ('00000000-0000-4000-8000-000000000001', 'MAKATI', 'Mspaces Makati'),
        ('00000000-0000-4000-8000-000000000002', 'ORTIGAS', 'Mspaces Ortigas')
      ) AS seed(id, code, name)
      WHERE NOT EXISTS (
        SELECT 1 FROM branches existing WHERE UPPER(existing.code) = seed.code
      )
    `);
  }

  async down(): Promise<void> {
    // Keep branch metadata and seed rows on rollback to avoid data loss.
  }
}