import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ModuleAccessLevels1794009600000 implements MigrationInterface {
  name = 'ModuleAccessLevels1794009600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE user_module_permissions DROP CONSTRAINT IF EXISTS user_module_permissions_effect_check',
    );
    // Preserve the behavior of earlier ALLOW overrides as full role-bounded edit access.
    await queryRunner.query(
      "UPDATE user_module_permissions SET effect='EDIT' WHERE effect='ALLOW'",
    );
    await queryRunner.query(`
      ALTER TABLE user_module_permissions
      ADD CONSTRAINT user_module_permissions_effect_check
      CHECK (effect IN ('VIEW','EDIT','DENY'))
    `);

    await queryRunner.query(
      'ALTER TABLE user_module_permission_audit DROP CONSTRAINT IF EXISTS user_module_permission_audit_old_value_check',
    );
    await queryRunner.query(
      'ALTER TABLE user_module_permission_audit DROP CONSTRAINT IF EXISTS user_module_permission_audit_new_value_check',
    );
    await queryRunner.query(`
      ALTER TABLE user_module_permission_audit
      ADD CONSTRAINT user_module_permission_audit_old_value_check
      CHECK (old_value IS NULL OR old_value IN ('ALLOW','VIEW','EDIT','DENY'))
    `);
    await queryRunner.query(`
      ALTER TABLE user_module_permission_audit
      ADD CONSTRAINT user_module_permission_audit_new_value_check
      CHECK (new_value IS NULL OR new_value IN ('ALLOW','VIEW','EDIT','DENY'))
    `);
  }

  async down(): Promise<void> {
    // Keep user access decisions; reverting access levels could grant unintended edit rights.
  }
}
