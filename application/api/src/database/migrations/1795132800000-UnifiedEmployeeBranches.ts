import type { MigrationInterface, QueryRunner } from 'typeorm';

// All authorization consumers read this view. Linked accounts derive their
// branch scope from the employee; legacy grants only support unlinked accounts.
export const employeeBranchAccessView = `CREATE OR REPLACE VIEW employee_branch_access AS
  SELECT u.id AS user_id,
    CASE WHEN e.id IS NOT NULL THEN
      CASE WHEN e.employment->>'allWorkBranches'='true' THEN 'ALL'
           WHEN jsonb_typeof(e.employment->'workBranchIds')='array' THEN 'SELECTED'
           ELSE 'ASSIGNED' END
      ELSE COALESCE(a.mode,'ASSIGNED') END AS mode,
    CASE WHEN e.id IS NOT NULL THEN
      CASE WHEN e.employment->>'allWorkBranches'='true' THEN ARRAY[]::text[]
           WHEN jsonb_typeof(e.employment->'workBranchIds')='array'
             THEN ARRAY(SELECT jsonb_array_elements_text(e.employment->'workBranchIds'))
           ELSE ARRAY[e.branch_id]::text[] END
      ELSE COALESCE(a.branch_ids,ARRAY[]::text[]) END AS branch_ids
  FROM users u LEFT JOIN employees e ON e.id=u.employee_id
  LEFT JOIN user_branch_access a ON a.user_id=u.id`;

export class UnifiedEmployeeBranches1795132800000 implements MigrationInterface {
  name = 'UnifiedEmployeeBranches1795132800000';
  async up(r: QueryRunner): Promise<void> {
    await r.query(
      'LOCK TABLE employees,users,user_branch_access,branches IN SHARE ROW EXCLUSIVE MODE',
    );
    const [backup] = (await r.query(
      "SELECT to_regclass('employee_branch_unification_backup') IS NOT NULL AS exists",
    )) as { exists: boolean }[];
    if (!backup.exists) {
      // Retain the old values before reconciling a linked administrator. Existing
      // effective access wins over conflicting metadata: never union grants.
      await r.query(`CREATE TABLE employee_branch_unification_backup AS
      SELECT e.id AS employee_id, e.branch_id, e.employment,
        u.id AS user_id, u.branch_id AS account_branch_id,
        a.mode AS legacy_mode,a.branch_ids AS legacy_branch_ids
      FROM employees e LEFT JOIN users u ON u.employee_id=e.id
      LEFT JOIN user_branch_access a ON a.user_id=u.id`);
      await r.query(`WITH resolved AS (
      SELECT e.id,
        (a.mode='ALL' OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND u.role='HR_ADMIN' AND u.branch_id IS NULL) AS all_branches,
        CASE WHEN a.mode='SELECTED' THEN a.branch_ids ELSE
          ARRAY(SELECT b.id::text FROM branches b WHERE b.status='ACTIVE'
            AND (b.id=u.branch_id OR b.manager_user_id=u.id) ORDER BY b.id) END AS ids
      FROM employees e JOIN users u ON u.employee_id=e.id AND u.role IN ('HR_ADMIN','BRANCH_MANAGER')
      LEFT JOIN user_branch_access a ON a.user_id=u.id
    ) UPDATE employees e SET employment=COALESCE(e.employment,'{}'::jsonb) ||
      jsonb_build_object('allWorkBranches',COALESCE(r.all_branches,false),
        'workBranchIds',CASE WHEN r.all_branches THEN '[]'::jsonb ELSE to_jsonb(r.ids) END)
      FROM resolved r WHERE e.id=r.id`);
      await r.query(`UPDATE employees SET employment=COALESCE(employment,'{}'::jsonb) ||
      jsonb_build_object('allWorkBranches',false,'workBranchIds',jsonb_build_array(branch_id))
      WHERE NOT COALESCE(employment,'{}'::jsonb) ? 'workBranchIds'
        AND NOT COALESCE(employment,'{}'::jsonb) ? 'allWorkBranches'`);
    }
    await r.query(employeeBranchAccessView);
    await r.query(`UPDATE users u SET branch_id=e.branch_id FROM employees e
      WHERE u.employee_id=e.id AND u.role<>'SUPER_ADMIN' AND u.branch_id IS DISTINCT FROM e.branch_id`);
    await r.query(`CREATE OR REPLACE FUNCTION enforce_employee_primary_branch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.role='SUPER_ADMIN' THEN NEW.branch_id:=NULL;
        ELSIF NEW.employee_id IS NOT NULL THEN
          SELECT branch_id INTO NEW.branch_id FROM employees WHERE id=NEW.employee_id;
        END IF;
        RETURN NEW;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='users_employee_primary_branch' AND tgrelid='users'::regclass) THEN
          CREATE TRIGGER users_employee_primary_branch BEFORE INSERT OR UPDATE OF employee_id,branch_id,role ON users
            FOR EACH ROW EXECUTE FUNCTION enforce_employee_primary_branch();
        END IF;
      END $$;
      CREATE OR REPLACE FUNCTION sync_employee_primary_branch() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        UPDATE users SET branch_id=NEW.branch_id WHERE employee_id=NEW.id AND role<>'SUPER_ADMIN'
          AND branch_id IS DISTINCT FROM NEW.branch_id;
        RETURN NEW;
      END $$;
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='employees_primary_branch' AND tgrelid='employees'::regclass) THEN
          CREATE TRIGGER employees_primary_branch AFTER UPDATE OF branch_id ON employees
            FOR EACH ROW WHEN (OLD.branch_id IS DISTINCT FROM NEW.branch_id) EXECUTE FUNCTION sync_employee_primary_branch();
        END IF;
      END $$`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Unified employee assignments require a reviewed data rollback; the original values are preserved in employee_branch_unification_backup.',
    );
  }
}
