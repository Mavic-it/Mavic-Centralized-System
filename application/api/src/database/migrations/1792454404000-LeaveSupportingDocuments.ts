import type { MigrationInterface, QueryRunner } from 'typeorm';
export class LeaveSupportingDocuments1792454404000 implements MigrationInterface {
  name = 'LeaveSupportingDocuments1792454404000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE leave_request_documents (
      request_id varchar(100) PRIMARY KEY REFERENCES leave_requests(id) ON DELETE CASCADE,
      file_name varchar(200) NOT NULL, mime_type varchar(100) NOT NULL,
      file_data bytea NOT NULL CHECK (octet_length(file_data) BETWEEN 1 AND 5242880),
      uploaded_by varchar(100) NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Use a forward migration to preserve leave supporting documents.',
    );
  }
}
