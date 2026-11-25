import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InquiryManagement1795910400000 implements MigrationInterface {
  name = 'InquiryManagement1795910400000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE SEQUENCE inquiry_reference_seq;
      CREATE FUNCTION next_inquiry_reference() RETURNS text LANGUAGE sql VOLATILE AS $$
        SELECT 'INQ-'||to_char(now() AT TIME ZONE 'Asia/Manila','YYYY')||'-'||lpad(n,greatest(6,length(n)),'0') FROM (SELECT nextval('inquiry_reference_seq')::text n) s
      $$;
      ALTER TABLE inquiries ALTER COLUMN customer_id DROP NOT NULL, ALTER COLUMN budget DROP NOT NULL;
      ALTER TABLE inquiries ADD COLUMN reference text UNIQUE,
        ADD COLUMN inquiry_date date, ADD COLUMN client_name varchar(200), ADD COLUMN client jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN channel_id varchar(100), ADD COLUMN source_id varchar(100), ADD COLUMN priority text NOT NULL DEFAULT 'NORMAL',
        ADD COLUMN description text NOT NULL DEFAULT '', ADD COLUMN requirements text NOT NULL DEFAULT '',
        ADD COLUMN pax integer CHECK(pax>0), ADD COLUMN preferred_start timestamptz, ADD COLUMN preferred_end timestamptz,
        ADD COLUMN next_action text, ADD COLUMN legacy_outcome text, ADD COLUMN archived_at timestamptz,
        ADD COLUMN created_by varchar(100) REFERENCES users(id), ADD COLUMN updated_by varchar(100) REFERENCES users(id),
        ADD COLUMN created_at timestamptz NOT NULL DEFAULT now(), ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN version integer NOT NULL DEFAULT 1;
      UPDATE inquiries i SET client_name=c.name FROM customers c WHERE c.id=i.customer_id;
      UPDATE inquiries SET reference='INQ-LEGACY-'||id;
      UPDATE inquiries SET legacy_outcome=status WHERE status IN ('RESERVED','CONVERTED');
      UPDATE inquiries SET legacy_outcome=COALESCE(legacy_outcome,status),status='NEEDS_REVIEW' WHERE status NOT IN ('NEW','IN_PROGRESS','FOLLOW_UP','NO_RESPONSE','OCULAR_SCHEDULED','PROPOSAL_SENT','PENDING_RESERVATION','RESERVED','CONVERTED','LOST','CLOSED','NEEDS_REVIEW','NEGOTIATION');
      UPDATE inquiries SET status='IN_PROGRESS' WHERE status='NEGOTIATION';
      ALTER TABLE inquiries ADD CONSTRAINT inquiry_status_check CHECK(status IN ('NEW','IN_PROGRESS','FOLLOW_UP','NO_RESPONSE','OCULAR_SCHEDULED','PROPOSAL_SENT','PENDING_RESERVATION','RESERVED','CONVERTED','LOST','CLOSED','NEEDS_REVIEW')),
        ADD CONSTRAINT inquiry_staff_fk FOREIGN KEY(assigned_staff_id) REFERENCES users(id) NOT VALID,
        ADD CONSTRAINT inquiry_budget_check CHECK(budget>=0) NOT VALID;
      CREATE TABLE inquiry_lookups(id varchar(100) PRIMARY KEY,kind text NOT NULL CHECK(kind IN ('SERVICE','CHANNEL','SOURCE','ACTION','LOST_REASON')),
        label varchar(150) NOT NULL CHECK(length(trim(label))>0),position integer NOT NULL DEFAULT 0,active boolean NOT NULL DEFAULT true,reservable boolean NOT NULL DEFAULT false);
      CREATE UNIQUE INDEX inquiry_lookup_label ON inquiry_lookups(kind,lower(label));
      ALTER TABLE inquiries ADD CONSTRAINT inquiry_channel_fk FOREIGN KEY(channel_id) REFERENCES inquiry_lookups(id),
        ADD CONSTRAINT inquiry_source_fk FOREIGN KEY(source_id) REFERENCES inquiry_lookups(id);
      CREATE TABLE inquiry_preferred_branches(inquiry_id varchar(100) REFERENCES inquiries(id),branch_id varchar(100) REFERENCES branches(id),PRIMARY KEY(inquiry_id,branch_id));
      INSERT INTO inquiry_preferred_branches SELECT id,branch_id FROM inquiries;
      CREATE TABLE inquiry_services(inquiry_id varchar(100) REFERENCES inquiries(id),service_id varchar(100) REFERENCES inquiry_lookups(id),PRIMARY KEY(inquiry_id,service_id));
      CREATE TABLE inquiry_events(id uuid PRIMARY KEY,sequence bigserial UNIQUE,inquiry_id varchar(100) NOT NULL REFERENCES inquiries(id),actor_id varchar(100) REFERENCES users(id),
        type varchar(100) NOT NULL,description text NOT NULL,previous_status text,new_status text,occurred_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX inquiry_event_timeline ON inquiry_events(inquiry_id,created_at);
      INSERT INTO inquiry_events(id,inquiry_id,type,description,occurred_at)
        SELECT gen_random_uuid(),i.id,'LEGACY_FOLLOW_UP',f->>'note',NULL
        FROM inquiries i CROSS JOIN LATERAL jsonb_array_elements(i.follow_ups) f WHERE f->>'note' IS NOT NULL;
      CREATE TABLE inquiry_tasks(id uuid PRIMARY KEY,inquiry_id varchar(100) NOT NULL REFERENCES inquiries(id),assigned_staff_id varchar(100) NOT NULL REFERENCES users(id),
        description text NOT NULL,action_type text NOT NULL DEFAULT 'FOLLOW_UP',priority text NOT NULL DEFAULT 'NORMAL',version integer NOT NULL DEFAULT 1,due_at timestamptz NOT NULL,status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','COMPLETED','CANCELLED')),
        result text,completed_by varchar(100) REFERENCES users(id),completed_at timestamptz,reminder_checked_at timestamptz,created_by varchar(100) NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now());
      CREATE INDEX inquiry_task_due ON inquiry_tasks(due_at,assigned_staff_id) WHERE status='OPEN';
      CREATE TABLE inquiry_task_reminders(task_id uuid NOT NULL REFERENCES inquiry_tasks(id),user_id varchar(100) NOT NULL REFERENCES users(id),kind text NOT NULL,schedule_version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(task_id,user_id,kind,schedule_version));
      CREATE TABLE inquiry_import_batches(id uuid PRIMARY KEY,checksum text NOT NULL,actor_id varchar(100) NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(checksum,actor_id));
      CREATE TABLE inquiry_import_rows(batch_id uuid NOT NULL REFERENCES inquiry_import_batches(id),worksheet text NOT NULL,row_number integer NOT NULL,
        raw jsonb NOT NULL,normalized jsonb NOT NULL,inquiry_id varchar(100) NOT NULL REFERENCES inquiries(id),fingerprint text NOT NULL,
        PRIMARY KEY(batch_id,worksheet,row_number),UNIQUE(fingerprint));
      CREATE INDEX inquiry_scope_date ON inquiries(branch_id,inquiry_date DESC,id) WHERE archived_at IS NULL;
      CREATE INDEX inquiry_staff_status ON inquiries(assigned_staff_id,status);
      CREATE INDEX inquiry_service_filter ON inquiry_services(service_id,inquiry_id);`);
    const defaults: Record<string, string[]> = {
      SERVICE: [
        'Meeting Room',
        'Coworking',
        'Private Office',
        'Virtual Office',
        'Business Registration Services',
        'Location Inquiry',
        'Availability Inquiry',
        'Amenities Inquiry',
        'Other',
      ],
      CHANNEL: [
        'Facebook',
        'Call',
        'Viber',
        'WhatsApp',
        'Email',
        'Walk-in',
        'Website',
        'Instagram',
        'SMS',
        'Other',
      ],
      SOURCE: [
        'Facebook',
        'Facebook Ads',
        'Google',
        'Google Ads',
        'Referral',
        'Repeat Client',
        'Website',
        'Flyers',
        'Instagram',
        'ChatGPT',
        'Other',
        'Unknown',
      ],
      ACTION: [
        'Contacted Client',
        'Sent Pricelist',
        'Sent Proposal',
        'Sent Location',
        'Sent Photos',
        'Sent Amenities',
        'Scheduled Ocular',
        'Follow-up',
        'Confirmed Booking',
        'Other',
      ],
      LOST_REASON: [
        'Location Mismatch',
        'Price or Budget',
        'Insufficient Capacity',
        'Operating Hours',
        'Requires 24-Hour Access',
        'Service Unavailable',
        'Client Found Another Provider',
        'Client Cancelled',
        'No Response After Follow-up Policy',
        'Other',
      ],
    };
    for (const [kind, labels] of Object.entries(defaults))
      for (const [position, label] of labels.entries()) {
        await q.query(
          `INSERT INTO inquiry_lookups(id,kind,label,position,reservable) VALUES($1,$2,$3,$4,$5)`,
          [
            `inq-${kind.toLowerCase()}-${position}`,
            kind,
            label,
            position,
            kind === 'SERVICE' && position < 3,
          ],
        );
      }
  }
  async down(): Promise<void> {
    throw new Error(
      'Inquiry migration preserves history. Roll back application code; restore schema only from a reviewed backup.',
    );
  }
}
