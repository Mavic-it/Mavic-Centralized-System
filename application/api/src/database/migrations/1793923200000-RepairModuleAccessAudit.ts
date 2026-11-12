import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Restores the audit relation when an installation recorded ModuleAccess before creating it. */
export class RepairModuleAccessAudit1793923200000 implements MigrationInterface {
  name = 'RepairModuleAccessAudit1793923200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_module_permission_audit (
        id varchar(100) PRIMARY KEY,
        actor_user_id varchar(100) NOT NULL REFERENCES users(id),
        target_user_id varchar(100) NOT NULL REFERENCES users(id),
        branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL,
        permission_key varchar(160) NOT NULL,
        old_value varchar(10) CHECK (old_value IS NULL OR old_value IN ('ALLOW','DENY')),
        new_value varchar(10) CHECK (new_value IS NULL OR new_value IN ('ALLOW','DENY')),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS idx_user_module_permission_audit_target_created ON user_module_permission_audit(target_user_id,created_at DESC)',
    );
  }

  async down(): Promise<void> {
    // Keep audit history if the application is rolled back.
  }
}
