import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import type { EmailService } from '../../email/email.service.js';
import type {
  Policy,
  Employee,
  LeaveType,
  LeaveRequest,
  CancellationReview,
  Balance,
  Document,
} from './leave.types.js';
import {
  today,
  date,
  range,
  year,
  halfUnits,
  employmentEligible,
} from './leave.policy.js';
import type {
  RequestDto,
  PreviewDto,
  FilterDto,
  TypeDto,
  AssignmentDto,
  AdjustmentDto,
  AllocateDto,
  ResetScheduleDto,
  ResetBalanceDto,
} from './leave.dto.js';
import {
  synchronizeApprovedLeave,
  lockLeaveDtr,
} from '../attendance/approved-leave.js';
import { validateFilingDate } from './leave.policy.js';
import { assertNoOfficialBusiness } from '../attendance/approved-official-business.js';

const requestSelect = `SELECT r.id,r.employee_id AS "employeeId",e.name AS "employeeName",r.branch_id AS "branchId",b.name AS "branchName",r.type_id AS "typeId",t.name AS "typeName",t.code AS "typeCode",r.credit_year AS "creditYear",r.start_date::text AS "startDate",r.end_date::text AS "endDate",r.days::float8 AS days,r.half_day AS "halfDay",r.reason,r.status,(SELECT c.status FROM leave_cancellation_reviews c WHERE c.request_id=r.id AND c.status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW') LIMIT 1) AS "cancellationReviewStatus",r.policy,r.submitted_at AS "submittedAt",r.decided_at AS "decidedAt",r.decided_by AS "decidedBy",r.decision_comment AS "decisionComment",r.cancelled_at AS "cancelledAt",r.cancellation_reason AS "cancellationReason",r.assigned_approver_id AS "assignedApproverId",r.submission_key AS "submissionKey",d.file_name AS "fileName" FROM leave_requests r JOIN employees e ON e.id=r.employee_id JOIN branches b ON b.id=r.branch_id JOIN leave_types t ON t.id=r.type_id LEFT JOIN leave_request_documents d ON d.request_id=r.id`;
export class LeaveService {
  constructor(
    readonly db: DataSource,
    private readonly email?: Pick<EmailService, 'sendLeaveNotice'>,
  ) {}
  management(user: AuthUserContext) {
    if (!['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(user.role))
      throw new ForbiddenException('Leave management access required.');
  }
  configure(user: AuthUserContext) {
    if (!['SUPER_ADMIN', 'HR_ADMIN'].includes(user.role))
      throw new ForbiddenException(
        'Only authorized HR administrators can change leave credits or settings.',
      );
  }
  async scope(
    user: AuthUserContext,
    branchId?: string,
    manager: EntityManager = this.db.manager,
  ): Promise<string[] | null> {
    this.management(user);
    if (user.branchIds !== undefined) {
      if (branchId && !user.branchIds.includes(branchId))
        throw new ForbiddenException('Branch access denied.');
      if (
        user.allBranches &&
        user.scope === 'ALL' &&
        ['SUPER_ADMIN', 'HR_ADMIN'].includes(user.role)
      )
        return branchId ? [branchId] : null;
      return branchId ? [branchId] : user.branchIds;
    }
    if (
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'HR_ADMIN' && user.scope === 'ALL')
    )
      return branchId ? [branchId] : null;
    const branches =
      user.role === 'BRANCH_MANAGER'
        ? await manager.query<Array<{ id: string }>>(
            'SELECT id FROM branches WHERE manager_user_id=$1 OR id=$2',
            [user.userId, user.branchId],
          )
        : user.branchId
          ? [{ id: user.branchId }]
          : [];
    const ids = branches.map((row) => row.id);
    if (!ids.length || (branchId && !ids.includes(branchId)))
      throw new ForbiddenException('Branch access denied.');
    return branchId ? [branchId] : ids;
  }
  async own(
    user: AuthUserContext,
    manager: EntityManager = this.db.manager,
  ): Promise<Employee | undefined> {
    const rows = await manager.query<Employee[]>(
      `SELECT e.id,e.name,e.branch_id AS "branchId",e.status,e.employment,p.probationary,p.regularization_date::text AS "regularizationDate" FROM users u JOIN employees e ON e.id=u.employee_id LEFT JOIN employee_profiles p ON p.employee_id=e.id WHERE u.id=$1`,
      [user.userId],
    );
    return rows[0];
  }
  async employee(id: string, manager: EntityManager, lock = false) {
    if (lock)
      await manager.query('SELECT id FROM employees WHERE id=$1 FOR UPDATE', [
        id,
      ]);
    const [e] = await manager.query<Employee[]>(
      `SELECT e.id,e.name,e.branch_id AS "branchId",e.status,e.employment,p.probationary,p.regularization_date::text AS "regularizationDate" FROM employees e LEFT JOIN employee_profiles p ON p.employee_id=e.id WHERE e.id=$1`,
      [id],
    );
    if (!e) throw new NotFoundException('Employee not found.');
    return e;
  }
  async context(user: AuthUserContext) {
    const own = await this.own(user);
    const admin = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(
      user.role,
    );
    const scope = admin ? await this.scope(user) : own ? [own.branchId] : [];
    const branches = await this.db.query<Array<{ id: string; name: string }>>(
      'SELECT id,name FROM branches WHERE ($1::text[] IS NULL OR id=ANY($1)) ORDER BY name',
      [scope],
    );
    const employees = admin
      ? await this.db.query<
          Array<{ id: string; name: string; branchId: string }>
        >(
          'SELECT id,name,branch_id AS "branchId" FROM employees WHERE ($1::text[] IS NULL OR branch_id=ANY($1)) ORDER BY name',
          [scope],
        )
      : own
        ? [{ id: own.id, name: own.name, branchId: own.branchId }]
        : [];
    return {
      userId: user.userId,
      ownEmployee: own
        ? { id: own.id, name: own.name, branchId: own.branchId }
        : null,
      canReview: admin,
      canConfigure: ['SUPER_ADMIN', 'HR_ADMIN'].includes(user.role),
      globalScope: scope === null,
      branches,
      employees,
    };
  }
  filingTime(_user: AuthUserContext) {
    const now = new Date();
    return {
      serverNow: now.toISOString(),
      today: today(now),
      timeZone: 'Asia/Manila',
    };
  }
  async types(user: AuthUserContext, personal = false, on = today()) {
    const admin =
      !personal &&
      ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(user.role);
    const own = admin ? undefined : await this.own(user);
    const scopes = admin ? await this.scope(user) : own ? [own.branchId] : [];
    const types = await this.db.query<LeaveType[]>(
      `SELECT t.*,v.policy,v.effective_from::text AS "effectiveFrom" FROM leave_types t JOIN leave_type_versions v ON v.type_id=t.id AND v.version=t.version ORDER BY t.name`,
    );
    const visible = types.filter(
      (t) =>
        !t.policy.branchId ||
        scopes === null ||
        scopes.includes(t.policy.branchId),
    );
    if (admin) return visible;
    const result = [];
    for (const t of visible) {
      if (!t.active || !own) continue;
      try {
        const p = await this.policy(this.db.manager, t.id, date(on));
        await this.eligible(this.db.manager, own, t, p, on);
        result.push({ ...t, ...p });
      } catch {
        /* Ineligible types are not request options. */
      }
    }
    return result;
  }
  async policy(m: EntityManager, typeId: string, on: string) {
    const [v] = await m.query<
      Array<{ policy: Policy; version: number; effectiveFrom: string }>
    >(
      `SELECT policy,version,effective_from::text AS "effectiveFrom" FROM leave_type_versions WHERE type_id=$1 AND effective_from<=$2::date ORDER BY effective_from DESC,version DESC LIMIT 1`,
      [typeId, on],
    );
    if (!v)
      throw new ConflictException(
        'No effective leave policy covers these dates.',
      );
    return v;
  }
  async eligible(
    m: EntityManager,
    e: Employee,
    t: LeaveType,
    p: { policy: Policy },
    on: string,
  ) {
    if (!t.active || !employmentEligible(e, p.policy, on))
      throw new ConflictException(
        'This leave type is not active or eligible for your employment.',
      );
    const [a] = await m.query<
      Array<{ eligible: boolean; sil_verified: boolean }>
    >(
      'SELECT eligible,sil_verified FROM leave_type_assignments WHERE employee_id=$1 AND type_id=$2',
      [e.id, t.id],
    );
    if (
      a?.eligible === false ||
      (p.policy.eligibility === 'ASSIGNED' && !a?.eligible) ||
      (t.code === 'SIL' && !(a?.eligible && a.sil_verified))
    )
      throw new ConflictException(
        'HR must confirm your eligibility for this leave type.',
      );
  }
  async days(
    m: EntityManager,
    e: Employee,
    from: string,
    to: string,
    half: boolean,
    p: Policy,
  ) {
    range(from, to);
    if (half && (!p.halfDay || from !== to))
      throw new ConflictException(
        'Half-day leave requires an allowed policy and one working date.',
      );
    const rows = await m.query<
      Array<{ date: string; work: boolean; fallback: boolean }>
    >(
      `SELECT d.day::date::text AS date,CASE WHEN COALESCE(settings.holidays,'{}'::jsonb) ? d.day::date::text THEN false WHEN daily.day_type IS NOT NULL THEN daily.day_type='WORK' ELSE EXTRACT(DOW FROM d.day)::smallint=ANY(COALESCE(history.work_days,base.work_days,ARRAY[1,2,3,4,5]::smallint[])) END AS work,(history.work_days IS NULL AND base.work_days IS NULL) AS fallback FROM generate_series($3::date,$4::date,interval '1 day') d(day) LEFT JOIN attendance_schedules base ON base.branch_id=$2 LEFT JOIN attendance_dtr_settings settings ON settings.branch_id=$2 LEFT JOIN LATERAL(SELECT work_days FROM employee_work_schedule_history WHERE employee_id=$1 AND branch_id=$2 AND effective_date<=d.day::date ORDER BY effective_date DESC,recorded_at DESC LIMIT 1) history ON true LEFT JOIN employee_work_schedule_days daily ON daily.employee_id=$1 AND daily.branch_id=$2 AND daily.work_date=d.day::date ORDER BY d.day`,
      [e.id, e.branchId, from, to],
    );
    const counted = rows
      .filter((row) => row.work)
      .map((row) => ({ date: row.date, units: half ? 0.5 : 1 }));
    if (!counted.length)
      throw new ConflictException(
        'The selected dates contain no eligible working days.',
      );
    return { counted, fallback: rows.some((row) => row.fallback) };
  }
  async balance(
    m: EntityManager,
    eid: string,
    typeId: string,
    creditYear: number,
    excludeRequestId?: string,
  ) {
    const [b] = await m.query<
      Array<{
        allocated: number;
        adjustments: number;
        used: number;
        restored: number;
        reserved: number;
        available: number;
      }>
    >(
      `WITH movements AS(SELECT COALESCE(sum(signed_days),0)::float8 AS net,COALESCE(sum(signed_days) FILTER(WHERE kind='ALLOCATION'),0)::float8 AS allocated,COALESCE(sum(signed_days) FILTER(WHERE kind='ADJUSTMENT'),0)::float8 AS adjustments,COALESCE(-sum(signed_days) FILTER(WHERE kind='USAGE'),0)::float8 AS used,COALESCE(sum(signed_days) FILTER(WHERE kind='RESTORATION'),0)::float8 AS restored FROM leave_credit_transactions WHERE employee_id=$1 AND type_id=$2 AND credit_year=$3),pending AS(SELECT COALESCE(sum(days),0)::float8 AS reserved FROM leave_requests WHERE employee_id=$1 AND type_id=$2 AND credit_year=$3 AND status='PENDING' AND (policy->>'paid')::boolean AND ($4::uuid IS NULL OR id<>$4::uuid)) SELECT m.allocated,m.adjustments,m.used,m.restored,p.reserved,(m.net-p.reserved)::float8 AS available FROM movements m CROSS JOIN pending p`,
      [eid, typeId, creditYear, excludeRequestId ?? null],
    );
    return b;
  }
  async quote(
    m: EntityManager,
    e: Employee,
    input: PreviewDto,
    enforceBalance = true,
    excludeRequestId?: string,
  ) {
    range(input.startDate, input.endDate);
    const [t] = await m.query<LeaveType[]>(
      'SELECT * FROM leave_types WHERE id=$1',
      [input.typeId],
    );
    if (!t) throw new NotFoundException('Leave type not found.');
    const p = await this.policy(m, t.id, input.startDate);
    validateFilingDate(
      input.startDate,
      Math.max(
        p.policy.minimumNoticeDays ?? 0,
        ['VL', 'LWOP'].includes(t.code) ? 3 : 0,
      ),
    );
    await this.eligible(m, e, t, p, input.startDate);
    await assertNoOfficialBusiness(m,e.id,input.startDate,input.endDate);
    if (
      typeof e.employment.endDate === 'string' &&
      e.employment.endDate < input.endDate
    )
      throw new ConflictException('These dates extend beyond employment.');
    const schedule = await this.days(
      m,
      e,
      input.startDate,
      input.endDate,
      !!input.halfDay,
      p.policy,
    );
    const days = schedule.counted.reduce((n, d) => n + d.units, 0);
    const [overlap] = await m.query(
      `SELECT id FROM leave_requests WHERE employee_id=$1 AND status IN ('PENDING','APPROVED') AND start_date<=$3::date AND end_date>=$2::date AND ($4::uuid IS NULL OR id<>$4::uuid) LIMIT 1`,
      [e.id, input.startDate, input.endDate, excludeRequestId ?? null],
    );
    if (overlap)
      throw new ConflictException(
        'These dates overlap a pending or approved request.',
      );
    const balance = await this.balance(
      m,
      e.id,
      t.id,
      Number(input.startDate.slice(0, 4)),
      excludeRequestId,
    );
    if (excludeRequestId) {
      const [previous] = await m.query<
        Array<{ status: string; days: number; paid: boolean }>
      >(
        "SELECT status,days::float8 AS days,(policy->>'paid')::boolean AS paid FROM leave_requests WHERE id=$1",
        [excludeRequestId],
      );
      if (previous?.status === 'APPROVED' && previous.paid) {
        balance.available += previous.days;
        balance.used -= previous.days;
      }
    }
    if (
      enforceBalance &&
      p.policy.paid &&
      p.policy.blockInsufficient &&
      days > balance.available
    )
      throw new ConflictException(
        'Insufficient available leave credits. Ask HR to review credits or choose eligible unpaid leave.',
      );
    return {
      type: t,
      policy: p.policy,
      version: p.version,
      days,
      dates: schedule.counted,
      fallback: schedule.fallback,
      balance,
      available: p.policy.paid ? balance.available : null,
      reserved: p.policy.paid ? balance.reserved : 0,
      afterApproval: p.policy.paid ? balance.available - days : null,
    };
  }
  async preview(user: AuthUserContext, input: PreviewDto) {
    const e = await this.own(user);
    if (!e)
      throw new ConflictException(
        'Link your employee profile before requesting leave.',
      );
    return this.quote(this.db.manager, e, input, false);
  }
  async submit(user: AuthUserContext, input: RequestDto, file?: Document) {
    const own = await this.own(user);
    if (!own)
      throw new ConflictException(
        'Link your employee profile before requesting leave.',
      );
    if (!input.reason.trim())
      throw new BadRequestException('A leave reason is required.');
    return this.withNotices(async (m, notify) => {
      const e = await this.employee(own.id, m, true);
      const [prior] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.submission_key=$1',
        [input.submissionKey],
      );
      if (prior) {
        if (
          prior.employeeId !== e.id ||
          prior.typeId !== input.typeId ||
          prior.startDate !== input.startDate ||
          prior.endDate !== input.endDate ||
          prior.halfDay !== !!input.halfDay ||
          prior.reason !== input.reason.trim()
        )
          throw new ConflictException(
            'This submission key was already used for another request.',
          );
        return prior;
      }
      const q = await this.quote(m, e, input);
      if (q.policy.attachmentRule === 'REQUIRED' && !file)
        throw new ConflictException('A supporting document is required.');
      if (q.policy.attachmentRule === 'NONE' && file)
        throw new BadRequestException(
          'This leave policy does not accept attachments.',
        );
      const [approver] = await m.query<Array<{ id: string }>>(
        `SELECT u.id FROM branches b JOIN users u ON u.id=b.manager_user_id WHERE b.id=$1 AND u.status='ACTIVE' AND u.role IN ('BRANCH_MANAGER','HR_ADMIN') AND (u.role='BRANCH_MANAGER' OR u.branch_id IS NULL OR u.branch_id=b.id) AND u.employee_id IS DISTINCT FROM $2`,
        [e.branchId, e.id],
      );
      const fallback = approver
        ? []
        : await m.query(
            `SELECT id FROM users WHERE status='ACTIVE' AND role IN ('SUPER_ADMIN','HR_ADMIN') AND employee_id IS DISTINCT FROM $1 AND (role='SUPER_ADMIN' OR branch_id IS NULL OR branch_id=$2) LIMIT 1`,
            [e.id, e.branchId],
          );
      if (!approver && !fallback.length)
        throw new ConflictException(
          'No authorized approver is configured for this branch. Ask HR to assign one.',
        );
      const id = randomUUID();
      await m.query(
        `INSERT INTO leave_requests(id,employee_id,branch_id,type_id,credit_year,start_date,end_date,days,half_day,reason,policy,assigned_approver_id,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
        [
          id,
          e.id,
          e.branchId,
          input.typeId,
          Number(input.startDate.slice(0, 4)),
          input.startDate,
          input.endDate,
          q.days,
          !!input.halfDay,
          input.reason.trim(),
          JSON.stringify({ ...q.policy, policyVersion: q.version }),
          approver?.id ?? null,
          input.submissionKey,
        ],
      );
      for (const d of q.dates)
        await m.query(
          'INSERT INTO leave_request_days(request_id,employee_id,branch_id,work_date,units) VALUES($1,$2,$3,$4,$5)',
          [id, e.id, e.branchId, d.date, d.units],
        );
      if (file)
        await m.query(
          'INSERT INTO leave_request_documents(request_id,file_name,mime_type,data) VALUES($1,$2,$3,$4)',
          [id, file.name, file.mime, file.data],
        );
      await this.event(
        m,
        id,
        user,
        'SUBMITTED',
        input.reason.trim(),
        e.branchId,
      );
      await notify(id, true);
      return (
        await m.query<LeaveRequest[]>(requestSelect + ' WHERE r.id=$1', [id])
      )[0];
    });
  }
  async filter(
    user: AuthUserContext,
    f: FilterDto,
    mine = false,
    manager: EntityManager = this.db.manager,
  ) {
    let branches: string[] | null = null;
    let employeeId = f.employeeId;
    if (mine) {
      const e = await this.own(user, manager);
      if (!e)
        throw new ConflictException(
          'Link your employee profile to view personal leave.',
        );
      employeeId = e.id;
      if (
        (f.employeeId && f.employeeId !== e.id) ||
        (f.branchId && f.branchId !== e.branchId)
      )
        throw new ForbiddenException('Own leave records only.');
    } else branches = await this.scope(user, f.branchId, manager);
    if (f.from) date(f.from);
    if (f.to) date(f.to);
    if (f.from && f.to && f.from > f.to)
      throw new BadRequestException('Start date must precede end date.');
    if (f.year) year(f.year);
    return { branches, employeeId };
  }
  async requests(user: AuthUserContext, f: FilterDto, mine = false) {
    const s = await this.filter(user, f, mine);
    const params = [
      s.branches,
      s.employeeId ?? null,
      f.typeId ?? null,
      f.status ?? null,
      f.from ?? (f.year ? `${f.year}-01-01` : null),
      f.to ?? (f.year ? `${f.year}-12-31` : null),
    ];
    const where = ` WHERE ($1::text[] IS NULL OR r.branch_id=ANY($1)) AND ($2::text IS NULL OR r.employee_id=$2) AND ($3::uuid IS NULL OR r.type_id=$3) AND ($4::text IS NULL OR r.status=$4) AND ($5::date IS NULL OR r.end_date>=$5) AND ($6::date IS NULL OR r.start_date<=$6)`;
    const page = f.page ?? 1,
      limit = f.limit ?? 20;
    const [count] = await this.db.query<Array<{ total: number }>>(
      'SELECT count(*)::int AS total FROM leave_requests r' + where,
      params,
    );
    const items = await this.db.query<LeaveRequest[]>(
      requestSelect +
        where +
        ' ORDER BY r.submitted_at DESC,r.id LIMIT $7 OFFSET $8',
      [...params, limit, (page - 1) * limit],
    );
    return { items, total: count.total, page, limit };
  }
  async detail(user: AuthUserContext, id: string) {
    const [r] = await this.db.query<LeaveRequest[]>(
      requestSelect + ' WHERE r.id=$1',
      [id],
    );
    if (!r) throw new NotFoundException('Leave request not found.');
    const own = await this.own(user);
    const management = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(
      user.role,
    );
    let reviewInScope = false;
    if (own?.id !== r.employeeId) {
      const scope = await this.scope(user, r.branchId);
      if (scope && !scope.includes(r.branchId))
        throw new ForbiddenException('Request access denied.');
      reviewInScope = management;
    } else if (management) {
      try {
        await this.scope(user, r.branchId);
        reviewInScope = true;
      } catch (error) {
        if (!(error instanceof ForbiddenException)) throw error;
      }
    }
    const e = await this.employee(r.employeeId, this.db.manager);
    const events = await this.db.query(
      `SELECT v.id,v.action,v.comment,v.actor_id AS "actorId",v.actor_role AS "actorRole",v.created_at AS "createdAt",COALESCE(v.actor_name,u.name) AS actor FROM leave_request_events v JOIN users u ON u.id=v.actor_id WHERE v.request_id=$1 ORDER BY v.created_at,v.id`,
      [id],
    );
    const [cancellationReview] = await this.db.query<CancellationReview[]>(
      `SELECT id,request_id AS "requestId",origin,status,reason,response,proposed_start::text AS "proposedStart",proposed_end::text AS "proposedEnd",created_at AS "createdAt" FROM leave_cancellation_reviews WHERE request_id=$1 AND status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW') ORDER BY created_at DESC LIMIT 1`,
      [id],
    );
    return {
      request: r,
      events,
      cancellationReview: cancellationReview ?? null,
      balance:
        e.branchId === r.branchId
          ? await this.balance(
              this.db.manager,
              r.employeeId,
              r.typeId,
              r.creditYear,
            )
          : null,
      canReview: reviewInScope && r.status === 'PENDING' && !cancellationReview,
    };
  }
  async decide(
    user: AuthUserContext,
    id: string,
    action: 'APPROVED' | 'REJECTED',
    comment = '',
  ) {
    this.management(user);
    if (action === 'REJECTED' && !comment.trim())
      throw new BadRequestException('A reason is required for rejection.');
    return this.withNotices(async (m, notify) => {
      const [lookup] = await m.query<
        Array<{ employee_id: string; branch_id: string }>
      >('SELECT employee_id,branch_id FROM leave_requests WHERE id=$1', [id]);
      if (!lookup) throw new NotFoundException('Request not found.');
      await lockLeaveDtr(m, lookup.branch_id);
      const e = await this.employee(lookup.employee_id, m, true);
      const [r] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.id=$1 FOR UPDATE OF r',
        [id],
      );
      await this.scope(user, r.branchId, m);
      const own = await this.own(user, m);
      const selfApproval = own?.id === r.employeeId;
      if (selfApproval && action !== 'APPROVED')
        throw new ForbiddenException(
          'Cancel your own request instead of rejecting it.',
        );
      if (r.status === action && r.decidedBy === user.userId) return r;
      if (r.status !== 'PENDING')
        throw new ConflictException(
          'This request already has a final decision.',
        );
      const [openCancellation] = await m.query(
        `SELECT id FROM leave_cancellation_reviews WHERE request_id=$1 AND status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW')`,
        [id],
      );
      if (openCancellation)
        throw new ConflictException(
          'Resolve the cancellation proposal before deciding this request.',
        );
      if (e.status !== 'ACTIVE')
        throw new ConflictException('The employee is no longer active.');
      if (e.branchId !== r.branchId)
        throw new ConflictException(
          'The employee changed branch. Cancel and refile this pending request.',
        );
      if (action === 'APPROVED') {
        await assertNoOfficialBusiness(m,e.id,r.startDate,r.endDate);
        const [worked] = await m.query(
          `SELECT a.id FROM attendance_records a JOIN leave_request_days d ON d.employee_id=a.employee_id AND d.work_date=a.work_date WHERE d.request_id=$1 AND (a.time_in IS NOT NULL OR a.time_out IS NOT NULL) AND d.units=1 LIMIT 1`,
          [id],
        );
        if (worked)
          throw new ConflictException(
            'Attendance is recorded on a requested full leave day. Reconcile it before approval.',
          );
        const b = await this.balance(m, e.id, r.typeId, r.creditYear);
        if (r.policy.paid && r.policy.blockInsufficient && b.available < 0)
          throw new ConflictException(
            'Leave credits no longer cover the reservation.',
          );
        if (r.policy.paid)
          await this.post(
            m,
            user,
            e,
            r.typeId,
            r.creditYear,
            'USAGE',
            -r.days,
            `usage:${id}`,
            'Approved leave',
            id,
          );
      }
      await m.query(
        'UPDATE leave_requests SET status=$2,decided_at=now(),decided_by=$3,decision_comment=$4 WHERE id=$1',
        [id, action, user.userId, comment.trim() || null],
      );
      await this.event(
        m,
        id,
        user,
        selfApproval ? 'SELF_APPROVED' : action,
        comment,
        e.branchId,
      );
      if (action === 'APPROVED')
        await synchronizeApprovedLeave(
          m,
          e.id,
          r.branchId,
          r.startDate,
          r.endDate,
        );
      await notify(id, false);
      return (
        await m.query<LeaveRequest[]>(requestSelect + ' WHERE r.id=$1', [id])
      )[0];
    });
  }
  async cancel(user: AuthUserContext, id: string, comment = '') {
    const own = await this.own(user);
    if (!own) throw new ForbiddenException('Linked employee required.');
    if (!comment.trim())
      throw new BadRequestException('A cancellation reason is required.');
    return this.withNotices(async (m, notify) => {
      const [lookup] = await m.query<
        Array<{ branch_id: string; employee_id: string }>
      >('SELECT branch_id,employee_id FROM leave_requests WHERE id=$1', [id]);
      if (!lookup || lookup.employee_id !== own.id)
        throw new ForbiddenException('Only your own leave can be cancelled.');
      await lockLeaveDtr(m, lookup.branch_id);
      const e = await this.employee(own.id, m, true);
      const [r] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.id=$1 FOR UPDATE OF r',
        [id],
      );
      if (!r || r.employeeId !== own.id)
        throw new ForbiddenException('Only your own leave can be cancelled.');
      if (r.status === 'CANCELLED') return r;
      const [openCancellation] = await m.query(
        `SELECT id FROM leave_cancellation_reviews WHERE request_id=$1 AND status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW')`,
        [id],
      );
      if (openCancellation)
        throw new ConflictException('A cancellation review is already open.');
      if (
        r.status !== 'PENDING' &&
        !(r.status === 'APPROVED' && r.startDate > today())
      )
        throw new ConflictException(
          'This request cannot be cancelled under its policy.',
        );
      if (r.status === 'APPROVED') {
        await this.openCancellation(m, r, user, 'EMPLOYEE', comment.trim());
        await this.event(m, id, user, 'CANCEL_REQUESTED', comment, r.branchId);
        await notify(
          id,
          true,
          'Leave cancellation approval needed',
          'An employee requests cancellation of approved leave. Review the request.',
        );
        return { pendingReview: true };
      }
      await this.finishCancellation(m, user, r, e, comment.trim());
      await notify(id, false);
      return { ok: true };
    });
  }
  private async openCancellation(
    m: EntityManager,
    r: LeaveRequest,
    user: AuthUserContext,
    origin: 'EMPLOYEE' | 'REVIEWER',
    reason: string,
  ) {
    const [active] = await m.query(
      "SELECT id FROM leave_cancellation_reviews WHERE request_id=$1 AND status IN ('AWAITING_EMPLOYEE','AWAITING_REVIEW')",
      [r.id],
    );
    if (active)
      throw new ConflictException('A cancellation review is already open.');
    await m.query(
      `INSERT INTO leave_cancellation_reviews(id,request_id,origin,status,reason,initiated_by) VALUES($1,$2,$3,$4,$5,$6)`,
      [
        randomUUID(),
        r.id,
        origin,
        origin === 'EMPLOYEE' ? 'AWAITING_REVIEW' : 'AWAITING_EMPLOYEE',
        reason,
        user.userId,
      ],
    );
  }
  private async finishCancellation(
    m: EntityManager,
    user: AuthUserContext,
    r: LeaveRequest,
    e: Employee,
    reason: string,
  ) {
    if (r.status === 'APPROVED' && r.startDate <= today())
      throw new ConflictException(
        'Approved leave can be cancelled only before it starts.',
      );
    if (r.status === 'APPROVED' && r.policy.paid)
      await this.post(
        m,
        user,
        { ...e, branchId: r.branchId },
        r.typeId,
        r.creditYear,
        'RESTORATION',
        r.days,
        `restoration:${r.id}`,
        'Approved cancellation',
        r.id,
      );
    await m.query(
      "UPDATE leave_requests SET status='CANCELLED',cancelled_at=now(),cancellation_reason=$2 WHERE id=$1",
      [r.id, reason],
    );
    await this.event(m, r.id, user, 'CANCELLED', reason, r.branchId);
    if (r.status === 'APPROVED')
      await synchronizeApprovedLeave(
        m,
        e.id,
        r.branchId,
        r.startDate,
        r.endDate,
      );
  }
  async proposeCancellation(user: AuthUserContext, id: string, reason: string) {
    this.management(user);
    if (!reason.trim())
      throw new BadRequestException('A cancellation reason is required.');
    return this.withNotices(async (m, notify) => {
      const [lookup] = await m.query<
        Array<{ branch_id: string; employee_id: string }>
      >('SELECT branch_id,employee_id FROM leave_requests WHERE id=$1', [id]);
      if (!lookup) throw new NotFoundException('Request not found.');
      await this.scope(user, lookup.branch_id, m);
      await lockLeaveDtr(m, lookup.branch_id);
      const e = await this.employee(lookup.employee_id, m, true);
      const [r] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.id=$1 FOR UPDATE OF r',
        [id],
      );
      if ((await this.own(user, m))?.id === r.employeeId)
        throw new ForbiddenException(
          'Use your personal leave actions for your own request.',
        );
      if (
        r.status !== 'PENDING' &&
        !(r.status === 'APPROVED' && r.startDate > today())
      )
        throw new ConflictException(
          'Only pending or future approved leave can be proposed for cancellation.',
        );
      await this.openCancellation(m, r, user, 'REVIEWER', reason.trim());
      await this.event(
        m,
        id,
        user,
        'CANCEL_PROPOSED',
        reason.trim(),
        e.branchId,
      );
      await notify(
        id,
        false,
        'Leave cancellation response needed',
        'A reviewer suggests cancelling your leave. Confirm, explain, or suggest new dates.',
      );
      return { pendingEmployee: true };
    });
  }
  async respondCancellation(
    user: AuthUserContext,
    id: string,
    input: {
      action: 'CONFIRM' | 'CONTINUE' | 'RESCHEDULE';
      comment: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (!input.comment.trim())
      throw new BadRequestException('A response is required.');
    return this.withNotices(async (m, notify) => {
      const own = await this.own(user, m);
      const [lookup] = await m.query<
        Array<{ branch_id: string; employee_id: string }>
      >('SELECT branch_id,employee_id FROM leave_requests WHERE id=$1', [id]);
      if (!own || !lookup || lookup.employee_id !== own.id)
        throw new ForbiddenException(
          'Only the concerned employee can respond.',
        );
      await lockLeaveDtr(m, lookup.branch_id);
      const e = await this.employee(own.id, m, true);
      const [r] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.id=$1 FOR UPDATE OF r',
        [id],
      );
      const [review] = await m.query<CancellationReview[]>(
        `SELECT id,request_id AS "requestId",origin,status,reason,response,proposed_start::text AS "proposedStart",proposed_end::text AS "proposedEnd",created_at AS "createdAt" FROM leave_cancellation_reviews WHERE request_id=$1 AND status='AWAITING_EMPLOYEE' FOR UPDATE`,
        [id],
      );
      if (!review || review.origin !== 'REVIEWER')
        throw new ConflictException(
          'No cancellation proposal awaits your response.',
        );
      if (r.status !== 'PENDING' && r.status !== 'APPROVED')
        throw new ConflictException('The leave request is already closed.');
      if (input.action === 'CONFIRM') {
        await this.finishCancellation(m, user, r, e, input.comment.trim());
        await m.query(
          "UPDATE leave_cancellation_reviews SET status='CLOSED',response=$2,resolved_by=$3,updated_at=now() WHERE id=$1",
          [review.id, input.comment.trim(), user.userId],
        );
        await notify(
          id,
          true,
          'Leave cancellation confirmed',
          'The employee confirmed the proposed cancellation.',
        );
        return { cancelled: true };
      }
      if (input.action === 'RESCHEDULE') {
        if (!input.startDate || !input.endDate)
          throw new BadRequestException('Choose new start and end dates.');
        range(input.startDate, input.endDate);
        if (input.startDate === r.startDate && input.endDate === r.endDate)
          throw new BadRequestException(
            'Choose different dates to reschedule.',
          );
        await this.quote(
          m,
          e,
          {
            typeId: r.typeId,
            startDate: input.startDate,
            endDate: input.endDate,
            halfDay: r.halfDay,
          },
          false,
          id,
        );
        await m.query(
          "UPDATE leave_cancellation_reviews SET status='AWAITING_REVIEW',response=$2,proposed_start=$3,proposed_end=$4,updated_at=now() WHERE id=$1",
          [review.id, input.comment.trim(), input.startDate, input.endDate],
        );
        await this.event(
          m,
          id,
          user,
          'RESCHEDULE_PROPOSED',
          input.comment.trim(),
          r.branchId,
        );
        await notify(
          id,
          true,
          'New leave dates proposed',
          'The employee proposed new dates for review.',
        );
        return { pendingReview: true };
      }
      await m.query(
        "UPDATE leave_cancellation_reviews SET status='CLOSED',response=$2,resolved_by=$3,updated_at=now() WHERE id=$1",
        [review.id, input.comment.trim(), user.userId],
      );
      await this.event(
        m,
        id,
        user,
        'CANCEL_DECLINED',
        input.comment.trim(),
        r.branchId,
      );
      await notify(
        id,
        true,
        'Leave cancellation declined',
        'The employee explained why the original leave should continue.',
      );
      return { continued: true };
    });
  }
  async decideCancellation(
    user: AuthUserContext,
    id: string,
    action: 'APPROVE' | 'REJECT',
    comment: string,
  ) {
    this.management(user);
    if (!comment.trim())
      throw new BadRequestException('A decision reason is required.');
    return this.withNotices(async (m, notify) => {
      const [lookup] = await m.query<
        Array<{ branch_id: string; employee_id: string }>
      >('SELECT branch_id,employee_id FROM leave_requests WHERE id=$1', [id]);
      if (!lookup) throw new NotFoundException('Request not found.');
      await this.scope(user, lookup.branch_id, m);
      await lockLeaveDtr(m, lookup.branch_id);
      const e = await this.employee(lookup.employee_id, m, true);
      const [r] = await m.query<LeaveRequest[]>(
        requestSelect + ' WHERE r.id=$1 FOR UPDATE OF r',
        [id],
      );
      if ((await this.own(user, m))?.id === r.employeeId)
        throw new ForbiddenException(
          'Another authorized reviewer must decide your cancellation request.',
        );
      const [review] = await m.query<CancellationReview[]>(
        `SELECT id,request_id AS "requestId",origin,status,reason,response,proposed_start::text AS "proposedStart",proposed_end::text AS "proposedEnd",created_at AS "createdAt" FROM leave_cancellation_reviews WHERE request_id=$1 AND status='AWAITING_REVIEW' FOR UPDATE`,
        [id],
      );
      if (!review)
        throw new ConflictException('No cancellation decision is pending.');
      if (r.status !== 'APPROVED' && r.status !== 'PENDING')
        throw new ConflictException('The leave request is already closed.');
      if (action === 'REJECT') {
        await m.query(
          "UPDATE leave_cancellation_reviews SET status='REJECTED',response=COALESCE(response,$2),resolved_by=$3,updated_at=now() WHERE id=$1",
          [review.id, comment.trim(), user.userId],
        );
        await this.event(
          m,
          id,
          user,
          'CANCEL_REJECTED',
          comment.trim(),
          r.branchId,
        );
        await notify(
          id,
          false,
          'Leave change declined',
          'The reviewer declined the proposed leave change. The original request remains in place.',
        );
        return { continued: true };
      }
      await this.finishCancellation(m, user, r, e, comment.trim());
      let replacementId: string | null = null;
      if (review.proposedStart && review.proposedEnd) {
        if (e.branchId !== r.branchId)
          throw new ConflictException(
            'The employee changed branch. File a new request in the current branch.',
          );
        const q = await this.quote(m, e, {
          typeId: r.typeId,
          startDate: review.proposedStart,
          endDate: review.proposedEnd,
          halfDay: r.halfDay,
        });
        const [documentRow] = await m.query<Array<{ present: boolean }>>(
          'SELECT EXISTS(SELECT 1 FROM leave_request_documents WHERE request_id=$1) AS present',
          [id],
        );
        if (q.policy.attachmentRule === 'REQUIRED' && !documentRow?.present)
          throw new ConflictException(
            'The new leave policy requires a supporting document. File a new request.',
          );
        replacementId = randomUUID();
        await m.query(
          `INSERT INTO leave_requests(id,employee_id,branch_id,type_id,credit_year,start_date,end_date,days,half_day,reason,policy,assigned_approver_id,submission_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13)`,
          [
            replacementId,
            e.id,
            r.branchId,
            r.typeId,
            Number(review.proposedStart.slice(0, 4)),
            review.proposedStart,
            review.proposedEnd,
            q.days,
            r.halfDay,
            r.reason,
            JSON.stringify({ ...q.policy, policyVersion: q.version }),
            r.assignedApproverId ?? user.userId,
            randomUUID(),
          ],
        );
        for (const d of q.dates)
          await m.query(
            'INSERT INTO leave_request_days(request_id,employee_id,branch_id,work_date,units) VALUES($1,$2,$3,$4,$5)',
            [replacementId, e.id, r.branchId, d.date, d.units],
          );
        if (q.policy.attachmentRule !== 'NONE')
          await m.query(
            'INSERT INTO leave_request_documents(request_id,file_name,mime_type,data) SELECT $2,file_name,mime_type,data FROM leave_request_documents WHERE request_id=$1',
            [id, replacementId],
          );
        await this.event(
          m,
          replacementId,
          user,
          'RESCHEDULED',
          `Rescheduled from ${id}. ${comment.trim()}`,
          r.branchId,
        );
        await notify(
          replacementId,
          true,
          'Rescheduled leave awaiting approval',
          'An employee has a new pending leave request for the proposed dates.',
        );
      }
      await m.query(
        "UPDATE leave_cancellation_reviews SET status='CLOSED',resolved_by=$2,replacement_request_id=$3,updated_at=now() WHERE id=$1",
        [review.id, user.userId, replacementId],
      );
      await notify(
        id,
        false,
        'Leave change approved',
        replacementId
          ? 'Your original leave was cancelled and a new request for the proposed dates is pending approval.'
          : 'Your approved leave cancellation was approved.',
      );
      return { cancelled: true, replacementRequestId: replacementId };
    });
  }
  async balances(
    user: AuthUserContext,
    f: FilterDto,
    mine = false,
    m: EntityManager = this.db.manager,
  ) {
    const s = await this.filter(user, f, mine, m),
      creditYear = year(f.year ?? Number(today().slice(0, 4)));
    const employees = await m.query<
      Array<{ id: string; name: string; branchId: string; branchName: string }>
    >(
      `SELECT e.id,e.name,e.branch_id AS "branchId",b.name AS "branchName" FROM employees e JOIN branches b ON b.id=e.branch_id WHERE ($1::text[] IS NULL OR e.branch_id=ANY($1)) AND ($2::text IS NULL OR e.id=$2) ORDER BY e.name LIMIT 2001`,
      [s.branches, s.employeeId ?? null],
    );
    const types = await m.query<LeaveType[]>(
      'SELECT * FROM leave_types WHERE ($1::uuid IS NULL OR id=$1) ORDER BY name',
      [f.typeId ?? null],
    );
    if (employees.length > 2000 || employees.length * types.length > 10000)
      throw new BadRequestException(
        'Narrow branch, employee or leave type filters to at most 10,000 balance rows and 2,000 employees.',
      );
    const result: Balance[] = [];
    for (const e of employees)
      for (const t of types) {
        const b = await this.balance(m, e.id, t.id, creditYear);
        let applicable = false;
        try {
          const p = await this.policy(
            m,
            t.id,
            creditYear === Number(today().slice(0, 4))
              ? today()
              : `${creditYear}-12-31`,
          );
          const full = await this.employee(e.id, m);
          await this.eligible(
            m,
            full,
            t,
            p,
            creditYear === Number(today().slice(0, 4))
              ? today()
              : `${creditYear}-12-31`,
          );
          applicable = p.policy.paid;
        } catch {
          /* Historical ledger rows remain visible after a policy is archived. */
        }
        if (
          applicable ||
          b.allocated ||
          b.adjustments ||
          b.used ||
          b.restored ||
          b.reserved
        )
          result.push({
            employeeId: e.id,
            employeeName: e.name,
            branchId: e.branchId,
            branchName: e.branchName,
            typeId: t.id,
            typeName: t.name,
            code: t.code,
            ...b,
            year: creditYear,
          });
      }
    return result;
  }
  async personalOverview(user: AuthUserContext, f: FilterDto) {
    await this.filter(user, f, true);
    const creditYear = year(f.year ?? Number(today().slice(0, 4)));
    const on =
      creditYear === Number(today().slice(0, 4))
        ? today()
        : `${creditYear}-12-31`;
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const own = await this.own(user, m);
      if (!own)
        throw new ConflictException(
          'Link your employee profile to view personal leave.',
        );
      const balances = await this.balances(user, { year: creditYear }, true, m);
      const summaries = await m.query<
        Array<{
          typeId: string;
          approvedDays: number;
          pendingDays: number;
          approvedRequests: number;
          pendingRequests: number;
        }>
      >(
        `SELECT type_id AS "typeId",COALESCE(sum(days) FILTER(WHERE status='APPROVED'),0)::float8 AS "approvedDays",COALESCE(sum(days) FILTER(WHERE status='PENDING'),0)::float8 AS "pendingDays",count(*) FILTER(WHERE status='APPROVED')::int AS "approvedRequests",count(*) FILTER(WHERE status='PENDING')::int AS "pendingRequests" FROM leave_requests WHERE employee_id=$1 AND credit_year=$2 AND NOT (policy->>'paid')::boolean GROUP BY type_id`,
        [own.id, creditYear],
      );
      const types = await m.query<LeaveType[]>(
        `SELECT t.*,v.policy FROM leave_types t JOIN LATERAL(SELECT policy FROM leave_type_versions WHERE type_id=t.id AND effective_from<=$1::date ORDER BY effective_from DESC,version DESC LIMIT 1)v ON true ORDER BY t.name`,
        [on],
      );
      const unpaid: Array<{
        typeId: string;
        typeName: string;
        code: string;
        approvedDays: number;
        pendingDays: number;
        approvedRequests: number;
        pendingRequests: number;
      }> = [];
      for (const t of types) {
        const summary = summaries.find((s) => s.typeId === t.id);
        let eligible = false;
        if (!t.policy.paid)
          try {
            await this.eligible(m, own, t, { policy: t.policy }, on);
            eligible = true;
          } catch {
            /* Retain personal historical usage after a policy is archived or changed. */
          }
        if (eligible || summary)
          unpaid.push({
            typeId: t.id,
            typeName: t.name,
            code: t.code,
            approvedDays: summary?.approvedDays ?? 0,
            pendingDays: summary?.pendingDays ?? 0,
            approvedRequests: summary?.approvedRequests ?? 0,
            pendingRequests: summary?.pendingRequests ?? 0,
          });
      }
      return { year: creditYear, balances, unpaid };
    });
  }
  async ledger(
    user: AuthUserContext,
    employeeId: string,
    typeId: string,
    creditYear: number,
  ) {
    this.management(user);
    const e = await this.employee(employeeId, this.db.manager);
    await this.scope(user, e.branchId);
    year(creditYear);
    return this.db.query(
      `SELECT c.id,c.kind,c.signed_days::float8 AS days,c.reason,c.created_at AS "createdAt",u.name AS actor FROM leave_credit_transactions c JOIN users u ON u.id=c.actor_id WHERE c.employee_id=$1 AND c.type_id=$2 AND c.credit_year=$3 ORDER BY c.created_at,c.id`,
      [employeeId, typeId, creditYear],
    );
  }
  async adjust(
    user: AuthUserContext,
    employeeId: string,
    input: AdjustmentDto,
  ) {
    this.configure(user);
    year(input.year);
    halfUnits(input.days);
    if (!input.reason.trim())
      throw new BadRequestException('A reason is required.');
    return this.db.transaction(async (m) => {
      const e = await this.employee(employeeId, m, true);
      await this.scope(user, e.branchId, m);
      const [t] = await m.query('SELECT id FROM leave_types WHERE id=$1', [
        input.typeId,
      ]);
      if (!t) throw new NotFoundException('Leave type not found.');
      const p = await this.policy(m, input.typeId, `${input.year}-12-31`);
      if (!p.policy.paid)
        throw new BadRequestException('Unpaid leave does not use credits.');
      if (p.policy.branchId && p.policy.branchId !== e.branchId)
        throw new ForbiddenException('Policy belongs to another branch.');
      const source = `adjustment:${input.key}`;
      const [old] = await m.query<
        Array<{
          employee_id: string;
          type_id: string;
          credit_year: number;
          signed_days: string;
          reason: string;
        }>
      >('SELECT * FROM leave_credit_transactions WHERE source_key=$1', [
        source,
      ]);
      if (old) {
        if (
          old.employee_id !== e.id ||
          old.type_id !== input.typeId ||
          old.credit_year !== input.year ||
          Number(old.signed_days) !== input.days ||
          old.reason !== input.reason.trim()
        )
          throw new ConflictException(
            'Adjustment key reused for different values.',
          );
        return { ok: true };
      }
      const before = await this.balance(m, e.id, input.typeId, input.year);
      if (before.available + input.days < 0)
        throw new ConflictException(
          'This adjustment would overdraw available or reserved credits.',
        );
      await this.post(
        m,
        user,
        e,
        input.typeId,
        input.year,
        'ADJUSTMENT',
        input.days,
        source,
        input.reason.trim(),
      );
      await this.audit(m, user, e.branchId, 'ADJUST_LEAVE', {
        employeeId: e.id,
        typeId: input.typeId,
        year: input.year,
        days: input.days,
        reason: input.reason.trim(),
      });
      return { before: before.available, after: before.available + input.days };
    });
  }
  async resetSettings(
    user: AuthUserContext,
    employeeId: string,
    typeId: string,
  ) {
    this.configure(user);
    const e = await this.employee(employeeId, this.db.manager);
    await this.scope(user, e.branchId);
    const [row] = await this.db.query<Array<{ nextDate: string | null }>>(
      'SELECT next_date::text AS "nextDate" FROM leave_balance_resets WHERE employee_id=$1 AND type_id=$2',
      [employeeId, typeId],
    );
    return row ?? { nextDate: null };
  }
  async saveResetSchedule(
    user: AuthUserContext,
    employeeId: string,
    input: ResetScheduleDto,
  ) {
    this.configure(user);
    if (input.nextDate) {
      date(input.nextDate);
      if (input.nextDate <= today() || input.nextDate.endsWith('02-29'))
        throw new BadRequestException(
          'Choose a future annual reset date other than February 29.',
        );
    }
    return this.db.transaction(async (m) => {
      const e = await this.employee(employeeId, m, true);
      await this.scope(user, e.branchId, m);
      await this.policy(m, input.typeId, today());
      await m.query(
        `INSERT INTO leave_balance_resets(employee_id,type_id,next_date,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT(employee_id,type_id) DO UPDATE SET next_date=EXCLUDED.next_date,actor_id=EXCLUDED.actor_id`,
        [employeeId, input.typeId, input.nextDate ?? null, user.userId],
      );
      await this.audit(m, user, e.branchId, 'SCHEDULE_LEAVE_RESET', {
        employeeId,
        typeId: input.typeId,
        nextDate: input.nextDate ?? null,
      });
      return { ok: true };
    });
  }
  async resetBalance(
    user: AuthUserContext,
    employeeId: string,
    input: ResetBalanceDto,
    scheduledDate?: string,
  ) {
    this.configure(user);
    if (!input.reason.trim())
      throw new BadRequestException('A reset reason is required.');
    return this.db.transaction(async (m) => {
      const e = await this.employee(employeeId, m, true);
      await this.scope(user, e.branchId, m);
      if (scheduledDate) {
        const [schedule] = await m.query(
          'SELECT next_date::text AS day FROM leave_balance_resets WHERE employee_id=$1 AND type_id=$2 FOR UPDATE',
          [employeeId, input.typeId],
        );
        if (schedule?.day !== scheduledDate || scheduledDate > today())
          return { ok: true };
      }
      const creditYear = Number(today().slice(0, 4));
      const p = await this.policy(m, input.typeId, today());
      const [t] = await m.query<LeaveType[]>(
        'SELECT * FROM leave_types WHERE id=$1',
        [input.typeId],
      );
      await this.eligible(m, e, t, p, today());
      if (!p.policy.paid)
        throw new BadRequestException('Unpaid leave has no credits to reset.');
      const source = scheduledDate
        ? `reset:scheduled:${employeeId}:${input.typeId}:${scheduledDate}`
        : `reset:manual:${input.key}`;
      const [old] = await m.query(
        'SELECT employee_id,type_id FROM leave_balance_reset_runs WHERE source_key=$1',
        [source],
      );
      if (old) {
        if (old.employee_id !== employeeId || old.type_id !== input.typeId)
          throw new ConflictException('Reset key already used.');
        return { ok: true };
      }
      const before = await this.balance(
        m,
        employeeId,
        input.typeId,
        creditYear,
      );
      if (before.reserved > p.policy.annualDays)
        throw new ConflictException(
          'Pending reservations exceed the annual allowance. Resolve them before resetting.',
        );
      const days = p.policy.annualDays - before.available - before.reserved;
      if (days)
        await this.post(
          m,
          user,
          e,
          input.typeId,
          creditYear,
          'ADJUSTMENT',
          days,
          source,
          input.reason.trim(),
        );
      await m.query(
        'INSERT INTO leave_balance_reset_runs(source_key,employee_id,type_id,credit_year) VALUES($1,$2,$3,$4)',
        [source, employeeId, input.typeId, creditYear],
      );
      // Prevent the annual allocator from granting a second allowance after a reset.
      await m.query(
        `INSERT INTO leave_balance_reset_runs(source_key,employee_id,type_id,credit_year) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          `annual-reset:${employeeId}:${input.typeId}:${creditYear}`,
          employeeId,
          input.typeId,
          creditYear,
        ],
      );
      if (scheduledDate) {
        const next = `${creditYear + 1}${scheduledDate.slice(4)}`;
        await m.query(
          'UPDATE leave_balance_resets SET next_date=$3 WHERE employee_id=$1 AND type_id=$2',
          [employeeId, input.typeId, next],
        );
      }
      await this.audit(m, user, e.branchId, 'RESET_LEAVE_BALANCE', {
        employeeId,
        typeId: input.typeId,
        creditYear,
        before: before.available,
        after: p.policy.annualDays - before.reserved,
        reason: input.reason,
        scheduledDate,
      });
      return { ok: true };
    });
  }
  async runScheduledResets() {
    const schedules = await this.db.query<
      Array<{
        employeeId: string;
        typeId: string;
        day: string;
        actorId: string;
      }>
    >(
      `SELECT employee_id AS "employeeId",type_id AS "typeId",next_date::text AS day,actor_id AS "actorId" FROM leave_balance_resets WHERE next_date <= $1 ORDER BY employee_id,type_id`,
      [today()],
    );
    for (const s of schedules) {
      try {
        const [actor] = await this.db.query<AuthUserContext[]>(
          `SELECT id AS "userId",role,branch_id AS "branchId",CASE WHEN role='SUPER_ADMIN' OR branch_id IS NULL THEN 'ALL' ELSE 'BRANCH' END AS scope FROM users WHERE id=$1 AND status='ACTIVE' AND role IN ('SUPER_ADMIN','HR_ADMIN')`,
          [s.actorId],
        );
        if (actor) {
          const [access] = await this.db.query<
            Array<{ mode: string; branchIds: string[] }>
          >(
            'SELECT mode,branch_ids AS "branchIds" FROM employee_branch_access WHERE user_id=$1',
            [actor.userId],
          );
          if (actor.role !== 'SUPER_ADMIN' && access?.mode === 'SELECTED') {
            actor.branchIds = access.branchIds;
            actor.scope = 'BRANCH';
          }
          if (access?.mode === 'ALL') {
            actor.allBranches = true;
            actor.scope = 'ALL';
          }
          await this.resetBalance(
            actor,
            s.employeeId,
            {
              typeId: s.typeId,
              key: randomUUID(),
              reason: `Scheduled annual reset due ${s.day}`,
            },
            s.day,
          );
        }
      } catch {
        console.warn('Scheduled leave balance reset failed; will retry.');
      }
    }
  }
  async saveType(user: AuthUserContext, input: TypeDto, id?: string) {
    this.configure(user);
    date(input.effectiveFrom);
    halfUnits(input.annualDays, true);
    if (!input.name.trim())
      throw new BadRequestException('A leave type name is required.');
    if (
      input.automaticAllocation &&
      (input.frequency !== 'ANNUAL' || !input.paid)
    )
      throw new BadRequestException(
        'Automatic grants require a paid annual policy.',
      );
    if (input.code === 'SIL' && input.eligibility !== 'ASSIGNED')
      throw new BadRequestException(
        'SIL requires explicit HR eligibility assignments.',
      );
    const scopes = await this.scope(user);
    if (
      scopes !== null &&
      (!input.branchId || !scopes.includes(input.branchId))
    )
      throw new ForbiddenException(
        'Branch HR can edit policies for their own branch only.',
      );
    if (
      input.branchId &&
      !(
        await this.db.query('SELECT id FROM branches WHERE id=$1', [
          input.branchId,
        ])
      ).length
    )
      throw new BadRequestException('Branch not found.');
    const policy: Policy = {
      annualDays: input.annualDays,
      paid: input.paid,
      eligibility: input.eligibility,
      frequency: input.frequency,
      halfDay: input.halfDay,
      attachmentRule: input.attachmentRule,
      automaticAllocation: input.automaticAllocation,
      blockInsufficient: input.blockInsufficient,
      minimumServiceMonths: input.minimumServiceMonths,
      minimumNoticeDays: input.minimumNoticeDays ?? 0,
      employmentTypes: input.employmentTypes,
      branchId: input.branchId ?? null,
      allowApprovedCancellation: input.allowApprovedCancellation,
      carryover: 'NONE',
    };
    return this.db
      .transaction(async (m) => {
        const typeId = id ?? randomUUID();
        let next = 1;
        if (id) {
          const [old] = await m.query<LeaveType[]>(
            'SELECT * FROM leave_types WHERE id=$1 FOR UPDATE',
            [id],
          );
          if (!old) throw new NotFoundException('Leave type not found.');
          const previous = await this.policy(m, id, '2200-12-31');
          if (
            scopes !== null &&
            (!previous.policy.branchId ||
              !scopes.includes(previous.policy.branchId))
          )
            throw new ForbiddenException(
              'Global settings require organization-wide HR access.',
            );
          if (old.version !== input.version)
            throw new ConflictException(
              'This policy changed. Refresh before saving.',
            );
          if (old.code !== input.code)
            throw new BadRequestException('A leave type code is immutable.');
          next = old.version + 1;
          await m.query(
            'UPDATE leave_types SET name=$2,description=$3,active=$4,version=$5 WHERE id=$1',
            [id, input.name.trim(), input.description, input.active, next],
          );
        } else {
          const exists = await m.query(
            'SELECT id FROM leave_types WHERE code=$1',
            [input.code],
          );
          if (exists.length)
            throw new ConflictException('This leave type code already exists.');
          await m.query(
            'INSERT INTO leave_types(id,code,name,description,active) VALUES($1,$2,$3,$4,$5)',
            [
              typeId,
              input.code,
              input.name.trim(),
              input.description,
              input.active,
            ],
          );
        }
        await m.query(
          'INSERT INTO leave_type_versions(type_id,version,policy,effective_from,actor_id) VALUES($1,$2,$3::jsonb,$4,$5)',
          [
            typeId,
            next,
            JSON.stringify(policy),
            input.effectiveFrom,
            user.userId,
          ],
        );
        await this.audit(m, user, input.branchId ?? null, 'SAVE_LEAVE_TYPE', {
          typeId,
          version: next,
        });
        return { id: typeId, version: next };
      })
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === '23505'
        )
          throw new ConflictException('This leave type code already exists.');
        throw error;
      });
  }
  async assign(user: AuthUserContext, input: AssignmentDto) {
    this.configure(user);
    if (!input.reason.trim())
      throw new BadRequestException('An eligibility reason is required.');
    return this.db.transaction(async (m) => {
      const e = await this.employee(input.employeeId, m, true);
      await this.scope(user, e.branchId, m);
      const [t] = await m.query<LeaveType[]>(
        'SELECT * FROM leave_types WHERE id=$1',
        [input.typeId],
      );
      if (!t) throw new NotFoundException('Leave type not found.');
      const p = await this.policy(m, t.id, '2200-12-31');
      if (p.policy.branchId && p.policy.branchId !== e.branchId)
        throw new ForbiddenException('Policy belongs to another branch.');
      if (t.code === 'SIL' && input.eligible && !input.silVerified)
        throw new BadRequestException(
          'Confirm SIL eligibility and equivalent benefits before assigning it.',
        );
      await m.query(
        'INSERT INTO leave_type_assignments(employee_id,type_id,eligible,sil_verified,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(employee_id,type_id) DO UPDATE SET eligible=$3,sil_verified=$4,reason=$5,actor_id=$6,updated_at=now()',
        [
          e.id,
          t.id,
          input.eligible,
          input.silVerified,
          input.reason.trim(),
          user.userId,
        ],
      );
      await this.audit(m, user, e.branchId, 'ASSIGN_LEAVE_ELIGIBILITY', {
        employeeId: input.employeeId,
        typeId: input.typeId,
        eligible: input.eligible,
        silVerified: input.silVerified,
        reason: input.reason.trim(),
      });
      return { ok: true };
    });
  }
  async allocate(user: AuthUserContext, input: AllocateDto) {
    this.configure(user);
    year(input.year);
    if (!input.reason.trim())
      throw new BadRequestException('An allocation reason is required.');
    if (input.year > Number(today().slice(0, 4)))
      throw new BadRequestException(
        'Annual allocation cannot run before its credit year.',
      );
    const scopes = await this.scope(user);
    const on =
      input.year === Number(today().slice(0, 4))
        ? today()
        : `${input.year}-12-31`;
    let granted = 0;
    await this.db.transaction(async (m) => {
      const employees = await m.query<Array<{ id: string }>>(
        `SELECT id FROM employees WHERE status='ACTIVE' AND ($1::text[] IS NULL OR branch_id=ANY($1)) ORDER BY id FOR UPDATE`,
        [scopes],
      );
      const types = await m.query<LeaveType[]>(
        'SELECT * FROM leave_types WHERE active ORDER BY id',
      );
      for (const row of employees) {
        const e = await this.employee(row.id, m);
        for (const t of types) {
          let p;
          try {
            p = await this.policy(m, t.id, on);
            await this.eligible(m, e, t, p, on);
          } catch {
            continue;
          }
          if (
            !p.policy.automaticAllocation ||
            p.policy.frequency !== 'ANNUAL' ||
            !p.policy.paid ||
            !p.policy.annualDays
          )
            continue;
          const result = await m.query(
            `INSERT INTO leave_credit_transactions(id,employee_id,branch_id,type_id,credit_year,kind,signed_days,source_key,reason,actor_id,policy_version) SELECT $1,$2,$3,$4,$5,'ALLOCATION',$6,$7,$8,$9,$10 WHERE NOT EXISTS(SELECT 1 FROM leave_balance_reset_runs WHERE employee_id=$2 AND type_id=$4 AND credit_year=$5) ON CONFLICT(source_key) DO NOTHING RETURNING id`,
            [
              randomUUID(),
              e.id,
              e.branchId,
              t.id,
              input.year,
              p.policy.annualDays,
              `annual:${e.id}:${t.id}:${input.year}`,
              input.reason.trim(),
              user.userId,
              p.version,
            ],
          );
          granted += result.length;
        }
      }
      await this.audit(m, user, null, 'ALLOCATE_LEAVE', {
        year: input.year,
        granted,
        reason: input.reason,
      });
    });
    return { granted };
  }
  async report(user: AuthUserContext, f: FilterDto) {
    this.management(user);
    const current = year(f.year ?? Number(today().slice(0, 4)));
    const from = f.from ?? `${current}-01-01`,
      to = f.to ?? `${current}-12-31`;
    range(from, to);
    if (Number(from.slice(0, 4)) !== current)
      throw new BadRequestException('Report dates must match the credit year.');
    const scope = await this.scope(user, f.branchId);
    return this.db.transaction('REPEATABLE READ', async (m) => {
      const balances = await this.balances(
        user,
        {
          year: current,
          branchId: f.branchId,
          employeeId: f.employeeId,
          typeId: f.typeId,
        },
        false,
        m,
      );
      const requests = await m.query<
        Array<{
          id: string;
          employeeName: string;
          branchName: string;
          typeName: string;
          typeId: string;
          paid: boolean;
          status: string;
          days: number;
          startDate: string;
          endDate: string;
        }>
      >(
        `SELECT r.id,r.type_id AS "typeId",(r.policy->>'paid')::boolean AS paid,e.name AS "employeeName",b.name AS "branchName",t.name AS "typeName",r.status,r.days::float8 AS days,r.start_date::text AS "startDate",r.end_date::text AS "endDate" FROM leave_requests r JOIN employees e ON e.id=r.employee_id JOIN branches b ON b.id=r.branch_id JOIN leave_types t ON t.id=r.type_id WHERE ($1::text[] IS NULL OR r.branch_id=ANY($1)) AND ($2::text IS NULL OR r.employee_id=$2) AND ($3::uuid IS NULL OR r.type_id=$3) AND ($4::text IS NULL OR r.status=$4) AND r.end_date>=$5::date AND r.start_date<=$6::date ORDER BY r.start_date,r.id LIMIT 10001`,
        [
          scope,
          f.employeeId ?? null,
          f.typeId ?? null,
          f.status ?? null,
          from,
          to,
        ],
      );
      if (requests.length > 10000)
        throw new BadRequestException(
          'Narrow the report filters to at most 10,000 requests.',
        );
      const definitions = await m.query<
        Array<{
          id: string;
          name: string;
          code: string;
          active: boolean;
          paid: boolean;
          effectiveFrom: string;
        }>
      >(
        `SELECT t.id,t.name,t.code,t.active,(v.policy->>'paid')::boolean AS paid,v.effective_from::text AS "effectiveFrom" FROM leave_types t JOIN leave_type_versions v ON v.type_id=t.id AND v.version=t.version WHERE ($1::uuid IS NULL OR t.id=$1) AND ((v.policy->>'branchId') IS NULL OR $2::text[] IS NULL OR (v.policy->>'branchId')=ANY($2) OR t.id=ANY($3::uuid[])) ORDER BY t.name`,
        [
          f.typeId ?? null,
          scope,
          [
            ...new Set([
              ...balances.map((b) => b.typeId),
              ...requests.map((r) => r.typeId),
            ]),
          ],
        ],
      );
      const typeBreakdown = definitions.map((t) => {
        const credits = balances.filter((b) => b.typeId === t.id),
          unpaid = requests.filter((r) => r.typeId === t.id && !r.paid);
        return {
          typeId: t.id,
          typeName: t.name,
          code: t.code,
          paid: t.paid,
          active: t.active,
          effectiveFrom: t.effectiveFrom,
          used: credits.reduce((n, b) => n + b.used - b.restored, 0),
          available: credits.reduce((n, b) => n + b.available, 0),
          reserved: credits.reduce((n, b) => n + b.reserved, 0),
          approvedUnpaidDays: unpaid
            .filter((r) => r.status === 'APPROVED')
            .reduce((n, r) => n + r.days, 0),
          pendingUnpaidDays: unpaid
            .filter((r) => r.status === 'PENDING')
            .reduce((n, r) => n + r.days, 0),
        };
      });
      return {
        year: current,
        from,
        to,
        balances,
        requests,
        typeBreakdown,
        asOf: today(),
        basis:
          'Credits are for the full credit year. Date and status filters apply to request records; available credits include live reservations. Branch balances use current assignments; request history uses the filed branch snapshot.',
      };
    });
  }
  private async withNotices<T>(
    run: (
      m: EntityManager,
      notify: (
        id: string,
        reviewers: boolean,
        title?: string,
        message?: string,
      ) => Promise<void>,
    ) => Promise<T>,
  ): Promise<T> {
    const notices: Array<{ id: string; reviewers: boolean }> = [];
    const result = await this.db.transaction((m) =>
      run(m, async (id, reviewers, title, message) => {
        if (await this.notify(m, id, reviewers, title, message))
          notices.push({ id, reviewers });
      }),
    );
    // SMTP runs only after commit. A rollback or idempotent retry sends nothing.
    for (const notice of notices)
      if (this.email)
        void this.deliverMail(notice.id, notice.reviewers).catch(() =>
          console.warn(
            'Leave email delivery failed; the committed leave record is preserved.',
          ),
        );
    return result;
  }
  private async deliverMail(id: string, reviewers: boolean) {
    const href = `${reviewers ? '/leave' : '/my-leave'}?requestId=${id}`;
    const recipients = await this.db.query<
      Array<{ email: string; name: string; status: string }>
    >(
      `SELECT DISTINCT u.email,u.name,r.status FROM notifications n JOIN users u ON u.id=n.user_id JOIN leave_requests r ON r.id=$2 WHERE n.href=$1 AND u.status='ACTIVE'`,
      [href, id],
    );
    for (const recipient of recipients)
      await this.email?.sendLeaveNotice(
        recipient.email,
        recipient.name,
        id,
        reviewers,
        recipient.status,
      );
  }
  async post(
    m: EntityManager,
    u: AuthUserContext,
    e: Employee,
    typeId: string,
    creditYear: number,
    kind: string,
    days: number,
    source: string,
    reason: string,
    requestId?: string,
  ) {
    await m.query(
      'INSERT INTO leave_credit_transactions(id,employee_id,branch_id,type_id,credit_year,kind,signed_days,source_key,request_id,reason,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [
        randomUUID(),
        e.id,
        e.branchId,
        typeId,
        creditYear,
        kind,
        days,
        source,
        requestId ?? null,
        reason,
        u.userId,
      ],
    );
  }
  async audit(
    m: EntityManager,
    u: AuthUserContext,
    branchId: string | null,
    action: string,
    details: object,
  ) {
    await m.query(
      'INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,$4,$5,$6,now())',
      [
        randomUUID(),
        u.userId,
        branchId,
        action,
        'leave',
        JSON.stringify(details),
      ],
    );
  }
  async event(
    m: EntityManager,
    id: string,
    u: AuthUserContext,
    action: string,
    comment: string,
    branchId: string,
  ) {
    await m.query(
      'INSERT INTO leave_request_events(id,request_id,actor_id,action,comment,actor_name,actor_role) VALUES($1,$2,$3::varchar(100),$4,$5,(SELECT name FROM users WHERE id=$3::varchar(100)),$6)',
      [randomUUID(), id, u.userId, action, comment || null, u.role],
    );
    await this.audit(m, u, branchId, action, {
      requestId: id,
      actorRole: u.role,
      selfApproved: action === 'SELF_APPROVED',
    });
  }
  async notify(
    m: EntityManager,
    id: string,
    reviewers: boolean,
    title?: string,
    message?: string,
  ) {
    await m.query('SAVEPOINT leave_notification');
    try {
      await m.query(
        `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name) SELECT gen_random_uuid()::text,u.id,r.branch_id,$2,$3,'INFO',false,now(),$4||r.id,COALESCE((SELECT COALESCE(v.actor_name,actor.name) FROM leave_request_events v JOIN users actor ON actor.id=v.actor_id WHERE v.request_id=r.id ORDER BY v.created_at DESC,v.id DESC LIMIT 1),'System') FROM leave_requests r JOIN employees e ON e.id=r.employee_id CROSS JOIN users u WHERE r.id=$1 AND u.status='ACTIVE' AND CASE WHEN $5::boolean THEN u.employee_id IS DISTINCT FROM e.id AND (CASE WHEN r.assigned_approver_id IS NOT NULL THEN u.id=r.assigned_approver_id ELSE u.role='SUPER_ADMIN' OR u.role='HR_ADMIN' AND (u.branch_id IS NULL OR u.branch_id=r.branch_id) END) ELSE u.employee_id=e.id END`,
        [
          id,
          title ??
            (reviewers ? 'Leave request submitted' : 'Leave request updated'),
          message ??
            (reviewers
              ? 'A leave request is ready for review.'
              : 'Your leave request status has changed. Open it for details.'),
          reviewers ? '/leave?requestId=' : '/my-leave?requestId=',
          reviewers,
        ],
      );
      await m.query('RELEASE SAVEPOINT leave_notification');
      return true;
    } catch {
      await m.query('ROLLBACK TO SAVEPOINT leave_notification');
      await m.query('RELEASE SAVEPOINT leave_notification');
      console.warn(
        'Leave notification could not be saved; the leave transaction is preserved.',
      );
      return false;
    }
  }
}
