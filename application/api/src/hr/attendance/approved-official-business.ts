import type { EntityManager } from 'typeorm';
import type { ApprovedOb } from './official-business/ob.types.js';
import { ConflictException } from '@nestjs/common';
export async function obInstalled(m: Pick<EntityManager, 'query'>) {
  const [r] = await m.query(
    `SELECT to_regclass('attendance_ob_requests') AS name`,
  );
  return Boolean(r?.name);
}
export type ObSummary = {
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string;
  workDate: string;
  status: string;
  destination: string;
  start: string;
  end: string;
  cancellationPending: boolean;
};
export async function officialBusinessSummaries(
  m: Pick<EntityManager, 'query'>,
  from: string,
  to: string,
  branchId?: string,
  employeeId?: string,
): Promise<ObSummary[]> {
  if (!(await obInstalled(m))) return [];
  return m.query<ObSummary[]>(
    `SELECT r.id,r.employee_id AS "employeeId",e.name AS "employeeName",r.branch_id AS "branchId",b.name AS "branchName",r.work_date::text AS "workDate",r.status,r.destination,r.starts_at AS start,r.ends_at AS end,r.cancellation_pending AS "cancellationPending" FROM attendance_ob_requests r JOIN employees e ON e.id=r.employee_id JOIN branches b ON b.id=r.branch_id WHERE r.status IN ('PENDING','APPROVED') AND r.work_date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR r.branch_id=$3) AND ($4::text IS NULL OR r.employee_id=$4) ORDER BY r.starts_at,r.id`,
    [from, to, branchId ?? null, employeeId ?? null],
  );
}
export async function assertNoOfficialBusiness(
  m: Pick<EntityManager, 'query'>,
  employeeId: string,
  from: string,
  to: string,
) {
  if (!(await obInstalled(m))) return;
  const rows = await m.query(
    `SELECT id FROM attendance_ob_requests WHERE employee_id=$1 AND work_date BETWEEN $2::date AND $3::date AND status='APPROVED' LIMIT 1`,
    [employeeId, from, to],
  );
  if (rows.length)
    throw new ConflictException(
      'Approved Official Business exists on these dates. Resolve it before approving leave.',
    );
}
// Safe on installations rolling out the additive OB migration separately.
export async function approvedOfficialBusiness(
  m: EntityManager,
  employeeId: string,
  branchId: string,
  on: string,
): Promise<ApprovedOb[]> {
  const [installed] = await m.query(
    `SELECT to_regclass('attendance_ob_requests') AS name`,
  );
  if (!installed?.name) return [];
  return m.query<ApprovedOb[]>(
    `SELECT id,starts_at AS start,ends_at AS end,destination,office_continuity AS "officeContinuity",schedule FROM attendance_ob_requests WHERE employee_id=$1 AND branch_id=$2 AND work_date=$3::date AND status='APPROVED' ORDER BY starts_at,id`,
    [employeeId, branchId, on],
  );
}
