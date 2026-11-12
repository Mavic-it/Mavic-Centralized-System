import type { EntityManager } from 'typeorm';

export const DEFAULT_DEPARTMENTS = [
  'Executive Department',
  'Admin',
  'Marketing',
  'Accounting',
  'IT',
  'Maintenance',
] as const;

export async function seedDefaultDepartments(
  manager: Pick<EntityManager, 'query'>,
  branchId: string,
) {
  await manager.query(
    `INSERT INTO departments (id, branch_id, name)
     SELECT md5(b.id || ':default:' || lower(d.name)), b.id, d.name
     FROM branches b CROSS JOIN unnest($2::text[]) AS d(name)
     WHERE b.id = $1 ON CONFLICT DO NOTHING`,
    [branchId, [...DEFAULT_DEPARTMENTS]],
  );
}
