import {
  verifiedInquiryConversion,
  verifiedInquiryReservation,
} from './inquiry-reporting.js';
import { inquiryPdf, inquiryWorkbook } from './inquiry-export.js';
import {
  InquiryReminderPolicyDto,
  type InquiryRescheduleDto,
} from './inquiry.dto.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import {
  includesBranch,
  selectedBranchScope,
} from '../../foundation/auth/branch-scope.js';
import {
  defaultModuleAccess,
  registryEntry,
} from '../../foundation/permissions/module-registry.js';
import type {
  InquiryActionDto,
  InquiryActivityDto,
  InquiryBulkDto,
  InquiryConversionDto,
  InquiryLookupDto,
  InquiryQueryDto,
  InquiryTaskDto,
  InquiryTaskResultDto,
  SaveInquiryDto,
} from './inquiry.dto.js';
import { csvCell, validateTransition } from './inquiry.domain.js';

type Row = Record<string, unknown>;
export type InquiryRecord = {
  id: string;
  branchId: string;
  status: string;
  version: number;
  archivedAt: string | null;
  assignedStaffId: string;
  clientName: string;
  [key: string]: unknown;
};
const columns = `i.id,i.reference,i.branch_id AS "branchId",b.name AS "branchName",i.customer_id AS "customerId",
  i.client_name AS "clientName",i.client,i.inquiry_date::text AS "inquiryDate",i.assigned_staff_id AS "assignedStaffId",u.name AS "assignedStaffName",
  i.status,i.priority,i.description,i.requirements,i.notes,i.budget::float,i.pax,i.preferred_start AS "preferredStart",i.preferred_end AS "preferredEnd",
  i.channel_id AS "channelId",i.source_id AS "sourceId",i.next_action AS "nextAction",i.legacy_outcome AS "legacyOutcome",
  i.archived_at AS "archivedAt",i.version,i.created_at AS "createdAt",i.updated_at AS "updatedAt",
  COALESCE((SELECT jsonb_agg(pb.branch_id) FROM inquiry_preferred_branches pb WHERE pb.inquiry_id=i.id),'[]') AS "preferredBranchIds",
  COALESCE((SELECT jsonb_agg(s.service_id) FROM inquiry_services s WHERE s.inquiry_id=i.id),'[]') AS "serviceIds"`;
const joins = `FROM inquiries i JOIN branches b ON b.id=i.branch_id LEFT JOIN users u ON u.id=i.assigned_staff_id`;

export class InquiryManagementService {
  constructor(readonly db: DataSource) {}

