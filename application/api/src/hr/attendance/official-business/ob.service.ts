import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID, createHash } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../../foundation/auth/auth.context.js';
import {
  includesBranch,
  selectedBranchScope,
} from '../../../foundation/auth/branch-scope.js';
import { DtrService } from '../dtr.service.js';
import {
  calculateDtr,
  localWallTime,
  wallToInstant,
} from '../dtr.calculator.js';
import { validDate, nextDate } from '../dtr.parser.js';
import { lockLeaveDtr } from '../approved-leave.js';
import type { DtrData, DtrSource } from '../dtr.types.js';
import type { ObRequest } from './ob.types.js';
import type { ObFilingDto, ObDecisionDto, ObFilterDto } from './ob.dto.js';
type Employee = {
  id: string;
  name: string;
  employeeNumber: string;
  branchId: string;
  status: string;
  employment: { startDate?: string; endDate?: string };
};
const select = `SELECT r.id,r.employee_id AS "employeeId",e.name AS "employeeName",r.branch_id AS "branchId",b.name AS "branchName",r.filed_by AS "filedBy",r.work_date::text AS "workDate",r.starts_at AS "startsAt",r.ends_at AS "endsAt",r.time_zone AS "timeZone",r.destination,r.destination_branch_id AS "destinationBranchId",r.reason,r.retrospective_reason AS "retrospectiveReason",r.status,r.version,r.schedule,r.office_continuity AS "officeContinuity",r.cancellation_pending AS "cancellationPending",r.submission_key AS "submissionKey",r.created_at AS "createdAt",r.decided_by AS "decidedBy" FROM attendance_ob_requests r JOIN employees e ON e.id=r.employee_id JOIN branches b ON b.id=r.branch_id`;
const scheduleKey = (s: ObRequest['schedule'] | null) =>
  s
    ? JSON.stringify([
        s.timeZone,
        s.shiftStart,
        s.shiftEnd,
        s.workDays,
        s.breakMinutes,
        s.graceMinutes,
      ])
    : '';
