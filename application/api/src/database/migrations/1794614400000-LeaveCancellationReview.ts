import type { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveCancellationReview1794614400000 implements MigrationInterface {
  name = 'LeaveCancellationReview1794614400000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`CREATE TABLE leave_cancellation_reviews (
      id uuid PRIMARY KEY,
      request_id uuid NOT NULL REFERENCES leave_requests(id) ON DELETE RESTRICT,
      origin varchar(10) NOT NULL CHECK (origin IN ('EMPLOYEE','REVIEWER')),
      status varchar(20) NOT NULL CHECK (status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW','CLOSED','REJECTED')),
      reason varchar(1000) NOT NULL,
      response varchar(1000),
      proposed_start date,
      proposed_end date,
      replacement_request_id uuid REFERENCES leave_requests(id) ON DELETE RESTRICT,
      initiated_by varchar(100) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      resolved_by varchar(100) REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((proposed_start IS NULL AND proposed_end IS NULL) OR (proposed_start IS NOT NULL AND proposed_end >= proposed_start))
    )`);
    await r.query(
      `CREATE UNIQUE INDEX leave_cancellation_one_open_idx ON leave_cancellation_reviews(request_id) WHERE status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW')`,
    );
    await r.query(
      `CREATE INDEX leave_cancellation_request_idx ON leave_cancellation_reviews(request_id,created_at DESC)`,
    );
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Retain cancellation review history; resolve open reviews through the leave workflow.',
      ),
    );
  }
}
