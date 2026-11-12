import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicClientBooking1794960000000 implements MigrationInterface {
  name = 'PublicClientBooking1794960000000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE rooms ADD COLUMN IF NOT EXISTS public_bookable boolean NOT NULL DEFAULT false;
      ALTER TABLE reservations
        ADD COLUMN IF NOT EXISTS source varchar(30) NOT NULL DEFAULT 'INTERNAL',
        ADD COLUMN IF NOT EXISTS public_key_hash varchar(64),
        ADD COLUMN IF NOT EXISTS public_payload_hash varchar(64),
        ADD COLUMN IF NOT EXISTS terms_version varchar(30),
        ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz;
      CREATE UNIQUE INDEX IF NOT EXISTS reservations_public_key ON reservations(public_key_hash) WHERE public_key_hash IS NOT NULL;
      ALTER TABLE reservation_events ALTER COLUMN actor_id DROP NOT NULL;
      CREATE TABLE IF NOT EXISTS reservation_customer_mail (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
        event varchar(30) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        available_at timestamptz NOT NULL DEFAULT now(),
        sent_at timestamptz,
        failure varchar(40),
        UNIQUE(reservation_id,event)
      );
      CREATE INDEX IF NOT EXISTS reservation_customer_mail_pending ON reservation_customer_mail(available_at) WHERE sent_at IS NULL;`);
  }
  async down(): Promise<void> {
    throw new Error('Preserve client bookings and consent with a forward migration.');
  }
}
