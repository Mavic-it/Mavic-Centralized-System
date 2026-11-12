import type { MigrationInterface, QueryRunner } from 'typeorm';

export class RepairAttendanceScheduleSnapshot1766000000000
  implements MigrationInterface
{
  name = 'RepairAttendanceScheduleSnapshot1766000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_records
        ADD COLUMN IF NOT EXISTS scheduled_start time,
        ADD COLUMN IF NOT EXISTS scheduled_end time,
        ADD COLUMN IF NOT EXISTS schedule_break_minutes integer,
        ADD COLUMN IF NOT EXISTS schedule_grace_minutes integer,
        ADD COLUMN IF NOT EXISTS schedule_time_zone varchar(100)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE attendance_records
        DROP COLUMN IF EXISTS scheduled_start,
        DROP COLUMN IF EXISTS scheduled_end,
        DROP COLUMN IF EXISTS schedule_break_minutes,
        DROP COLUMN IF EXISTS schedule_grace_minutes,
        DROP COLUMN IF EXISTS schedule_time_zone
    `);
  }
}
