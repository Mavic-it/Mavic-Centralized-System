import { BadRequestException } from '@nestjs/common';
import { inquiryReportingSource } from '../crm/inquiries/inquiry-reporting.js';
import type { DataSource } from 'typeorm';
import type { AnalyticsCategory, AnalyticsQuery } from './analytics.dto.js';
import type { AggregateRow } from './analytics.types.js';

type Source = { sql: string; snapshot?: boolean; overlap?: boolean; description: string; countLabel: string; amountLabel?: string; attentionLabel?: string };
const ready = `NOT a.dtr_stale AND COALESCE((a.dtr_data->'calculation'->>'payrollReady')::boolean,false)`;
export const sources: Partial<Record<AnalyticsCategory, Source>> = {
  inquiries: { countLabel:'Inquiries',amountLabel:'Verified conversions',attentionLabel:'New or awaiting response',description:'Inquiry-date cohort by handling branch; archived inquiries excluded. Legacy reserved outcomes never count as verified conversions. Services and preferred branches do not multiply records.',sql:inquiryReportingSource },
  workforce: {
    snapshot: true, countLabel: 'Employees', attentionLabel: 'Hired in period',
    description: 'Current distinct employee records by primary branch. Hiring uses the employment start date; this is not historical headcount.',
    sql: `SELECT e.branch_id,e.status,NULL::date AS event_date,0::numeric AS amount,
      CASE WHEN e.employment->>'startDate' BETWEEN $2::text AND $3::text THEN 1 ELSE 0 END AS attention FROM employees e`,
  },
  reservations: {
    countLabel: 'Reservations', attentionLabel: 'Pending reservations',
    description: 'Reservations starting within the selected Manila dates, including cancelled, rejected and no-show records.',
    sql: `SELECT r.branch_id,r.status,(r.start_date_time AT TIME ZONE 'Asia/Manila')::date AS event_date,0::numeric AS amount,
      CASE WHEN r.status='PENDING' THEN 1 ELSE 0 END AS attention FROM reservations r
      WHERE r.start_date_time >= ($2::date::timestamp AT TIME ZONE 'Asia/Manila') AND r.start_date_time < (($3::date+1)::timestamp AT TIME ZONE 'Asia/Manila')`,
  },
  spaces: {
    snapshot: true, countLabel: 'Active spaces', attentionLabel: 'Unavailable spaces',
    description: 'Active spaces now. Maintenance or a current block takes precedence, then checked-in, then pending/confirmed reservations. Availability is a space count, not capacity utilization.',
    sql: `SELECT room.branch_id,CASE WHEN room.status IN ('MAINTENANCE','INACTIVE') OR EXISTS(SELECT 1 FROM reservation_space_blocks b WHERE b.room_id=room.id AND b.start_at<=now() AND b.end_at>now()) THEN 'UNAVAILABLE'
      WHEN EXISTS(SELECT 1 FROM reservations r WHERE r.room_id=room.id AND r.status='CHECKED_IN' AND r.start_date_time<=now() AND r.end_date_time>now()) THEN 'OCCUPIED'
      WHEN EXISTS(SELECT 1 FROM reservations r WHERE r.room_id=room.id AND r.status IN ('PENDING','CONFIRMED') AND r.start_date_time<=now() AND r.end_date_time>now()) THEN 'RESERVED' ELSE 'AVAILABLE' END AS status,
      NULL::date AS event_date,0::numeric AS amount,0 AS attention FROM rooms room WHERE room.is_active`,
  },
  attendance: {
    countLabel: 'Recorded employee-days', amountLabel: 'Approved overtime hours', attentionLabel: 'Records needing review',
    description: 'Existing calculated DTR rows only, using work date and current employee branch. Stale or non-payroll-ready rows need review. Missing rows are not inferred as absences. Status order: review, absence, late, present, leave, rest day, other.',
    sql: `SELECT a.branch_id,a.work_date AS event_date,CASE WHEN NOT (${ready}) THEN 'NEEDS_REVIEW'
      WHEN COALESCE((a.dtr_data->'calculation'->>'absent')::numeric,0)>0 THEN 'CALCULATED_ABSENCE'
      WHEN COALESCE((a.dtr_data->'calculation'->>'lateMinutes')::numeric,0)>0 THEN 'LATE'
      WHEN a.dtr_data->'calculation'->'statuses' ? 'Present' THEN 'PRESENT'
      WHEN COALESCE((a.dtr_data->'calculation'->>'leaveUnits')::numeric,0)>0 THEN 'ON_LEAVE'
      WHEN (a.dtr_data->'calculation'->>'restDay')::boolean THEN 'REST_DAY' ELSE 'OTHER' END AS status,
      CASE WHEN ${ready} THEN COALESCE((a.dtr_data->'calculation'->>'approvedOtMinutes')::numeric,0)/60 ELSE 0 END AS amount,
      CASE WHEN ${ready} THEN 0 ELSE 1 END AS attention FROM attendance_records a JOIN employees e ON e.id=a.employee_id AND e.branch_id=a.branch_id WHERE a.dtr_data IS NOT NULL`,
  },
  leave: {
    overlap: true, countLabel: 'Leave requests', amountLabel: 'Approved leave days in period', attentionLabel: 'Pending requests',
    description: 'Requests overlapping the period, grouped by start date. Approved day units include only work dates inside the period; reasons and credit balances are excluded.',
    sql: `SELECT r.branch_id,r.status,r.start_date AS event_date,
      CASE WHEN r.status='APPROVED' THEN COALESCE((SELECT sum(d.units) FROM leave_request_days d WHERE d.request_id=r.id AND d.work_date BETWEEN $2::date AND $3::date),0) ELSE 0 END AS amount,
      CASE WHEN r.status='PENDING' THEN 1 ELSE 0 END AS attention FROM leave_requests r WHERE r.end_date >= $2::date AND r.start_date <= $3::date`,
  },
  'official-business': {
    countLabel: 'Official business requests', attentionLabel: 'Pending requests',
    description: 'Filed official business requests by work date and current status. Approval does not imply overtime.',
    sql: `SELECT branch_id,status,work_date AS event_date,0::numeric AS amount,CASE WHEN status='PENDING' THEN 1 ELSE 0 END AS attention FROM attendance_ob_requests`,
  },
  inventory: {
    snapshot: true, countLabel: 'Stock locations', attentionLabel: 'Low or out of stock',
    description: 'Current non-archived item/branch/storage-location balances. Active items are low stock when available quantity is positive and at or below the catalog reorder threshold; zero is out of stock.',
    sql: `SELECT b.branch_id,CASE WHEN i.status<>'ACTIVE' THEN 'INACTIVE' WHEN b.on_hand-b.reserved-b.quarantined=0 THEN 'OUT_OF_STOCK' WHEN b.on_hand-b.reserved-b.quarantined<=i.reorder_threshold THEN 'LOW_STOCK' ELSE 'IN_STOCK' END AS status,
      NULL::date AS event_date,0::numeric AS amount,CASE WHEN i.status='ACTIVE' AND b.on_hand-b.reserved-b.quarantined<=i.reorder_threshold THEN 1 ELSE 0 END AS attention
      FROM inventory_balances b JOIN inventory_catalog_items i ON i.id=b.item_id WHERE i.status<>'ARCHIVED'`,
  },
  movements: {
    countLabel: 'Stock movements', description: 'Posted inventory movement counts by creation date and movement type. Quantities of unlike units are not added together.',
    sql: `SELECT branch_id,movement_type AS status,(created_at AT TIME ZONE 'Asia/Manila')::date AS event_date,0::numeric AS amount,0 AS attention FROM inventory_movements`,
  },
  assets: {
    snapshot: true, countLabel: 'Registered assets', description: 'Current asset records by branch and stored status; no historical condition is inferred.',
    sql: `SELECT branch_id,status,NULL::date AS event_date,0::numeric AS amount,0 AS attention FROM assets`,
  },
  accounts: {
    snapshot: true, countLabel: 'Accounts', description: 'Current accounts with an authorized primary branch. HR and branch managers see employee/staff accounts only. Unassigned accounts are excluded from branch totals.',
    sql: `SELECT COALESCE(e.branch_id,u.branch_id) AS branch_id,u.status,NULL::date AS event_date,0::numeric AS amount,0 AS attention FROM users u LEFT JOIN employees e ON e.id=u.employee_id WHERE ($6::text IN ('SUPER_ADMIN','IT_ADMIN') OR u.role IN ('EMPLOYEE','STAFF'))`,
  },
  branches: {
    snapshot: true, countLabel: 'Active branches', description: 'Active branches in the current authorized scope.',
    sql: `SELECT id AS branch_id,status,NULL::date AS event_date,0::numeric AS amount,0 AS attention FROM branches WHERE is_active`,
  },
};

