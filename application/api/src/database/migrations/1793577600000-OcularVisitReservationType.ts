import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OcularVisitReservationType1793577600000
  implements MigrationInterface
{
  name = 'OcularVisitReservationType1793577600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE reservations ALTER COLUMN room_id DROP NOT NULL;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Preserve ocular visit reservation history with a forward migration.');
  }
}