export class OfficialBusinessService {
  constructor(
    readonly db: DataSource,
    private readonly dtr: DtrService,
  ) {}
  isReviewer(u: AuthUserContext) {
    return ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(u.role);
  }
  private requireFiler(u: AuthUserContext) {
    if (u.role === 'SUPER_ADMIN')
      throw new ForbiddenException(
        'Super Admin is review-only for Official Business.',
      );
  }
  private selfReview(u: AuthUserContext, employeeId: string, ownId?: string) {
    return (
      ['HR_ADMIN', 'BRANCH_MANAGER'].includes(u.role) && employeeId === ownId
    );
  }
  private review(u: AuthUserContext, branch: string) {
    if (!this.isReviewer(u))
      throw new ForbiddenException('OB reviewer access required.');
    this.dtr.requireManager(u, branch, 'UPDATE');
  }
  async own(u: AuthUserContext, m: EntityManager = this.db.manager) {
    const [row] = await m.query<Employee[]>(
      `SELECT e.id,e.name,e.employee_number AS "employeeNumber",e.branch_id AS "branchId",e.status,e.employment FROM users u JOIN employees e ON e.id=u.employee_id WHERE u.id=$1`,
      [u.userId],
    );
    return row;
  }
  private async employee(id: string, m: EntityManager) {
    const [row] = await m.query<Employee[]>(
      `SELECT id,name,employee_number AS "employeeNumber",branch_id AS "branchId",status,employment FROM employees WHERE id=$1 FOR UPDATE`,
      [id],
    );
    if (!row) throw new NotFoundException('Employee not found.');
    return row;
  }
  async context(u: AuthUserContext) {
    const own = await this.own(u);
    const scope = selectedBranchScope(u);
    const employees = this.isReviewer(u)
      ? await this.db.query(
          `SELECT id,name,branch_id AS "branchId" FROM employees WHERE status='ACTIVE' AND ($1::text[] IS NULL OR branch_id=ANY($1)) ORDER BY name`,
          [scope ?? null],
        )
      : own
        ? [{ id: own.id, name: own.name, branchId: own.branchId }]
        : [];
    const branches = await this.db.query(
      `SELECT id,name FROM branches WHERE status='ACTIVE' ORDER BY name`,
    );
    return {
      ownEmployee: own ? { id: own.id, name: own.name } : null,
      canReview: this.isReviewer(u),
      canFile: u.role !== 'SUPER_ADMIN' && Boolean(own || this.isReviewer(u)),
      employees,
      branches,
    };
  }
  async list(u: AuthUserContext, f: ObFilterDto) {
    const own = await this.own(u);
    const review = f.view === 'review';
    if (review && !this.isReviewer(u))
      throw new ForbiddenException('OB reviewer access required.');
    if (f.branchId && review && !includesBranch(u, f.branchId))
      throw new ForbiddenException('Branch access denied.');
    if (
      (f.from && !validDate(f.from)) ||
      (f.to && !validDate(f.to)) ||
      (f.from && f.to && f.to < f.from)
    )
      throw new BadRequestException('Choose a valid ordered date range.');
    const scopes = review ? selectedBranchScope(u) : null;
    const page = f.page ?? 1;
    const rows = await this.db.query<ObRequest[]>(
      `${select} WHERE ($1::boolean AND ($2::text[] IS NULL OR r.branch_id=ANY($2)) OR NOT $1::boolean AND r.employee_id=$3) AND ($4::text IS NULL OR r.branch_id=$4) AND ($5::text IS NULL OR r.status=$5) AND ($6::date IS NULL OR r.work_date >= $6) AND ($7::date IS NULL OR r.work_date <= $7) AND ($8::text IS NULL OR r.employee_id=$8) ORDER BY r.created_at DESC,r.id LIMIT 21 OFFSET $9`,
      [
        review,
        scopes ?? null,
        own?.id ?? '',
        f.branchId ?? null,
        f.status ?? null,
        f.from ?? null,
        f.to ?? null,
        f.employeeId ?? null,
        (page - 1) * 20,
      ],
    );
    return { items: rows.slice(0, 20), hasNext: rows.length > 20, page };
  }
  async detail(
    u: AuthUserContext,
    id: string,
    m: EntityManager = this.db.manager,
  ) {
    const [r] = await m.query<ObRequest[]>(`${select} WHERE r.id=$1`, [id]);
    if (!r) throw new NotFoundException('OB request not found.');
    const own = await this.own(u, m);
    const owner = own?.id === r.employeeId;
    if (!owner) {
      if (!this.isReviewer(u) || !includesBranch(u, r.branchId))
        throw new ForbiddenException('OB access denied.');
      this.dtr.requireManager(u, r.branchId);
    }
    const events = await m.query(
      `SELECT ev.action,ev.comment,ev.created_at AS "createdAt",u.name AS actor FROM attendance_ob_events ev JOIN users u ON u.id=ev.actor_id WHERE ev.request_id=$1 ORDER BY ev.created_at,ev.id`,
      [id],
    );
    const current = await m.query<{ branchId: string }[]>(
      `SELECT branch_id AS "branchId" FROM employees WHERE id=$1`,
      [r.employeeId],
    );
    const [employee] = await m.query<Employee[]>(
      `SELECT id,name,employee_number AS "employeeNumber",branch_id AS "branchId",status,employment FROM employees WHERE id=$1`,
      [r.employeeId],
    );
    const context = await this.dtr.context(m, r.branchId, employee, r.workDate);
    const [attendance] = await m.query<
      { data: DtrData | null; timeIn: string | null; timeOut: string | null }[]
    >(
      `SELECT dtr_data AS data,time_in AS "timeIn",time_out AS "timeOut" FROM attendance_records WHERE employee_id=$1 AND work_date=$2::date`,
      [r.employeeId, r.workDate],
    );
    const sources =
      attendance?.data?.source ??
      this.clockSource(attendance, r.workDate, r.timeZone);
    const ob = {
      id: r.id,
      start: new Date(r.startsAt).toISOString(),
      end: new Date(r.endsAt).toISOString(),
      destination: r.destination,
      officeContinuity: r.officeContinuity,
      schedule: r.schedule,
    };
    const calculate = (continuity: boolean) =>
      calculateDtr({
        workDate: r.workDate,
        sources,
        ...context,
        pairing: attendance?.data?.pairing ?? 'STRICT',
        override: attendance?.data?.override ?? {},
        officialBusiness: [
          ...context.officialBusiness.filter((x) => x.id !== r.id),
          { ...ob, officeContinuity: continuity },
        ],
      });
    return {
      ...r,
      events,
      preview: calculate(r.officeContinuity),
      continuityPreview: calculate(true),
      canReview:
        this.isReviewer(u) &&
        ((r.filedBy !== u.userId && !owner) ||
          this.selfReview(u, r.employeeId, own?.id)) &&
        Boolean(current[0] && includesBranch(u, current[0].branchId)),
      isOwner: owner || r.filedBy === u.userId,
    };
  }
  private async mutable(m: EntityManager, branch: string, on: string) {
    const locked = await m.query(
      `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('APPROVED','LOCKED') AND date_from<=$2::date AND date_to>=$2::date`,
      [branch, on],
    );
    if (locked.length)
      throw new ConflictException(
        'Reopen the approved or locked DTR period before changing OB attendance.',
      );
  }
  private async openCutoff(
    m: EntityManager,
    branch: string,
    on: string,
    timeZone: string,
  ) {
    const today = localWallTime(new Date(), timeZone).slice(0, 10);
    if (on < today) {
      // Filing may precede DTR setup. Existing periods still follow the
      // retrospective window and protected-period rules.
      const configured = await m.query(
        `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND date_from<=$2::date AND date_to>=$2::date LIMIT 1`,
        [branch, on],
      );
      if (!configured.length) return;
      const rows = await m.query(
        `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('DRAFT','REOPENED') AND date_from<=$2::date AND date_to>=$3::date LIMIT 1`,
        [branch, on, today],
      );
      if (!rows.length)
        throw new ConflictException(
          'Retrospective OB must be within the current open DTR cutoff. Ask HR to configure or reopen it.',
        );
    }
  }
  private async conflicts(
    m: EntityManager,
    eid: string,
    on: string,
    start: string,
    end: string,
    id?: string,
  ) {
    const leave = await m.query(
      `SELECT r.id FROM leave_request_days d JOIN leave_requests r ON r.id=d.request_id WHERE d.employee_id=$1 AND d.work_date=$2::date AND r.status='APPROVED' LIMIT 1`,
      [eid, on],
    );
    if (leave.length)
      throw new ConflictException(
        'Approved leave exists on this date. Resolve it before approving OB.',
      );
    const overlap = await m.query(
      `SELECT id FROM attendance_ob_requests WHERE employee_id=$1 AND status='APPROVED' AND starts_at<$3::timestamptz AND ends_at>$2::timestamptz AND ($4::uuid IS NULL OR id<>$4) LIMIT 1`,
      [eid, start, end, id ?? null],
    );
    if (overlap.length)
      throw new ConflictException('This interval overlaps approved OB.');
  }
  private async prepare(u: AuthUserContext, d: ObFilingDto, m: EntityManager) {
    if (
      !validDate(d.workDate) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.endTime)
    )
      throw new BadRequestException('Enter a valid date and times.');
    if (!d.destination.trim() || !d.reason.trim())
      throw new BadRequestException('Destination and reason are required.');
    const own = await this.own(u, m);
    const employeeId = d.employeeId ?? own?.id;
    if (!employeeId)
      throw new BadRequestException(
        'Link an employee record before filing OB.',
      );
    const e = await this.employee(employeeId, m);
    if (e.id !== own?.id) this.review(u, e.branchId);
    if (e.status !== 'ACTIVE')
      throw new BadRequestException('Employee must be active.');
    const context = await this.dtr.context(m, e.branchId, e, d.workDate);
    const s = context.schedule;
    if (
      !s ||
      !context.active ||
      !s.workDays.includes(new Date(`${d.workDate}T00:00:00Z`).getUTCDay()) ||
      context.holiday
    )
      throw new BadRequestException(
        'OB requires an active employee and scheduled workday. Ask HR to resolve rest-day or holiday assignments first.',
      );
    const start = wallToInstant(`${d.workDate}T${d.startTime}`, s.timeZone);
    const end = wallToInstant(
      `${(d.nextDay ?? d.endTime < d.startTime) ? nextDate(d.workDate) : d.workDate}T${d.endTime}`,
      s.timeZone,
    );
    const shiftStart = wallToInstant(
      `${d.workDate}T${s.shiftStart}`,
      s.timeZone,
    );
    const shiftEnd = wallToInstant(
      `${s.shiftEnd <= s.shiftStart ? nextDate(d.workDate) : d.workDate}T${s.shiftEnd}`,
      s.timeZone,
    );
    if (
      end <= start ||
      Date.parse(end) - Date.parse(start) > 36 * 3600000 ||
      start < shiftStart ||
      end > shiftEnd
    )
      throw new BadRequestException(
        'OB time must be within the scheduled shift, with end later than start. An earlier end time is treated as the following morning for overnight shifts.',
      );
    const today = localWallTime(new Date(), s.timeZone).slice(0, 10);
    if (Date.parse(d.workDate) - Date.parse(today) > 366 * 86400000)
      throw new BadRequestException('File within the next 366 days.');
    await this.openCutoff(m, e.branchId, d.workDate, s.timeZone);
    if (d.destinationBranchId) {
      const rows = await m.query(
        `SELECT id FROM branches WHERE id=$1 AND status='ACTIVE'`,
        [d.destinationBranchId],
      );
      if (!rows.length)
        throw new BadRequestException('Choose an active destination branch.');
    }
    await this.conflicts(m, e.id, d.workDate, start, end);
    return { e, context, start, end };
  }
  private rangeDates(d: ObFilingDto) {
    const end = d.endDate ?? d.workDate;
    if (
      !validDate(d.workDate) ||
      !validDate(end) ||
      end < d.workDate ||
      Date.parse(end) - Date.parse(d.workDate) > 365 * 86400000
    )
      throw new BadRequestException(
        'Choose an ordered OB date range of at most 366 days.',
      );
    const dates: string[] = [];
    for (let date = d.workDate; date <= end; date = nextDate(date))
      dates.push(date);
    return dates;
  }
  private dailyDraft(d: ObFilingDto, date: string): ObFilingDto {
    // Bind every date and the complete selection to the retry key.
    const hex = createHash('sha256')
      .update(
        `${d.submissionKey}:${d.workDate}:${d.endDate ?? d.workDate}:${date}`,
      )
      .digest('hex');
    return {
      employeeId: d.employeeId,
      startTime: d.startTime,
      endTime: d.endTime,
      nextDay: d.nextDay,
      destination: d.destination,
      destinationBranchId: d.destinationBranchId,
      reason: d.reason,
      retrospectiveReason: d.retrospectiveReason,
      workDate: date,
      endDate: undefined,
      submissionKey: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`,
    };
  }
  private async rangeDays(
    u: AuthUserContext,
    d: ObFilingDto,
    m: EntityManager,
  ) {
    const dates = this.rangeDates(d);
    const own = await this.own(u, m);
    const e = await this.employee(d.employeeId ?? own?.id ?? '', m);
    if (e.id !== own?.id) this.review(u, e.branchId);
    const days: ObFilingDto[] = [];
    const skipped: string[] = [];
    for (const date of dates) {
      const context = await this.dtr.context(m, e.branchId, e, date);
      if (
        dates.length > 1 &&
        context.schedule &&
        (!context.schedule.workDays.includes(
          new Date(`${date}T00:00:00Z`).getUTCDay(),
        ) ||
          context.holiday)
      ) {
        skipped.push(date);
      } else days.push(this.dailyDraft(d, date));
    }
    if (!days.length)
      throw new BadRequestException(
        'The selected range has no scheduled workdays.',
      );
    return { days, skipped, e, own };
  }
  async previewRange(u: AuthUserContext, d: ObFilingDto) {
    this.requireFiler(u);
    if (!d.endDate) return this.preview(u, d);
    return this.db.transaction(async (m) => {
      const { days, skipped } = await this.rangeDays(u, d, m);
      const previews = [];
      for (const day of days) {
        try {
          previews.push({
            workDate: day.workDate,
            ...(await this.previewDay(u, day, m)),
          });
        } catch (error) {
          if (error instanceof Error)
            error.message = `${day.workDate}: ${error.message}`;
          throw error;
        }
      }
      return { ...previews[0], days: previews, skipped };
    });
  }
  async submitRange(u: AuthUserContext, d: ObFilingDto) {
    this.requireFiler(u);
    if (!d.endDate) return this.submit(u, d);
    const own = await this.own(u);
    const [lookup] = await this.db.query<{ branchId: string }[]>(
      `SELECT branch_id AS "branchId" FROM employees WHERE id=$1`,
      [d.employeeId ?? own?.id ?? ''],
    );
    if (!lookup) throw new BadRequestException('Employee not found.');
    return this.db.transaction(async (m) => {
      await lockLeaveDtr(m, lookup.branchId);
      const { days, skipped, e } = await this.rangeDays(u, d, m);
      if (e.branchId !== lookup.branchId)
        throw new ConflictException(
          'Employee branch changed. Refresh before filing.',
        );
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify([
            e.id,
            d.workDate,
            d.endDate,
            d.startTime,
            d.endTime,
            d.nextDay ?? d.endTime < d.startTime,
            d.destination.trim(),
            d.destinationBranchId ?? null,
            d.reason.trim(),
            d.retrospectiveReason?.trim() ?? '',
          ]),
        )
        .digest('hex');
      const [retry] = await m.query<
        { details: { fingerprint: string; ids: string[]; skipped: string[] } }[]
      >(
        `SELECT details::jsonb AS details FROM audit_logs WHERE user_id=$1 AND action='OB_RANGE_SUBMITTED' AND (CASE WHEN action='OB_RANGE_SUBMITTED' THEN details::jsonb ELSE '{}'::jsonb END)->>'submissionKey'=$2 LIMIT 1`,
        [u.userId, d.submissionKey],
      );
      if (retry) {
        if (retry.details.fingerprint !== fingerprint)
          throw new ConflictException(
            'Submission key reused for different values.',
          );
        return {
          id: retry.details.ids[0],
          ids: retry.details.ids,
          skipped: retry.details.skipped,
        };
      }
      const requests = [];
      for (const day of days)
        requests.push(
          await this.submitDay(u, day, m, lookup.branchId, own?.id),
        );
      const ids = requests.map((r) => r.id);
      await m.query(
        `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'OB_RANGE_SUBMITTED','attendance_ob_requests',$4,now())`,
        [
          randomUUID(),
          u.userId,
          e.branchId,
          {
            submissionKey: d.submissionKey,
            fingerprint,
            ids,
            skipped,
            role: u.role,
          },
        ],
      );
      return { id: ids[0], ids, skipped };
    });
  }
  async preview(u: AuthUserContext, d: ObFilingDto) {
    this.requireFiler(u);
    return this.db.transaction((m) => this.previewDay(u, d, m));
  }
  private async previewDay(
    u: AuthUserContext,
    d: ObFilingDto,
    m: EntityManager,
  ) {
    const { e, context, start, end } = await this.prepare(u, d, m);
    const [row] = await m.query<
      {
        data: DtrData | null;
        timeIn: string | null;
        timeOut: string | null;
      }[]
    >(
      `SELECT dtr_data AS data,time_in AS "timeIn",time_out AS "timeOut" FROM attendance_records WHERE employee_id=$1 AND work_date=$2::date`,
      [e.id, d.workDate],
    );
    const source =
      row?.data?.source ??
      this.clockSource(row, d.workDate, context.schedule!.timeZone);
    const calculation = calculateDtr({
      workDate: d.workDate,
      sources: source,
      ...context,
      pairing: row?.data?.pairing ?? 'STRICT',
      override: row?.data?.override ?? {},
      officialBusiness: [
        ...context.officialBusiness,
        {
          id: 'PREVIEW',
          start,
          end,
          destination: d.destination,
          officeContinuity: false,
          schedule: context.schedule!,
        },
      ],
    });
    return {
      schedule: context.schedule,
      calculation,
      actualIn: calculation.actualIn,
      actualOut: calculation.actualOut,
    };
  }
  async submit(u: AuthUserContext, d: ObFilingDto) {
    this.requireFiler(u);
    // Lock branch before employee, matching DTR commit/approval ordering.
    const own = await this.own(u);
    const [lookup] = await this.db.query<{ branchId: string }[]>(
      `SELECT branch_id AS "branchId" FROM employees WHERE id=$1`,
      [d.employeeId ?? own?.id ?? ''],
    );
    if (!lookup) throw new BadRequestException('Employee not found.');
    return this.db.transaction((m) =>
      this.submitDay(u, d, m, lookup.branchId, own?.id),
    );
  }
  private async submitDay(
    u: AuthUserContext,
    d: ObFilingDto,
    m: EntityManager,
    branchId: string,
    ownId?: string,
  ) {
    await lockLeaveDtr(m, branchId);
    const [retry] = await m.query<ObRequest[]>(
      `${select} WHERE r.submission_key=$1`,
      [d.submissionKey],
    );
    if (retry) {
      const target = d.employeeId ?? ownId;
      const start = wallToInstant(
        `${d.workDate}T${d.startTime}`,
        retry.timeZone,
      );
      const end = wallToInstant(
        `${(d.nextDay ?? d.endTime < d.startTime) ? nextDate(d.workDate) : d.workDate}T${d.endTime}`,
        retry.timeZone,
      );
      if (
        retry.filedBy !== u.userId ||
        retry.employeeId !== target ||
        new Date(retry.startsAt).toISOString() !== start ||
        new Date(retry.endsAt).toISOString() !== end ||
        retry.reason !== d.reason.trim() ||
        retry.destination !== d.destination.trim() ||
        (retry.destinationBranchId ?? null) !==
          (d.destinationBranchId ?? null) ||
        retry.retrospectiveReason !== (d.retrospectiveReason?.trim() ?? '')
      )
        throw new ConflictException(
          'Submission key reused for different values.',
        );
      return { id: retry.id };
    }
    const { e, context, start, end } = await this.prepare(u, d, m);
    if (e.branchId !== branchId)
      throw new ConflictException(
        'Employee branch changed. Refresh before filing.',
      );
    const id = randomUUID();
    await m.query(
      `INSERT INTO attendance_ob_requests(id,employee_id,branch_id,filed_by,work_date,starts_at,ends_at,time_zone,destination,destination_branch_id,reason,retrospective_reason,schedule,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        id,
        e.id,
        e.branchId,
        u.userId,
        d.workDate,
        start,
        end,
        context.schedule!.timeZone,
        d.destination.trim(),
        d.destinationBranchId ?? null,
        d.reason.trim(),
        d.retrospectiveReason?.trim() ?? '',
        JSON.stringify(context.schedule),
        d.submissionKey,
      ],
    );
    await this.event(m, u, id, 'SUBMITTED', 'OB request submitted', e.branchId);
    await this.notify(m, id, true, 'Official Business needs review');
    return { id };
  }
  async decide(u: AuthUserContext, id: string, d: ObDecisionDto) {
    if (!d.comment.trim())
      throw new BadRequestException('A decision reason is required.');
    const lookup = await this.detail(u, id);
    return this.db.transaction(async (m) => {
      await lockLeaveDtr(m, lookup.branchId);
      const e = await this.employee(lookup.employeeId, m);
      await m.query(
        `SELECT id FROM attendance_ob_requests WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const r = await this.detail(u, id, m);
      const own = await this.own(u, m);
      const filer = r.filedBy === u.userId || own?.id === r.employeeId;
      if (r.version !== d.version)
        throw new ConflictException(
          'OB request changed. Reload before deciding.',
        );
      const reviewer = [
        'APPROVE',
        'REJECT',
        'APPROVE_CANCELLATION',
        'REJECT_CANCELLATION',
      ].includes(d.action);
      if (reviewer) {
        this.review(u, r.branchId);
        if (
          !includesBranch(u, e.branchId) ||
          (filer && !this.selfReview(u, r.employeeId, own?.id))
        )
          throw new ForbiddenException(
            'An independent reviewer with both original and current branch access is required.',
          );
      } else if (!filer)
        throw new ForbiddenException(
          'Only the employee or filer may cancel this request.',
        );
      let status = r.status,
        cancellation = r.cancellationPending;
      if (d.action === 'APPROVE' || d.action === 'REJECT') {
        if (status !== 'PENDING')
          throw new ConflictException('Only pending OB can be decided.');
        status = d.action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      } else if (d.action === 'CANCEL') {
        if (status !== 'PENDING')
          throw new ConflictException(
            'Approved OB requires a cancellation review.',
          );
        status = 'CANCELLED';
      } else if (d.action === 'REQUEST_CANCELLATION') {
        if (status !== 'APPROVED' || cancellation)
          throw new ConflictException(
            'Only an approved OB without a pending cancellation can be withdrawn.',
          );
        cancellation = true;
      } else {
        if (status !== 'APPROVED' || !cancellation)
          throw new ConflictException('No pending cancellation.');
        cancellation = false;
        if (d.action === 'APPROVE_CANCELLATION') status = 'CANCELLED';
      }
      const affects =
        d.action === 'APPROVE' || d.action === 'APPROVE_CANCELLATION';
      if (affects) {
        await this.mutable(m, r.branchId, r.workDate);
        if (d.action === 'APPROVE') {
          if (d.officeContinuity) {
            const preview = r.continuityPreview;
            if (
              r.workDate > localWallTime(new Date(), r.timeZone).slice(0, 10) ||
              !preview.actualIn ||
              preview.actualOut ||
              new Date(preview.actualIn).getTime() >
                new Date(r.startsAt).getTime()
            )
              throw new BadRequestException(
                'Office continuity can only confirm an existing office IN with a missing OUT, no later than OB departure.',
              );
          }
          if (e.branchId !== r.branchId || e.status !== 'ACTIVE')
            throw new ConflictException(
              'Employee assignment changed. Cancel and refile in the current branch.',
            );
          const context = await this.dtr.context(m, r.branchId, e, r.workDate);
          if (
            scheduleKey(context.schedule) !== scheduleKey(r.schedule) ||
            !context.active ||
            context.holiday
          )
            throw new ConflictException(
              'Schedule or employment changed. Cancel and refile for review.',
            );
          await this.openCutoff(m, r.branchId, r.workDate, r.timeZone);
          await this.conflicts(
            m,
            e.id,
            r.workDate,
            new Date(r.startsAt).toISOString(),
            new Date(r.endsAt).toISOString(),
            id,
          );
        }
      }
      await m.query(
        `UPDATE attendance_ob_requests SET status=$2,cancellation_pending=$3,office_continuity=CASE WHEN $4 THEN $5 ELSE office_continuity END,decided_by=CASE WHEN $6 THEN $7 ELSE decided_by END,decided_at=CASE WHEN $6 THEN now() ELSE decided_at END,version=version+1,updated_at=now() WHERE id=$1`,
        [
          id,
          status,
          cancellation,
          d.action === 'APPROVE',
          d.officeContinuity ?? false,
          reviewer,
          u.userId,
        ],
      );
      if (affects) await this.synchronize(m, e, r.branchId, r.workDate);
      const selfApproval =
        reviewer &&
        filer &&
        ['APPROVE', 'APPROVE_CANCELLATION'].includes(d.action);
      await this.event(
        m,
        u,
        id,
        selfApproval ? `SELF_${d.action}` : d.action,
        d.comment.trim(),
        r.branchId,
        { selfApproval, employeeId: r.employeeId, filedBy: r.filedBy },
      );
      await this.notify(
        m,
        id,
        d.action === 'REQUEST_CANCELLATION',
        'Official Business request updated',
      );
      return { id };
    });
  }
  private clockSource(
    row: { timeIn: string | null; timeOut: string | null } | undefined,
    on: string,
    timeZone: string,
  ): DtrSource[] {
    if (!row?.timeIn && !row?.timeOut) return [];
    const wall = (s: string) => localWallTime(new Date(s), timeZone).slice(11);
    return [
      {
        sheet: 'Original attendance',
        row: 1,
        kind: 'DAILY',
        key: 'office-clock',
        identifier: '',
        name: '',
        device: '',
        date: on,
        punch: null,
        direction: 'UNKNOWN',
        actualIn: row.timeIn ? wall(row.timeIn) : null,
        actualOut: row.timeOut ? wall(row.timeOut) : null,
        shiftStart: null,
        shiftEnd: null,
        status: '',
        raw: { originalTimeIn: row.timeIn, originalTimeOut: row.timeOut },
        errors: [],
      },
    ];
  }
  async synchronize(m: EntityManager, e: Employee, branch: string, on: string) {
    const context = await this.dtr.context(m, branch, e, on);
    const [row] = await m.query<
      {
        id: string;
        branchId: string;
        data: DtrData | null;
        timeIn: string | null;
        timeOut: string | null;
      }[]
    >(
      `SELECT id,branch_id AS "branchId",dtr_data AS data,time_in AS "timeIn",time_out AS "timeOut" FROM attendance_records WHERE employee_id=$1 AND work_date=$2::date FOR UPDATE`,
      [e.id, on],
    );
    if (row && row.branchId !== branch)
      throw new ConflictException('Attendance exists in a different branch.');
    const sources =
      row?.data?.source ??
      this.clockSource(row, on, context.schedule?.timeZone ?? 'Asia/Manila');
    const override = { ...row?.data?.override, approvedOtMinutes: 0 };
    if (override.arrangement)
      throw new ConflictException(
        'Resolve the manual arrangement override before changing OB.',
      );
    const calculation = calculateDtr({
      workDate: on,
      sources,
      ...context,
      pairing: row?.data?.pairing ?? 'STRICT',
      override,
    });
    if (!sources.length && !context.officialBusiness.length) {
      calculation.payrollReady = false;
      calculation.exceptions.push(
        'OB cancelled: attendance evidence requires review',
      );
    }
    const data: DtrData = {
      batchId: row?.data?.batchId ?? 'OB',
      sourceKeys: row?.data?.sourceKeys ?? [],
      source: sources,
      override,
      calculation,
      policy: context.policy,
      pairing: row?.data?.pairing ?? 'STRICT',
      revision: (row?.data?.revision ?? 0) + 1,
      approval: 'DRAFT',
    };
    await this.dtr.persist(m, row?.id ?? randomUUID(), e.id, branch, on, data);
    await m.query(
      `UPDATE attendance_dtr_periods SET state='DRAFT',updated_at=now() WHERE branch_id=$1 AND state='DRAFT' AND date_from<=$2::date AND date_to>=$2::date`,
      [branch, on],
    );
  }
  private async event(
    m: EntityManager,
    u: AuthUserContext,
    id: string,
    action: string,
    comment: string,
    branch: string,
    approvalDetails: {
      selfApproval: boolean;
      employeeId: string;
      filedBy: string;
    } | null = null,
  ) {
    await m.query(
      `INSERT INTO attendance_ob_events(id,request_id,actor_id,action,comment) VALUES($1,$2,$3,$4,$5)`,
      [randomUUID(), id, u.userId, action, comment],
    );
    await m.query(
      `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,$4,'attendance_ob_requests',$5,now())`,
      [
        randomUUID(),
        u.userId,
        branch,
        `OB_${action}`,
        { requestId: id, role: u.role, ...approvalDetails },
      ],
    );
  }
  private async notify(
    m: EntityManager,
    id: string,
    reviewers: boolean,
    title: string,
  ) {
    await m.query(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href) SELECT gen_random_uuid()::text,u.id,r.branch_id,$2,'Open the Official Business request to review its status.','INFO',false,now(),CASE WHEN $3::boolean THEN '/attendance?section=official-business&obId=' ELSE '/attendance/official-business?obId=' END||r.id FROM attendance_ob_requests r JOIN users u ON u.status='ACTIVE' LEFT JOIN employee_branch_access access ON access.user_id=u.id WHERE r.id=$1 AND CASE WHEN $3::boolean THEN ((u.id<>r.filed_by AND u.employee_id IS DISTINCT FROM r.employee_id) OR (u.role IN ('HR_ADMIN','BRANCH_MANAGER') AND u.employee_id=r.employee_id)) AND (u.role='SUPER_ADMIN' OR u.role IN ('HR_ADMIN','BRANCH_MANAGER') AND CASE WHEN access.mode='SELECTED' THEN r.branch_id=ANY(access.branch_ids) WHEN access.mode='ALL' THEN true ELSE u.branch_id=r.branch_id OR u.role='HR_ADMIN' AND u.branch_id IS NULL END) AND NOT EXISTS(SELECT 1 FROM user_module_permissions p WHERE p.user_id=u.id AND p.permission_key IN ('hr','hr.attendance') AND p.effect IN ('DENY','VIEW')) ELSE u.employee_id=r.employee_id OR u.id=r.filed_by END`,
      [id, title, reviewers],
    );
  }
}