  async authorize(user: AuthUserContext, action = 'list', write = false) {
    const key = `crm.inquiries.${action}`;
    const entry = registryEntry(key);
    if (!entry) throw new ForbiddenException('Inquiry access denied.');
    const overrides =
      user.role === 'SUPER_ADMIN'
        ? []
        : await this.db.query<{ permission_key: string; effect: string }[]>(
            `SELECT permission_key,effect FROM user_module_permissions WHERE user_id=$1`,
            [user.userId],
          );
    const byKey = new Map(overrides.map((r) => [r.permission_key, r.effect]));
    if (byKey.get('crm.inquiries') === 'DENY' || byKey.get(key) === 'DENY')
      throw new ForbiddenException('Inquiry access denied.');
    const own = byKey.get(key);
    const mode =
      own === 'ALLOW' ? 'EDIT' : (own ?? defaultModuleAccess(entry, user.role));
    if (mode === 'DENY' || (write && mode !== 'EDIT'))
      throw new ForbiddenException('Inquiry action is not permitted.');
    if (write && !['list', 'settings', 'import'].includes(action))
      await this.authorize(user, 'list');
  }
  branch(user: AuthUserContext, branchId: string) {
    if (!includesBranch(user, branchId))
      throw new ForbiddenException('Inquiry branch access denied.');
  }
  filter(user: AuthUserContext, q: InquiryQueryDto) {
    if (q.branchId) this.branch(user, q.branchId);
    if (q.from && q.to && q.from.slice(0, 10) > q.to.slice(0, 10))
      throw new BadRequestException('Date range is reversed.');
    const params: unknown[] = [
      q.branchId ? [q.branchId] : (selectedBranchScope(user) ?? null),
      q.archived === 'true',
    ];
    const clauses = [
      `($1::varchar[] IS NULL OR i.branch_id=ANY($1))`,
      `(i.archived_at IS NOT NULL)=$2`,
    ];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      clauses.push(sql.replaceAll('?', `$${params.length}`));
    };
    if (q.search?.trim())
      add(
        `(i.client_name ILIKE '%'||?||'%' OR i.reference ILIKE '%'||?||'%')`,
        q.search.trim(),
      );
    if (q.status) add('i.status=?', q.status);
    if (q.lostReason)
      add(
        "COALESCE((SELECT e.description FROM inquiry_events e WHERE e.inquiry_id=i.id AND e.new_status='LOST' ORDER BY e.sequence DESC LIMIT 1),'Not recorded')=?",
        q.lostReason,
      );
    if (q.metric) {
      const metricSql: Record<string, string> = {
        active: "i.status NOT IN ('LOST','CLOSED','CONVERTED','NEEDS_REVIEW')",
        legacyReserved: "i.legacy_outcome='RESERVED'",
        followUpsToday:
          "EXISTS(SELECT 1 FROM inquiry_tasks t WHERE t.inquiry_id=i.id AND t.status='OPEN' AND (t.due_at AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date)",
        overdueFollowUps:
          "EXISTS(SELECT 1 FROM inquiry_tasks t WHERE t.inquiry_id=i.id AND t.status='OPEN' AND t.due_at<now())",
      };
      const status: Record<string, string> = {
        new: 'NEW',
        noResponse: 'NO_RESPONSE',
        pendingReservations: 'PENDING_RESERVATION',
        reserved: 'RESERVED',
        converted: 'CONVERTED',
        lost: 'LOST',
      };
      if (metricSql[q.metric]) clauses.push(metricSql[q.metric]);
      else if (status[q.metric]) {
        add('i.status=?', status[q.metric]);
        if (q.metric === 'reserved') clauses.push(verifiedInquiryReservation);
        if (q.metric === 'converted') clauses.push(verifiedInquiryConversion);
      }
    }
    if (q.from) add('i.inquiry_date>=?::date', q.from.slice(0, 10));
    if (q.to) add('i.inquiry_date<=?::date', q.to.slice(0, 10));
    if (q.assignedStaffId) add('i.assigned_staff_id=?', q.assignedStaffId);
    if (q.sourceId) add('i.source_id=?', q.sourceId);
    if (q.channelId) add('i.channel_id=?', q.channelId);
    if (q.serviceId)
      add(
        'EXISTS(SELECT 1 FROM inquiry_services s WHERE s.inquiry_id=i.id AND s.service_id=?)',
        q.serviceId,
      );
    return { where: clauses.join(' AND '), params };
  }
  async list(user: AuthUserContext, q: InquiryQueryDto) {
    await this.authorize(user);
    const { where, params } = this.filter(user, q);
    const [count] = await this.db.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM inquiries i WHERE ${where}`,
      params,
    );
    const sort =
      (
        {
          date: 'i.inquiry_date',
          client: 'i.client_name',
          updated: 'i.updated_at',
          reference: 'i.reference',
        } as Record<string, string>
      )[q.sort ?? 'date'] ?? 'i.inquiry_date';
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 20;
    const items = await this.db.query<InquiryRecord[]>(
      `SELECT ${columns} ${joins} WHERE ${where} ORDER BY ${sort} ${q.direction === 'ASC' ? 'ASC' : 'DESC'} NULLS LAST,i.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { items, total: Number(count.total), page, pageSize };
  }
  async owned(
    m: Pick<EntityManager, 'query'>,
    user: AuthUserContext,
    id: string,
    lock = false,
  ) {
    const scope = selectedBranchScope(user);
    const [row] = await m.query<InquiryRecord[]>(
      `SELECT i.id,i.branch_id AS "branchId",i.status,i.version,i.archived_at AS "archivedAt",i.assigned_staff_id AS "assignedStaffId",i.client_name AS "clientName" FROM inquiries i WHERE i.id=$1 AND ($2::varchar[] IS NULL OR i.branch_id=ANY($2)) ${lock ? 'FOR UPDATE' : ''}`,
      [id, scope ?? null],
    );
    if (!row) throw new NotFoundException('Inquiry not found.');
    return row;
  }
  async detail(user: AuthUserContext, id: string) {
    await this.authorize(user);
    await this.owned(this.db, user, id);
    // Ownership is rechecked in the data query, including archived records.
    const [record] = await this.db.query<InquiryRecord[]>(
      `SELECT ${columns} ${joins} WHERE i.id=$1 AND ($2::varchar[] IS NULL OR i.branch_id=ANY($2))`,
      [id, selectedBranchScope(user) ?? null],
    );
    if (!record) throw new NotFoundException('Inquiry not found.');
    const events = await this.db.query(
      `SELECT e.id,e.type,e.description,e.previous_status AS "previousStatus",e.new_status AS "newStatus",e.occurred_at AS "occurredAt",e.created_at AS "createdAt",u.name AS "actorName" FROM inquiry_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.inquiry_id=$1 ORDER BY e.sequence DESC`,
      [id],
    );
    const tasks = await this.db.query(
      `SELECT id,description,action_type AS "actionType",priority,version,due_at AS "dueAt",status,result,assigned_staff_id AS "assignedStaffId" FROM inquiry_tasks WHERE inquiry_id=$1 ORDER BY due_at`,
      [id],
    );
    const [importSource] = await this.db.query(
      `SELECT r.batch_id AS "batchId",r.worksheet,r.row_number AS "rowNumber",r.normalized,b.created_at AS "importedAt" FROM inquiry_import_rows r JOIN inquiry_import_batches b ON b.id=r.batch_id WHERE r.inquiry_id=$1`,
      [id],
    );
    const reservations = await this.db.query(
      `SELECT id,reference,status,start_date_time AS "startAt",end_date_time AS "endAt" FROM reservations WHERE inquiry_id=$1 AND ($2::varchar[] IS NULL OR branch_id=ANY($2)) ORDER BY start_date_time DESC`,
      [id, selectedBranchScope(user) ?? null],
    );
    return {
      record,
      events,
      tasks,
      importSource: importSource ?? null,
      reservations,
    };
  }
  async metadata(user: AuthUserContext) {
    let visible = false;
    for (const action of [
      'list',
      'dashboard',
      'reports',
      'followups',
      'settings',
    ]) {
      try {
        await this.authorize(user, action);
        visible = true;
        break;
      } catch (e) {
        if (!(e instanceof ForbiddenException)) throw e;
      }
    }
    if (!visible) throw new ForbiddenException('Inquiry access denied.');
    const scope = selectedBranchScope(user);
    const [branches, staff, lookups] = await Promise.all([
      this.db.query(
        `SELECT id,name FROM branches WHERE is_active AND ($1::varchar[] IS NULL OR id=ANY($1)) ORDER BY name`,
        [scope ?? null],
      ),
      this.db.query(
        `SELECT id,name,branch_id AS "branchId" FROM users WHERE status='ACTIVE' AND (role='SUPER_ADMIN' OR ($1::varchar[] IS NULL OR branch_id=ANY($1))) ORDER BY name`,
        [scope ?? null],
      ),
      this.db.query(
        `SELECT * FROM inquiry_lookups ORDER BY kind,position,label`,
      ),
    ]);
    const permissions: Record<string, boolean> = {};
    for (const action of [
      'list',
      'create',
      'update',
      'archive',
      'assign',
      'activities',
      'followups',
      'convert',
      'dashboard',
      'reports',
      'import',
      'export',
      'settings',
    ]) {
      try {
        await this.authorize(
          user,
          action,
          ![
            'list',
            'followups',
            'settings',
            'dashboard',
            'reports',
            'export',
          ].includes(action),
        );
        permissions[action] = true;
      } catch (e) {
        if (!(e instanceof ForbiddenException)) throw e;
        permissions[action] = false;
      }
    }
    for (const [key, action] of [
      ['manageFollowups', 'followups'],
      ['manageSettings', 'settings'],
    ]) {
      try {
        await this.authorize(user, action, true);
        permissions[key] = true;
      } catch (e) {
        if (!(e instanceof ForbiddenException)) throw e;
        permissions[key] = false;
      }
    }
    return { branches, staff, lookups, permissions, userId: user.userId };
  }
  async customers(user: AuthUserContext, branchId: string, search: string) {
    await this.authorize(user);
    this.branch(user, branchId);
    if (!search?.trim() || search.length > 320) return [];
    return this.db.query(
      `SELECT id,name,email,phone,CASE WHEN lower(trim(email))=lower($2) THEN 'EMAIL' WHEN length($3)>=7 AND regexp_replace(phone,'[^0-9]','','g')=$3 THEN 'PHONE' ELSE 'NAME' END AS "matchType" FROM customers WHERE branch_id=$1 AND (name ILIKE '%'||$2||'%' OR lower(trim(email))=lower($2) OR (length($3)>=7 AND regexp_replace(phone,'[^0-9]','','g')=$3)) ORDER BY CASE WHEN lower(trim(email))=lower($2) THEN 0 WHEN length($3)>=7 AND regexp_replace(phone,'[^0-9]','','g')=$3 THEN 1 ELSE 2 END,name LIMIT 20`,
      [branchId, search.trim(), search.replace(/\D/g, '')],
    );
  }
  async validate(
    m: Pick<EntityManager, 'query'>,
    user: AuthUserContext,
    d: SaveInquiryDto,
    inquiryId?: string,
  ) {
    this.branch(user, d.branchId);
    if (!d.clientName.trim())
      throw new BadRequestException('Client name is required.');
    for (const id of d.preferredBranchIds) this.branch(user, id);
    const branchIds = [...new Set([d.branchId, ...d.preferredBranchIds])];
    const branches = await m.query<Row[]>(
      `SELECT id FROM branches WHERE is_active AND id=ANY($1::varchar[])`,
      [branchIds],
    );
    if (branches.length !== branchIds.length)
      throw new BadRequestException('Choose active authorized branches.');
    const [staff] = await m.query<Row[]>(
      `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND (branch_id=$2 OR role='SUPER_ADMIN')`,
      [d.assignedStaffId, d.branchId],
    );
    if (!staff)
      throw new BadRequestException(
        'Choose active staff assigned to the handling branch.',
      );
    if (d.customerId) {
      const [customer] = await m.query<Row[]>(
        `SELECT id FROM customers WHERE id=$1 AND branch_id=$2`,
        [d.customerId, d.branchId],
      );
      if (!customer)
        throw new BadRequestException(
          'Choose a customer in the handling branch.',
        );
    }
    const expected = [
      ...d.serviceIds,
      d.channelId,
      ...(d.sourceId ? [d.sourceId] : []),
    ];
    const lookups = await m.query<{ id: string; kind: string }[]>(
      `SELECT id,kind FROM inquiry_lookups l WHERE id=ANY($1::varchar[]) AND (active OR ($2::varchar IS NOT NULL AND (id IN (SELECT service_id FROM inquiry_services WHERE inquiry_id=$2) OR id IN (SELECT channel_id FROM inquiries WHERE id=$2 UNION ALL SELECT source_id FROM inquiries WHERE id=$2))))`,
      [expected, inquiryId ?? null],
    );
    if (
      d.serviceIds.some(
        (id) => !lookups.some((l) => l.id === id && l.kind === 'SERVICE'),
      ) ||
      !lookups.some((l) => l.id === d.channelId && l.kind === 'CHANNEL') ||
      (d.sourceId &&
        !lookups.some((l) => l.id === d.sourceId && l.kind === 'SOURCE'))
    )
      throw new BadRequestException(
        'Choose active services, channel and source.',
      );
    if (/follow.?up|ocular|schedule/i.test(d.nextAction ?? '') && !d.followUpAt)
      throw new BadRequestException(
        'A scheduled next action requires a follow-up date and time.',
      );
    if (
      d.preferredEnd &&
      (!d.preferredStart ||
        new Date(d.preferredEnd) <= new Date(d.preferredStart))
    )
      throw new BadRequestException(
        'Preferred end must follow preferred start.',
      );
  }
  async event(
    m: Pick<EntityManager, 'query'>,
    id: string,
    user: AuthUserContext,
    type: string,
    description: string,
    from?: string,
    to?: string,
    occurred = true,
  ) {
    await m.query(
      `INSERT INTO inquiry_events(id,inquiry_id,actor_id,type,description,previous_status,new_status,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        id,
        occurred ? user.userId : null,
        type,
        description,
        from ?? null,
        to ?? null,
        occurred ? new Date() : null,
      ],
    );
  }
  async audit(
    m: Pick<EntityManager, 'query'>,
    id: string,
    branchId: string,
    user: AuthUserContext,
    action: string,
  ) {
    await m.query(
      `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at) VALUES($1,$2,$3,$4,$5,$6,now())`,
      [
        randomUUID(),
        user.userId,
        branchId,
        `INQUIRY_${action}`,
        id,
        'Inquiry workflow action',
      ],
    );
  }
  async insert(m: EntityManager, user: AuthUserContext, d: SaveInquiryDto) {
    await this.validate(m, user, d);
    const id = randomUUID();
    await m.query(
      `INSERT INTO inquiries(id,reference,branch_id,customer_id,assigned_staff_id,space_interest,budget,status,notes,client_name,client,inquiry_date,channel_id,source_id,priority,description,requirements,pax,preferred_start,preferred_end,next_action,created_by,updated_by)
      VALUES($1,next_inquiry_reference(),$2,$3,$4,'',$5,$20,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19)`,
      [
        id,
        d.branchId,
        d.customerId ?? null,
        d.assignedStaffId,
        d.budget ?? null,
        d.notes ?? '',
        d.clientName.trim(),
        JSON.stringify({
          companyName: d.companyName?.trim() || undefined,
          contactPerson: d.contactPerson?.trim() || undefined,
          phone: d.phone?.trim() || undefined,
          email: d.email?.trim() || undefined,
        }),
        d.inquiryDate,
        d.channelId,
        d.sourceId ?? null,
        d.priority,
        d.description ?? '',
        d.requirements ?? '',
        d.pax ?? null,
        d.preferredStart ?? null,
        d.preferredEnd ?? null,
        d.nextAction ?? null,
        user.userId,
        d.initialStatus ?? 'NEW',
      ],
    );
    await this.relations(m, id, d);
    await this.event(
      m,
      id,
      user,
      'CREATED',
      'Inquiry recorded',
      undefined,
      d.initialStatus ?? 'NEW',
    );
    if (d.actionTaken?.trim())
      await this.event(m, id, user, 'NOTE', d.actionTaken.trim());
    if (d.followUpAt)
      await this.addTask(m, user, id, d.assignedStaffId, {
        description: d.nextAction?.trim() || 'Follow-up',
        dueAt: d.followUpAt,
      });
    await this.audit(m, id, d.branchId, user, 'CREATED');
    return id;
  }
  private async relations(m: EntityManager, id: string, d: SaveInquiryDto) {
    await m.query(
      `DELETE FROM inquiry_preferred_branches WHERE inquiry_id=$1`,
      [id],
    );
    await m.query(
      `INSERT INTO inquiry_preferred_branches SELECT $1,unnest($2::varchar[])`,
      [id, d.preferredBranchIds],
    );
    await m.query(`DELETE FROM inquiry_services WHERE inquiry_id=$1`, [id]);
    await m.query(
      `INSERT INTO inquiry_services SELECT $1,unnest($2::varchar[])`,
      [id, d.serviceIds],
    );
  }
  async save(user: AuthUserContext, d: SaveInquiryDto, id?: string) {
    await this.authorize(user, id ? 'update' : 'create', true);
    if (!id && d.assignedStaffId !== user.userId)
      await this.authorize(user, 'assign', true);
    const key = await this.db.transaction(async (m) => {
      if (!id) return this.insert(m, user, d);
      const old = await this.owned(m, user, id, true);
      if (old.archivedAt)
        throw new BadRequestException('Restore the inquiry before editing.');
      if (old.version !== d.version)
        throw new ConflictException('Inquiry changed. Refresh before saving.');
      if (old.branchId !== d.branchId)
        throw new BadRequestException(
          'Handling branch cannot change after creation.',
        );
      if (old.assignedStaffId !== d.assignedStaffId)
        await this.authorize(user, 'assign', true);
      await this.validate(m, user, d, id);
      await m.query(
        `UPDATE inquiries SET customer_id=$2,assigned_staff_id=$3,budget=$4,notes=$5,client_name=$6,client=$7::jsonb,inquiry_date=$8,channel_id=$9,source_id=$10,priority=$11,description=$12,requirements=$13,pax=$14,preferred_start=$15,preferred_end=$16,next_action=$17,updated_by=$18,updated_at=now(),version=version+1 WHERE id=$1`,
        [
          id,
          d.customerId ?? null,
          d.assignedStaffId,
          d.budget ?? null,
          d.notes ?? '',
          d.clientName.trim(),
          JSON.stringify({
            companyName: d.companyName?.trim() || undefined,
            contactPerson: d.contactPerson?.trim() || undefined,
            phone: d.phone?.trim() || undefined,
            email: d.email?.trim() || undefined,
          }),
          d.inquiryDate,
          d.channelId,
          d.sourceId ?? null,
          d.priority,
          d.description ?? '',
          d.requirements ?? '',
          d.pax ?? null,
          d.preferredStart ?? null,
          d.preferredEnd ?? null,
          d.nextAction ?? null,
          user.userId,
        ],
      );
      await this.relations(m, id, d);
      if (old.assignedStaffId !== d.assignedStaffId) {
        await m.query(
          `UPDATE inquiry_tasks SET assigned_staff_id=$2 WHERE inquiry_id=$1 AND status='OPEN'`,
          [id, d.assignedStaffId],
        );
        await this.event(m, id, user, 'ASSIGNMENT', 'Inquiry reassigned');
      }
      if (d.followUpAt)
        await this.addTask(m, user, id, d.assignedStaffId, {
          description: d.nextAction?.trim() || 'Follow-up',
          dueAt: d.followUpAt,
        });
      await this.event(m, id, user, 'UPDATED', 'Inquiry details updated');
      await this.audit(m, id, d.branchId, user, 'UPDATED');
      return id;
    });
    return this.detail(user, key);
  }
  async action(user: AuthUserContext, id: string, d: InquiryActionDto) {
    await this.authorize(
      user,
      d.archived === undefined ? 'update' : 'archive',
      true,
    );
    await this.db.transaction(async (m) => {
      const old = await this.owned(m, user, id, true);
      if (old.version !== d.version)
        throw new ConflictException('Inquiry changed. Refresh before saving.');
      if (d.archived !== undefined) {
        if (!d.reason?.trim())
          throw new BadRequestException(
            'Archive or restore reason is required.',
          );
        await m.query(
          `UPDATE inquiries SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1`,
          [id, d.archived, user.userId],
        );
        await this.event(
          m,
          id,
          user,
          d.archived ? 'ARCHIVED' : 'RESTORED',
          d.reason,
        );
      } else {
        if (old.archivedAt)
          throw new BadRequestException('Restore this inquiry first.');
        if (!d.status) throw new BadRequestException('Choose a status.');
        if (d.status !== old.status) {
          const [linked] = await m.query(
            `SELECT id FROM reservations WHERE inquiry_id=$1 AND status IN ('PENDING','CONFIRMED','CHECKED_IN','COMPLETED') LIMIT 1`,
            [id],
          );
          if (linked)
            throw new BadRequestException(
              'Use the linked reservation workflow to update this outcome.',
            );
        }
        validateTransition(old.status, d.status, d.reason);
        await m.query(
          `UPDATE inquiries SET status=$2,updated_at=now(),updated_by=$3,version=version+1 WHERE id=$1`,
          [id, d.status, user.userId],
        );
        await this.event(
          m,
          id,
          user,
          'STATUS',
          d.reason?.trim() || 'Status updated',
          old.status,
          d.status,
        );
      }
      await this.audit(m, id, old.branchId, user, 'ACTION');
    });
    return this.detail(user, id);
  }
  async bulk(user: AuthUserContext, d: InquiryBulkDto) {
    await this.authorize(user, 'archive', true);
    if (!d.reason.trim()) throw new BadRequestException('Reason is required.');
    await this.db.transaction(async (m) => {
      for (const id of [...d.ids].sort()) {
        const row = await this.owned(m, user, id, true);
        await m.query(
          `UPDATE inquiries SET archived_at=CASE WHEN $2 THEN now() ELSE NULL END,version=version+1,updated_at=now(),updated_by=$3 WHERE id=$1`,
          [id, d.archived, user.userId],
        );
        await this.event(
          m,
          id,
          user,
          d.archived ? 'ARCHIVED' : 'RESTORED',
          d.reason,
        );
        await this.audit(m, id, row.branchId, user, 'BULK_ARCHIVE');
      }
    });
    return { updated: d.ids.length };
  }
  async convertService(
    user: AuthUserContext,
    id: string,
    d: InquiryConversionDto,
  ) {
    await this.authorize(user, 'convert', true);
    if (!d.evidence.trim())
      throw new BadRequestException('Confirmation evidence is required.');
    await this.db.transaction(async (m) => {
      const old = await this.owned(m, user, id, true);
      if (old.version !== d.version)
        throw new ConflictException(
          'Inquiry changed. Refresh before confirming.',
        );
      if (
        old.archivedAt ||
        ['LOST', 'CLOSED', 'CONVERTED', 'NEEDS_REVIEW'].includes(old.status)
      )
        throw new BadRequestException('Resolve or reopen this inquiry first.');
      const [service] = await m.query(
        `SELECT 1 FROM inquiry_services s JOIN inquiry_lookups l ON l.id=s.service_id WHERE s.inquiry_id=$1 AND NOT l.reservable AND l.label NOT IN ('Location Inquiry','Availability Inquiry','Amenities Inquiry','Other') LIMIT 1`,
        [id],
      );
      if (!service)
        throw new BadRequestException('A non-reservation service is required.');
      await m.query(
        `UPDATE inquiries SET status='CONVERTED',version=version+1,updated_at=now(),updated_by=$2 WHERE id=$1`,
        [id, user.userId],
      );
      await this.event(
        m,
        id,
        user,
        'SERVICE_CONVERSION',
        d.evidence.trim(),
        old.status,
        'CONVERTED',
      );
      await this.audit(m, id, old.branchId, user, 'SERVICE_CONVERSION');
    });
    return this.detail(user, id);
  }
  async activity(user: AuthUserContext, id: string, d: InquiryActivityDto) {
    await this.authorize(user, 'activities', true);
    if (
      !d.description.trim() ||
      ![
        'CALL',
        'MESSAGE',
        'EMAIL',
        'PROPOSAL',
        'PRICELIST',
        'VISIT',
        'OCULAR',
        'NOTE',
        'FOLLOW_UP_RESULT',
      ].includes(d.type)
    )
      throw new BadRequestException(
        'Choose an activity type and enter its description.',
      );
    await this.db.transaction(async (m) => {
      const row = await this.owned(m, user, id, true);
      if (row.archivedAt)
        throw new BadRequestException('Restore this inquiry first.');
      await this.event(m, id, user, d.type, d.description.trim());
      await this.audit(m, id, row.branchId, user, 'ACTIVITY');
    });
    return this.detail(user, id);
  }
  async addTask(
    m: EntityManager,
    user: AuthUserContext,
    id: string,
    assignedStaffId: string,
    d: InquiryTaskDto,
  ) {
    if (!d.description.trim())
      throw new BadRequestException('Follow-up description is required.');
    await m.query(
      `INSERT INTO inquiry_tasks(id,inquiry_id,assigned_staff_id,description,due_at,created_by,action_type,priority) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        randomUUID(),
        id,
        assignedStaffId,
        d.description.trim(),
        d.dueAt,
        user.userId,
        d.actionType ?? 'FOLLOW_UP',
        d.priority ?? 'NORMAL',
      ],
    );
    await this.event(m, id, user, 'FOLLOW_UP_SCHEDULED', d.description.trim());
  }
  async schedule(user: AuthUserContext, id: string, d: InquiryTaskDto) {
    await this.authorize(user, 'followups', true);
    await this.db.transaction(async (m) => {
      const row = await this.owned(m, user, id, true);
      if (row.archivedAt)
        throw new BadRequestException('Restore this inquiry first.');
      await this.addTask(m, user, id, row.assignedStaffId, d);
      await this.audit(m, id, row.branchId, user, 'FOLLOW_UP');
    });
    return this.detail(user, id);
  }
  async reschedule(
    user: AuthUserContext,
    id: string,
    taskId: string,
    d: InquiryRescheduleDto,
  ) {
    await this.authorize(user, 'followups', true);
    if (!d.reason.trim())
      throw new BadRequestException('A rescheduling reason is required.');
    await this.db.transaction(async (m) => {
      const inquiry = await this.owned(m, user, id, true);
      if (inquiry.archivedAt)
        throw new BadRequestException('Restore this inquiry first.');
      const [task] = await m.query<
        { dueAt: Date; version: number; status: string }[]
      >(
        `SELECT due_at AS "dueAt",version,status FROM inquiry_tasks WHERE id=$1 AND inquiry_id=$2 FOR UPDATE`,
        [taskId, id],
      );
      if (!task || task.status !== 'OPEN' || task.version !== d.version)
        throw new ConflictException('Follow-up changed or is no longer open.');
      await m.query(
        `UPDATE inquiry_tasks SET due_at=$2,version=version+1,reminder_checked_at=NULL WHERE id=$1`,
        [taskId, d.dueAt],
      );
      await this.event(
        m,
        id,
        user,
        'FOLLOW_UP_RESCHEDULED',
        `${task.dueAt.toISOString()} → ${d.dueAt}: ${d.reason.trim()}`,
      );
      await this.audit(m, id, inquiry.branchId, user, 'FOLLOW_UP_RESCHEDULED');
    });
    return this.detail(user, id);
  }
  async reminderPolicy(
    user: AuthUserContext,
    branchId: string,
    d?: InquiryReminderPolicyDto,
  ) {
    await this.authorize(user, 'settings', d !== undefined);
    this.branch(user, branchId);
    const [branch] = await this.db.query(
      `SELECT id FROM branches WHERE id=$1 AND is_active`,
      [branchId],
    );
    if (!branch) throw new BadRequestException('Choose an active branch.');
    if (d)
      await this.db.transaction(async (m) => {
        await m.query(
          `INSERT INTO branch_settings(branch_id,setting_key,setting_value) VALUES($1,'inquiry.reminders',$2::jsonb) ON CONFLICT(branch_id,setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value`,
          [branchId, JSON.stringify(d)],
        );
        await this.audit(m, branchId, branchId, user, 'REMINDER_POLICY');
      });
    const [row] = await this.db.query<
      { value: Partial<InquiryReminderPolicyDto> }[]
    >(
      `SELECT setting_value AS value FROM branch_settings WHERE branch_id=$1 AND setting_key='inquiry.reminders'`,
      [branchId],
    );
    return Object.assign(new InquiryReminderPolicyDto(), row?.value ?? {});
  }
  async complete(
    user: AuthUserContext,
    id: string,
    taskId: string,
    d: InquiryTaskResultDto,
  ) {
    await this.authorize(user, 'followups', true);
    if (!d.result.trim())
      throw new BadRequestException('Enter the follow-up result.');
    await this.db.transaction(async (m) => {
      const row = await this.owned(m, user, id, true);
      if (row.archivedAt)
        throw new BadRequestException('Restore this inquiry first.');
      const changed = await m.query<Row[]>(
        `WITH changed AS (UPDATE inquiry_tasks SET status=$3,result=$4,completed_at=now(),completed_by=$5,version=version+1 WHERE id=$1 AND inquiry_id=$2 AND status='OPEN' AND version=$6 RETURNING id) SELECT id FROM changed`,
        [taskId, id, d.status, d.result.trim(), user.userId, d.version],
      );
      if (!changed.length)
        throw new ConflictException(
          'Follow-up is already completed or unavailable.',
        );
      await this.event(m, id, user, 'FOLLOW_UP_RESULT', d.result.trim());
      await this.audit(m, id, row.branchId, user, 'FOLLOW_UP_RESULT');
    });
    return this.detail(user, id);
  }
  async tasks(user: AuthUserContext, q: InquiryQueryDto) {
    await this.authorize(user, 'followups');
    const filter = this.filter(user, q),
      params = filter.params;
    let where = filter.where;
    if (q.followUpQueue === 'completed') where += " AND t.status='COMPLETED'";
    else if (q.followUpQueue === 'cancelled')
      where += " AND t.status='CANCELLED'";
    else {
      where += " AND t.status='OPEN'";
      if (!q.followUpQueue || q.followUpQueue === 'mine') {
        params.push(user.userId);
        where += ` AND t.assigned_staff_id=$${params.length}`;
      }
      if (q.followUpQueue === 'today')
        where +=
          " AND (t.due_at AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date";
      if (q.followUpQueue === 'overdue') where += ' AND t.due_at<now()';
      if (q.followUpQueue === 'upcoming') where += ' AND t.due_at>=now()';
    }
    const page = q.page ?? 1,
      pageSize = q.pageSize ?? 20;
    if (q.followUpFrom) {
      params.push(q.followUpFrom.slice(0, 10));
      where += ` AND (COALESCE(t.completed_at,t.due_at) AT TIME ZONE 'Asia/Manila')::date>=$${params.length}::date`;
    }
    if (q.followUpTo) {
      params.push(q.followUpTo.slice(0, 10));
      where += ` AND (COALESCE(t.completed_at,t.due_at) AT TIME ZONE 'Asia/Manila')::date<=$${params.length}::date`;
    }
    const [count] = await this.db.query<{ total: string }[]>(
      `SELECT count(*) AS total FROM inquiry_tasks t JOIN inquiries i ON i.id=t.inquiry_id WHERE ${where}`,
      params,
    );
    const items = await this.db.query(
      `SELECT t.id,t.inquiry_id AS "inquiryId",i.reference,i.client_name AS "clientName",i.branch_id AS "branchId",t.description,t.due_at AS "dueAt",t.status,t.result,t.assigned_staff_id AS "assignedStaffId",u.name AS "assignedStaffName" FROM inquiry_tasks t JOIN inquiries i ON i.id=t.inquiry_id LEFT JOIN users u ON u.id=t.assigned_staff_id WHERE ${where} ORDER BY t.due_at,t.id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { items, total: Number(count.total), page, pageSize };
  }
  async lookup(user: AuthUserContext, d: InquiryLookupDto, id?: string) {
    await this.authorize(user, 'settings', true);
    if (!d.label.trim())
      throw new BadRequestException('Lookup label is required.');
    const key = id ?? randomUUID();
    await this.db.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
        `inquiry-lookup:${d.kind}`,
      ]);
      const duplicates = await m.query<Row[]>(
        `SELECT id FROM inquiry_lookups WHERE kind=$1 AND lower(label)=lower($2) AND id<>$3`,
        [d.kind, d.label.trim(), key],
      );
      if (duplicates.length)
        throw new ConflictException('A value with this label already exists.');
      if (id) {
        const changed = await m.query<Row[]>(
          `WITH changed AS (UPDATE inquiry_lookups SET label=$2,position=$3,active=$4,reservable=$5 WHERE id=$1 AND kind=$6 RETURNING id) SELECT id FROM changed`,
          [id, d.label.trim(), d.position, d.active, d.reservable, d.kind],
        );
        if (!changed.length) throw new NotFoundException('Lookup not found.');
      } else
        await m.query(
          `INSERT INTO inquiry_lookups(id,kind,label,position,active,reservable) VALUES($1,$2,$3,$4,$5,$6)`,
          [key, d.kind, d.label.trim(), d.position, d.active, d.reservable],
        );
      await this.audit(
        m,
        key,
        user.branchId ??
          (
            await m.query<{ id: string }[]>(
              `SELECT id FROM branches ORDER BY id LIMIT 1`,
            )
          )[0]?.id,
        user,
        'LOOKUP',
      );
    });
    return { id: key };
  }
  async analytics(
    user: AuthUserContext,
    q: InquiryQueryDto,
    action = 'dashboard',
  ) {
    await this.authorize(user, action);
    const { where, params } = this.filter(user, q);
    const [totals] = await this.db.query(
      `SELECT count(*)::int AS total,count(*) FILTER(WHERE status='NEW')::int AS new,
      count(*) FILTER(WHERE status NOT IN ('LOST','CLOSED','CONVERTED','NEEDS_REVIEW'))::int AS active,
      count(*) FILTER(WHERE status='NO_RESPONSE')::int AS "noResponse",count(*) FILTER(WHERE status='PENDING_RESERVATION')::int AS "pendingReservations",
      count(*) FILTER(WHERE ${verifiedInquiryReservation})::int AS reserved,
      count(*) FILTER(WHERE ${verifiedInquiryConversion})::int AS converted,
      count(*) FILTER(WHERE legacy_outcome='RESERVED')::int AS "legacyReserved",
      count(*) FILTER(WHERE status='LOST')::int AS lost,count(*) FILTER(WHERE status<>'NEEDS_REVIEW')::int AS eligible
      FROM inquiries i WHERE ${where}`,
      params,
    );
    const grouping = ['day', 'week', 'month', 'quarter', 'year'].includes(
      q.grouping,
    )
      ? q.grouping
      : 'month';
    const dimensions: Record<string, string> = {
      status: 'i.status',
      branch: 'b.name',
      staff: "COALESCE(u.name,'Unassigned')",
      channel: "COALESCE(l.label,'Unknown')",
      source: "COALESCE(l.label,'Unknown')",
      period: `COALESCE(to_char(date_trunc('${grouping}',i.inquiry_date),'YYYY-MM-DD'),'Unknown date')`,
      lostReason:
        "COALESCE((SELECT e.description FROM inquiry_events e WHERE e.inquiry_id=i.id AND e.new_status='LOST' ORDER BY e.sequence DESC LIMIT 1),'Not recorded')",
      service: "COALESCE(l.label,'Unclassified')",
      serviceStatus: "COALESCE(l.label,'Unclassified')||' / '||i.status",
    };
    const reportOrder = ['label', 'count', 'converted'].includes(q.reportSort)
      ? q.reportSort
      : 'label';
    const reportDirection = q.direction === 'ASC' ? 'ASC' : 'DESC';
    const groups: Record<string, unknown> = {};
    for (const [name, expression] of Object.entries(dimensions)) {
      const extra =
        name === 'channel'
          ? 'LEFT JOIN inquiry_lookups l ON l.id=i.channel_id'
          : name === 'source'
            ? 'LEFT JOIN inquiry_lookups l ON l.id=i.source_id'
            : name === 'service' || name === 'serviceStatus'
              ? 'LEFT JOIN inquiry_services s ON s.inquiry_id=i.id LEFT JOIN inquiry_lookups l ON l.id=s.service_id'
              : '';
      groups[name] = await this.db.query(
        `SELECT ${expression} AS label,MIN(u.id) AS "staffId",MIN(b.id) AS "branchId",count(DISTINCT i.id)::int AS count,count(DISTINCT i.id) FILTER(WHERE ${verifiedInquiryConversion})::int AS converted ${joins} ${extra} WHERE ${where} ${name === 'lostReason' ? "AND i.status='LOST'" : ''} GROUP BY 1${name === 'staff' ? ',u.id' : name === 'branch' ? ',b.id' : ''} ORDER BY ${reportOrder} ${reportDirection}`,
        params,
      );
    }
    const [followups] = await this.db.query(
      `SELECT count(*) FILTER(WHERE t.status='OPEN' AND (t.due_at AT TIME ZONE 'Asia/Manila')::date=(now() AT TIME ZONE 'Asia/Manila')::date)::int AS today,
      count(*) FILTER(WHERE t.status='OPEN' AND t.due_at<now())::int AS overdue,count(*) FILTER(WHERE t.status='COMPLETED')::int AS completed FROM inquiry_tasks t JOIN inquiries i ON i.id=t.inquiry_id WHERE ${where}`,
      params,
    );
    groups.followUpCompletion = await this.db.query(
      `SELECT to_char(date_trunc('${grouping}',COALESCE(t.completed_at,t.due_at) AT TIME ZONE 'Asia/Manila'),'YYYY-MM-DD')||' / '||t.status AS label,count(*)::int AS count,count(*) FILTER(WHERE t.status='COMPLETED')::int AS converted FROM inquiry_tasks t JOIN inquiries i ON i.id=t.inquiry_id WHERE ${where} GROUP BY 1 ORDER BY 1`,
      params,
    );
    return { totals, groups, followups };
  }
  async export(user: AuthUserContext, q: InquiryQueryDto) {
    await this.authorize(user, 'export');
    const { where, params } = this.filter(user, q);
    let rows =
      q.summary === 'true'
        ? []
        : await this.db.query<Row[]>(
            `SELECT i.reference,i.inquiry_date::text AS date,i.client_name AS client,b.name AS branch,i.status,i.priority,u.name AS staff,i.description,i.next_action AS "nextAction",i.notes,
        (SELECT string_agg(l.label,', ' ORDER BY l.label) FROM inquiry_services s JOIN inquiry_lookups l ON l.id=s.service_id WHERE s.inquiry_id=i.id) AS services,
        (SELECT l.label FROM inquiry_lookups l WHERE l.id=i.channel_id) AS channel,(SELECT l.label FROM inquiry_lookups l WHERE l.id=i.source_id) AS source,
        (SELECT min(t.due_at)::text FROM inquiry_tasks t WHERE t.inquiry_id=i.id AND t.status='OPEN') AS "followUpAt",i.legacy_outcome AS "legacyOutcome",i.preferred_start::text AS "preferredStart",i.preferred_end::text AS "preferredEnd"
        ${joins} WHERE ${where} ORDER BY i.inquiry_date DESC NULLS LAST,i.id LIMIT 5001`,
            params,
          );
    if (rows.length > 5000)
      throw new BadRequestException(
        'Narrow filters to export at most 5,000 records.',
      );
    let headers = [
      'reference',
      'date',
      'client',
      'branch',
      'status',
      'priority',
      'staff',
      'description',
      'nextAction',
      'notes',
      'services',
      'channel',
      'source',
      'followUpAt',
      'legacyOutcome',
      'preferredStart',
      'preferredEnd',
    ];
    if (q.summary === 'true') {
      const data = await this.analytics(user, q, 'reports');
      headers = ['dimension', 'label', 'count', 'converted'];
      rows = Object.entries(data.groups).flatMap(([dimension, values]) =>
        (values as { label: string; count: number; converted: number }[]).map(
          (value) => ({ dimension, ...value }),
        ),
      );
    }
    await this.db.transaction(async (m) => {
      const branch =
        user.branchId ??
        (
          await m.query<{ id: string }[]>(
            `SELECT id FROM branches ORDER BY id LIMIT 1`,
          )
        )[0]?.id;
      await this.audit(m, 'inquiries', branch, user, 'EXPORT');
    });
    if (q.format === 'xlsx') return inquiryWorkbook(headers, rows);
    if (q.format === 'pdf') return inquiryPdf(headers, rows);
    return (
      '\uFEFF' +
      [
        headers.map(csvCell).join(','),
        ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(',')),
      ].join('\r\n')
    );
  }
}
