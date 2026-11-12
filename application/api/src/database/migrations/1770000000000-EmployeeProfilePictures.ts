import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EmployeeProfilePictures1770000000000 implements MigrationInterface {
  name = 'EmployeeProfilePictures1770000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS employee_profile_pictures (
        employee_id varchar(100) PRIMARY KEY
          REFERENCES employees(id) ON DELETE CASCADE,
        mime_type varchar(50) NOT NULL,
        file_data bytea NOT NULL,
        uploaded_by varchar(100) NOT NULL REFERENCES users(id),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT employee_profile_pictures_mime_check
          CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp'))
      )
    `);
  }

  async down(): Promise<void> {
    // Preserve uploaded profile pictures if the application version is rolled back.
  }
}
