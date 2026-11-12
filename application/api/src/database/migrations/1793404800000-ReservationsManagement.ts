import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ReservationsManagement1793404800000 implements MigrationInterface {
  name = 'ReservationsManagement1793404800000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS type varchar(40) NOT NULL DEFAULT 'MEETING_ROOM',
      ADD COLUMN IF NOT EXISTS description text,
      ADD COLUMN IF NOT EXISTS hourly_rate numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS buffer_minutes integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS min_minutes integer NOT NULL DEFAULT 30,
      ADD COLUMN IF NOT EXISTS max_minutes integer NOT NULL DEFAULT 1440,
      ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
      ALTER TABLE rooms ADD CONSTRAINT rooms_booking_values CHECK
        (capacity > 0 AND hourly_rate >= 0 AND buffer_minutes BETWEEN 0 AND 240
         AND min_minutes > 0 AND max_minutes >= min_minutes);`);
    await r.query(`ALTER TABLE reservations
      ALTER COLUMN employee_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS reference varchar(30),
      ADD COLUMN IF NOT EXISTS customer_name varchar(200),
      ADD COLUMN IF NOT EXISTS customer_email varchar(320),
      ADD COLUMN IF NOT EXISTS customer_phone varchar(50),
      ADD COLUMN IF NOT EXISTS company_name varchar(200),
      ADD COLUMN IF NOT EXISTS guest_count integer,
      ADD COLUMN IF NOT EXISTS special_requests text,
      ADD COLUMN IF NOT EXISTS notes text,
      ADD COLUMN IF NOT EXISTS amount numeric(12,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS payment_status varchar(30) NOT NULL DEFAULT 'UNPAID',
      ADD COLUMN IF NOT EXISTS created_by varchar(100) REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS approved_by varchar(100) REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS approved_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
      ADD COLUMN IF NOT EXISTS cancellation_reason text,
      ADD COLUMN IF NOT EXISTS checked_in_at timestamptz,
      ADD COLUMN IF NOT EXISTS checked_out_at timestamptz,
      ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
      CREATE UNIQUE INDEX IF NOT EXISTS reservation_reference_unique ON reservations(reference) WHERE reference IS NOT NULL;
      CREATE INDEX IF NOT EXISTS reservations_room_time ON reservations(room_id, start_date_time, end_date_time);
      CREATE INDEX IF NOT EXISTS reservations_branch_time ON reservations(branch_id, start_date_time DESC);`);
    await r.query(`CREATE INDEX IF NOT EXISTS reservations_customer_history ON reservations(lower(customer_email),start_date_time DESC) WHERE customer_email IS NOT NULL`);
    await r.query(`CREATE TABLE reservation_space_blocks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      room_id varchar(100) NOT NULL REFERENCES rooms(id),
      start_at timestamptz NOT NULL,
      end_at timestamptz NOT NULL,
      reason text NOT NULL,
      created_by varchar(100) NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now(),
      CHECK (start_at < end_at)
    );
    CREATE INDEX reservation_space_blocks_time ON reservation_space_blocks(room_id, start_at, end_at);
    CREATE TABLE reservation_events (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
      action varchar(40) NOT NULL,
      reason text,
      actor_id varchar(100) NOT NULL REFERENCES users(id),
      previous_status varchar(30),
      new_status varchar(30),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX reservation_events_record ON reservation_events(reservation_id, created_at);
    CREATE TABLE reservation_payments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      reservation_id varchar(100) NOT NULL REFERENCES reservations(id),
      amount numeric(12,2) NOT NULL CHECK (amount > 0),
      method varchar(50) NOT NULL,
      reference varchar(120),
      note text,
      recorded_by varchar(100) NOT NULL REFERENCES users(id),
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX reservation_payments_record ON reservation_payments(reservation_id, created_at);
    CREATE TABLE reservation_settings (
      branch_id varchar(100) PRIMARY KEY REFERENCES branches(id),
      auto_confirm boolean NOT NULL DEFAULT false,
      min_advance_minutes integer NOT NULL DEFAULT 0,
      max_advance_days integer NOT NULL DEFAULT 365,
      default_duration_minutes integer NOT NULL DEFAULT 60,
      updated_by varchar(100) REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK (min_advance_minutes BETWEEN 0 AND 10080 AND max_advance_days BETWEEN 1 AND 1095
        AND default_duration_minutes BETWEEN 30 AND 1440)
    );
    CREATE TABLE reservation_mail_outbox (
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
    );
    CREATE INDEX reservation_mail_pending ON reservation_mail_outbox(available_at) WHERE sent_at IS NULL;`);
  }

  async down(): Promise<void> {
    throw new Error('Preserve reservation history with a forward migration.');
  }
}
