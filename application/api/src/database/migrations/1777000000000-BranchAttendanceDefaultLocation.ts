import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BranchAttendanceDefaultLocation1777000000000 implements MigrationInterface {
  name = 'BranchAttendanceDefaultLocation1777000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_schedules
      ADD COLUMN IF NOT EXISTS default_location varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_schedules
      DROP COLUMN IF EXISTS default_location
    `);
  }
}
