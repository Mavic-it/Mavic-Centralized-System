import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationSpaceImages1794873600000 implements MigrationInterface {
  name = 'ReservationSpaceImages1794873600000';
  async up(r: QueryRunner): Promise<void> {
    await r.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_data text');
  }
  async down(r: QueryRunner): Promise<void> {
    await r.query('ALTER TABLE rooms DROP COLUMN IF EXISTS image_data');
  }
}
