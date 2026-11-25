import { BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { AuthUserContext } from '../foundation/auth/auth.context.js';
import { WorkService } from '../work/work.service.js';
import { analyticsPermission, categoryInfo, permittedCategories, type ModuleOverride } from './analytics-access.js';
import { AnalyticsQuery, manilaDate, reportingRange, type AnalyticsCategory } from './analytics.dto.js';
import { sourceRows, sources } from './analytics-sources.js';
import type { AnalyticsPanel, AggregateRow } from './analytics.types.js';

export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  constructor(private readonly db: DataSource) {}

  private async access(user: AuthUserContext, q: AnalyticsQuery) {
    const overrides = await this.db.query<ModuleOverride[]>(
      'SELECT permission_key,effect FROM user_module_permissions WHERE user_id=$1', [user.userId]);
    const key = q.mode === 'hr' ? 'hr.dashboard' : 'workspace.overview';
    if (!analyticsPermission(user, overrides, key)) throw new ForbiddenException('Dashboard access denied.');
    // Auth middleware refreshes finite grants on every request. No role-name global fallback.
    const scope = user.branchIds ?? (user.allBranches && user.scope === 'ALL' ? null : user.branchId ? [user.branchId] : []);
    const branches = await this.db.query<{ id: string; name: string }[]>(
      'SELECT id,name FROM branches WHERE is_active AND ($1::text[] IS NULL OR id=ANY($1)) ORDER BY name,id', [scope]);
    if (q.branchId && !branches.some(b => b.id === q.branchId)) throw new ForbiddenException('Branch access denied or branch is inactive.');
    const allowed = permittedCategories(user, overrides, q.mode);
    if (q.category !== 'all' && !allowed.includes(q.category)) throw new ForbiddenException('Report category access denied.');
    return { overrides, branches, allowed };
  }
  async context(user: AuthUserContext, q: AnalyticsQuery) {
    const access = await this.access(user, q);
    return { branches: access.branches, categories: access.allowed.map(id => ({ id, title: categoryInfo[id].title })), timeZone: 'Asia/Manila', today: manilaDate(),
      notes: ['Inquiry reporting uses handling-branch ownership and excludes archived records and unverified legacy conversions.', 'Payroll, recruitment, training and performance metrics are outside the currently implemented HRIS scope.'] };
  }
  async data(user: AuthUserContext, query: AnalyticsQuery) {
    const q: AnalyticsQuery & { from: string; to: string } = Object.assign(new AnalyticsQuery(), query, reportingRange(query));
    const access = await this.access(user, q);
    const branchIds = q.branchId ? [q.branchId] : access.branches.map(b => b.id);
    const ids = q.category === 'all' ? access.allowed : [q.category];
    if (q.mode === 'overview') {
      const order: AnalyticsCategory[] = ['reservations', 'inquiries', 'spaces', 'workforce', 'inventory', 'tasks', 'attendance', 'leave', 'official-business', 'movements', 'assets', 'incidents', 'accounts', 'branches'];
      ids.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    }
    const scopedUser = { ...user, branchIds: access.branches.map(b => b.id) };
    const panels: AnalyticsPanel[] = [];
    // Sequential module queries bound pressure on the shared database pool.
    for (const id of ids) {
      const info = categoryInfo[id];
      const source = sources[id];
      const panel: AnalyticsPanel = { id, title: info.title, href: info.href, snapshot: !!source?.snapshot,
        description: source?.description ?? (id === 'tasks' ? 'Tasks created in the period, under current private-workspace visibility. Overdue uses today and excludes completed/cancelled tasks.' : 'Visible incidents by incident date and current status, with the same participant, reviewer and reporting-line access as the private workspace.'),
        state: 'ready', metrics: [], rows: [], amountLabel: source?.amountLabel,
        attentionLabel: source?.attentionLabel ?? (id === 'tasks' ? 'Overdue tasks' : id === 'incidents' ? 'Unresolved incidents' : undefined) };
      try {
        panel.rows = id === 'tasks' || id === 'incidents'
          ? await new WorkService(this.db).analytics(scopedUser, id, branchIds, q.from, q.to, q.grouping, q.status)
          : await sourceRows(this.db, id, branchIds, q, user.role);
        panel.metrics = this.metrics(panel, source?.countLabel ?? info.title);
        if (id === 'workforce') {
          const canOpen = analyticsPermission(user, access.overrides, 'hr.employee-profile');
          const people = await this.db.query<NonNullable<AnalyticsPanel['people']>>(`SELECT e.id,e.name,COALESCE(p.name,e.position) AS position,COALESCE(d.name,e.department) AS department,b.name AS branch FROM employees e JOIN branches b ON b.id=e.branch_id LEFT JOIN departments d ON d.id=e.department_id LEFT JOIN employee_positions p ON p.id=e.position_id WHERE e.branch_id=ANY($1::text[]) AND ($2::text IS NULL OR e.status=$2) ORDER BY CASE WHEN e.status='ACTIVE' THEN 0 ELSE 1 END,e.name,e.id LIMIT 6`, [branchIds, q.status || null]);
          panel.people = people.map(person => ({ ...person, ...(canOpen ? { href: `/employees/${encodeURIComponent(person.id)}` } : {}) }));
          const departments = await this.db.query<{ label: string; value: number }[]>(`SELECT COALESCE(d.name,NULLIF(e.department,''),'Unassigned') AS label,count(*)::int AS value FROM employees e LEFT JOIN departments d ON d.id=e.department_id WHERE e.branch_id=ANY($1::text[]) AND ($2::text IS NULL OR e.status=$2) GROUP BY 1 ORDER BY 2 DESC,1 LIMIT 201`, [branchIds, q.status || null]);
          if (departments.length > 200) throw new BadRequestException('Narrow the branch filter to at most 200 departments.');
          panel.breakdown = { title: 'Employees by department', values: departments };
        }
        if (id === 'reservations') {
          const today = manilaDate();
          const where = `r.branch_id=ANY($1::text[]) AND r.start_date_time>=($2::date::timestamp AT TIME ZONE 'Asia/Manila') AND r.start_date_time<(($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila') AND ($3::text IS NULL OR r.status=$3)`;
          const [total] = await this.db.query<{ count: number }[]>(`SELECT count(*)::int AS count FROM reservations r WHERE ${where}`, [branchIds, today, q.status || null]);
          panel.reservationTotal = total.count;
          panel.metrics.push({ label: 'Reservations today', value: total.count, definition: 'Reservations starting on the current Manila calendar day in authorized branches; independent of the selected reporting period.' });
          panel.reservationPage = Math.min(q.reservationPage, Math.max(1, Math.ceil(total.count / 10)));
          panel.reservations = await this.db.query<NonNullable<AnalyticsPanel['reservations']>>(`SELECT r.id,r.start_date_time AS "startAt",r.customer_name AS customer,room.name AS room,b.name AS branch,r.status FROM reservations r JOIN rooms room ON room.id=r.room_id JOIN branches b ON b.id=r.branch_id WHERE ${where} ORDER BY r.start_date_time,r.id LIMIT 10 OFFSET $4`, [branchIds, today, q.status || null, (panel.reservationPage - 1) * 10]);
        }
        if (id === 'leave') {
          const [today] = await this.db.query<{ count: number }[]>(`SELECT count(DISTINCT r.employee_id)::int AS count FROM leave_requests r JOIN leave_request_days d ON d.request_id=r.id WHERE r.branch_id=ANY($1::text[]) AND r.status='APPROVED' AND d.work_date=(now() AT TIME ZONE 'Asia/Manila')::date`, [branchIds]);
          panel.metrics.push({ label: 'On approved leave today', value: today.count, definition: 'Distinct employees with approved leave day units today in authorized branches, independent of period/status filters.' });
          const types = await this.db.query<{ label: string; value: number }[]>(`SELECT t.name AS label,sum(d.units)::float8 AS value FROM leave_requests r JOIN leave_types t ON t.id=r.type_id JOIN leave_request_days d ON d.request_id=r.id WHERE r.branch_id=ANY($1::text[]) AND r.status='APPROVED' AND d.work_date BETWEEN $2::date AND $3::date AND ($4::text IS NULL OR r.status=$4) GROUP BY t.id,t.name ORDER BY 2 DESC,t.name LIMIT 201`, [branchIds, q.from, q.to, q.status || null]);
          if (types.length > 200) throw new BadRequestException('Narrow the branch filter to at most 200 leave types.');
          panel.breakdown = { title: 'Approved leave days by type', values: types };
        }
      } catch (error) {
        if (error instanceof BadRequestException || error instanceof ForbiddenException) throw error;
        this.logger.error(`Analytics source failed: ${id}`);
        panel.state = 'unavailable'; panel.message = 'This data source could not be loaded. Refresh to retry.';
        panel.rows = []; panel.metrics = []; delete panel.people; delete panel.reservations; delete panel.reservationTotal; delete panel.reservationPage; delete panel.breakdown;
      }
      panels.push(panel);
    }
    return { generatedAt: new Date().toISOString(), timeZone: 'Asia/Manila', filters: q,
      branches: access.branches.filter(b => branchIds.includes(b.id)), panels };
  }
  private metrics(panel: AnalyticsPanel, countLabel: string) {
    const sum = (field: keyof Pick<AggregateRow, 'count' | 'amount' | 'attention'>) => panel.rows.reduce((total, row) => total + Number(row[field]), 0);
    const metrics = [{ label: countLabel, value: sum('count'), definition: panel.description }];
    if (panel.amountLabel) metrics.push({ label: panel.amountLabel, value: Math.round(sum('amount') * 100) / 100, definition: panel.description });
    if (panel.attentionLabel) metrics.push({ label: panel.attentionLabel, value: sum('attention'), definition: panel.description });
    if (panel.id === 'workforce') for (const status of ['ACTIVE', 'INACTIVE']) metrics.push({ label: `${status === 'ACTIVE' ? 'Active' : 'Inactive'} employees`, value: panel.rows.filter(r => r.status === status).reduce((n, r) => n + r.count, 0), definition: `Current employees with exact ${status} status. Other employment statuses appear separately in the distribution.` });
    return metrics;
  }
}
