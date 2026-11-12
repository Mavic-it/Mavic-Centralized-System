import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import { selectedBranchScope } from '../foundation/auth/branch-scope.js';
import type {
  CreateIncidentDto,
  CreateTaskDto,
  CreateTaskTemplateDto,
  RecordOffenseDto,
  TaskExportQueryDto,
  TaskTemplateQueryDto,
  WorkActionDto,
  WorkFilterDto,
} from './work.dto.js';
import {
  addCalendarDays,
  manilaCalendarDate,
  nextTaskOccurrence,
  type TaskRecurrence,
} from './task-recurrence.js';
import { taskPdf, taskWorkbook, type TaskExportRow } from './task-export.js';
import {
  hasDisciplinaryAuthority,
  IncidentAuthorityService,
} from './incident-authority.js';
import { incidentCsv, incidentStep, incidentWorkbook, incidentPdf } from './incident-report.js';
import {
  incidentTransition,
  reportTransition,
  taskTransition,
  taskStatusChange,
  validDate,
  type WorkKind,
  type WorkRecord,
} from './work.policy.js';

type Employee = {
  id: string;
  name: string;
  branchId: string;
  status: string;
  profilePictureUpdatedAt?: string | null;
  taskEmail?: string | null;
  taskEmailReady?: boolean;
};
export type WorkUpload = { buffer: Buffer; originalname: string };
type ValidatedUpload = { buffer: Buffer; filename: string; mime: string };
type Event = {
  id: string;
  action: string;
  audience: string;
  message: string;
  actorId: string;
  createdAt: string;
  actorName: string;
  details: Record<string, unknown>;
};
// The immutable creation role also covers reports created before immediate sharing.
// Do not derive this from the reporter's current role, which may change later.
const managementReportSql = `EXISTS(SELECT 1 FROM work_events created WHERE created.incident_id=t.id AND created.action='CREATED' AND created.actor_id=t.reporter_id AND created.details->>'actorRole' IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER'))`;
const supervisorReportSql = 't.employee_id=ANY($12::varchar[])';
export class WorkService {
  constructor(private readonly db: DataSource) {}
  incidentAuthority() {
    return new IncidentAuthorityService(this.db);
  }
  private allowed(u: AuthUserContext) {
    if (
      ![
        'SUPER_ADMIN',
        'IT_ADMIN',
        'HR_ADMIN',
        'BRANCH_MANAGER',
        'STAFF',
        'EMPLOYEE',
      ].includes(u.role)
    )
      throw new ForbiddenException('This module is unavailable for your role.');
  }
  private manager(u: AuthUserContext) {
    return ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(u.role);
  }
  private hr(u: AuthUserContext) {
    return ['SUPER_ADMIN', 'HR_ADMIN'].includes(u.role);
  }
  private scope(u: AuthUserContext) {
    return selectedBranchScope(u) ?? null;
  }
  private inScope(u: AuthUserContext, branchId: string) {
    const scope = this.scope(u);
    return scope === null || scope.includes(branchId);
  }
  private async own(
    u: AuthUserContext,
    m: EntityManager = this.db.manager,
  ): Promise<Employee | null> {
    const rows = await m.query<Employee[]>(
      `SELECT e.id,e.name,e.branch_id AS "branchId",e.status FROM users u JOIN employees e ON e.id=u.employee_id WHERE u.id=$1 AND u.status='ACTIVE'`,
      [u.userId],
    );
    return rows[0] ?? null;
  }
  private async employee(id: string, m: EntityManager): Promise<Employee> {
    const rows = await m.query<Employee[]>(
      `SELECT e.id,e.name,e.branch_id AS "branchId",e.status FROM employees e JOIN branches b ON b.id=e.branch_id WHERE e.id=$1 AND b.status='ACTIVE' FOR SHARE OF e,b`,
      [id],
    );
    if (!rows[0] || rows[0].status !== 'ACTIVE')
      throw new BadRequestException('Select an active employee.');
    return rows[0];
  }
  async context(u: AuthUserContext, kind: WorkKind) {
    this.allowed(u);
    const own = await this.own(u);
    const scope = this.scope(u);
    const branches = await this.db.query<Array<{ id: string; name: string }>>(
      `SELECT id,name FROM branches WHERE is_active=true AND ($1::text[] IS NULL OR id=ANY($1)) AND ($2::boolean OR id=$3) ORDER BY name`,
      [scope, this.manager(u), own?.branchId ?? null],
    );
    const employeeRows = this.manager(u)
      ? await this.db.query<Employee[]>(
          `SELECT e.id,e.name,e.branch_id AS "branchId",e.status,picture.updated_at AS "profilePictureUpdatedAt",(SELECT account.email FROM users account WHERE account.employee_id=e.id AND account.status='ACTIVE' AND account.role IN ('SUPER_ADMIN','IT_ADMIN','HR_ADMIN','BRANCH_MANAGER','STAFF','EMPLOYEE') LIMIT 1) AS "taskEmail" FROM employees e JOIN branches b ON b.id=e.branch_id LEFT JOIN employee_profile_pictures picture ON picture.employee_id=e.id WHERE e.status='ACTIVE' AND b.is_active=true AND ($1::text[] IS NULL OR e.branch_id=ANY($1)) ORDER BY e.name`,
          [scope],
        )
      : [];
    // Tell task creators when a selected employee cannot receive task mail,
    // without exposing the employee account's email address to the browser.
    const employees = employeeRows.map(({ taskEmail, ...employee }) => ({
      ...employee,
      taskEmailReady:
        !!taskEmail && isEmail(taskEmail) && !/[\r\n]/.test(taskEmail),
    }));
    const reviewers =
      kind === 'incidents' && this.manager(u)
        ? await this.db.query<Array<{ id: string; name: string }>>(
            `SELECT u.id,u.name,u.role FROM users u LEFT JOIN employee_branch_access a ON a.user_id=u.id WHERE u.status='ACTIVE' AND u.role IN ('HR_ADMIN','BRANCH_MANAGER','SUPER_ADMIN') AND (u.role='SUPER_ADMIN' OR a.mode='ALL' OR a.mode='SELECTED' AND a.branch_ids && $1::text[] OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.role='HR_ADMIN' AND u.branch_id IS NULL OR u.branch_id=ANY($1::text[]) OR EXISTS(SELECT 1 FROM branches b WHERE b.id=ANY($1::text[]) AND b.manager_user_id=u.id))) ORDER BY u.name`,
            [branches.map((b) => b.id)],
          )
        : [];
    return {
      ownEmployee: own,
      canManage: this.manager(u),
      canAssignReviewer: this.hr(u),
      canManageAuthority: kind === 'incidents' && u.role === 'SUPER_ADMIN',
      branches,
      employees,
      reviewers,
    };
  }
  async taskTemplates(u: AuthUserContext, filter: TaskTemplateQueryDto) {
    this.allowed(u);
    if (!this.manager(u))
      throw new ForbiddenException('Task templates are manager-only.');
    if (!this.inScope(u, filter.branchId))
      throw new ForbiddenException('Task template branch access denied.');
    const branches = await this.db.query<Array<{ id: string }>>(
      'SELECT id FROM branches WHERE id=$1 AND is_active=true',
      [filter.branchId],
    );
    if (!branches.length)
      throw new BadRequestException('Select an active branch.');
    return this.db.query<
      Array<{
        id: string;
        branchId: string | null;
        name: string;
        title: string;
        description: string;
        priority: string;
        isSystem: boolean;
      }>
    >(
      `SELECT id,branch_id AS "branchId",name,title,description,priority,is_system AS "isSystem"
       FROM work_task_templates WHERE branch_id IS NULL OR branch_id=$1
       ORDER BY is_system DESC,name`,
      [filter.branchId],
    );
  }
  async createTaskTemplate(u: AuthUserContext, input: CreateTaskTemplateDto) {
    this.allowed(u);
    if (!this.manager(u))
      throw new ForbiddenException('Task templates are manager-only.');
    if (!this.inScope(u, input.branchId))
      throw new ForbiddenException('Task template branch access denied.');
    const name = this.text(input.name);
    const title = this.text(input.title);
    const description = this.text(input.description);
    try {
      return await this.db.transaction(async (m) => {
        const branch = await m.query<Array<{ id: string }>>(
          'SELECT id FROM branches WHERE id=$1 AND is_active=true FOR SHARE',
          [input.branchId],
        );
        if (!branch.length)
          throw new BadRequestException('Select an active branch.');
        const id = randomUUID();
        await m.query(
          `INSERT INTO work_task_templates(id,branch_id,created_by,name,title,description,priority)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            input.branchId,
            u.userId,
            name,
            title,
            description,
            input.priority,
          ],
        );
        await m.query(
          `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
           VALUES($1,$2,$3,'WORK_TASK_TEMPLATE_CREATED','task-template',$4,now())`,
          [randomUUID(), u.userId, input.branchId, { templateId: id, name }],
        );
        return { id };
      });
    } catch (error) {
      const databaseError =
        error && typeof error === 'object' && 'driverError' in error
          ? error.driverError
          : error;
      if (
        databaseError &&
        typeof databaseError === 'object' &&
        'code' in databaseError &&
        databaseError.code === '23505'
      )
        throw new ConflictException(
          'A template with that name already exists in this branch.',
        );
      throw error;
    }
  }
  private query(kind: WorkKind) {
    return kind === 'tasks'
      ? `SELECT t.id,t.branch_id AS "branchId",t.employee_id AS "employeeId",t.created_by AS "createdBy",t.series_id AS "seriesId",t.template_id AS "templateId",to_char(t.occurrence_date,'YYYY-MM-DD') AS "occurrenceDate",(SELECT s.recurrence FROM work_task_series s WHERE s.id=t.series_id) AS recurrence,(SELECT to_char(s.ends_on,'YYYY-MM-DD') FROM work_task_series s WHERE s.id=t.series_id) AS "recurrenceEndDate",(SELECT s.is_active FROM work_task_series s WHERE s.id=t.series_id) AS "recurrenceActive",t.title,t.description,t.status,t.version,t.progress,t.priority,(SELECT jsonb_agg(jsonb_build_object('id',ta.employee_id,'name',ae.name,'branchId',ta.branch_id,'currentBranchId',ae.branch_id,'branchName',ab.name,'profilePictureUpdatedAt',ap.updated_at) ORDER BY ae.name,ae.id) FROM work_task_assignees ta JOIN employees ae ON ae.id=ta.employee_id JOIN branches ab ON ab.id=ta.branch_id LEFT JOIN employee_profile_pictures ap ON ap.employee_id=ae.id WHERE ta.task_id=t.id) AS assignees,to_char(t.start_date,'YYYY-MM-DD') AS "startDate",to_char(t.due_date,'YYYY-MM-DD') AS "dueDate",t.created_at AS "createdAt",e.name AS "employeeName",picture.updated_at AS "profilePictureUpdatedAt",e.branch_id AS "currentBranchId",b.name AS "branchName" FROM work_tasks t JOIN employees e ON e.id=t.employee_id JOIN branches b ON b.id=t.branch_id LEFT JOIN employee_profile_pictures picture ON picture.employee_id=e.id`
      : `SELECT t.id,t.branch_id AS "branchId",t.employee_id AS "employeeId",t.reporter_id AS "reporterId",t.reviewer_id AS "reviewerId",${managementReportSql} AS "sharedWithSubject",t.report_scope AS "reportScope",t.title,t.description,t.status,t.version,t.category,(SELECT ev.details->>'offense' FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='OFFENSE_RECORDED' AND ev.details->>'employeeId'=t.employee_id ORDER BY ev.sequence DESC LIMIT 1) AS offense,t.reference_number AS "referenceNumber",t.report_source AS "reportSource",to_char(t.incident_time,'HH24:MI') AS "incidentTime",t.remarks,t.case_status AS "caseStatus",t.case_started_at AS "caseStartedAt",t.resolved_at AS "resolvedAt",(SELECT name FROM users WHERE id=t.resolved_by) AS "resolvedByName",t.resolution_summary AS "resolutionSummary",t.closed_at AS "closedAt",t.updated_at AS "updatedAt",(SELECT name FROM users WHERE id=t.reviewer_id) AS "reviewerName",to_char(t.incident_date,'YYYY-MM-DD') AS "incidentDate",t.created_at AS "createdAt",e.name AS "employeeName",picture.updated_at AS "profilePictureUpdatedAt",e.branch_id AS "currentBranchId",b.name AS "branchName" FROM workplace_incidents t LEFT JOIN employees e ON e.id=t.employee_id JOIN branches b ON b.id=t.branch_id LEFT JOIN employee_profile_pictures picture ON picture.employee_id=e.id`;
  }
  private canReview(u: AuthUserContext, r: WorkRecord, own: Employee | null) {
    return (
      this.manager(u) &&
      this.inScope(u, r.branchId) &&
      (!r.currentBranchId || this.inScope(u, r.currentBranchId)) &&
      r.reporterId !== u.userId &&
      r.employeeId !== own?.id &&
      (this.hr(u) || r.reviewerId === u.userId)
    );
  }
  private canManageTask(u: AuthUserContext, r: WorkRecord) {
    return (
      this.manager(u) &&
      this.inScope(u, r.branchId) &&
      this.inScope(u, r.currentBranchId ?? r.branchId) &&
      (r.assignees ?? []).every(
        (a) =>
          this.inScope(u, a.branchId) && this.inScope(u, a.currentBranchId),
      )
    );
  }
  private async managedEmployeeIds(
    u: AuthUserContext,
    own: Employee | null,
    m: EntityManager | DataSource = this.db.manager,
  ): Promise<string[]> {
    if (u.role !== 'BRANCH_MANAGER' || !own) return [];
    const rows = await m.query<Array<{ id: string }>>(
      `WITH RECURSIVE subordinates(id,path) AS (
        SELECT employee.id,ARRAY[employee.id]::varchar[]
        FROM employees employee
        WHERE employee.manager_employee_id=$1 AND employee.id<>$1
        UNION ALL
        SELECT employee.id,subordinates.path||employee.id
        FROM employees employee JOIN subordinates ON employee.manager_employee_id=subordinates.id
        WHERE NOT employee.id=ANY(subordinates.path)
      ) SELECT DISTINCT id FROM subordinates`,
      [own.id],
    );
    return rows.map((row) => row.id);
  }
  private async authorized(
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    m: EntityManager,
    lock = false,
  ) {
    this.allowed(u);
    const rows = await m.query<WorkRecord[]>(
      `${this.query(kind)} WHERE t.id=$1${kind === 'tasks' ? ' AND t.deleted_at IS NULL' : ''}${lock ? ' FOR UPDATE OF t' : ''}`,
      [id],
    );
    const r = rows[0];
    if (!r) throw new NotFoundException('Record not found.');
    if (lock && r.employeeId) {
      const employees = await m.query<Array<{ branchId: string }>>(
        'SELECT branch_id AS "branchId" FROM employees WHERE id=$1 FOR SHARE',
        [r.employeeId],
      );
      r.currentBranchId = employees[0]?.branchId ?? null;
    }
    const own = await this.own(u, m);
    if (lock && kind === 'tasks' && r.assignees?.length) {
      const locked = await m.query<Array<{ id: string; branchId: string }>>(
        'SELECT id,branch_id AS "branchId" FROM employees WHERE id=ANY($1::text[]) ORDER BY id FOR SHARE',
        [r.assignees.map((a) => a.id)],
      );
      r.assignees = r.assignees.map((a) => ({
        ...a,
        currentBranchId: locked.find((e) => e.id === a.id)!.branchId,
      }));
    }
    const assigned =
      !!own &&
      (kind === 'tasks'
        ? (r.assignees ?? []).some((a) => a.id === own.id)
        : r.employeeId === own.id);
    const manage =
      kind === 'tasks' ? this.canManageTask(u, r) : this.canReview(u, r, own);
    const reporter = kind === 'incidents' && r.reporterId === u.userId;
    const managerEmployees =
      kind === 'incidents' ? await this.managedEmployeeIds(u, own, m) : [];
    const supervisor =
      !!r.employeeId &&
      managerEmployees.includes(r.employeeId) &&
      this.inScope(u, r.branchId) &&
      (!r.currentBranchId || this.inScope(u, r.currentBranchId));
    const subject =
      kind === 'incidents' &&
      assigned &&
      (r.sharedWithSubject ||
        (
          await m.query<Array<{ id: string }>>(
            `SELECT id FROM work_events WHERE incident_id=$1 AND action='NOTICE' LIMIT 1`,
            [id],
          )
        ).length > 0);
    if (
      !manage &&
      !(kind === 'tasks' && assigned) &&
      !reporter &&
      !subject &&
      !supervisor
    )
      throw new NotFoundException('Record not found.');
    return { r, own, manage, assigned, reporter, subject, supervisor };
  }
  async list(
    u: AuthUserContext,
    kind: WorkKind,
    f: WorkFilterDto,
    exporting = false,
  ) {
    this.allowed(u);
    if (f.branchId && !this.inScope(u, f.branchId))
      throw new ForbiddenException('Branch access denied.');
    const own = await this.own(u);
    const scope = this.scope(u);
    const page = f.page ?? 1;
    const manager = this.manager(u) && f.view !== 'mine';
    const supervisorIds =
      kind === 'incidents' ? await this.managedEmployeeIds(u, own) : [];
    const visible =
      kind === 'tasks'
        ? `t.deleted_at IS NULL AND (EXISTS(SELECT 1 FROM work_task_assignees mine WHERE mine.task_id=t.id AND mine.employee_id=$2) OR ($3 AND ($1::text[] IS NULL OR t.branch_id=ANY($1)) AND ($1::text[] IS NULL OR NOT EXISTS(SELECT 1 FROM work_task_assignees scope_assignee JOIN employees se ON se.id=scope_assignee.employee_id WHERE scope_assignee.task_id=t.id AND (NOT(scope_assignee.branch_id=ANY($1)) OR NOT(se.branch_id=ANY($1)))))))`
        : `(t.reporter_id=$4 OR (t.employee_id=$2 AND (${managementReportSql} OR EXISTS(SELECT 1 FROM work_events ev WHERE ev.incident_id=t.id AND ev.action='NOTICE'))) OR ($3 AND t.reporter_id<>$4 AND ($2::text IS NULL OR t.employee_id IS DISTINCT FROM $2) AND ($1::text[] IS NULL OR t.branch_id=ANY($1)) AND (e.id IS NULL OR $1::text[] IS NULL OR e.branch_id=ANY($1)) AND ($5 OR t.reviewer_id=$4)) OR ($3 AND ${supervisorReportSql} AND ($1::text[] IS NULL OR t.branch_id=ANY($1)) AND ($1::text[] IS NULL OR e.branch_id=ANY($1))))`;
    if (f.from) validDate(f.from);
    if (f.to) validDate(f.to);
    if (f.from && f.to && f.from > f.to)
      throw new BadRequestException(
        'The start date must precede the end date.',
      );
    const extra =
      kind === 'incidents'
        ? ` AND ($8::text IS NULL OR (CASE WHEN t.reporter_id=$4 OR ${managementReportSql} OR ($3 AND t.reporter_id<>$4 AND ($2::text IS NULL OR t.employee_id IS DISTINCT FROM $2) AND ($5 OR t.reviewer_id=$4)) OR ($3 AND ${supervisorReportSql}) THEN t.title ELSE 'Private notice / case' END) ILIKE $8 OR t.reference_number ILIKE $8 OR e.name ILIKE $8) AND ($9::date IS NULL OR t.incident_date >= $9) AND ($10::date IS NULL OR t.incident_date <= $10) AND ($11::text IS NULL OR $11='reports' OR $11='active-cases' AND t.case_status IS NOT NULL AND t.case_status<>'CLOSED' OR $11='case-history' AND t.case_status='CLOSED')`
        : ` AND ($8::text IS NULL OR t.title ILIKE $8 OR t.description ILIKE $8 OR e.name ILIKE $8 OR b.name ILIKE $8 OR EXISTS(SELECT 1 FROM work_task_assignees search_assignee JOIN employees search_employee ON search_employee.id=search_assignee.employee_id WHERE search_assignee.task_id=t.id AND search_employee.name ILIKE $8)) AND $9::date IS NULL AND $10::date IS NULL AND $11::text IS NULL`;
    const params = [
      scope,
      own?.id ?? null,
      manager,
      u.userId,
      this.hr(u),
      f.status ?? null,
      (page - 1) * 20,
      f.search?.trim()
        ? `%${f.search.trim().replace(/[\\%_]/g, '\\$&')}%`
        : null,
      kind === 'incidents' ? (f.from ?? null) : null,
      kind === 'incidents' ? (f.to ?? null) : null,
      kind === 'incidents' ? (f.queue ?? 'reports') : null,
    ];
    if (kind === 'incidents') params.push(supervisorIds);
    const employeeFilter = f.employeeId
      ? ` AND t.employee_id=$${params.push(f.employeeId)}`
      : '';
    let assigneeFilter = '';
    if (kind === 'tasks') {
      const assigneeParam = params.push(f.assigneeId ?? null);
      assigneeFilter = ` AND ($${assigneeParam}::text IS NULL OR EXISTS(SELECT 1 FROM work_task_assignees selected_assignee WHERE selected_assignee.task_id=t.id AND selected_assignee.employee_id=$${assigneeParam}))`;
    }
    const branchFilter = f.branchId
      ? ` AND t.branch_id=$${params.push(f.branchId)}`
      : '';
    const categoryFilter =
      kind === 'incidents' && f.category
        ? ` AND t.category=$${params.push(f.category)}`
        : '';
    const limit = exporting ? 5000 : 20;
    const exportScope = exporting
      ? ` AND ($1::text[] IS NULL OR (t.branch_id=ANY($1) AND (e.branch_id IS NULL OR e.branch_id=ANY($1))))`
      : '';
    const workflowFilter =
      kind === 'incidents'
        ? ` OR $6='PENDING_EXPLANATION' AND t.status NOT IN ('RESOLVED','CLOSED','WITHDRAWN','DISMISSED') AND (t.status='DETAILS_REQUESTED' OR t.case_status IN ('NOTICE_ISSUED','AWAITING_RESPONSE')) OR $6='FOR_DECISION' AND t.status NOT IN ('RESOLVED','CLOSED','WITHDRAWN','DISMISSED') AND t.case_status IN ('DECISION_PENDING','CLOSED')`
        : '';
    const querySql = `${this.query(kind)} WHERE ${visible} AND $4::text IS NOT NULL AND $5::boolean IS NOT NULL AND ($6::text IS NULL OR t.status=$6 OR $6='finished' AND t.status IN ('RESOLVED','CLOSED','WITHDRAWN','DISMISSED')${workflowFilter})  ${extra}${employeeFilter}${assigneeFilter}${branchFilter}${categoryFilter}${exportScope} ORDER BY t.created_at DESC,t.id LIMIT ${limit + 1} OFFSET $7`;
    const rows = await this.db.query<WorkRecord[]>(querySql, params);
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => {
      const manage =
        kind === 'tasks'
          ? manager && this.canManageTask(u, r)
          : this.canReview(u, r, own);
      return {
        ...(kind === 'incidents' ? { workflowStatus: incidentStep(r) } : {}),
        canRecordOffense:
          kind === 'incidents' &&
          this.manager(u) &&
          r.employeeId !== own?.id &&
          !!r.employeeId &&
          this.inScope(u, r.branchId) &&
          this.inScope(u, r.currentBranchId ?? r.branchId) &&
          (manage ||
            r.reporterId === u.userId ||
            supervisorIds.includes(r.employeeId)),
        ...this.present(
          r,
          kind,
          manage,
          kind === 'incidents' && r.reporterId === u.userId,
          kind === 'incidents' &&
            !!r.employeeId &&
            supervisorIds.includes(r.employeeId),
        ),
      };
    });
    const summary =
      kind === 'incidents' && !exporting
        ? (
            await this.db.query<
              Array<{
                total: number;
                pending: number;
                clarification: number;
                resolved: number;
              }>
            >(
              `SELECT count(*)::int AS total,count(*) FILTER(WHERE status='SUBMITTED')::int AS pending,count(*) FILTER(WHERE status='DETAILS_REQUESTED' OR "caseStatus" IN ('NOTICE_ISSUED','AWAITING_RESPONSE'))::int AS clarification,count(*) FILTER(WHERE status IN ('RESOLVED','CLOSED','WITHDRAWN','DISMISSED'))::int AS resolved FROM (${this.query(kind)} WHERE ${visible} AND $4::text IS NOT NULL AND $5::boolean IS NOT NULL AND ($6::text IS NULL OR $6 IS NOT NULL) AND $7::int IS NOT NULL ${extra}${employeeFilter}${branchFilter}${categoryFilter}) authorized`,
              params,
            )
          )[0]
        : undefined;
    return { items, page, hasNext, ...(summary ? { summary } : {}) };
  }
  async exportIncidents(u: AuthUserContext, f: WorkFilterDto & {format?: 'xlsx' | 'pdf'}) {
    if (!this.manager(u))
      throw new ForbiddenException(
        'Incident reporting is restricted to authorized managers.',
      );
    const result = await this.list(u, 'incidents', Object.assign({}, f, { page: 1 }), true);
    if (result.hasNext)
      throw new BadRequestException(
        'More than 5,000 incidents match. Narrow the filters before exporting.',
      );
    await this.db.query(
      `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'INCIDENT_EXPORT','incidents',$4,now())`,
      [
        randomUUID(),
        u.userId,
        f.branchId ?? null,
        {
          count: result.items.length,
          category: f.category,
          employeeId: f.employeeId,
          from: f.from,
          to: f.to,
          format: f.format ?? 'csv',
        },
      ],
    );
    if (f.format === 'xlsx') return incidentWorkbook(result.items);
    if (f.format === 'pdf') return incidentPdf(result.items);
    return incidentCsv(result.items);
  }
  async exportTasks(u: AuthUserContext, filter: TaskExportQueryDto) {
    if (filter.branchId && !this.inScope(u, filter.branchId))
      throw new ForbiddenException('Task branch access denied.');
    const rows: TaskExportRow[] = [];
    let page = 1;
    let hasNext = true;
    while (hasNext && page <= 250) {
      const result = await this.list(u, 'tasks', {
        status: filter.status,
        view: filter.view,
        search: filter.search,
        branchId: filter.branchId,
        assigneeId: filter.assigneeId,
        page,
      });
      rows.push(
        ...result.items.map((item) => {
          const record = item as unknown as WorkRecord & {
            branchName?: string;
            startDate?: string | null;
            dueDate?: string;
            createdAt?: string;
            priority?: string;
          };
          return {
            id: record.id,
            title: record.title,
            description: record.description,
            branchName: record.branchName ?? '',
            assigneeNames:
              record.assignees?.map((assignee) => assignee.name).join(', ') ??
              record.employeeName ??
              '',
            status: record.status,
            priority: record.priority ?? '',
            startDate: record.startDate ?? '',
            dueDate: record.dueDate ?? '',
            createdAt: record.createdAt ?? '',
          };
        }),
      );
      hasNext = result.hasNext;
      page++;
    }
    if (hasNext)
      throw new BadRequestException(
        'This export contains more than 5,000 tasks. Narrow the branch or filters and try again.',
      );
    if (filter.format === 'xlsx')
      return {
        content: await taskWorkbook(rows),
        mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: 'tasks-export.xlsx',
      };
    return {
      content: taskPdf(rows),
      mime: 'application/pdf',
      filename: 'tasks-report.pdf',
    };
  }
  private present(
    r: WorkRecord,
    kind: WorkKind,
    manage: boolean,
    reporter: boolean,
    supervisor = false,
  ) {
    const {
      reporterId: _reporter,
      reviewerId: _reviewer,
      currentBranchId: _branch,
      sharedWithSubject: _shared,
      ...safe
    } = r;
    if (kind === 'tasks')
      return {
        ...safe,
        employeeName:
          r.assignees?.map((a) => a.name).join(', ') ?? safe.employeeName,
        assignees: r.assignees?.map(({ currentBranchId: _current, ...a }) => a),
      };
    if (
      kind === 'incidents' &&
      !manage &&
      !reporter &&
      !supervisor &&
      !r.sharedWithSubject
    )
      return {
        ...safe,
        title: 'Private notice / case',
        description: 'Read the notice and correspondence below.',
        remarks: '',
      };
    return safe;
  }
  private visibleEvent(
    kind: WorkKind,
    manage: boolean,
    reporter: boolean,
    subject: boolean,
    audience: string,
  ) {
    return (
      kind === 'tasks' ||
      manage ||
      ((reporter || subject) && audience === 'PARTICIPANTS') ||
      (reporter && audience === 'REPORTER') ||
      (subject && audience === 'SUBJECT')
    );
  }
  async detail(u: AuthUserContext, kind: WorkKind, id: string) {
    const a = await this.authorized(u, kind, id, this.db.manager);
    const canDiscipline =
      kind === 'incidents' &&
      a.manage &&
      (await hasDisciplinaryAuthority(this.db.manager, u));
    const events = await this.db.query<Event[]>(
      `SELECT e.id,e.actor_id AS "actorId",u.name AS "actorName",e.action,e.audience,e.message,e.details,e.created_at AS "createdAt" FROM work_events e JOIN users u ON u.id=e.actor_id WHERE e.${kind === 'tasks' ? 'task_id' : 'incident_id'}=$1 ORDER BY e.sequence`,
      [id],
    );
    const visible = events.filter((e) =>
      this.visibleEvent(
        kind,
        a.manage || a.supervisor,
        a.reporter,
        a.subject,
        e.audience,
      ),
    );
    const attachments = await this.db.query<
      Array<{ id: string; eventId: string; filename: string; mime: string }>
    >(
      `SELECT id,event_id AS "eventId",filename,mime FROM work_attachments WHERE event_id=ANY($1::uuid[])`,
      [visible.map((e) => e.id)],
    );
    return {
      ...this.present(a.r, kind, a.manage, a.reporter, a.supervisor),
      canManage: a.manage,
      canDelete: kind === 'tasks' && a.manage && a.r.createdBy === u.userId,
      canStopRecurrence:
        kind === 'tasks' &&
        a.manage &&
        !!a.r.seriesId &&
        a.r.recurrenceActive === true,
      canReassign:
        kind === 'tasks' &&
        a.manage &&
        !a.assigned &&
        !['COMPLETED', 'CANCELLED'].includes(a.r.status),
      isAssignee: a.assigned,
      isReporter: a.reporter,
      isSubject: a.subject,
      canAssignReviewer: kind === 'incidents' && a.manage && this.hr(u),
      canResolve: kind === 'incidents' && a.manage && this.hr(u),
      canInitiateCase: canDiscipline,
      canDiscipline,
      canManageAuthority: kind === 'incidents' && u.role === 'SUPER_ADMIN',
      ...(kind === 'incidents' ? { workflowStatus: incidentStep(a.r) } : {}),
      events: visible.map(({ actorId, actorName, details, ...event }) => ({
        ...event,
        actor:
          actorId === u.userId
            ? 'You'
            : a.manage || kind === 'tasks'
              ? actorName
              : 'Case participant',
        ...(kind === 'tasks' || a.manage
          ? { details }
          : kind === 'incidents' && a.subject && event.action === 'DECIDE'
            ? {
                details: {
                  findings: details.findings,
                  outcome: details.outcome,
                  disciplinaryAction: details.disciplinaryAction,
                  actionDetails: details.actionDetails,
                },
              }
            : {}),
      })),
      attachments,
    };
  }
  async recordOffense(u: AuthUserContext, id: string, d: RecordOffenseDto) {
    this.allowed(u);
    return this.db.transaction(async (m) => {
      // Serialize numbering per employee/category, including different incidents.
      const initial = await this.authorized(u, 'incidents', id, m);
      if (
        !this.manager(u) ||
        !initial.r.employeeId ||
        initial.own?.id === initial.r.employeeId ||
        !this.inScope(u, initial.r.branchId) ||
        !this.inScope(u, initial.r.currentBranchId ?? initial.r.branchId) ||
        !(initial.manage || initial.reporter || initial.supervisor)
      )
        throw new ForbiddenException(
          'An authorized different manager must record the offense.',
        );
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `offense:${initial.r.employeeId}:${initial.r.category}`,
      ]);
      const a = await this.authorized(u, 'incidents', id, m, true);
      if (
        !this.inScope(u, a.r.branchId) ||
        !this.inScope(u, a.r.currentBranchId ?? a.r.branchId) ||
        a.own?.id === a.r.employeeId ||
        !(a.manage || a.reporter || a.supervisor)
      )
        throw new ForbiddenException(
          'Employee access changed. Refresh and try again.',
        );
      if (a.r.employeeId !== initial.r.employeeId || a.r.version !== d.version)
        throw new ConflictException(
          'The incident changed. Refresh and try again.',
        );
      let offense = d.offense === 'NONE' ? null : d.offense;
      if (offense === 'AUTO') {
        const rows = await m.query<Array<{ highest: number }>>(
          `SELECT COALESCE(max((latest.offense)::int),0)::int AS highest FROM workplace_incidents t
           CROSS JOIN LATERAL (SELECT ev.details->>'offense' AS offense FROM work_events ev
             WHERE ev.incident_id=t.id AND ev.action='OFFENSE_RECORDED'
             AND ev.details->>'employeeId'=t.employee_id ORDER BY ev.sequence DESC LIMIT 1) latest
           WHERE t.employee_id=$1 AND t.category=$2 AND t.id<>$3`,
          [a.r.employeeId, a.r.category, id],
        );
        if (rows[0].highest >= 3)
          throw new BadRequestException(
            'Third offense already recorded. Select a level explicitly under your policy.',
          );
        offense = String(rows[0].highest + 1);
      }
      const reason = this.text(d.reason);
      await this.event(
        m,
        u,
        'incidents',
        id,
        a.r.branchId,
        'OFFENSE_RECORDED',
        'SUBJECT',
        `${offense ? ['', '1st', '2nd', '3rd'][Number(offense)] + ' offense' : 'Offense classification cleared'}: ${reason}`,
        {
          offense,
          employeeId: a.r.employeeId,
          category: a.r.category,
          mode: d.offense,
        },
      );
      await m.query(
        'UPDATE workplace_incidents SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      return { offense };
    });
  }
  private text(value: string) {
    const v = value.trim();
    if (!v) throw new BadRequestException('Enter a description or reason.');
    return v;
  }
  async create(
    u: AuthUserContext,
    kind: WorkKind,
    input: CreateTaskDto | CreateIncidentDto,
    file?: WorkUpload,
  ) {
    this.allowed(u);
    if (kind === 'tasks' && !this.manager(u))
      throw new ForbiddenException('Task assignment denied.');
    const attachment = file ? this.validateUpload(file) : undefined;
    return this.db.transaction(async (m) => {
      const key = input.submissionKey;
      // Serialize retries of the same submission without locking unrelated records.
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `${kind}:${key}`,
      ]);
      const previous = await m.query<Array<{ actor: string }>>(
        `SELECT ${kind === 'tasks' ? 'created_by' : 'reporter_id'} AS actor FROM ${kind === 'tasks' ? 'work_tasks' : 'workplace_incidents'} WHERE id=$1`,
        [key],
      );
      if (previous.length) {
        if (previous[0].actor !== u.userId)
          throw new ConflictException('Submission key already used.');
        return { id: key };
      }
      const own = await this.own(u, m);
      const selfReport =
        kind === 'incidents' &&
        !this.manager(u) &&
        (input as CreateIncidentDto).reportMode === 'SELF';
      if (
        selfReport &&
        (!own || (input.employeeId && input.employeeId !== own.id))
      )
        throw new ForbiddenException(
          'A self-report must use your linked employee identity.',
        );
      const employeeId = selfReport
        ? own!.id
        : kind === 'tasks'
          ? ((input as CreateTaskDto).employeeIds?.[0] ?? input.employeeId)
          : input.employeeId;
      const employee = employeeId ? await this.employee(employeeId, m) : null;
      let assignees: Employee[] = [];
      let taskSeriesId: string | null = null;
      if (kind === 'tasks') {
        const d = input as CreateTaskDto;
        const title = this.text(d.title);
        const description = this.text(d.description);
        const ids = d.employeeIds ?? (d.employeeId ? [d.employeeId] : []);
        if (
          !ids.length ||
          ids.length > 50 ||
          new Set(ids).size !== ids.length ||
          (d.employeeIds && d.employeeId && !ids.includes(d.employeeId))
        )
          throw new BadRequestException(
            'Choose 1 to 50 unique task assignees.',
          );
        for (const id of [...ids].sort())
          assignees.push(await this.employee(id, m));
        if (assignees.some((a) => !this.inScope(u, a.branchId)))
          throw new ForbiddenException('Task assignment denied.');
        if (
          !this.manager(u) ||
          !employee ||
          !this.inScope(u, employee.branchId)
        )
          throw new ForbiddenException('Task assignment denied.');
        validDate(d.dueDate);
        if (d.startDate) {
          validDate(d.startDate);
          if (d.startDate > d.dueDate)
            throw new BadRequestException(
              'Task start date cannot exceed its due date.',
            );
        }
        if (d.templateId) {
          const template = await m.query<Array<{ id: string }>>(
            `SELECT id FROM work_task_templates WHERE id=$1
             AND (branch_id IS NULL OR branch_id=$2) FOR SHARE`,
            [d.templateId, employee.branchId],
          );
          if (!template.length)
            throw new NotFoundException('Task template not found.');
        }
        const recurrence = d.recurrence as TaskRecurrence | undefined;
        if (recurrence) {
          if (!d.startDate || !d.recurrenceEndDate)
            throw new BadRequestException(
              'Choose a start date and an end date for recurring tasks.',
            );
          validDate(d.recurrenceEndDate);
          const nextOccurrence = nextTaskOccurrence(
            d.startDate,
            recurrence,
            Number(d.startDate.slice(8, 10)),
          );
          if (nextOccurrence > d.recurrenceEndDate)
            throw new BadRequestException(
              'Choose an end date that includes at least one repeat.',
            );
          if (nextOccurrence < manilaCalendarDate(new Date()))
            throw new BadRequestException(
              'Recurring tasks cannot start in the past.',
            );
          if (d.recurrenceEndDate > addCalendarDays(d.startDate, 365))
            throw new BadRequestException(
              'Recurring tasks are limited to one year per series.',
            );
          if (
            addCalendarDays(d.startDate, 366) < d.dueDate ||
            assignees.some(
              (assignee) => assignee.branchId !== employee.branchId,
            )
          )
            throw new BadRequestException(
              'Recurring task assignees must belong to the task branch, and the due date must be within one year of its start.',
            );
          taskSeriesId = randomUUID();
          const dueOffset = Math.round(
            (Date.parse(`${d.dueDate}T00:00:00.000Z`) -
              Date.parse(`${d.startDate}T00:00:00.000Z`)) /
              86_400_000,
          );
          await m.query(
            `INSERT INTO work_task_series(id,branch_id,created_by,template_id,title,description,priority,recurrence,anchor_day,due_offset,next_occurrence,ends_on)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              taskSeriesId,
              employee.branchId,
              u.userId,
              d.templateId ?? null,
              title,
              description,
              d.priority,
              recurrence,
              Number(d.startDate.slice(8, 10)),
              dueOffset,
              nextOccurrence,
              d.recurrenceEndDate,
            ],
          );
          for (const assignee of assignees)
            await m.query(
              'INSERT INTO work_task_series_assignees(series_id,employee_id,branch_id) VALUES($1,$2,$3)',
              [taskSeriesId, assignee.id, assignee.branchId],
            );
        } else if (d.recurrenceEndDate) {
          throw new BadRequestException(
            'Select a repeat frequency before setting an end date.',
          );
        }
        await m.query(
          `INSERT INTO work_tasks(id,branch_id,employee_id,created_by,title,description,priority,due_date,start_date,template_id,series_id,occurrence_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            key,
            employee.branchId,
            employee.id,
            u.userId,
            title,
            description,
            d.priority,
            d.dueDate,
            d.startDate ?? null,
            d.templateId ?? null,
            taskSeriesId,
            taskSeriesId ? d.startDate : null,
          ],
        );
        for (const assignee of assignees)
          await m.query(
            'INSERT INTO work_task_assignees(task_id,employee_id,branch_id) VALUES($1,$2,$3)',
            [key, assignee.id, assignee.branchId],
          );
      } else {
        const d = input as CreateIncidentDto;
        validDate(d.incidentDate);
        if (d.incidentTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.incidentTime))
          throw new BadRequestException('Enter a valid incident time.');
        if (
          d.incidentDate >
          new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Manila',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date())
        )
          throw new BadRequestException(
            'An incident date cannot be in the future.',
          );
        if (
          !this.inScope(u, d.branchId) ||
          (!this.manager(u) && own?.branchId !== d.branchId) ||
          (employee && employee.branchId !== d.branchId) ||
          (!this.manager(u) && employee && employee.id !== own?.id)
        )
          throw new ForbiddenException(
            'Incident branch or employee access denied.',
          );
        const active = await m.query<Array<{ id: string }>>(
          'SELECT id FROM branches WHERE id=$1 AND is_active=true FOR SHARE',
          [d.branchId],
        );
        if (!active.length)
          throw new BadRequestException('Select an active branch.');
        await m.query(
          `INSERT INTO workplace_incidents(id,branch_id,employee_id,reporter_id,title,description,category,incident_date,incident_time,remarks,report_scope,report_source) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            key,
            d.branchId,
            employee?.id ?? null,
            u.userId,
            this.text(d.title),
            this.text(d.description),
            d.category,
            d.incidentDate,
            d.incidentTime ?? null,
            d.remarks?.trim() ?? '',
            d.reportScope ?? 'BRANCH',
            this.manager(u)
              ? 'MANAGEMENT_REPORTED'
              : employee && employee.id === own?.id
                ? 'SELF_REPORTED'
                : 'EMPLOYEE_REPORTED',
          ],
        );
      }
      const branchId =
        kind === 'tasks'
          ? employee!.branchId
          : (input as CreateIncidentDto).branchId;
      const initialAudience =
        kind === 'tasks' || this.manager(u) ? 'PARTICIPANTS' : 'REPORTER';
      await this.event(
        m,
        u,
        kind,
        key,
        branchId,
        'CREATED',
        initialAudience,
        'Record submitted.',
        kind === 'tasks'
          ? {
              employeeIds: assignees.map((a) => a.id),
              startDate: (input as CreateTaskDto).startDate ?? null,
              ...((input as CreateTaskDto).templateId
                ? { templateId: (input as CreateTaskDto).templateId }
                : {}),
              ...((input as CreateTaskDto).recurrence
                ? {
                    seriesId: taskSeriesId,
                    recurrence: (input as CreateTaskDto).recurrence,
                    recurrenceEndDate: (input as CreateTaskDto)
                      .recurrenceEndDate,
                  }
                : {}),
            }
          : {},
      );
      if (attachment)
        await this.saveAttachment(
          m,
          u,
          kind,
          key,
          branchId,
          initialAudience,
          attachment,
        );
      if (kind === 'tasks')
        await this.notifyTask(m, key, null, u.userId, 'ASSIGNED');
      else {
        await this.notifyReviewers(m, key, branchId, u.userId);
        if (this.manager(u) && employee)
          await this.notify(m, kind, key, branchId, employee.id, null);
      }
      return { id: key };
    });
  }

  async processRecurringTasks(now = new Date()) {
    const table = await this.db.query<Array<{ name: string | null }>>(
      "SELECT to_regclass('work_task_series')::text AS name",
    );
    if (!table[0]?.name) return 0;
    const today = manilaCalendarDate(now);
    let processed = 0;
    while (processed < 200) {
      const advanced = await this.db.transaction(async (m) => {
        const due = await m.query<
          Array<{
            id: string;
            branchId: string;
            createdBy: string;
            templateId: string | null;
            title: string;
            description: string;
            priority: string;
            recurrence: TaskRecurrence;
            anchorDay: number;
            dueOffset: number;
            nextOccurrence: string;
            endsOn: string;
          }>
        >(
          `SELECT s.id,s.branch_id AS "branchId",s.created_by AS "createdBy",s.template_id AS "templateId",
             s.title,s.description,s.priority,s.recurrence,s.anchor_day AS "anchorDay",s.due_offset AS "dueOffset",
             to_char(s.next_occurrence,'YYYY-MM-DD') AS "nextOccurrence",to_char(s.ends_on,'YYYY-MM-DD') AS "endsOn"
           FROM work_task_series s
           WHERE s.is_active AND s.next_occurrence<=$1::date AND s.next_occurrence<=s.ends_on
           ORDER BY s.next_occurrence,s.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED`,
          [today],
        );
        const series = due[0];
        if (!series) return false;
        const creatorRows = await m.query<
          Array<{ email: string; role: string; authorized: boolean }>
        >(
          `SELECT u.email,u.role,
             (u.status='ACTIVE' AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER') AND COALESCE(b.is_active,false) AND
               (u.role='SUPER_ADMIN' OR a.mode='ALL' OR a.mode='SELECTED' AND s.branch_id=ANY(a.branch_ids) OR
                COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND
                  (u.branch_id=s.branch_id OR (u.role='HR_ADMIN' AND u.branch_id IS NULL) OR b.manager_user_id=u.id))) AS authorized
           FROM work_task_series s JOIN users u ON u.id=s.created_by
           LEFT JOIN branches b ON b.id=s.branch_id
           LEFT JOIN employee_branch_access a ON a.user_id=u.id
           WHERE s.id=$1`,
          [series.id],
        );
        const creator = creatorRows[0];
        const assignments = await m.query<
          Array<{
            id: string;
            branchId: string;
            currentBranchId: string;
            status: string;
            activeBranch: boolean;
          }>
        >(
          `SELECT sa.employee_id AS id,sa.branch_id AS "branchId",e.branch_id AS "currentBranchId",e.status,b.is_active AS "activeBranch"
           FROM work_task_series_assignees sa JOIN employees e ON e.id=sa.employee_id
           JOIN branches b ON b.id=sa.branch_id WHERE sa.series_id=$1 ORDER BY sa.employee_id FOR SHARE OF e,b`,
          [series.id],
        );
        const pauseReason = !creator?.authorized
          ? 'CREATOR_SCOPE_CHANGED'
          : !assignments.length ||
              assignments.some(
                (assignee) =>
                  assignee.status !== 'ACTIVE' ||
                  !assignee.activeBranch ||
                  assignee.branchId !== series.branchId ||
                  assignee.currentBranchId !== assignee.branchId,
              )
            ? 'ASSIGNEE_SCOPE_CHANGED'
            : null;
        if (pauseReason) {
          await m.query(
            `UPDATE work_task_series SET is_active=false,pause_reason=$2,updated_at=now() WHERE id=$1`,
            [series.id, pauseReason],
          );
          await m.query(
            `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
             VALUES($1,$2,$3,'WORK_TASK_SERIES_PAUSED','tasks',$4,now())`,
            [
              randomUUID(),
              series.createdBy,
              series.branchId,
              { seriesId: series.id, reason: pauseReason },
            ],
          );
          return true;
        }
        const taskId = randomUUID();
        const dueDate = addCalendarDays(
          series.nextOccurrence,
          Number(series.dueOffset),
        );
        await m.query(
          `INSERT INTO work_tasks(id,branch_id,employee_id,created_by,title,description,priority,due_date,start_date,template_id,series_id,occurrence_date)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            taskId,
            series.branchId,
            assignments[0].id,
            series.createdBy,
            series.title,
            series.description,
            series.priority,
            dueDate,
            series.nextOccurrence,
            series.templateId,
            series.id,
            series.nextOccurrence,
          ],
        );
        for (const assignee of assignments)
          await m.query(
            'INSERT INTO work_task_assignees(task_id,employee_id,branch_id) VALUES($1,$2,$3)',
            [taskId, assignee.id, assignee.branchId],
          );
        const actor: AuthUserContext = {
          userId: series.createdBy,
          email: creator!.email,
          role: creator!.role as AuthUserContext['role'],
          branchId: series.branchId,
          branchIds: [series.branchId],
        };
        await this.event(
          m,
          actor,
          'tasks',
          taskId,
          series.branchId,
          'CREATED',
          'PARTICIPANTS',
          'Recurring task created.',
          {
            employeeIds: assignments.map((assignee) => assignee.id),
            startDate: series.nextOccurrence,
            seriesId: series.id,
            recurrence: series.recurrence,
            occurrenceDate: series.nextOccurrence,
            ...(series.templateId ? { templateId: series.templateId } : {}),
          },
        );
        await this.notifyTask(m, taskId, null, series.createdBy, 'ASSIGNED');
        const next = nextTaskOccurrence(
          series.nextOccurrence,
          series.recurrence,
          Number(series.anchorDay),
        );
        await m.query(
          `UPDATE work_task_series SET next_occurrence=$2::date,is_active=$2::date<=ends_on,
             pause_reason=NULL,updated_at=now() WHERE id=$1`,
          [series.id, next],
        );
        return true;
      });
      if (!advanced) break;
      processed++;
    }
    return processed;
  }

  async deleteTask(u: AuthUserContext, id: string) {
    this.allowed(u);
    return this.db.transaction(async (m) => {
      const a = await this.authorized(u, 'tasks', id, m, true);
      if (!a.manage || a.r.createdBy !== u.userId)
        throw new ForbiddenException(
          'Only the task creator with current branch authority may delete this task.',
        );
      await this.event(
        m,
        u,
        'tasks',
        id,
        a.r.branchId,
        'DELETED',
        'PARTICIPANTS',
        'Task deleted by its creator.',
      );
      await m.query(
        'UPDATE work_tasks SET deleted_at=now(),deleted_by=$2,version=version+1,updated_at=now() WHERE id=$1 AND deleted_at IS NULL',
        [id, u.userId],
      );
      return { id, deleted: true };
    });
  }
  async stopRecurringTask(u: AuthUserContext, id: string, version: number) {
    this.allowed(u);
    return this.db.transaction(async (m) => {
      const authorized = await this.authorized(u, 'tasks', id, m, true);
      if (!authorized.manage || !authorized.r.seriesId)
        throw new ForbiddenException(
          'You cannot stop this recurring task series.',
        );
      if (authorized.r.version !== version)
        throw new ConflictException(
          'This task changed. Refresh it before stopping the series.',
        );
      const stopped = await m.query<Array<{ id: string }>>(
        `UPDATE work_task_series SET is_active=false,pause_reason='MANAGER_STOPPED',updated_at=now()
         WHERE id=$1 AND is_active=true RETURNING id`,
        [authorized.r.seriesId],
      );
      if (!stopped.length)
        throw new ConflictException(
          'This recurring series has already stopped.',
        );
      await this.event(
        m,
        u,
        'tasks',
        id,
        authorized.r.branchId,
        'SERIES_STOPPED',
        'PARTICIPANTS',
        'Future scheduled tasks were stopped.',
        { seriesId: authorized.r.seriesId },
      );
      await this.notifyTask(
        m,
        id,
        authorized.r.createdBy ?? null,
        u.userId,
        null,
      );
      await m.query(
        'UPDATE work_tasks SET version=version+1,updated_at=now() WHERE id=$1',
        [id],
      );
      return { id, version: authorized.r.version + 1, recurrenceActive: false };
    });
  }
  async act(
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    d: WorkActionDto,
    file?: WorkUpload,
  ) {
    const attachment = file ? this.validateUpload(file) : undefined;
    if (d.action === 'REASSIGN' && kind !== 'tasks')
      throw new BadRequestException('Only tasks can be reassigned.');
    return this.db.transaction(async (m) => {
      const a = await this.authorized(u, kind, id, m, true);
      const r = a.r;
      if (d.version !== r.version)
        throw new ConflictException(
          'This record changed. Refresh it before trying again.',
        );
      if (attachment) {
        const recordColumn = kind === 'tasks' ? 'e.task_id' : 'e.incident_id';
        const count = await m.query<Array<{ count: number }>>(
          `SELECT count(*)::int AS count FROM work_attachments f JOIN work_events e ON e.id=f.event_id WHERE ${recordColumn}=$1`,
          [id],
        );
        if (count[0].count >= 20)
          throw new BadRequestException(
            'This record already has 20 supporting files.',
          );
      }
      const optionalIncidentMessage =
        kind === 'incidents' &&
        a.manage &&
        ![
          'REQUEST_DETAILS',
          'HR_ESCALATE',
          'RESOLVE',
          'CLOSE',
          'ESCALATE',
          'NOTICE',
          'DECIDE',
          'WITHDRAW',
          'DISMISS',
        ].includes(d.action);
      const message =
        kind === 'tasks' && d.action === 'REASSIGN'
          ? (d.message ?? '').trim() || 'Task assignees updated.'
          : optionalIncidentMessage
            ? (d.message ?? '').trim()
            : this.text(d.message ?? '');
      let caseStatus = r.caseStatus ?? null;
      let status: string;
      let audience = 'PARTICIPANTS';
      let reassignedEmployeeIds: string[] = [];
      let reassignedAssigneeBranches: Array<{
        employeeId: string;
        branchId: string;
      }> = [];
      if (kind === 'tasks') {
        if (d.action === 'REASSIGN') {
          if (!a.manage || a.assigned)
            throw new ForbiddenException(
              'Only a different authorized manager can reassign this task.',
            );
          if (['COMPLETED', 'CANCELLED'].includes(r.status))
            throw new BadRequestException('Closed tasks cannot be reassigned.');
          const employeeIds = d.employeeIds;
          if (
            !Array.isArray(employeeIds) ||
            employeeIds.length < 1 ||
            employeeIds.length > 50 ||
            employeeIds.some(
              (employeeId) =>
                typeof employeeId !== 'string' ||
                employeeId.length < 1 ||
                employeeId.length > 100,
            ) ||
            new Set(employeeIds).size !== employeeIds.length
          )
            throw new BadRequestException(
              'Choose 1 to 50 unique active task assignees.',
            );
          const previousEmployeeIds = (r.assignees ?? []).map((assignee) =>
            String(assignee.id),
          );
          if (
            employeeIds.length === previousEmployeeIds.length &&
            employeeIds.every((employeeId) =>
              previousEmployeeIds.includes(employeeId),
            )
          )
            throw new BadRequestException(
              'Choose a different set of task assignees.',
            );
          const assignees: Employee[] = [];
          for (const employeeId of [...employeeIds].sort())
            assignees.push(await this.employee(employeeId, m));
          if (assignees.some((assignee) => !this.inScope(u, assignee.branchId)))
            throw new ForbiddenException(
              'Task assignment is outside your authorized branches.',
            );
          reassignedEmployeeIds = employeeIds.filter(
            (employeeId) => !previousEmployeeIds.includes(employeeId),
          );
          reassignedAssigneeBranches = assignees.map((assignee) => ({
            employeeId: assignee.id,
            branchId: assignee.branchId,
          }));
          await m.query(
            "SELECT set_config('app.work_task_reassignment','on',true)",
          );
          await m.query('DELETE FROM work_task_assignees WHERE task_id=$1', [
            id,
          ]);
          for (const assignee of assignees)
            await m.query(
              'INSERT INTO work_task_assignees(task_id,employee_id,branch_id) VALUES($1,$2,$3)',
              [id, assignee.id, assignee.branchId],
            );
          status = r.status;
          await m.query(
            'UPDATE work_tasks SET employee_id=$2,version=version+1,updated_at=now() WHERE id=$1',
            [id, employeeIds[0]],
          );
        } else {
          const change =
            d.action === 'STATUS'
              ? taskStatusChange(
                  r.status,
                  d.taskState,
                  a.assigned,
                  r.progress ?? 0,
                )
              : null;
          status =
            change?.status ??
            taskTransition(r.status, d.action, a.assigned, a.manage);
          if (d.action === 'PROGRESS' && d.progress === undefined)
            throw new BadRequestException('Enter progress from 0 to 100.');
          await m.query(
            `UPDATE work_tasks SET status=$2,progress=$3,version=version+1,updated_at=now() WHERE id=$1`,
            [
              id,
              status,
              change
                ? change.progress
                : ['SUBMIT', 'ACCEPT'].includes(d.action)
                  ? 100
                  : d.action === 'PROGRESS'
                    ? d.progress
                    : r.progress,
            ],
          );
        }
      } else {
        const canDiscipline =
          a.manage && (await hasDisciplinaryAuthority(m, u, true));
        const formal = [
          'ESCALATE',
          'NOTICE',
          'ACKNOWLEDGE',
          'RESPONSE',
          'DECIDE',
        ].includes(d.action);
        if (['CLOSED', 'WITHDRAWN', 'DISMISSED'].includes(r.status))
          throw new BadRequestException('This report is closed.');
        if (
          formal &&
          ['ESCALATE', 'NOTICE', 'DECIDE'].includes(d.action) &&
          !canDiscipline
        )
          throw new ForbiddenException(
            'Explicit disciplinary authority and independent case-review access are required.',
          );
        if (
          d.action === 'ESCALATE' &&
          (r.caseStatus || r.status !== 'UNDER_REVIEW')
        )
          throw new BadRequestException(
            'A case already exists or the report is not under review.',
          );
        if (d.action === 'SET_SUBJECT' && r.caseStatus)
          throw new BadRequestException(
            'The subject of a formal case cannot be changed.',
          );
        if (d.action === 'RESOLVE' && r.caseStatus && r.caseStatus !== 'CLOSED')
          throw new BadRequestException(
            'Complete the formal case before resolving its report.',
          );
        if (
          d.action === 'WITHDRAW' &&
          (!a.reporter || (r.caseStatus && r.caseStatus !== 'CLOSED'))
        )
          throw new ForbiddenException(
            'Only the reporter can withdraw a report without an active formal case.',
          );
        if (
          d.action === 'DISMISS' &&
          (!a.manage ||
            !(this.hr(u) || canDiscipline) ||
            (r.caseStatus && !canDiscipline))
        )
          throw new ForbiddenException(
            'Dismissal requires an independent authorized decision reviewer.',
          );
        if (['RESOLVE', 'DECIDE'].includes(d.action)) {
          if (!d.findings?.trim() || !d.outcome || !d.disciplinaryAction)
            throw new BadRequestException(
              'Enter findings, an outcome, and an action selection.',
            );
          if (
            d.disciplinaryAction !== 'NONE' &&
            (!canDiscipline ||
              d.outcome !== 'CONFIRMED' ||
              !d.actionDetails?.trim() ||
              d.action !== 'DECIDE')
          )
            throw new ForbiddenException(
              'Disciplinary actions require authority, a confirmed finding, action details and a completed formal notice/explanation.',
            );
        } else if (
          d.findings ||
          d.outcome ||
          d.disciplinaryAction ||
          d.actionDetails
        ) {
          throw new BadRequestException(
            'Decision fields are only accepted when recording a decision or resolution.',
          );
        }
        const assignmentOnly = ['ASSIGN_REVIEWER', 'SET_SUBJECT'].includes(
          d.action,
        );
        if (assignmentOnly && !a.manage)
          throw new ForbiddenException(
            'An authorized case reviewer is required.',
          );
        if (d.action === 'ASSIGN_REVIEWER' && !this.hr(u))
          throw new ForbiddenException(
            'Only Super/HR admins can assign reviewers.',
          );
        const next = formal
          ? incidentTransition(
              d.action === 'ESCALATE' ? 'UNDER_REVIEW' : (r.caseStatus ?? ''),
              d.action,
              a.manage,
              a.reporter,
              a.subject,
            )
          : assignmentOnly
            ? { status: r.status, audience: 'INTERNAL' }
            : reportTransition(
                r.status,
                d.action,
                a.manage,
                d.action === 'WITHDRAW'
                  ? a.reporter
                  : a.reporter || (a.subject && !!r.sharedWithSubject),
                this.hr(u) || (d.action === 'DISMISS' && canDiscipline),
              );
        status = formal
          ? d.action === 'DECIDE'
            ? 'CLOSED'
            : r.status
          : next.status;
        audience = next.audience;
        if (!formal && audience === 'PARTICIPANTS' && !r.sharedWithSubject)
          audience = 'REPORTER';
        if (d.action === 'COMMENT' && a.manage)
          audience = d.audience ?? 'INTERNAL';
        if (d.action === 'HR_ESCALATE') {
          if (!d.reviewerId)
            throw new BadRequestException('Choose an authorized HR reviewer.');
          await this.validateReviewer(
            m,
            d.reviewerId,
            r.branchId,
            r.employeeId,
            r.reporterId!,
          );
          const target = await m.query<Array<{ role: string }>>(
            'SELECT role FROM users WHERE id=$1',
            [d.reviewerId],
          );
          if (!['SUPER_ADMIN', 'HR_ADMIN'].includes(target[0]?.role))
            throw new ForbiddenException(
              'Escalation requires an HR or Super Admin reviewer.',
            );
          await m.query(
            'UPDATE workplace_incidents SET reviewer_id=$2 WHERE id=$1',
            [id, d.reviewerId],
          );
        }
        if (formal) caseStatus = next.status;
        if (['WITHDRAW', 'DISMISS'].includes(d.action) && r.caseStatus) {
          caseStatus = 'CLOSED';
          await m.query(
            "UPDATE workplace_incidents SET case_status='CLOSED' WHERE id=$1",
            [id],
          );
        }
        if (formal)
          await m.query(
            'UPDATE workplace_incidents SET case_status=$2,case_started_at=COALESCE(case_started_at,now()) WHERE id=$1',
            [id, next.status],
          );
        if (['RESOLVE', 'DECIDE'].includes(d.action))
          await m.query(
            'UPDATE workplace_incidents SET resolved_at=now(),resolved_by=$2,resolution_summary=$3 WHERE id=$1',
            [
              id,
              u.userId,
              d.action === 'DECIDE'
                ? 'Formal case completed. See authorized case correspondence.'
                : message,
            ],
          );
        if (['CLOSE', 'DECIDE', 'WITHDRAW', 'DISMISS'].includes(d.action))
          await m.query(
            'UPDATE workplace_incidents SET closed_at=now() WHERE id=$1',
            [id],
          );
        if (['ESCALATE', 'NOTICE'].includes(d.action) && !r.employeeId)
          throw new BadRequestException(
            'A disciplinary case requires a concerned employee on the report.',
          );
        if (d.action === 'COMMENT' && a.manage)
          audience = d.audience ?? 'INTERNAL';
        if (d.action === 'SET_SUBJECT') {
          if (!d.employeeId)
            throw new BadRequestException('Choose the concerned employee.');
          const employee = await this.employee(d.employeeId, m);
          if (
            employee.branchId !== r.branchId ||
            !this.inScope(u, employee.branchId) ||
            employee.id === a.own?.id
          )
            throw new ForbiddenException('Concerned employee access denied.');
          await m.query(
            'UPDATE workplace_incidents SET employee_id=$2 WHERE id=$1',
            [id, employee.id],
          );
        }
        if (d.action === 'ASSIGN_REVIEWER') {
          if (!this.hr(u) || !d.reviewerId)
            throw new ForbiddenException(
              'Only Super/HR admins can designate a reviewer.',
            );
          await this.validateReviewer(
            m,
            d.reviewerId,
            r.branchId,
            r.employeeId,
            r.reporterId!,
          );
          await m.query(
            'UPDATE workplace_incidents SET reviewer_id=$2 WHERE id=$1',
            [id, d.reviewerId],
          );
        }
        await m.query(
          'UPDATE workplace_incidents SET status=$2,version=version+1,updated_at=now() WHERE id=$1',
          [id, status],
        );
      }
      const eventId = await this.event(
        m,
        u,
        kind,
        id,
        r.branchId,
        d.action === 'REASSIGN' ? 'REASSIGNED' : d.action,
        audience,
        message,
        {
          previousStatus: r.status,
          status,
          ...(d.action === 'ASSIGN_REVIEWER'
            ? { previousReviewerId: r.reviewerId, reviewerId: d.reviewerId }
            : {}),
          ...(d.action === 'SET_SUBJECT'
            ? { previousEmployeeId: r.employeeId, employeeId: d.employeeId }
            : {}),
          ...(d.action === 'PROGRESS' ? { progress: d.progress } : {}),
          ...(d.action === 'STATUS' ? { taskState: d.taskState } : {}),
          ...(d.action === 'REASSIGN'
            ? {
                previousAssigneeIds: (r.assignees ?? []).map((assignee) =>
                  String(assignee.id),
                ),
                previousAssigneeBranches: (r.assignees ?? []).map(
                  (assignee) => ({
                    employeeId: String(assignee.id),
                    branchId: assignee.currentBranchId,
                  }),
                ),
                assigneeIds: d.employeeIds,
                assigneeBranches: reassignedAssigneeBranches,
              }
            : {}),
          ...(kind === 'incidents'
            ? { previousCaseStatus: r.caseStatus, caseStatus }
            : {}),
          ...(kind === 'incidents' && ['RESOLVE', 'DECIDE'].includes(d.action)
            ? {
                findings: d.findings?.trim(),
                outcome: d.outcome,
                disciplinaryAction: d.disciplinaryAction,
                actionDetails: d.actionDetails?.trim(),
              }
            : {}),
        },
      );
      if (attachment) await this.storeEvidence(m, eventId, attachment);
      if (kind === 'tasks') {
        const mailEvent =
          d.action === 'REASSIGN'
            ? 'ASSIGNED'
            : status === 'FOR_REVIEW' && r.status !== 'FOR_REVIEW'
              ? 'REVIEW_REQUIRED'
              : d.action === 'CHANGES'
                ? 'CHANGES_REQUESTED'
                : d.action === 'ACCEPT'
                  ? 'COMPLETED'
                  : d.action === 'CANCEL'
                    ? 'CANCELLED'
                    : null;
        await this.notifyTask(
          m,
          id,
          r.createdBy ?? null,
          u.userId,
          mailEvent,
          d.action === 'REASSIGN' ? reassignedEmployeeIds : null,
        );
      } else {
        if (d.action === 'SET_SUBJECT' && r.sharedWithSubject)
          await this.notify(m, kind, id, r.branchId, d.employeeId!, null);
        if (['SUBJECT', 'PARTICIPANTS'].includes(audience) && r.employeeId)
          await this.notify(m, kind, id, r.branchId, r.employeeId, null);
        if (
          ['REPORTER', 'PARTICIPANTS'].includes(audience) ||
          status === 'CLOSED'
        )
          await this.notify(m, kind, id, r.branchId, null, r.reporterId!);
        if (d.action === 'HR_ESCALATE') {
          await this.event(
            m,
            u,
            kind,
            id,
            r.branchId,
            'HR_REFERRED',
            r.sharedWithSubject ? 'PARTICIPANTS' : 'REPORTER',
            'Referred to HR for review.',
          );
          await this.notify(
            m,
            kind,
            id,
            r.branchId,
            r.sharedWithSubject ? r.employeeId : null,
            r.reporterId!,
          );
        }
        if (!a.manage) await this.notifyReviewers(m, id, r.branchId, u.userId);
        if (['ASSIGN_REVIEWER', 'HR_ESCALATE'].includes(d.action))
          await this.notify(m, kind, id, r.branchId, null, d.reviewerId!);
      }
      return {
        id,
        status,
        version: r.version + 1,
        ...(kind === 'incidents' ? { caseStatus } : {}),
      };
    });
  }
  private async validateReviewer(
    m: EntityManager,
    id: string,
    branch: string,
    employee: string | null,
    reporter: string,
  ) {
    const rows = await m.query<Array<{ id: string }>>(
      `SELECT u.id FROM users u LEFT JOIN employee_branch_access a ON a.user_id=u.id WHERE u.id=$1 AND u.status='ACTIVE' AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER') AND u.id<>$3 AND ($4::text IS NULL OR u.employee_id IS DISTINCT FROM $4) AND (u.role='SUPER_ADMIN' OR a.mode='ALL' OR a.mode='SELECTED' AND $2=ANY(a.branch_ids) OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.branch_id=$2 OR u.role='HR_ADMIN' AND u.branch_id IS NULL OR EXISTS(SELECT 1 FROM branches b WHERE b.id=$2 AND b.manager_user_id=u.id))) FOR SHARE OF u`,
      [id, branch, reporter, employee],
    );
    if (!rows.length)
      throw new BadRequestException(
        'Choose an authorized reviewer who is not the reporter or concerned employee.',
      );
  }
  private async event(
    m: EntityManager,
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    branch: string,
    action: string,
    audience: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    details = { ...details, actorRole: u.role };
    const {
      findings: _findings,
      actionDetails: _actionDetails,
      ...auditDetails
    } = details;
    const eventId = randomUUID();
    await m.query(
      `INSERT INTO work_events(id,task_id,incident_id,actor_id,action,audience,message,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        eventId,
        kind === 'tasks' ? id : null,
        kind === 'incidents' ? id : null,
        u.userId,
        action,
        audience,
        message,
        details,
      ],
    );
    await m.query(
      `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,$4,$5,$6,now())`,
      [
        randomUUID(),
        u.userId,
        branch,
        `WORK_${action}`,
        kind,
        { recordId: id, eventId, ...auditDetails },
      ],
    );
    return eventId;
  }
  private async notifyTask(
    m: EntityManager,
    id: string,
    creator: string | null,
    actor: string,
    mailEvent: string | null,
    assigneeMailTargets: string[] | null = null,
  ) {
    const notifications = await m.query<Array<{ id: string; user_id: string }>>(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name) SELECT gen_random_uuid()::text,u.id,COALESCE(a.branch_id,t.branch_id),'Task update','Open the private workspace to review an update.','INFO',false,now(),'/tasks?record='||t.id,COALESCE((SELECT name FROM users WHERE id=$3),'System') FROM work_tasks t JOIN users u ON u.status='ACTIVE' LEFT JOIN work_task_assignees a ON a.task_id=t.id AND a.employee_id=u.employee_id WHERE t.id=$1 AND (a.employee_id IS NOT NULL OR u.id=$2) RETURNING id,user_id`,
      [id, creator, actor],
    );
    if (!mailEvent || !notifications.length) return;
    await m.query(
      `INSERT INTO work_task_mail_outbox(notification_id,user_id,task_id,event,audience)
       SELECT n.id,n.user_id,$1::uuid,$2::text,
         CASE WHEN $2::text='REVIEW_REQUIRED' THEN 'CREATOR' ELSE 'ASSIGNEE' END
       FROM notifications n JOIN users u ON u.id=n.user_id
       WHERE n.id=ANY($3::text[]) AND n.user_id<>$4
         AND ($6::text[] IS NULL OR u.employee_id=ANY($6::text[]))
         AND (($2::text='REVIEW_REQUIRED' AND n.user_id=$5 AND u.role IN ('SUPER_ADMIN','HR_ADMIN','BRANCH_MANAGER')
           AND NOT EXISTS(SELECT 1 FROM work_task_assignees a WHERE a.task_id=$1 AND a.employee_id=u.employee_id))
           OR ($2::text<>'REVIEW_REQUIRED' AND EXISTS(SELECT 1 FROM work_task_assignees a WHERE a.task_id=$1 AND a.employee_id=u.employee_id)))
       ON CONFLICT(notification_id) DO NOTHING`,
      [
        id,
        mailEvent,
        notifications.map((n) => n.id),
        actor,
        creator,
        assigneeMailTargets,
      ],
    );
  }
  private async notify(
    m: EntityManager,
    kind: WorkKind,
    id: string,
    branch: string,
    employee: string | null,
    user: string | null,
  ) {
    const notifications = await m.query<Array<{ id: string }>>(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name) SELECT gen_random_uuid()::text,u.id,$1,$2,'Open the private workspace to review an update.','INFO',false,now(),$3,'Private workspace' FROM users u WHERE u.status='ACTIVE' AND (u.employee_id=$4 OR u.id=$5) RETURNING id`,
      [
        branch,
        kind === 'tasks' ? 'Task update' : 'Private incident / case update',
        `/${kind}?record=${id}`,
        employee,
        user,
      ],
    );
    if (kind === 'incidents') await this.queueMail(m, id, notifications);
  }
  private async notifyReviewers(
    m: EntityManager,
    id: string,
    branch: string,
    actor: string,
  ) {
    const notifications = await m.query<Array<{ id: string }>>(
      `INSERT INTO notifications(id,user_id,branch_id,title,message,type,read,created_at,href,sender_name) SELECT gen_random_uuid()::text,u.id,$2::text,'Private report update','Open the private workspace to review an update.','INFO',false,now(),'/incidents?record='||$1,'Private workspace' FROM users u LEFT JOIN employee_branch_access a ON a.user_id=u.id WHERE u.status='ACTIVE' AND u.id<>$3 AND (u.role='SUPER_ADMIN' OR u.role='HR_ADMIN' AND (a.mode='ALL' OR a.mode='SELECTED' AND $2=ANY(a.branch_ids) OR COALESCE(a.mode,'ASSIGNED')='ASSIGNED' AND (u.branch_id IS NULL OR u.branch_id=$2 OR EXISTS(SELECT 1 FROM branches b WHERE b.id=$2 AND b.manager_user_id=u.id))) OR u.id=(SELECT reviewer_id FROM workplace_incidents WHERE id=$1::uuid)) RETURNING id`,
      [id, branch, actor],
    );
    await this.queueMail(m, id, notifications);
  }
  private async queueMail(
    m: EntityManager,
    incident: string,
    notifications: Array<{ id: string }>,
  ) {
    if (!notifications.length) return;
    const ids = notifications.map((n) => n.id);
    await m.query(
      `UPDATE notifications n SET message=t.reference_number || ' ? ' || t.category || ' ? ' || t.status || CASE WHEN t.case_status IS NOT NULL THEN ' / case: ' || t.case_status ELSE '' END || '. Open the private workspace for details.' FROM workplace_incidents t WHERE t.id=$1 AND n.id=ANY($2::text[])`,
      [incident, ids],
    );
    await m.query(
      `INSERT INTO work_mail_outbox(notification_id,user_id,incident_id,reference_number,category,status) SELECT n.id,n.user_id,t.id,t.reference_number,t.category,CASE WHEN t.case_status IS NOT NULL AND t.case_status<>'CLOSED' THEN t.case_status ELSE t.status END FROM notifications n CROSS JOIN workplace_incidents t WHERE t.id=$1 AND n.id=ANY($2::text[]) ON CONFLICT(notification_id) DO NOTHING`,
      [incident, ids],
    );
  }
  private validateUpload(file: WorkUpload | undefined): ValidatedUpload {
    if (!file || !file.buffer.length || file.buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Choose a PDF, PNG or JPEG up to 5 MB.');
    const b = file.buffer;
    const mime =
      b.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : b
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : b[0] === 255 && b[1] === 216 && b[2] === 255
            ? 'image/jpeg'
            : null;
    if (!mime)
      throw new BadRequestException(
        'Only PDF, PNG and JPEG evidence is accepted.',
      );
    return {
      buffer: b,
      mime,
      filename:
        file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(-180) ||
        'attachment',
    };
  }
  private async saveAttachment(
    m: EntityManager,
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    branchId: string,
    audience: string,
    file: ValidatedUpload,
  ) {
    const event = await this.event(
      m,
      u,
      kind,
      id,
      branchId,
      'ATTACHMENT',
      audience,
      'Supporting file added.',
    );
    return this.storeEvidence(m, event, file);
  }
  private async storeEvidence(
    m: EntityManager,
    event: string,
    file: ValidatedUpload,
  ) {
    const attachmentId = randomUUID();
    await m.query(
      'INSERT INTO work_attachments(id,event_id,filename,mime,content) VALUES($1,$2,$3,$4,$5)',
      [attachmentId, event, file.filename, file.mime, file.buffer],
    );
    return attachmentId;
  }
  async upload(
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    file: WorkUpload | undefined,
    audience: string,
  ) {
    const attachment = this.validateUpload(file);
    return this.db.transaction(async (m) => {
      const a = await this.authorized(u, kind, id, m, true);
      if (['CLOSED', 'RESOLVED', 'COMPLETED', 'CANCELLED'].includes(a.r.status))
        throw new BadRequestException('This record is closed.');
      const counts = await m.query<Array<{ count: number }>>(
        `SELECT count(*)::int AS count FROM work_attachments a JOIN work_events e ON e.id=a.event_id WHERE e.${kind === 'tasks' ? 'task_id' : 'incident_id'}=$1`,
        [id],
      );
      if (counts[0].count >= 20)
        throw new BadRequestException(
          'This record already has 20 supporting files.',
        );
      const visibility =
        kind === 'tasks'
          ? 'PARTICIPANTS'
          : a.manage
            ? ['INTERNAL', 'REPORTER', 'SUBJECT'].includes(audience)
              ? audience
              : 'INTERNAL'
            : a.reporter
              ? 'REPORTER'
              : 'SUBJECT';
      const attachmentId = await this.saveAttachment(
        m,
        u,
        kind,
        id,
        a.r.branchId,
        visibility,
        attachment,
      );
      await m.query(
        `UPDATE ${kind === 'tasks' ? 'work_tasks' : 'workplace_incidents'} SET version=version+1,updated_at=now() WHERE id=$1`,
        [id],
      );
      return { id: attachmentId };
    });
  }
  async download(
    u: AuthUserContext,
    kind: WorkKind,
    id: string,
    attachmentId: string,
  ) {
    const a = await this.authorized(u, kind, id, this.db.manager);
    const rows = await this.db.query<
      Array<{
        content: Buffer;
        filename: string;
        mime: string;
        audience: string;
      }>
    >(
      `SELECT a.content,a.filename,a.mime,e.audience FROM work_attachments a JOIN work_events e ON e.id=a.event_id WHERE a.id=$1 AND e.${kind === 'tasks' ? 'task_id' : 'incident_id'}=$2`,
      [attachmentId, id],
    );
    const file = rows[0];
    const incidentAdmin = kind === 'incidents' && this.hr(u);
    const incidentReviewer =
      kind === 'incidents' && a.manage && (incidentAdmin || this.manager(u));
    if (
      !file ||
      !(
        incidentReviewer ||
        (incidentAdmin && file.audience === 'INTERNAL') ||
        this.visibleEvent(
          kind,
          a.manage || a.supervisor,
          a.reporter,
          a.subject,
          file.audience,
        )
      )
    )
      throw new NotFoundException('Attachment not found.');
    await this.db.query(
      `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,'WORK_DOWNLOAD',$4,$5,now())`,
      [
        randomUUID(),
        u.userId,
        a.r.branchId,
        kind,
        { recordId: id, attachmentId },
      ],
    );
    return file;
  }
}