export async function sourceRows(db: Pick<DataSource, 'query'>, id: AnalyticsCategory, branchIds: string[], q: AnalyticsQuery & { from: string; to: string }, role: string): Promise<AggregateRow[]> {
  const source = sources[id];
  if (!source) throw new BadRequestException('Unsupported report category.');
  const rows = await db.query<AggregateRow[]>(`WITH source AS (${source.sql})
    SELECT ${source.snapshot ? "'Current'::text" : "to_char(date_trunc($4::text,s.event_date::timestamp),'YYYY-MM-DD')"} AS period,
      b.id AS "branchId",b.name AS branch,s.status,count(*)::int AS count,COALESCE(sum(s.amount),0)::float8 AS amount,
      ${id === 'spaces' ? "count(*) FILTER(WHERE s.status='UNAVAILABLE')" : 'COALESCE(sum(s.attention),0)'}::int AS attention
    FROM source s JOIN branches b ON b.id=s.branch_id WHERE b.is_active AND b.id=ANY($1::text[])
      AND ${source.snapshot || source.overlap ? '$2::date <= $3::date' : 's.event_date BETWEEN $2::date AND $3::date'}
      AND $4::text IS NOT NULL AND ($5::text IS NULL OR s.status=$5) AND $6::text IS NOT NULL
    GROUP BY 1,b.id,b.name,s.status ORDER BY 1,b.name,b.id,s.status LIMIT 5001`,
    [branchIds, q.from, q.to, q.grouping, q.status || null, role]);
  if (rows.length > 5000) throw new BadRequestException('Narrow the branch/date filters or use a larger grouping interval (maximum 5,000 aggregate rows per module).');
  return rows.map(r => ({ ...r, count: Number(r.count), amount: Number(r.amount), attention: Number(r.attention) }));
}
