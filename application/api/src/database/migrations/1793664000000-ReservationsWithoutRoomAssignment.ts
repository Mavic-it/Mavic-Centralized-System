import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationsWithoutRoomAssignment1793664000000
  implements MigrationInterface
{
  name = 'ReservationsWithoutRoomAssignment1793664000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE reservations ALTER COLUMN room_id DROP NOT NULL;
      ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_booking_type_check;
      ALTER TABLE reservations DROP COLUMN IF EXISTS booking_type;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Do not restore room requirements for reservation records.');
  }
}
