import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationBookingHours1793750400000 implements MigrationInterface {
  name = 'ReservationBookingHours1793750400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE reservation_settings
        ADD COLUMN IF NOT EXISTS open_time time NOT NULL DEFAULT '07:00',
        ADD COLUMN IF NOT EXISTS close_time time NOT NULL DEFAULT '19:00',
        ADD COLUMN IF NOT EXISTS allowed_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::integer[];
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'reservation_settings_booking_hours_check'
            AND conrelid = 'reservation_settings'::regclass
        ) THEN
          ALTER TABLE reservation_settings
            ADD CONSTRAINT reservation_settings_booking_hours_check
            CHECK (open_time < close_time);
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'reservation_settings_allowed_days_check'
            AND conrelid = 'reservation_settings'::regclass
        ) THEN
          ALTER TABLE reservation_settings
            ADD CONSTRAINT reservation_settings_allowed_days_check CHECK (
              cardinality(allowed_days) BETWEEN 1 AND 7 AND
              allowed_days <@ ARRAY[1,2,3,4,5,6,7]::integer[]
            );
        END IF;
      END $$;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Preserve reservation booking policy with a forward migration.');
  }
}
