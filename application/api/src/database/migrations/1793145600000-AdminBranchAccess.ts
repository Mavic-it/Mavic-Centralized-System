import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AdminBranchAccess1793145600000 implements MigrationInterface {
  name = 'AdminBranchAccess1793145600000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE user_branch_access (
      user_id varchar(100) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mode varchar(20) NOT NULL CHECK (mode IN ('ASSIGNED','SELECTED','ALL')),
      branch_ids text[] NOT NULL DEFAULT '{}',
      updated_by varchar(100) NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((mode='SELECTED' AND cardinality(branch_ids)>0) OR (mode<>'SELECTED' AND cardinality(branch_ids)=0))
    )`);
  }
  async down(): Promise<void> { throw new Error('Use a forward migration to preserve administrator access settings.'); }
}
