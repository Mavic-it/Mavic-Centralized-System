import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IndependentSuperAdminProfiles1791936000000
  implements MigrationInterface
{
  name = 'IndependentSuperAdminProfiles1791936000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing accounts remain NULL because their original creation dates are unknown.
    await queryRunner.query(
      `ALTER TABLE users
         ADD COLUMN IF NOT EXISTS created_at timestamptz,
         ADD COLUMN IF NOT EXISTS last_login_at timestamptz`,
    );
    await queryRunner.query(
      'ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now()',
    );

    // A Super Admin remains unassigned to a branch but may retain an explicit
    // employee link when an existing employee account is promoted.
    await queryRunner.query(
      'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_super_admin_scope_check',
    );
    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT users_super_admin_scope_check
        CHECK (role <> 'SUPER_ADMIN' OR branch_id IS NULL)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id varchar(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        first_name varchar(100) NOT NULL,
        middle_name varchar(100),
        last_name varchar(100) NOT NULL,
        display_name varchar(150) NOT NULL,
        date_of_birth date,
        gender varchar(50),
        contact_number varchar(50) NOT NULL,
        home_address varchar(1000) NOT NULL,
        emergency_contact_name varchar(200),
        emergency_contact_relationship varchar(100),
        emergency_contact_number varchar(50),
        profile_picture_mime_type varchar(50),
        profile_picture_data bytea,
        profile_picture_updated_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT user_profiles_emergency_contact_check
          CHECK (
            (emergency_contact_name IS NULL AND
             emergency_contact_relationship IS NULL AND
             emergency_contact_number IS NULL)
            OR
            (emergency_contact_name IS NOT NULL AND
             emergency_contact_relationship IS NOT NULL AND
             emergency_contact_number IS NOT NULL)
          ),
        CONSTRAINT user_profiles_picture_pair_check
          CHECK (
            (profile_picture_mime_type IS NULL AND
             profile_picture_data IS NULL AND
             profile_picture_updated_at IS NULL)
            OR
            (profile_picture_mime_type IS NOT NULL AND
             profile_picture_data IS NOT NULL AND
             profile_picture_updated_at IS NOT NULL)
          ),
        CONSTRAINT user_profiles_picture_mime_check
          CHECK (
            profile_picture_mime_type IS NULL OR
            profile_picture_mime_type IN ('image/jpeg', 'image/png', 'image/webp')
          )
      )
    `);
  }

  async down(): Promise<void> {
    // Preserve profile information if the application version is rolled back.
  }
}
