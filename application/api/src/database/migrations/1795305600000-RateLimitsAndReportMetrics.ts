import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Shared rate limits and durable reporting events. Existing business tables are reused. */
export class RateLimitsAndReportMetrics1795305600000 implements MigrationInterface {
  name = 'RateLimitsAndReportMetrics1795305600000';

  async up(r: QueryRunner): Promise<void> {
    await r.query(`
      CREATE TABLE IF NOT EXISTS api_rate_limit (
        bucket_key char(64) PRIMARY KEY,
        request_count integer NOT NULL CHECK (request_count >= 0),
        expires_at timestamptz NOT NULL
      );
      CREATE INDEX IF NOT EXISTS api_rate_limit_expiry_idx ON api_rate_limit(expires_at);

      CREATE TABLE IF NOT EXISTS report_metrics (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        branch_id varchar(100) NOT NULL REFERENCES branches(id),
        module varchar(100) NOT NULL,
        label varchar(500) NOT NULL,
        amount numeric(18, 4) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS report_metrics_branch_created_idx
        ON report_metrics(branch_id, created_at DESC);
    `);
  }

  async down(r: QueryRunner): Promise<void> {
    await r.query('DROP TABLE IF EXISTS report_metrics');
    await r.query('DROP TABLE IF EXISTS api_rate_limit');
  }
}
