import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ModuleAccess1793836800000 implements MigrationInterface {
  name = 'ModuleAccess1793836800000';
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE user_module_permissions (
      user_id varchar(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_key varchar(160) NOT NULL,
      effect varchar(10) NOT NULL CHECK (effect IN ('ALLOW','DENY')),
      updated_by varchar(100) NOT NULL REFERENCES users(id),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(user_id, permission_key)
    )`);
    await runner.query('CREATE INDEX idx_user_module_permissions_key ON user_module_permissions(permission_key)');
    await runner.query('CREATE INDEX idx_user_module_permissions_updated_at ON user_module_permissions(updated_at)');
    await runner.query(`CREATE TABLE user_module_permission_audit (
      id varchar(100) PRIMARY KEY,
      actor_user_id varchar(100) NOT NULL REFERENCES users(id),
      target_user_id varchar(100) NOT NULL REFERENCES users(id),
      branch_id varchar(100) REFERENCES branches(id) ON DELETE SET NULL,
      permission_key varchar(160) NOT NULL,
      old_value varchar(10) CHECK (old_value IS NULL OR old_value IN ('ALLOW','DENY')),
      new_value varchar(10) CHECK (new_value IS NULL OR new_value IN ('ALLOW','DENY')),
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await runner.query('CREATE INDEX idx_user_module_permission_audit_target_created ON user_module_permission_audit(target_user_id,created_at DESC)');
  }
  async down(): Promise<void> { throw new Error('Use a forward migration to preserve module access decisions.'); }
}
