import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { officialBusinessSummaries, type ObSummary } from './approved-official-business.js';
import {
  workScheduleValidationError,
  type AttendanceSchedule,
  type EffectiveEmployeeWorkSchedule,
  type EmployeeWorkScheduleHistoryRecord,
  type WorkScheduleDefinition,
} from './attendance.types.js';

export type { AttendanceSchedule } from './attendance.types.js';

export type AttendanceRecord = {
  dtrCalculation?: import('./dtr.types.js').DtrCalculation;
  dtrApproval?: string;
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string | null;
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  source: 'MANUAL' | 'BIOMETRIC' | 'IMPORT' | 'API' | 'LEAVE' | 'OB';
  officialBusiness?: ObSummary[];
  status: string;
  leaveType?: string;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  originalTimeIn: string | null;
  originalTimeOut: string | null;
  overtimeApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
  overtimeApprovalMinutes: number | null;
};

export type AttendanceWorkRosterDay = {
  officialBusiness?: ObSummary[];
  workDate: string;
  dayType: 'WORK' | 'REST_DAY';
  shiftStart: string | null;
  shiftEnd: string | null;
  baseShiftStart: string | null;
  baseShiftEnd: string | null;
  assignmentLabel: string | null;
  hasSchedule: boolean;
  approvedLeave: { units: number; codes: string[] } | null;
};

export type AttendanceWorkRosterEmployee = {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  days: AttendanceWorkRosterDay[];
};

export type AttendanceWorkRosterInput = {
  branchId: string;
  weekStart: string;
  employees: Array<{
    employeeId: string;
    days: Array<{
      workDate: string;
      dayType: 'WORK' | 'REST_DAY';
      shiftStart?: string | null;
      shiftEnd?: string | null;
      assignmentLabel?: string | null;
    }>;
  }>;
};

export type AttendanceFilters = {
  approvedDtrOnly?: boolean;
  employeeId?: string;
  branchId?: string;
  from?: string;
  to?: string;
};

type RawSchedule = {
  id?: string;
  employeeId?: string;
  workDate?: string;
  branchId: string;
  timeZone: string;
  workDays: number[] | string;
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
  defaultLocation?: string | null;
  effectiveDate?: string | null;
  assignedBy?: string | null;
  assignedByName?: string | null;
  recordedAt?: string;
};

function databaseDateTime(value: unknown): string {
  const parsed = value instanceof Date
    ? value
    : typeof value === 'string' || typeof value === 'number'
      ? new Date(value)
      : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    throw new Error('The database returned an invalid attendance timestamp.');
  }
  return parsed.toISOString();
}

function optionalDatabaseDateTime(value: unknown): string | null {
  return value === null || value === undefined ? null : databaseDateTime(value);
}

