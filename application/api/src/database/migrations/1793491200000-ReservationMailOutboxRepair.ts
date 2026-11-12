import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Repairs installations where the reservations migration was recorded but the
 * email outbox table was not retained. Existing outbox rows are never changed. */
export class ReservationMailOutboxRepair1793491200000 implements MigrationInterface {
  name = 'ReservationMailOutboxRepair1793491200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS reservation_mail_outbox (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        notification_id varchar(100) NOT NULL UNIQUE REFERENCES notifications(id),
        reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
        user_id varchar(100) NOT NULL REFERENCES users(id),
        audience varchar(20) NOT NULL CHECK (audience IN ('MANAGER','CREATOR')),
        event varchar(30) NOT NULL CHECK (event IN ('PENDING','CONFIRMED','REJECTED','CANCELLED','CHECKED_IN','COMPLETED','NO_SHOW')),
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        failure varchar(40),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS reservation_mail_pending ON reservation_mail_outbox(available_at) WHERE sent_at IS NULL`,
    );
  }

  async down(): Promise<void> {
    throw new Error(
      'Preserve reservation delivery history with a forward migration.',
    );
  }
}
