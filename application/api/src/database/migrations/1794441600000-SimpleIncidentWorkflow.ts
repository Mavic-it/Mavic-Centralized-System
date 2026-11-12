import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SimpleIncidentWorkflow1794441600000 implements MigrationInterface {
  name = 'SimpleIncidentWorkflow1794441600000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE incident_disciplinary_authority (
      user_id varchar(100) PRIMARY KEY REFERENCES users(id),
      granted_by varchar(100) NOT NULL REFERENCES users(id),
      granted_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE workplace_incidents DROP CONSTRAINT workplace_incidents_status_check;
    ALTER TABLE workplace_incidents ADD CONSTRAINT workplace_incidents_status_check
      CHECK(status IN ('SUBMITTED','UNDER_REVIEW','DETAILS_REQUESTED','ESCALATED','RESOLVED','CLOSED','WITHDRAWN','DISMISSED'));`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Preserve incident decisions and authority audit with a forward migration.',
    );
  }
}