function attendanceWeekDates(weekStart: string): string[] {
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== weekStart ||
    date.getUTCDay() !== 1
  ) {
    throw new BadRequestException('Choose a valid Monday as the roster week start.');
  }
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(date);
    day.setUTCDate(date.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export class AttendanceService {
  constructor(private readonly dataSource: DataSource) {}

  async getSchedule(branchId: string): Promise<AttendanceSchedule | undefined> {
    const rows = await this.dataSource.query<RawSchedule[]>(
      `SELECT branch_id AS "branchId", time_zone AS "timeZone",
              work_days AS "workDays", shift_start::text AS "shiftStart",
              shift_end::text AS "shiftEnd", break_minutes AS "breakMinutes",
              grace_minutes AS "graceMinutes", default_location AS "defaultLocation"
       FROM attendance_schedules WHERE branch_id = $1`,
      [branchId],
    );
    return rows[0] ? this.normalizeSchedule(rows[0]) : undefined;
  }

  async getWorkRoster(
    branchId: string,
    weekStart: string,
    employeeId?: string,
  ) {
    const dates = attendanceWeekDates(weekStart);
    const rows = await this.dataSource.query<Array<{
      employeeId: string;
      employeeNumber: string | null;
      name: string;
      workDate: string;
      dayType: 'WORK' | 'REST_DAY';
      shiftStart: string | null;
      shiftEnd: string | null;
      baseShiftStart: string | null;
      baseShiftEnd: string | null;
      assignmentLabel: string | null;
      hasSchedule: boolean;
      leaveUnits: number;
      leaveCodes: string[] | null;
    }>>(
      `WITH requested_dates AS (
         SELECT unnest($2::date[]) AS work_date
       )
       SELECT e.id AS "employeeId", e.employee_number AS "employeeNumber",
              e.name, requested.work_date::text AS "workDate",
              CASE
                WHEN roster.day_type IS NOT NULL THEN roster.day_type
                WHEN COALESCE(employee_schedule.work_days, branch_schedule.work_days) IS NOT NULL
                     AND NOT (EXTRACT(DOW FROM requested.work_date)::smallint = ANY(
                       COALESCE(employee_schedule.work_days, branch_schedule.work_days)
                     )) THEN 'REST_DAY'
                ELSE 'WORK'
              END AS "dayType",
              COALESCE(roster.shift_start::text,
                       employee_schedule.shift_start::text,
                       branch_schedule.shift_start::text) AS "shiftStart",
              COALESCE(roster.shift_end::text,
                       employee_schedule.shift_end::text,
                       branch_schedule.shift_end::text) AS "shiftEnd",
              COALESCE(employee_schedule.shift_start::text,
                       branch_schedule.shift_start::text) AS "baseShiftStart",
              COALESCE(employee_schedule.shift_end::text,
                       branch_schedule.shift_end::text) AS "baseShiftEnd",
              COALESCE(roster.assignment_label, branch_schedule.default_location) AS "assignmentLabel",
              approved_leave.units AS "leaveUnits", approved_leave.codes AS "leaveCodes",
              (COALESCE(employee_schedule.time_zone, branch_schedule.time_zone) IS NOT NULL) AS "hasSchedule"
       FROM employees e
       CROSS JOIN requested_dates requested
       LEFT JOIN LATERAL (
         SELECT time_zone, work_days, shift_start, shift_end
         FROM employee_work_schedule_history
         WHERE employee_id = e.id AND branch_id = $1
           AND effective_date <= requested.work_date
         ORDER BY effective_date DESC, recorded_at DESC
         LIMIT 1
       ) employee_schedule ON true
       LEFT JOIN attendance_schedules branch_schedule ON branch_schedule.branch_id = $1
       LEFT JOIN employee_work_schedule_days roster
         ON roster.employee_id = e.id AND roster.branch_id = $1
        AND roster.work_date = requested.work_date
       LEFT JOIN LATERAL (
         SELECT COALESCE(sum(d.units), 0)::float8 AS units,
                array_agg(DISTINCT t.code ORDER BY t.code) AS codes
         FROM leave_request_days d
         JOIN leave_requests r ON r.id = d.request_id AND r.status = 'APPROVED'
         JOIN leave_types t ON t.id = r.type_id
         WHERE d.employee_id = e.id AND d.branch_id = $1
           AND d.work_date = requested.work_date
       ) approved_leave ON true
       WHERE e.branch_id = $1
         AND (e.status = 'ACTIVE' OR $3::text IS NOT NULL)
         AND ($3::text IS NULL OR e.id::text = $3)
       ORDER BY e.name ASC, requested.work_date ASC`,
      [branchId, dates, employeeId ?? null],
    );
    const employees = new Map<string, AttendanceWorkRosterEmployee>();
    for (const row of rows) {
      const employee = employees.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeNumber: row.employeeNumber,
        name: row.name,
        days: [],
      };
      employee.days.push({
        workDate: String(row.workDate).slice(0, 10),
        dayType: row.dayType,
        shiftStart: row.shiftStart ? String(row.shiftStart).slice(0, 5) : null,
        shiftEnd: row.shiftEnd ? String(row.shiftEnd).slice(0, 5) : null,
        baseShiftStart: row.baseShiftStart ? String(row.baseShiftStart).slice(0, 5) : null,
        baseShiftEnd: row.baseShiftEnd ? String(row.baseShiftEnd).slice(0, 5) : null,
        assignmentLabel: row.assignmentLabel,
        hasSchedule: row.hasSchedule,
        approvedLeave: Number(row.leaveUnits) > 0
          ? { units: Number(row.leaveUnits), codes: row.leaveCodes ?? [] }
          : null,
      });
      employees.set(employee.employeeId, employee);
    }
    const branchRows = await this.dataSource.query<Array<{
      branchName: string;
      defaultLocation: string | null;
    }>>(
      `SELECT b.name AS "branchName", schedule.default_location AS "defaultLocation"
       FROM branches b
       LEFT JOIN attendance_schedules schedule ON schedule.branch_id = b.id
       WHERE b.id = $1`,
      [branchId],
    );
    const ob = await officialBusinessSummaries(this.dataSource,dates[0],dates[6],branchId,employeeId);
    for(const employee of employees.values())for(const day of employee.days)day.officialBusiness=ob.filter(r=>r.employeeId===employee.employeeId&&r.workDate===day.workDate);
    return {
      branchId,
      branchName: branchRows[0]?.branchName ?? branchId,
      defaultLocation: branchRows[0]?.defaultLocation ?? null,
      weekStart,
      dates,
      employees: [...employees.values()],
    };
  }

  async saveWorkRoster(
    input: AttendanceWorkRosterInput,
    actor: { userId: string; ip?: string; userAgent?: string },
  ) {
    const dates = attendanceWeekDates(input.weekStart);
    const dateSet = new Set(dates);
    const employeeIds = input.employees.map((employee) => employee.employeeId);
    if (new Set(employeeIds).size !== employeeIds.length) {
      throw new BadRequestException('An employee can appear only once in the weekly roster.');
    }
    const rowsToSave: Array<{
      id: string;
      employeeId: string;
      workDate: string;
      dayType: 'WORK' | 'REST_DAY';
      shiftStart: string | null;
      shiftEnd: string | null;
      assignmentLabel: string | null;
    }> = [];
    for (const employee of input.employees) {
      if (employee.days.length !== 7 || new Set(employee.days.map((day) => day.workDate)).size !== 7) {
        throw new BadRequestException('Each employee must have one schedule entry for each day of the selected week.');
      }
      for (const day of employee.days) {
        if (!dateSet.has(day.workDate)) {
          throw new BadRequestException('Roster dates must match the selected Monday-to-Sunday week.');
        }
        const shiftStart = day.shiftStart || null;
        const shiftEnd = day.shiftEnd || null;
        if ((shiftStart === null) !== (shiftEnd === null)) {
          throw new BadRequestException('Enter both shift start and shift end, or leave both blank to use the default schedule.');
        }
        if (shiftStart && shiftStart === shiftEnd) {
          throw new BadRequestException('Shift start and end must be different.');
        }
        if (day.dayType === 'REST_DAY' && (shiftStart || shiftEnd)) {
          throw new BadRequestException('Rest days cannot include shift times.');
        }
        const assignmentLabel = day.assignmentLabel?.trim() || null;
        rowsToSave.push({
          id: randomUUID(),
          employeeId: employee.employeeId,
          workDate: day.workDate,
          dayType: day.dayType,
          shiftStart,
          shiftEnd,
          assignmentLabel,
        });
      }
    }

    await this.dataSource.transaction(async (manager) => {
      const branchEmployees = await manager.query<Array<{ id: string }>>(
        `SELECT id FROM employees
         WHERE branch_id = $1 AND status = 'ACTIVE' AND id = ANY($2::varchar[])
         FOR UPDATE`,
        [input.branchId, employeeIds],
      );
      if (branchEmployees.length !== employeeIds.length) {
        throw new BadRequestException('The weekly roster includes an inactive or out-of-branch employee. Refresh the roster and try again.');
      }
      const missingScheduleRows = await manager.query<Array<{ employeeId: string; workDate: string }>>(
        `WITH requested_dates AS (SELECT unnest($2::date[]) AS work_date)
         SELECT e.id AS "employeeId", requested.work_date::text AS "workDate"
         FROM employees e CROSS JOIN requested_dates requested
         LEFT JOIN LATERAL (
           SELECT time_zone FROM employee_work_schedule_history
           WHERE employee_id = e.id AND branch_id = $1
             AND effective_date <= requested.work_date
           ORDER BY effective_date DESC, recorded_at DESC LIMIT 1
         ) employee_schedule ON true
         LEFT JOIN attendance_schedules branch_schedule ON branch_schedule.branch_id = $1
         WHERE e.id = ANY($3::varchar[])
           AND COALESCE(employee_schedule.time_zone, branch_schedule.time_zone) IS NULL`,
        [input.branchId, dates, employeeIds],
      );
      if (missingScheduleRows.length) {
        throw new ConflictException('Configure a branch or employee base schedule before saving the weekly roster.');
      }

      const existingRows = await manager.query<Array<{
        employeeId: string;
        branchId: string;
        workDate: string;
        dayType: 'WORK' | 'REST_DAY';
        shiftStart: string | null;
        shiftEnd: string | null;
        assignmentLabel: string | null;
      }>>(
        `SELECT employee_id AS "employeeId", branch_id AS "branchId",
                work_date::text AS "workDate",
                day_type AS "dayType", shift_start::text AS "shiftStart",
                shift_end::text AS "shiftEnd", assignment_label AS "assignmentLabel"
         FROM employee_work_schedule_days
         WHERE employee_id = ANY($1::varchar[]) AND work_date = ANY($2::date[])
         FOR UPDATE`,
        [employeeIds, dates],
      );
      const existingByKey = new Map(existingRows.map((row) => [
        `${row.employeeId}:${String(row.workDate).slice(0, 10)}`,
        {
          ...row,
          workDate: String(row.workDate).slice(0, 10),
          shiftStart: row.shiftStart ? String(row.shiftStart).slice(0, 5) : null,
          shiftEnd: row.shiftEnd ? String(row.shiftEnd).slice(0, 5) : null,
        },
      ]));
      const changedRows = rowsToSave.filter((row) => {
        const existing = existingByKey.get(`${row.employeeId}:${row.workDate}`);
        return !existing ||
          existing.branchId !== input.branchId ||
          existing.dayType !== row.dayType ||
          existing.shiftStart !== row.shiftStart ||
          existing.shiftEnd !== row.shiftEnd ||
          existing.assignmentLabel !== row.assignmentLabel;
      });
      if (!changedRows.length) return;

      await manager.query(
        `INSERT INTO employee_work_schedule_days
           (id, employee_id, branch_id, work_date, day_type,
            shift_start, shift_end, assignment_label, created_by, updated_by)
         SELECT incoming.id, incoming.employee_id, $2, incoming.work_date,
                incoming.day_type, incoming.shift_start, incoming.shift_end,
                incoming.assignment_label, $3, $3
         FROM jsonb_to_recordset($1::jsonb) AS incoming(
           id varchar, employee_id varchar, work_date date, day_type varchar,
           shift_start time, shift_end time, assignment_label varchar
         )
         ON CONFLICT (employee_id, work_date) DO UPDATE SET
           branch_id = EXCLUDED.branch_id,
           day_type = EXCLUDED.day_type,
           shift_start = EXCLUDED.shift_start,
           shift_end = EXCLUDED.shift_end,
           assignment_label = EXCLUDED.assignment_label,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [
          JSON.stringify(changedRows.map((row) => ({
            id: row.id,
            employee_id: row.employeeId,
            work_date: row.workDate,
            day_type: row.dayType,
            shift_start: row.shiftStart,
            shift_end: row.shiftEnd,
            assignment_label: row.assignmentLabel,
          }))),
          input.branchId,
          actor.userId,
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'UPDATE', 'employee_work_schedule_days', $4, now())`,
        [
          randomUUID(), actor.userId, input.branchId,
          JSON.stringify({
            weekStart: input.weekStart,
            ip: actor.ip,
            userAgent: actor.userAgent,
            changes: changedRows.map((row) => ({
              employeeId: row.employeeId,
              workDate: row.workDate,
              before: existingByKey.get(`${row.employeeId}:${row.workDate}`) ?? null,
              after: {
                branchId: input.branchId,
                dayType: row.dayType,
                shiftStart: row.shiftStart,
                shiftEnd: row.shiftEnd,
                assignmentLabel: row.assignmentLabel,
              },
            })),
          }),
        ],
      );
    });
    return this.getWorkRoster(input.branchId, input.weekStart);
  }

  async getEmployeeWorkSchedule(
    employeeId: string,
    branchId: string,
    historyBranchId: string | null = branchId,
  ): Promise<{
    current: EffectiveEmployeeWorkSchedule | null;
    history: EmployeeWorkScheduleHistoryRecord[];
  }> {
    const assignedRows = await this.dataSource.query<RawSchedule[]>(
      `SELECT employee_id AS "employeeId", branch_id AS "branchId",
              time_zone AS "timeZone", work_days AS "workDays",
              shift_start::text AS "shiftStart", shift_end::text AS "shiftEnd",
              break_minutes AS "breakMinutes", grace_minutes AS "graceMinutes",
              effective_date::text AS "effectiveDate"
       FROM employee_work_schedule_history
       WHERE employee_id = $1 AND branch_id = $2
         AND effective_date <= (now() AT TIME ZONE time_zone)::date
       ORDER BY effective_date DESC, recorded_at DESC
       LIMIT 1`,
      [employeeId, branchId],
    );
    const assigned = assignedRows[0];
    const branchSchedule = assigned
      ? undefined
      : await this.getSchedule(branchId);
    const historyRows = await this.dataSource.query<RawSchedule[]>(
      `SELECT h.id, h.employee_id AS "employeeId", h.branch_id AS "branchId",
              h.time_zone AS "timeZone", h.work_days AS "workDays",
              h.shift_start::text AS "shiftStart", h.shift_end::text AS "shiftEnd",
              h.break_minutes AS "breakMinutes", h.grace_minutes AS "graceMinutes",
              h.effective_date::text AS "effectiveDate",
              h.assigned_by AS "assignedBy", u.name AS "assignedByName",
              h.recorded_at AS "recordedAt"
       FROM employee_work_schedule_history h
       LEFT JOIN users u ON u.id = h.assigned_by
       WHERE h.employee_id = $1 AND ($2::varchar IS NULL OR h.branch_id = $2)
       ORDER BY h.effective_date DESC, h.recorded_at DESC, h.id DESC`,
      [employeeId, historyBranchId],
    );
    const current: EffectiveEmployeeWorkSchedule | null = assigned
      ? {
          ...this.normalizeSchedule(assigned),
          source: 'EMPLOYEE',
          effectiveDate: assigned.effectiveDate
            ? String(assigned.effectiveDate).slice(0, 10)
            : null,
        }
      : branchSchedule
        ? { ...branchSchedule, source: 'BRANCH', effectiveDate: null }
        : null;
    return {
      current,
      history: historyRows.map((row) => ({
        id: row.id!,
        employeeId,
        branchId: row.branchId,
        timeZone: row.timeZone,
        workDays: this.parseWorkDays(row.workDays),
        shiftStart: String(row.shiftStart).slice(0, 5),
        shiftEnd: String(row.shiftEnd).slice(0, 5),
        breakMinutes: Number(row.breakMinutes),
        graceMinutes: Number(row.graceMinutes),
        effectiveDate: String(row.effectiveDate).slice(0, 10),
        assignedBy: row.assignedBy ?? null,
        assignedByName: row.assignedByName ?? null,
        recordedAt: new Date(row.recordedAt!).toISOString(),
      })),
    };
  }

  async assignEmployeeWorkSchedule(
    employeeId: string,
    input: WorkScheduleDefinition & { effectiveDate: string },
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeWorkScheduleHistoryRecord> {
    const validationError = workScheduleValidationError(input);
    if (validationError) throw new ConflictException(validationError);
    return this.dataSource.transaction(async (manager) => {
      const employeeRows = await manager.query<Array<{ branchId: string }>>(
        'SELECT branch_id AS "branchId" FROM employees WHERE id = $1 FOR UPDATE',
        [employeeId],
      );
      const employee = employeeRows[0];
      if (!employee) throw new NotFoundException('Employee not found.');
      const id = randomUUID();
      const rows = await manager.query<EmployeeWorkScheduleHistoryRecord[]>(
        `INSERT INTO employee_work_schedule_history
           (id, employee_id, branch_id, effective_date, time_zone, work_days,
            shift_start, shift_end, break_minutes, grace_minutes, assigned_by)
         VALUES ($1, $2, $3, $4::date, $5, $6::smallint[], $7::time, $8::time,
                 $9, $10, $11)
         RETURNING id, employee_id AS "employeeId", branch_id AS "branchId",
                   effective_date::text AS "effectiveDate", time_zone AS "timeZone",
                   work_days AS "workDays", shift_start::text AS "shiftStart",
                   shift_end::text AS "shiftEnd", break_minutes AS "breakMinutes",
                   grace_minutes AS "graceMinutes", assigned_by AS "assignedBy",
                   recorded_at AS "recordedAt"`,
        [
          id,
          employeeId,
          employee.branchId,
          input.effectiveDate,
          input.timeZone,
          input.workDays,
          input.shiftStart,
          input.shiftEnd,
          input.breakMinutes,
          input.graceMinutes,
          actor.userId,
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'CREATE', 'employee_work_schedule_history', $4, now())`,
        [
          randomUUID(),
          actor.userId,
          employee.branchId,
          JSON.stringify({
            scheduleId: id,
            employeeId,
            effectiveDate: input.effectiveDate,
            schedule: this.scheduleSnapshot(input),
            ip: actor.ip,
            userAgent: actor.userAgent,
          }),
        ],
      );
      const row = rows[0];
      return {
        ...row,
        workDays: this.parseWorkDays(row.workDays),
        shiftStart: String(row.shiftStart).slice(0, 5),
        shiftEnd: String(row.shiftEnd).slice(0, 5),
        breakMinutes: Number(row.breakMinutes),
        graceMinutes: Number(row.graceMinutes),
        effectiveDate: String(row.effectiveDate).slice(0, 10),
        assignedBy: row.assignedBy ?? null,
        recordedAt: new Date(row.recordedAt).toISOString(),
      };
    });
  }

  async saveSchedule(
    branchId: string,
    schedule: Omit<AttendanceSchedule, 'branchId'>,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<AttendanceSchedule> {
    const validationError = workScheduleValidationError(schedule);
    if (validationError) throw new ConflictException(validationError);
    return this.dataSource.transaction(async (manager) => {
      const previous = await manager.query<RawSchedule[]>(
        `SELECT branch_id AS "branchId", time_zone AS "timeZone",
                work_days AS "workDays", shift_start::text AS "shiftStart",
                shift_end::text AS "shiftEnd", break_minutes AS "breakMinutes",
                grace_minutes AS "graceMinutes", default_location AS "defaultLocation"
         FROM attendance_schedules WHERE branch_id = $1 FOR UPDATE`,
        [branchId],
      );
      const rows = await manager.query<RawSchedule[]>(
        `INSERT INTO attendance_schedules
         (branch_id, time_zone, work_days, shift_start, shift_end,
          break_minutes, grace_minutes, default_location, updated_at)
       VALUES ($1, $2, $3::smallint[], $4::time, $5::time, $6, $7, $8, now())
       ON CONFLICT (branch_id) DO UPDATE SET
         time_zone = EXCLUDED.time_zone,
         work_days = EXCLUDED.work_days,
         shift_start = EXCLUDED.shift_start,
         shift_end = EXCLUDED.shift_end,
         break_minutes = EXCLUDED.break_minutes,
         grace_minutes = EXCLUDED.grace_minutes,
         default_location = EXCLUDED.default_location,
         updated_at = now()
       RETURNING branch_id AS "branchId", time_zone AS "timeZone",
                 work_days AS "workDays", shift_start::text AS "shiftStart",
                 shift_end::text AS "shiftEnd", break_minutes AS "breakMinutes",
                 grace_minutes AS "graceMinutes", default_location AS "defaultLocation"`,
        [
          branchId,
          schedule.timeZone,
          schedule.workDays,
          schedule.shiftStart,
          schedule.shiftEnd,
          schedule.breakMinutes,
          schedule.graceMinutes,
          schedule.defaultLocation?.trim() || null,
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, $4, 'attendance_schedules', $5, now())`,
        [
          randomUUID(),
          actor.userId,
          branchId,
          previous[0] ? 'UPDATE' : 'CREATE',
          JSON.stringify({
            ip: actor.ip,
            userAgent: actor.userAgent,
            before: previous[0] ?? null,
            after: rows[0],
          }),
        ],
      );
      return this.normalizeSchedule(rows[0]);
    });
  }

  async listCorrections(attendanceRecordId: string) {
    const rows = await this.dataSource.query<Array<Record<string, any>>>(
      `SELECT c.id, c.attendance_record_id AS "attendanceRecordId",
              c.change_type AS "changeType", c.reason,
              c.time_in_before AS "timeInBefore", c.time_out_before AS "timeOutBefore",
              c.time_in_after AS "timeInAfter", c.time_out_after AS "timeOutAfter",
              c.created_at AS "createdAt", c.created_by AS "createdBy",
              u.name AS "createdByName"
       FROM attendance_corrections c
       JOIN users u ON u.id = c.created_by
       WHERE c.attendance_record_id = $1
       ORDER BY c.created_at DESC, c.id DESC`,
      [attendanceRecordId],
    );
    return rows.map((row) => ({
      ...row,
      timeInBefore: optionalDatabaseDateTime(row.timeInBefore),
      timeOutBefore: optionalDatabaseDateTime(row.timeOutBefore),
      timeInAfter: optionalDatabaseDateTime(row.timeInAfter),
      timeOutAfter: optionalDatabaseDateTime(row.timeOutAfter),
      createdAt: databaseDateTime(row.createdAt),
    }));
  }

  async decideOvertimeApproval(
    attendanceRecordId: string,
    input: { decision: 'APPROVE' | 'REJECT'; reason: string },
    actor: { userId: string; ip?: string; userAgent?: string },
  ) {
    return this.dataSource.transaction(async (manager) => {
      const record = await this.findRecordWithManager(manager, attendanceRecordId);
      if (record.overtimeMinutes <= 0) {
        throw new ConflictException('This attendance record has no calculated overtime.');
      }
      const requests = await manager.query<
        Array<{ id: string; requestedMinutes: number; status: string; branchId: string }>
      >(
        `SELECT id, requested_minutes AS "requestedMinutes", status,
                branch_id AS "branchId"
         FROM attendance_overtime_approvals
         WHERE attendance_record_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC, id DESC
         LIMIT 1 FOR UPDATE`,
        [attendanceRecordId],
      );
      const pending = requests[0];
      if (!pending) throw new ConflictException('There is no pending overtime approval for this record.');
      if (Number(pending.requestedMinutes) !== record.overtimeMinutes) {
        throw new ConflictException('The overtime changed after the approval was requested. Review the updated attendance record.');
      }
      const nextStatus = input.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await manager.query(
        `UPDATE attendance_overtime_approvals
         SET status = $2, reviewed_by = $3, review_reason = $4, reviewed_at = now()
         WHERE id = $1`,
        [pending.id, nextStatus, actor.userId, input.reason],
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, $4, 'attendance_overtime_approvals', $5::jsonb, now())`,
        [
          randomUUID(), actor.userId, pending.branchId,
          input.decision === 'APPROVE' ? 'APPROVE' : 'REJECT',
          JSON.stringify({
            approvalId: pending.id,
            attendanceRecordId,
            requestedMinutes: record.overtimeMinutes,
            reason: input.reason,
            ip: actor.ip,
            userAgent: actor.userAgent,
          }),
        ],
      );
      return this.findRecordWithManager(manager, attendanceRecordId);
    });
  }

  private async createOvertimeApproval(
    manager: EntityManager,
    input: {
      attendanceRecordId: string;
      employeeId: string;
      branchId: string;
      requestedMinutes: number;
      requestedBy: string;
      actor: { userId: string; ip?: string; userAgent?: string };
    },
  ): Promise<void> {
    if (!Number.isInteger(input.requestedMinutes) || input.requestedMinutes < 1) return;
    const latestRows = await manager.query<
      Array<{ requestedMinutes: number; status: string }>
    >(
      `SELECT requested_minutes AS "requestedMinutes", status
       FROM attendance_overtime_approvals
       WHERE attendance_record_id = $1
       ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      [input.attendanceRecordId],
    );
    const latest = latestRows[0];
    if (latest && Number(latest.requestedMinutes) === input.requestedMinutes) return;
    const id = randomUUID();
    await manager.query(
      `INSERT INTO attendance_overtime_approvals
         (id, attendance_record_id, employee_id, branch_id, requested_minutes,
          status, requested_by)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)`,
      [id, input.attendanceRecordId, input.employeeId, input.branchId, input.requestedMinutes, input.requestedBy],
    );
    await manager.query(
      `INSERT INTO audit_logs
         (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, 'CREATE', 'attendance_overtime_approvals', $4::jsonb, now())`,
      [
        randomUUID(), input.actor.userId, input.branchId,
        JSON.stringify({
          approvalId: id,
          attendanceRecordId: input.attendanceRecordId,
          requestedMinutes: input.requestedMinutes,
          ip: input.actor.ip,
          userAgent: input.actor.userAgent,
        }),
      ],
    );
  }

  async list(filters: AttendanceFilters): Promise<AttendanceRecord[]> {
    if (!filters.from || !filters.to) {
      throw new BadRequestException(
        'A bounded attendance date range is required.',
      );
    }
    const rangeLength =
      (Date.parse(`${filters.to}T00:00:00Z`) -
        Date.parse(`${filters.from}T00:00:00Z`)) /
      86_400_000;
    if (!Number.isFinite(rangeLength) || rangeLength < 0 || rangeLength > 366) {
      throw new BadRequestException(
        'Attendance date range must be ordered and no longer than 366 days.',
      );
    }
    const clauses: string[] = [];
    clauses.push('(a.dtr_data IS NULL OR e.branch_id = a.branch_id)');
    if (filters.approvedDtrOnly) clauses.push(`(a.dtr_data IS NULL OR (a.dtr_data->>'approval'='APPROVED' AND a.dtr_stale=false))`);
    const parameters: unknown[] = [];
    const add = (column: string, value: string | undefined) => {
      if (value) {
        parameters.push(value);
        clauses.push(`${column} = $${parameters.length}`);
      }
    };
    add('a.employee_id', filters.employeeId);
    add('a.branch_id', filters.branchId);
    if (filters.from) {
      parameters.push(filters.from);
      clauses.push(`a.work_date >= $${parameters.length}::date`);
    }
    if (filters.to) {
      parameters.push(filters.to);
      clauses.push(`a.work_date <= $${parameters.length}::date`);
    }
    const rows = await this.dataSource.query<AttendanceRecord[]>(
      `${this.attendanceSelect()}
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY a.work_date DESC, e.name ASC`,
      parameters,
    );
    const records = rows.map((record) => this.normalizeRecord(record));
    const leaveDays = await this.dataSource.query<Array<{employeeId:string;employeeName:string;branchId:string;branchName:string;workDate:string;units:string;codes:string;paid:boolean}>>(
      `SELECT d.employee_id AS "employeeId",e.name AS "employeeName",d.branch_id AS "branchId",b.name AS "branchName",d.work_date::text AS "workDate",sum(d.units)::text AS units,string_agg(DISTINCT t.code,', ') AS codes,bool_and((r.policy->>'paid')::boolean) AS paid
       FROM leave_request_days d JOIN leave_requests r ON r.id=d.request_id JOIN leave_types t ON t.id=r.type_id JOIN employees e ON e.id=d.employee_id JOIN branches b ON b.id=d.branch_id
       WHERE r.status='APPROVED' AND d.work_date BETWEEN $1::date AND $2::date AND ($3::text IS NULL OR d.employee_id=$3) AND ($4::text IS NULL OR d.branch_id=$4)
       GROUP BY d.employee_id,e.name,d.branch_id,b.name,d.work_date`,[filters.from,filters.to,filters.employeeId??null,filters.branchId??null]);
    for(const day of leaveDays){
      const existing=records.find(row=>row.employeeId===day.employeeId&&row.branchId===day.branchId&&row.workDate===day.workDate);
      const label=`APPROVED_${day.paid?'PAID':'UNPAID'}_LEAVE${Number(day.units)<1?'_HALF_DAY':''}`;
      if(existing){existing.leaveType=day.codes;if(!existing.dtrCalculation){existing.status=existing.timeIn?`${existing.status}, ${label}`:label;existing.lateMinutes=0;existing.undertimeMinutes=0;}}
      else if(!filters.approvedDtrOnly)records.push({id:`leave:${day.employeeId}:${day.workDate}`,employeeId:day.employeeId,employeeName:day.employeeName,branchId:day.branchId,branchName:day.branchName,workDate:day.workDate,timeIn:null,timeOut:null,source:'LEAVE',status:label,leaveType:day.codes,totalMinutes:0,regularMinutes:0,overtimeMinutes:0,lateMinutes:0,undertimeMinutes:0,originalTimeIn:null,originalTimeOut:null,overtimeApprovalStatus:null,overtimeApprovalMinutes:null});
    }
    const official=await officialBusinessSummaries(this.dataSource,filters.from,filters.to,filters.branchId,filters.employeeId);
    for(const day of official){
      const existing=records.find(r=>r.employeeId===day.employeeId&&r.workDate===day.workDate&&r.branchId===day.branchId);
      if(existing){existing.officialBusiness=[...(existing.officialBusiness??[]),day];if(!existing.dtrCalculation)existing.status+=`, OB_${day.status}`;}
      else records.push({id:`ob:${day.id}`,employeeId:day.employeeId,employeeName:day.employeeName,branchId:day.branchId,branchName:day.branchName,workDate:day.workDate,timeIn:null,timeOut:null,source:'OB',status:`OB_${day.status}${day.status==='APPROVED'?'_AWAITING_DTR_REVIEW':''}`,officialBusiness:[day],totalMinutes:0,regularMinutes:0,overtimeMinutes:0,lateMinutes:0,undertimeMinutes:0,originalTimeIn:null,originalTimeOut:null,overtimeApprovalStatus:null,overtimeApprovalMinutes:null});
    }
    return records.sort((a,b)=>b.workDate.localeCompare(a.workDate)||a.employeeName.localeCompare(b.employeeName));
  }

  async findById(id: string): Promise<AttendanceRecord | undefined> {
    const rows = await this.dataSource.query<AttendanceRecord[]>(
      `${this.attendanceSelect()} WHERE a.id = $1`,
      [id],
    );
    return rows[0] ? this.normalizeRecord(rows[0]) : undefined;
  }

  async clockIn(
    employee: { id: string; branchId: string },
    at = new Date(),
  ): Promise<AttendanceRecord> {
    const schedule = await this.getScheduleForEmployee(
      employee.id,
      employee.branchId,
      at,
    );
    if (!schedule) {
      throw new ConflictException(
        'Attendance schedule has not been configured for this branch.',
      );
    }
    const workDate = this.localDate(at, schedule.timeZone);
    const day = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
    if (!schedule.workDays.includes(day)) {
      throw new ConflictException(
        'The configured schedule marks today as a rest day.',
      );
    }
    const started = await this.dataSource.transaction(async (manager) => {
      await manager.query(`SELECT id FROM employees WHERE id = $1 FOR UPDATE`, [
        employee.id,
      ]);
      const approved=await manager.query<Array<{units:string}>>(`SELECT sum(d.units)::text AS units FROM leave_request_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.status='APPROVED' AND d.employee_id=$1 AND d.work_date=$2::date`,[employee.id,workDate]);
      if(Number(approved[0]?.units??0)>=1)throw new ConflictException('Full-day approved leave is recorded for today. Ask HR to resolve the leave before clocking in.');
      const rows = await manager.query<Array<{ id: string }>>(
        `INSERT INTO attendance_records
           (id, employee_id, branch_id, work_date, time_in, scheduled_start,
            scheduled_end, schedule_break_minutes, schedule_grace_minutes,
            schedule_time_zone, source, status)
         SELECT $1, $2, $3, $4::date, $5::timestamptz, $6::time, $7::time,
                $8, $9, $10, 'MANUAL', 'RECORDED'
         WHERE NOT EXISTS (
           SELECT 1 FROM attendance_records
           WHERE employee_id = $2 AND time_in IS NOT NULL AND time_out IS NULL
             AND work_date >= ($4::date - 1)
         )
         ON CONFLICT (employee_id, work_date) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          employee.id,
          employee.branchId,
          workDate,
          at.toISOString(),
          schedule.shiftStart,
          schedule.shiftEnd,
          schedule.breakMinutes,
          schedule.graceMinutes,
          schedule.timeZone,
        ],
      );
      return rows[0];
    });
    if (!started) {
      throw new ConflictException(
        'Attendance has already been started for today.',
      );
    }
    return this.findRecord(started.id);
  }

  async clockOut(
    employee: { id: string; branchId: string },
    at = new Date(),
    actor?: { userId: string; ip?: string; userAgent?: string },
  ): Promise<AttendanceRecord> {
    return this.dataSource.transaction(async (manager) => {
      const open = await manager.query<Array<{ id: string; branchId: string; workDate: string }>>(
        `SELECT id, branch_id AS "branchId", work_date::text AS "workDate"
         FROM attendance_records WHERE employee_id = $1
           AND time_in IS NOT NULL AND time_out IS NULL AND dtr_data IS NULL
           AND time_in <= $2::timestamptz
           AND time_in >= $2::timestamptz - interval '36 hours'
         ORDER BY time_in DESC LIMIT 1 FOR UPDATE`, [employee.id, at.toISOString()]);
      if (!open[0]) throw new ConflictException('No open attendance record was found for today.');
      const rows = await manager.query<Array<{ id: string }>>(
        `UPDATE attendance_records
         SET time_out = $2::timestamptz, updated_at = now()
         WHERE id = $1 AND time_out IS NULL
         RETURNING id`,
        [open[0].id, at.toISOString()],
      );
      if (!rows[0]) {
        throw new ConflictException('No open attendance record was found for today.');
      }
      let record = await this.findRecordWithManager(manager, rows[0].id);
      if (actor && record.overtimeMinutes > 0) {
        await this.createOvertimeApproval(manager, {
          attendanceRecordId: record.id,
          employeeId: record.employeeId,
          branchId: record.branchId,
          requestedMinutes: record.overtimeMinutes,
          requestedBy: actor.userId,
          actor,
        });
        record = await this.findRecordWithManager(manager, rows[0].id);
      }
      return record;
    });
  }

  async correct(
    id: string,
    input: {
      timeIn?: string;
      timeOut?: string;
      reason: string;
      changeType?: 'CORRECTION' | 'MANUAL_ADJUSTMENT';
    },
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<AttendanceRecord | undefined> {
    if (!input.timeIn && !input.timeOut) {
      throw new ConflictException('Provide a corrected time-in or time-out.');
    }
    if (
      input.timeIn &&
      input.timeOut &&
      Date.parse(input.timeOut) < Date.parse(input.timeIn)
    ) {
      throw new ConflictException('Time out must be later than time in.');
    }
    return this.dataSource.transaction(async (manager) => {
      const beforeRows = await manager.query<AttendanceRecord[]>(
        `SELECT id, employee_id AS "employeeId", branch_id AS "branchId",
                work_date::text AS "workDate", time_in AS "timeIn", time_out AS "timeOut"
         FROM attendance_records WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const before = beforeRows[0];
      if (!before) return undefined;
      const priorCorrections = await manager.query<
        Array<{ timeInAfter: string | null; timeOutAfter: string | null }>
      >(
        `SELECT time_in_after AS "timeInAfter", time_out_after AS "timeOutAfter"
         FROM attendance_corrections WHERE attendance_record_id = $1
         ORDER BY created_at DESC, id DESC LIMIT 1`,
        [id],
      );
      const previous = priorCorrections[0];
      const currentTimeIn = previous?.timeInAfter ?? before.timeIn;
      const currentTimeOut = previous?.timeOutAfter ?? before.timeOut;
      const nextTimeIn = input.timeIn ?? currentTimeIn;
      const nextTimeOut = input.timeOut ?? currentTimeOut;
      if (
        nextTimeIn &&
        nextTimeOut &&
        Date.parse(nextTimeOut) < Date.parse(nextTimeIn)
      ) {
        throw new ConflictException('Time out must be later than time in.');
      }
      await manager.query(
        `INSERT INTO attendance_corrections
           (id, attendance_record_id, employee_id, branch_id,
            time_in_before, time_out_before, time_in_after, time_out_after,
            change_type, reason, created_by)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz,
                 $7::timestamptz, $8::timestamptz, $9, $10, $11)`,
        [
          randomUUID(), id, before.employeeId, before.branchId,
          currentTimeIn, currentTimeOut, nextTimeIn, nextTimeOut,
          input.changeType ?? 'CORRECTION', input.reason, actor.userId,
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'CREATE', 'attendance_corrections', $4::jsonb, now())`,
        [
          randomUUID(),
          actor.userId,
          before.branchId,
          JSON.stringify({
            recordId: id,
            changeType: input.changeType ?? 'CORRECTION',
            reason: input.reason,
            ip: actor.ip,
            userAgent: actor.userAgent,
            before: { timeIn: currentTimeIn, timeOut: currentTimeOut },
            after: { timeIn: nextTimeIn, timeOut: nextTimeOut },
          }),
        ],
      );
      const corrected = await this.findRecordWithManager(manager, id);
      if (corrected.overtimeMinutes > 0) {
        await this.createOvertimeApproval(manager, {
          attendanceRecordId: corrected.id,
          employeeId: corrected.employeeId,
          branchId: corrected.branchId,
          requestedMinutes: corrected.overtimeMinutes,
          requestedBy: actor.userId,
          actor,
        });
      }
      return this.findRecordWithManager(manager, id);
    });
  }

  private async findRecord(id: string): Promise<AttendanceRecord> {
    const records = await this.dataSource.query<AttendanceRecord[]>(
      `${this.attendanceSelect()} WHERE a.id = $1`,
      [id],
    );
    if (!records[0])
      throw new NotFoundException('Attendance record not found.');
    return this.normalizeRecord(records[0]);
  }

  private async findRecordWithManager(
    manager: EntityManager,
    id: string,
  ): Promise<AttendanceRecord> {
    const records = await manager.query<AttendanceRecord[]>(
      `${this.attendanceSelect()} WHERE a.id = $1`,
      [id],
    );
    if (!records[0])
      throw new NotFoundException('Attendance record not found.');
    return this.normalizeRecord(records[0]);
  }

  private attendanceSelect(): string {
    return `SELECT a.id, CASE WHEN a.dtr_stale THEN (a.dtr_data->'calculation') || '{"payrollReady":false,"approvedOtMinutes":0}'::jsonb ELSE a.dtr_data->'calculation' END AS "dtrCalculation", a.dtr_data->>'approval' AS "dtrApproval", a.employee_id AS "employeeId", e.name AS "employeeName",
                   a.branch_id AS "branchId", b.name AS "branchName",
                   a.work_date::text AS "workDate",
                   COALESCE(correction.time_in_after, a.time_in) AS "timeIn",
                   COALESCE(correction.time_out_after, a.time_out) AS "timeOut",
                   a.time_in AS "originalTimeIn", a.time_out AS "originalTimeOut",
                   a.source,
                   CASE WHEN correction.id IS NOT NULL THEN 'CORRECTED' ELSE a.status END AS status,
                   CASE WHEN COALESCE(correction.time_in_after, a.time_in) IS NULL OR COALESCE(correction.time_out_after, a.time_out) IS NULL THEN 0
                     ELSE GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(correction.time_out_after, a.time_out) - COALESCE(correction.time_in_after, a.time_in))) / 60)::int - COALESCE(a.schedule_break_minutes, 0))
                   END AS "totalMinutes",
                   CASE WHEN COALESCE(correction.time_in_after, a.time_in) IS NULL OR COALESCE(correction.time_out_after, a.time_out) IS NULL THEN 0
                     ELSE LEAST(
                       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(correction.time_out_after, a.time_out) - COALESCE(correction.time_in_after, a.time_in))) / 60)::int - COALESCE(a.schedule_break_minutes, 0)),
                       GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                         (a.scheduled_end - a.scheduled_start)
                         + CASE WHEN a.scheduled_end <= a.scheduled_start THEN interval '1 day' ELSE interval '0' END
                       )) / 60)::int - COALESCE(a.schedule_break_minutes, 0))
                     )
                   END AS "regularMinutes",
                   CASE WHEN COALESCE(correction.time_in_after, a.time_in) IS NULL OR COALESCE(correction.time_out_after, a.time_out) IS NULL THEN 0
                     ELSE GREATEST(0,
                       FLOOR(EXTRACT(EPOCH FROM (COALESCE(correction.time_out_after, a.time_out) - COALESCE(correction.time_in_after, a.time_in))) / 60)::int
                       - COALESCE(a.schedule_break_minutes, 0)
                       - GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (
                         (a.scheduled_end - a.scheduled_start)
                         + CASE WHEN a.scheduled_end <= a.scheduled_start THEN interval '1 day' ELSE interval '0' END
                       )) / 60)::int - COALESCE(a.schedule_break_minutes, 0))
                     )
                   END AS "overtimeMinutes",
                   CASE WHEN COALESCE(correction.time_in_after, a.time_in) IS NULL OR a.scheduled_start IS NULL THEN 0
                     ELSE GREATEST(0,
                       FLOOR(EXTRACT(EPOCH FROM (
                         COALESCE(correction.time_in_after, a.time_in) - ((a.work_date + a.scheduled_start) AT TIME ZONE a.schedule_time_zone)
                       )) / 60)::int - a.schedule_grace_minutes
                     )
                   END AS "lateMinutes",
                   CASE WHEN COALESCE(correction.time_out_after, a.time_out) IS NULL OR a.scheduled_end IS NULL THEN 0
                     ELSE GREATEST(0,
                       FLOOR(EXTRACT(EPOCH FROM (
                         ((a.work_date + CASE WHEN a.scheduled_end <= a.scheduled_start THEN 1 ELSE 0 END + a.scheduled_end) AT TIME ZONE a.schedule_time_zone) - COALESCE(correction.time_out_after, a.time_out)
                       )) / 60)::int
                     )
                   END AS "undertimeMinutes",
                   overtime.status AS "overtimeApprovalStatus",
                   overtime.requested_minutes AS "overtimeApprovalMinutes"
            FROM attendance_records a
            JOIN employees e ON e.id = a.employee_id
            LEFT JOIN branches b ON b.id = a.branch_id
            LEFT JOIN LATERAL (
              SELECT c.id, c.time_in_after, c.time_out_after
              FROM attendance_corrections c
              WHERE c.attendance_record_id = a.id
              ORDER BY c.created_at DESC, c.id DESC
              LIMIT 1
            ) correction ON true
            LEFT JOIN LATERAL (
              SELECT o.status, o.requested_minutes
              FROM attendance_overtime_approvals o
              WHERE o.attendance_record_id = a.id
              ORDER BY o.created_at DESC, o.id DESC
              LIMIT 1
            ) overtime ON true`;
  }

  private async getScheduleForEmployee(
    employeeId: string,
    branchId: string,
    at: Date,
  ): Promise<AttendanceSchedule | undefined> {
    const employeeSchedules = await this.dataSource.query<RawSchedule[]>(
      `SELECT branch_id AS "branchId", time_zone AS "timeZone",
              work_days AS "workDays", shift_start::text AS "shiftStart",
              shift_end::text AS "shiftEnd", break_minutes AS "breakMinutes",
              grace_minutes AS "graceMinutes"
       FROM employee_work_schedule_history
       WHERE employee_id = $1 AND branch_id = $2
         AND effective_date <= (($3::timestamptz AT TIME ZONE time_zone)::date)
       ORDER BY effective_date DESC, recorded_at DESC
       LIMIT 1`,
      [employeeId, branchId, at.toISOString()],
    );
    const baseSchedule = employeeSchedules[0]
      ? this.normalizeSchedule(employeeSchedules[0])
      : this.getSchedule(branchId);
    const schedule = await baseSchedule;
    if (!schedule) return undefined;
    const workDate = this.localDate(at, schedule.timeZone);
    const dayRows = await this.dataSource.query<Array<{
      dayType: 'WORK' | 'REST_DAY';
      shiftStart: string | null;
      shiftEnd: string | null;
    }>>(
      `SELECT day_type AS "dayType", shift_start::text AS "shiftStart",
              shift_end::text AS "shiftEnd"
       FROM employee_work_schedule_days
       WHERE employee_id = $1 AND branch_id = $2 AND work_date = $3::date`,
      [employeeId, branchId, workDate],
    );
    const dailySchedule = dayRows[0];
    if (!dailySchedule) return schedule;
    const dayOfWeek = new Date(`${workDate}T00:00:00.000Z`).getUTCDay();
    return {
      ...schedule,
      workDays: dailySchedule.dayType === 'REST_DAY' ? [] : [dayOfWeek],
      shiftStart: dailySchedule.shiftStart
        ? String(dailySchedule.shiftStart).slice(0, 5)
        : schedule.shiftStart,
      shiftEnd: dailySchedule.shiftEnd
        ? String(dailySchedule.shiftEnd).slice(0, 5)
        : schedule.shiftEnd,
    };
  }

  private normalizeSchedule(schedule: RawSchedule): AttendanceSchedule {
    return {
      branchId: schedule.branchId,
      timeZone: schedule.timeZone,
      workDays: this.parseWorkDays(schedule.workDays),
      shiftStart: String(schedule.shiftStart).slice(0, 5),
      shiftEnd: String(schedule.shiftEnd).slice(0, 5),
      breakMinutes: Number(schedule.breakMinutes),
      graceMinutes: Number(schedule.graceMinutes),
      ...(schedule.defaultLocation !== undefined
        ? { defaultLocation: schedule.defaultLocation ?? null }
        : {}),
    };
  }

  private parseWorkDays(workDays: number[] | string): number[] {
    return typeof workDays === 'string'
      ? workDays
          .replace(/^\{|\}$/g, '')
          .split(',')
          .filter(Boolean)
          .map(Number)
      : workDays.map(Number);
  }

  private scheduleSnapshot(schedule: WorkScheduleDefinition) {
    return {
      timeZone: schedule.timeZone,
      workDays: [...schedule.workDays].sort((left, right) => left - right),
      shiftStart: schedule.shiftStart,
      shiftEnd: schedule.shiftEnd,
      breakMinutes: schedule.breakMinutes,
      graceMinutes: schedule.graceMinutes,
    };
  }

  private normalizeRecord(record: AttendanceRecord): AttendanceRecord {
    if (record.dtrCalculation) {
      const c = record.dtrCalculation;
      return { ...record, timeIn:c.actualIn,timeOut:c.actualOut,status:c.statuses.join(', '),totalMinutes:c.workedMinutes,regularMinutes:Math.max(0,c.workedMinutes-c.potentialOtMinutes),overtimeMinutes:c.payrollReady ? c.potentialOtMinutes : 0,lateMinutes:c.payrollReady ? c.lateMinutes : 0,undertimeMinutes:c.payrollReady ? c.undertimeMinutes : 0,overtimeApprovalStatus:c.approvedOtMinutes > 0 ? 'APPROVED' : null,overtimeApprovalMinutes:c.approvedOtMinutes };
    }
    const overtimeApprovalMinutes = record.overtimeApprovalMinutes === null || record.overtimeApprovalMinutes === undefined
      ? null
      : Number(record.overtimeApprovalMinutes);
    return {
      ...record,
      workDate: String(record.workDate).slice(0, 10),
      timeIn: record.timeIn ? new Date(record.timeIn).toISOString() : null,
      timeOut: record.timeOut ? new Date(record.timeOut).toISOString() : null,
      originalTimeIn: record.originalTimeIn ? new Date(record.originalTimeIn).toISOString() : null,
      originalTimeOut: record.originalTimeOut ? new Date(record.originalTimeOut).toISOString() : null,
      totalMinutes: Number(record.totalMinutes ?? 0),
      regularMinutes: Number(record.regularMinutes ?? 0),
      overtimeMinutes: Number(record.overtimeMinutes ?? 0),
      lateMinutes: Number(record.lateMinutes ?? 0),
      undertimeMinutes: Number(record.undertimeMinutes ?? 0),
      overtimeApprovalMinutes,
      overtimeApprovalStatus:
        overtimeApprovalMinutes === Number(record.overtimeMinutes)
          ? record.overtimeApprovalStatus ?? null
          : null,
    };
  }

  private localDate(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
}
