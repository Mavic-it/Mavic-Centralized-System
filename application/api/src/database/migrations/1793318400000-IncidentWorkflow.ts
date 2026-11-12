import type { MigrationInterface, QueryRunner } from 'typeorm';
export class IncidentWorkflow1793318400000 implements MigrationInterface {
  name = 'IncidentWorkflow1793318400000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`ALTER TABLE workplace_incidents
      ADD COLUMN reference_number varchar(40) GENERATED ALWAYS AS ('INC-' || upper(id::text)) STORED UNIQUE,
      ADD COLUMN report_source varchar(30) NOT NULL DEFAULT 'EMPLOYEE_REPORTED',
      ADD COLUMN incident_time time,
      ADD COLUMN remarks text NOT NULL DEFAULT '',
      ADD COLUMN case_status varchar(30),
      ADD COLUMN case_started_at timestamptz,
      ADD COLUMN resolved_at timestamptz,
      ADD COLUMN resolved_by varchar(100) REFERENCES users(id),
      ADD COLUMN resolution_summary text,
      ADD COLUMN closed_at timestamptz;
    ALTER TABLE workplace_incidents DROP CONSTRAINT workplace_incidents_status_check;
    UPDATE workplace_incidents t SET
      report_source=CASE WHEN EXISTS(SELECT 1 FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='CREATED' AND ev.details->>'actorRole' IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER')) THEN 'MANAGEMENT_REPORTED'
        WHEN EXISTS(SELECT 1 FROM users u WHERE u.id=t.reporter_id AND u.employee_id=t.employee_id) THEN 'SELF_REPORTED' ELSE 'EMPLOYEE_REPORTED' END,
      case_status=CASE WHEN t.status IN ('DISCIPLINARY_REVIEW','NOTICE_ISSUED','AWAITING_RESPONSE','DECISION_PENDING') THEN t.status WHEN t.status='CLOSED' AND EXISTS(SELECT 1 FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='NOTICE') THEN 'CLOSED' END,
      case_started_at=(SELECT min(ev.created_at) FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='ESCALATE'),
      closed_at=CASE WHEN t.status='CLOSED' THEN t.updated_at END;
    UPDATE workplace_incidents SET status='UNDER_REVIEW' WHERE status IN ('DISCIPLINARY_REVIEW','NOTICE_ISSUED','AWAITING_RESPONSE','DECISION_PENDING');
    ALTER TABLE workplace_incidents ADD CONSTRAINT workplace_incidents_status_check CHECK(status IN ('SUBMITTED','UNDER_REVIEW','DETAILS_REQUESTED','ESCALATED','RESOLVED','CLOSED')),
      ADD CONSTRAINT workplace_incidents_case_status_check CHECK(case_status IS NULL OR case_status IN ('DISCIPLINARY_REVIEW','NOTICE_ISSUED','AWAITING_RESPONSE','DECISION_PENDING','CLOSED')),
      ADD CONSTRAINT workplace_incidents_source_check CHECK(report_source IN ('SELF_REPORTED','MANAGEMENT_REPORTED','EMPLOYEE_REPORTED'));
    CREATE INDEX workplace_incidents_queue ON workplace_incidents(branch_id,status,created_at DESC);
    CREATE TABLE work_mail_outbox (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), notification_id text NOT NULL UNIQUE,
      user_id varchar(100) NOT NULL REFERENCES users(id), incident_id uuid NOT NULL REFERENCES workplace_incidents(id),
      reference_number varchar(40) NOT NULL, category varchar(40) NOT NULL, status varchar(30) NOT NULL,
      attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
      sent_at timestamptz, failure varchar(40), created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX work_mail_pending ON work_mail_outbox(available_at) WHERE sent_at IS NULL;`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve incident workflow history with a forward migration.',
    );
  }
}
