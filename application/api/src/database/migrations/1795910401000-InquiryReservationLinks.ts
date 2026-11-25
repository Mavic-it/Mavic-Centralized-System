import type { MigrationInterface, QueryRunner } from 'typeorm';
export class InquiryReservationLinks1795910401000 implements MigrationInterface {
  name = 'InquiryReservationLinks1795910401000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE reservations ADD COLUMN inquiry_id varchar(100) REFERENCES inquiries(id), ADD COLUMN inquiry_request_key uuid UNIQUE;
      CREATE INDEX reservation_inquiry_links ON reservations(inquiry_id) WHERE inquiry_id IS NOT NULL;
      CREATE FUNCTION synchronize_inquiry_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE previous text; next_status text;
      BEGIN
        IF NEW.inquiry_id IS NULL THEN RETURN NEW; END IF;
        SELECT status INTO previous FROM inquiries WHERE id=NEW.inquiry_id FOR UPDATE;
        SELECT CASE WHEN bool_or(status='COMPLETED') OR EXISTS(SELECT 1 FROM inquiry_events WHERE inquiry_id=NEW.inquiry_id AND type='SERVICE_CONVERSION') THEN 'CONVERTED'
          WHEN bool_or(status IN ('CONFIRMED','CHECKED_IN')) THEN 'RESERVED'
          WHEN bool_or(status='PENDING') THEN 'PENDING_RESERVATION' ELSE 'IN_PROGRESS' END INTO next_status
          FROM reservations WHERE inquiry_id=NEW.inquiry_id;
        IF previous IS DISTINCT FROM next_status THEN
          UPDATE inquiries SET status=next_status,version=version+1,updated_at=now(),updated_by=COALESCE(NEW.approved_by,NEW.created_by) WHERE id=NEW.inquiry_id;
          INSERT INTO inquiry_events(id,inquiry_id,actor_id,type,description,previous_status,new_status,occurred_at)
            VALUES(gen_random_uuid(),NEW.inquiry_id,COALESCE(NEW.approved_by,NEW.created_by),'RESERVATION_STATUS','Linked reservation status synchronized',previous,next_status,now());
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER inquiry_reservation_sync AFTER INSERT OR UPDATE OF status,inquiry_id ON reservations FOR EACH ROW EXECUTE FUNCTION synchronize_inquiry_reservation();`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Retain reservation relationships; restore only from a reviewed backup.',
    );
  }
}
