import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { calculateDtr } from './dtr.calculator.js';
import type { DtrData } from './dtr.types.js';
import { approvedOfficialBusiness } from './approved-official-business.js';
export async function approvedLeave(
  m: EntityManager,
  employeeId: string,
  branchId: string,
  on: string,
) {
  const [r] = await m.query<
    Array<{ units: number; paid: number; codes: string[] }>
  >(
    `SELECT COALESCE(sum(d.units),0)::float8 AS units,COALESCE(sum(d.units) FILTER(WHERE (r.policy->>'paid')::boolean),0)::float8 AS paid,array_agg(DISTINCT t.code) AS codes FROM leave_request_days d JOIN leave_requests r ON r.id=d.request_id AND r.status='APPROVED' JOIN leave_types t ON t.id=r.type_id WHERE d.employee_id=$1 AND d.branch_id=$2 AND d.work_date=$3::date`,
    [employeeId, branchId, on],
  );
  return {
    leaveUnits: r.units,
    paidLeaveUnits: r.paid,
    leaveTypes: r.codes ?? [],
  };
}
export async function synchronizeApprovedLeave(
  m: EntityManager,
  employeeId: string,
  branchId: string,
  from: string,
  to: string,
) {
  await lockLeaveDtr(m, branchId);
  const locked = await m.query(
    `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('APPROVED','LOCKED') AND date_from<=$3::date AND date_to>=$2::date LIMIT 1`,
    [branchId, from, to],
  );
  if (locked.length)
    throw new ConflictException(
      'Reopen the approved or locked DTR period before changing leave.',
    );
  const rows = await m.query<
    Array<{ id: string; date: string; data: DtrData }>
  >(
    `SELECT id,work_date::text AS date,dtr_data AS data FROM attendance_records WHERE employee_id=$1 AND branch_id=$2 AND work_date BETWEEN $3::date AND $4::date AND dtr_data IS NOT NULL FOR UPDATE`,
    [employeeId, branchId, from, to],
  );
  for (const row of rows) {
    const data = row.data;
    const leave = await approvedLeave(m, employeeId, branchId, row.date);
    const calculation = calculateDtr({
      workDate: row.date,
      sources: data.source,
      schedule: data.calculation.schedule,
      policy: data.policy,
      pairing: data.pairing,
      override: data.override,
      active: true,
      holiday: data.calculation.holiday,
      ...leave,
      officialBusiness: await approvedOfficialBusiness(m,employeeId,branchId,row.date),
    });
    const next = {
      ...data,
      calculation,
      revision: data.revision + 1,
      approval: 'DRAFT',
    };
    await m.query(
      `UPDATE attendance_records SET dtr_data=$2::jsonb,dtr_stale=false,status=$3,updated_at=now() WHERE id=$1`,
      [
        row.id,
        JSON.stringify(next),
        calculation.absent
          ? 'ABSENT'
          : calculation.restDay
            ? 'REST_DAY'
            : 'RECORDED',
      ],
    );
  }
}
// Share the DTR import/approval/export lock so leave cannot race period locking.
export async function lockLeaveDtr(m: EntityManager, branchId: string) {
  await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `DTR:${branchId}`,
  ]);
}
