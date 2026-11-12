import { includesBranch } from '../../foundation/auth/branch-scope.js';
import { approvedLeave } from './approved-leave.js';
import { approvedOfficialBusiness } from './approved-official-business.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { calculateDtr, summarizeDtr } from './dtr.calculator.js';
import { parseDtr, validDate, nextDate } from './dtr.parser.js';
import {
  DEFAULT_DTR_POLICY,
  type DtrData,
  type DtrOverride,
  type DtrPolicy,
  type DtrRecord,
  type DtrSource,
  type DtrTemplate,
} from './dtr.types.js';
import type {
  DtrCommitDto,
  DtrImportSelectionDto,
  DtrCorrectionDto,
  DtrExportDto,
  DtrPeriodDto,
  DtrQueryDto,
  DtrSaveTemplateDto,
  DtrSettingsDto,
} from './dtr.dto.js';
import type { WorkScheduleDefinition } from './attendance.types.js';
import { exportDtr } from './dtr.export.js';
import { PermissionService } from '../../foundation/permissions/permission.service.js';
import type { PermissionAction } from '../../foundation/roles/role.service.js';
import { matchDtrIdentity, requireDtrCutoff, type DtrCutoff } from './dtr-import-flow.js';

type Employee = {
  id: string;
  name: string;
  employeeNumber: string;
  status: string;
  employment: { startDate?: string; endDate?: string };
};
type Batch = {
  id: string;
  branchId: string;
  template: DtrTemplate & { cutoff?: DtrCutoff };
  status: string;
  filename: string;
  dates: string[];
  sourceCount: number;
};
const hash = (bytes: Buffer) =>
  createHash('sha256').update(bytes).digest('hex');
export class DtrService {
  constructor(
    private readonly db: DataSource,
    private readonly permissions = new PermissionService(),
  ) {}

  // Mirrors the retained attendance management boundary and authenticated active-workspace scope.
  requireManager(
    user: AuthUserContext,
    branchId: string,
    action: PermissionAction = 'VIEW',
  ) {
    const scope =
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'HR_ADMIN' && !user.branchId)
        ? 'ALL'
        : 'BRANCH';
    if (
      typeof branchId !== 'string' ||
      !branchId ||
      branchId.length > 100 ||
      !this.permissions.can(user.role, 'attendance', action, scope)
    )
      throw new ForbiddenException('Attendance management access denied.');
    if (
      !includesBranch(user, branchId)
    )
      throw new ForbiddenException('Branch access denied.');
  }
  private range(query: DtrQueryDto) {
    if (
      !validDate(query.from) ||
      !validDate(query.to) ||
      query.to < query.from ||
      (Date.parse(query.to) - Date.parse(query.from)) / 86400000 > 366
    )
      throw new BadRequestException(
        'Select an ordered date range of at most 366 days.',
      );
  }
  private async lock(manager: EntityManager, branchId: string) {
    await manager.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`DTR:${branchId}`],
    );
    const rows = await manager.query(
      `SELECT id FROM branches WHERE id=$1 AND status='ACTIVE'`,
      [branchId],
    );
    if (!rows.length) throw new NotFoundException('Active branch not found.');
  }
  private async mutable(
    manager: EntityManager,
    branchId: string,
    from: string,
    to = from,
  ) {
    const rows = await manager.query(
      `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('APPROVED','LOCKED') AND date_from <= $3::date AND date_to >= $2::date`,
      [branchId, from, to],
    );
    if (rows.length)
      throw new ConflictException(
        'This period is approved or exported. Reopen it with a reason before changing attendance.',
      );
  }
  private async audit(
    manager: EntityManager,
    branchId: string,
    actor: string,
    action: string,
    reason: string,
    before: unknown,
    after: unknown,
    recordId: string | null = null,
  ) {
    if (reason.trim().length < 3)
      throw new BadRequestException(
        'Enter a meaningful reason of at least three characters.',
      );
    await manager.query(
      `INSERT INTO attendance_dtr_audit(id,branch_id,record_id,action,actor_id,reason,before_value,after_value) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)`,
      [
        randomUUID(),
        branchId,
        recordId,
        action,
        actor,
        reason,
        JSON.stringify(before ?? null),
        JSON.stringify(after ?? null),
      ],
    );
  }
  private validateTemplate(template: DtrTemplate) {
    const allowed = [
      'date',
      'timestamp',
      'identifier',
      'name',
      'lastName',
      'device',
      'in',
      'out',
      'direction',
      'status',
      'shiftStart',
      'shiftEnd',
    ];
    if (
      !template ||
      !['AUTO', 'PUNCH', 'DAILY'].includes(template.kind) ||
      !['STRICT', 'FIRST_LAST'].includes(template.pairing) ||
      !['MDY', 'DMY', 'ISO'].includes(template.dateOrder) ||
      (template.date && !validDate(template.date)) ||
      Object.entries(template.fields ?? {}).some(
        ([key, value]) =>
          !allowed.includes(key) ||
          typeof value !== 'string' ||
          value.length > 100,
      )
    )
      throw new BadRequestException('Invalid source template configuration.');
  }
  async configuration(user: AuthUserContext, branchId: string) {
    this.requireManager(user, branchId);
    const [templates, settings, employees, mappings] = await Promise.all([
      this.db.query(
        `SELECT id,name,version,configuration FROM biometric_format_templates WHERE branch_id=$1 AND active=true ORDER BY name,version DESC`,
        [branchId],
      ),
      this.db.query(
        `SELECT policy,holidays FROM attendance_dtr_settings WHERE branch_id=$1`,
        [branchId],
      ),
      this.db.query<Employee[]>(
        `SELECT id,name,employee_number AS "employeeNumber",status,employment FROM employees WHERE branch_id=$1 ORDER BY name`,
        [branchId],
      ),
      this.db.query(
        `SELECT m.source_key AS key,m.employee_id AS "employeeId" FROM employee_biometric_mappings m JOIN employees e ON e.id=m.employee_id AND e.branch_id=m.branch_id WHERE m.branch_id=$1`,
        [branchId],
      ),
    ]);
    return {
      templates,
      settings: settings[0] ? { ...settings[0], policy: { ...DEFAULT_DTR_POLICY, ...settings[0].policy } } : { policy: DEFAULT_DTR_POLICY, holidays: {} },
      employees: employees.map(({ id, name, employeeNumber }) => ({
        id,
        name,
        employeeNumber,
      })),
      mappings,
    };
  }
  async saveTemplate(user: AuthUserContext, input: DtrSaveTemplateDto) {
    this.requireManager(user, input.branchId, 'UPDATE');
    this.validateTemplate(input.configuration);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const versions = await manager.query(
        `SELECT COALESCE(MAX(version),0)+1 AS version FROM biometric_format_templates WHERE branch_id=$1 AND name=$2`,
        [input.branchId, input.name.trim()],
      );
      const id = randomUUID(),
        version = Number(versions[0].version);
      await manager.query(
        `INSERT INTO biometric_format_templates(id,branch_id,name,version,configuration,created_by) VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
        [
          id,
          input.branchId,
          input.name.trim(),
          version,
          JSON.stringify(input.configuration),
          user.userId,
        ],
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'TEMPLATE',
        'Saved versioned import template',
        null,
        { id, version },
      );
      return { id, version };
    });
  }
  async saveSettings(user: AuthUserContext, input: DtrSettingsDto) {
    this.requireManager(user, input.branchId, 'UPDATE');
    if (
      Object.keys(input.holidays).length > 1000 ||
      Object.entries(input.holidays).some(
        ([date, type]) =>
          !validDate(date) ||
          !['Regular Holiday', 'Special Non-working Day'].includes(type),
      )
    )
      throw new BadRequestException('Invalid holiday calendar.');
    if (Boolean(input.policy.breakStart) !== Boolean(input.policy.breakEnd))
      throw new BadRequestException('Configure both break boundaries.');
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const protectedRows = await manager.query(
        `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('APPROVED','LOCKED')`,
        [input.branchId],
      );
      if (protectedRows.length)
        throw new ConflictException(
          'Reopen protected branch periods before changing policy or holidays.',
        );
      const before = await manager.query(
        `SELECT policy,holidays FROM attendance_dtr_settings WHERE branch_id=$1`,
        [input.branchId],
      );
      await manager.query(
        `INSERT INTO attendance_dtr_settings(branch_id,policy,holidays,updated_by) VALUES($1,$2::jsonb,$3::jsonb,$4) ON CONFLICT(branch_id) DO UPDATE SET policy=EXCLUDED.policy,holidays=EXCLUDED.holidays,updated_by=EXCLUDED.updated_by,updated_at=now()`,
        [
          input.branchId,
          JSON.stringify(input.policy),
          JSON.stringify(input.holidays),
          user.userId,
        ],
      );
      await manager.query(
        `UPDATE attendance_records SET dtr_stale=true WHERE branch_id=$1 AND dtr_data IS NOT NULL`,
        [input.branchId],
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'SETTINGS',
        input.reason,
        before[0],
        input,
      );
      return { saved: true, requiresRecalculation: true };
    });
  }
  async preview(
    user: AuthUserContext,
    branchId: string,
    file: { buffer: Buffer; originalname: string },
    templateId?: string,
    date?: string,
    selectedCutoff?: DtrCutoff,
  ) {
    this.requireManager(user, branchId, 'IMPORT');
    const cutoff = requireDtrCutoff(selectedCutoff);
    let template: Batch['template'] = {
      kind: 'AUTO',
      dateOrder: 'ISO',
      pairing: 'STRICT',
    };
    if (templateId) {
      const rows = await this.db.query(
        `SELECT configuration FROM biometric_format_templates WHERE id=$1 AND branch_id=$2 AND active=true`,
        [templateId, branchId],
      );
      if (!rows[0]) throw new NotFoundException('Branch template not found.');
      template = rows[0].configuration;
    }
    if (date) {
      if (!validDate(date))
        throw new BadRequestException('Invalid attendance date.');
      template = { ...template, date };
    }
    this.validateTemplate(template);
    template = { ...template, cutoff };
    const sources = parseDtr(file.buffer, file.originalname, template);
    const dates = [
      ...new Set(
        sources.map((s) => s.date).filter((d): d is string => Boolean(d)),
      ),
    ].sort();
    const id = await this.db.transaction(async (manager) => {
      await this.lock(manager, branchId);
      const prior = await manager.query(
        `SELECT id FROM attendance_import_batches WHERE branch_id=$1 AND file_hash=$2 AND template_hash=md5($3::jsonb::text)`,
        [branchId, hash(file.buffer), JSON.stringify(template)],
      );
      if (prior.length) return prior[0].id as string;
      const batchId = randomUUID();
      const filename = Array.from(file.originalname)
        .map((character) =>
          character.charCodeAt(0) < 32 || ['/', '\\'].includes(character)
            ? '_'
            : character,
        )
        .join('')
        .slice(0, 255);
      await manager.query(
        `INSERT INTO attendance_import_batches(id,branch_id,template_id,template_snapshot,filename,file_hash,file_data,dates,source_count,uploaded_by,template_hash) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9,$10,md5($4::jsonb::text))`,
        [
          batchId,
          branchId,
          templateId ?? null,
          JSON.stringify(template),
          filename,
          hash(file.buffer),
          file.buffer,
          JSON.stringify(dates),
          sources.length,
          user.userId,
        ],
      );
      await manager.query(
        `INSERT INTO attendance_source_rows(id,batch_id,source_sheet,source_row,normalized) SELECT v.id,$1,v.sheet,v.row,v.normalized FROM jsonb_to_recordset($2::jsonb) AS v(id text,sheet text,row integer,normalized jsonb)`,
        [
          batchId,
          JSON.stringify(
            sources.map((s) => ({
              id: randomUUID(),
              sheet: s.sheet,
              row: s.row,
              normalized: s,
            })),
          ),
        ],
      );
      await this.audit(
        manager,
        branchId,
        user.userId,
        'PREVIEW',
        'Original file and normalized source retained',
        null,
        { batchId, dates, rows: sources.length },
      );
      return batchId;
    });
    return this.batch(user, branchId, id);
  }
  async batch(user: AuthUserContext, branchId: string, id: string) {
    this.requireManager(user, branchId);
    const batches = await this.db.query<Batch[]>(
      `SELECT id,branch_id AS "branchId",template_snapshot AS template,status,filename,dates,source_count AS "sourceCount" FROM attendance_import_batches WHERE id=$1 AND branch_id=$2`,
      [id, branchId],
    );
    if (!batches[0]) throw new NotFoundException('Import not found.');
    const sources = await this.db.query<{ normalized: DtrSource }[]>(
      `SELECT normalized FROM attendance_source_rows WHERE batch_id=$1 ORDER BY source_sheet,source_row`,
      [id],
    );
    const config = await this.configuration(user, branchId);
    const identities = [
      ...new Map(
        sources.map(({ normalized: s }) => [
          s.key,
          {
            key: s.key,
            name: s.name,
            identifier: s.identifier,
            device: s.device,
          },
        ]),
      ).values(),
    ].map((identity) => {
      return {
        ...identity,
        ...matchDtrIdentity(identity, config.employees, new Map(
          config.mappings.map((m: { key: string; employeeId: string }) => [m.key, m.employeeId]),
        )),
      };
    });
    return {
      ...batches[0],
      cutoff: batches[0].template.cutoff ?? null,
      sheets: [...new Set(sources.map((r) => r.normalized.sheet))],
      identities,
      rows: sources.map((r) => r.normalized),
      duplicate: batches[0].status === 'COMMITTED',
    };
  }
  async history(user: AuthUserContext, branchId: string) {
    this.requireManager(user, branchId);
    const [batches, exports, periods] = await Promise.all([
      this.db.query(
        `SELECT id,filename,status,dates,source_count AS "sourceCount",created_at AS "createdAt" FROM attendance_import_batches WHERE branch_id=$1 ORDER BY created_at DESC LIMIT 100`,
        [branchId],
      ),
      this.db.query(
        `SELECT id,period_id AS "periodId",revision,format,generated_by AS "generatedBy",generated_at AS "generatedAt" FROM attendance_exports WHERE branch_id=$1 ORDER BY generated_at DESC LIMIT 100`,
        [branchId],
      ),
      this.db.query(
        `SELECT id,date_from::text AS "from",date_to::text AS "to",state,revision FROM attendance_dtr_periods WHERE branch_id=$1 ORDER BY date_from DESC LIMIT 100`,
        [branchId],
      ),
    ]);
    return { batches, exports, periods };
  }
  private async prepareImport(manager: EntityManager, batch: Batch, input: DtrImportSelectionDto) {
    const cutoff = requireDtrCutoff(input);
    if (batch.template.cutoff && (batch.template.cutoff.from !== cutoff.from || batch.template.cutoff.to !== cutoff.to))
      throw new BadRequestException('This preview belongs to a different cutoff. Preview the file again for the selected cutoff.');
    const sourceRows = await manager.query<{ normalized: DtrSource }[]>(
      `SELECT normalized FROM attendance_source_rows WHERE batch_id=$1 ORDER BY source_sheet,source_row`, [batch.id],
    );
    const employees = await manager.query<Employee[]>(
      `SELECT id,name,employee_number AS "employeeNumber",status,employment FROM employees WHERE branch_id=$1 FOR SHARE`, [input.branchId],
    );
    const saved = await manager.query<{ key: string; employeeId: string }[]>(
      `SELECT source_key AS key,employee_id AS "employeeId" FROM employee_biometric_mappings WHERE branch_id=$1`, [input.branchId],
    );
    const remembered = new Map(saved.map((m) => [m.key, m.employeeId]));
    const mappings = new Map<string, string>();
    const identified = new Set<string>();
    for (const { normalized: source } of sourceRows) {
      if (identified.has(source.key)) continue;
      identified.add(source.key);
      const match = matchDtrIdentity(source, employees, remembered);
      if (match.employeeId) mappings.set(source.key, match.employeeId);
    }
    const submitted = new Set<string>();
    for (const mapping of input.mappings) {
      if (submitted.has(mapping.key) || !employees.some((e) => e.id === mapping.employeeId) || !sourceRows.some((r) => r.normalized.key === mapping.key))
        throw new BadRequestException('Employee mapping must be unique and belong to this branch and source.');
      submitted.add(mapping.key);
      mappings.set(mapping.key, mapping.employeeId);
    }
    const groups = new Map<string, { employee: Employee; date: string; sources: DtrSource[] }>();
    const contexts = new Map<string, Awaited<ReturnType<typeof this.context>>>();
    const getContext = async (employee: Employee, date: string) => {
      const key = `${employee.id}:${date}`;
      if (!contexts.has(key)) contexts.set(key, await this.context(manager, input.branchId, employee, date));
      return contexts.get(key)!;
    };
    let unmapped = 0, invalid = 0, outsideCutoff = 0;
    const unmappedKeys = new Set<string>();
    const chronological = [...sourceRows].sort((a, b) => (a.normalized.punch ?? '').localeCompare(b.normalized.punch ?? ''));
    for (const { normalized: source } of chronological) {
      if (!source.date) { invalid++; continue; }
      // One trailing day is retained for overnight OUT punches; attribution below decides scope.
      if (source.date < cutoff.from || source.date > nextDate(cutoff.to)) { outsideCutoff++; continue; }
      const employee = employees.find((e) => e.id === mappings.get(source.key));
      if (!employee) {
        // Keep unidentified rows out of the calculation while allowing the
        // identified employees in this file to proceed independently.
        unmapped++;
        unmappedKeys.add(source.key);
        continue;
      }
      let date = source.date;
      if (source.kind === 'PUNCH' && source.punch) {
        const previousDate = nextDate(date, -1);
        const previous = await getContext(employee, previousDate);
        const priorGroup = groups.get(`${employee.id}:${previousDate}`);
        const nightStart = previous.schedule?.shiftStart;
        const canClosePrevious = Boolean(nightStart && source.punch.slice(11) < nightStart && priorGroup?.sources.some(
          (s) => s.punch && s.punch.slice(11) >= nightStart && (s.direction === 'IN' || batch.template.pairing === 'FIRST_LAST'),
        ) && (source.direction === 'OUT' || batch.template.pairing === 'FIRST_LAST'));
        if (previous.schedule && previous.schedule.shiftEnd < previous.schedule.shiftStart && (source.punch.slice(11) <= previous.schedule.shiftEnd || canClosePrevious)) date = previousDate;
      }
      if (date < cutoff.from || date > cutoff.to) { outsideCutoff++; continue; }
      const key = `${employee.id}:${date}`;
      if (!groups.has(key)) groups.set(key, { employee, date, sources: [] });
      groups.get(key)!.sources.push(source);
    }
    const dayOverrides = new Map<string, DtrOverride>();
    for (const day of input.dayOverrides ?? []) {
      const key = `${day.employeeId}:${day.workDate}`;
      if (!groups.has(key) || dayOverrides.has(key))
        throw new BadRequestException('Day changes must be unique and belong to a mapped employee-day in this preview.');
      if (Boolean(day.shiftStart) !== Boolean(day.shiftEnd) || (day.shiftStart && day.shiftStart === day.shiftEnd))
        throw new BadRequestException('Enter both shift times with different start and end times.');
      dayOverrides.set(key, {
        ...(day.arrangement !== undefined ? { arrangement: day.arrangement } : {}),
        ...(day.remarks !== undefined ? { remarks: day.remarks } : {}),
        ...(day.shiftStart && day.shiftEnd ? { shiftStart: day.shiftStart, shiftEnd: day.shiftEnd } : {}),
      });
    }
    const getOverride = (employeeId: string, date: string): DtrOverride => dayOverrides.get(`${employeeId}:${date}`) ?? {};
    return { cutoff, mappings, groups, getContext, getOverride, unmapped, unmappedKeys: [...unmappedKeys], invalid, outsideCutoff };
  }

  private async importContextHash(plan: Awaited<ReturnType<DtrService['prepareImport']>>) {
    const contexts:unknown[]=[];
    let hasOb=false;
    for(const {employee,date} of [...plan.groups.values()].sort((a,b)=>(a.employee.id+a.date).localeCompare(b.employee.id+b.date))){
      const context=await plan.getContext(employee,date);
      if(context.officialBusiness?.length)hasOb=true;
      contexts.push([employee.id,date,context]);
    }
    return {contextHash:hash(Buffer.from(JSON.stringify(contexts))),hasOb};
  }
  async calculateImport(user: AuthUserContext, id: string, input: DtrImportSelectionDto) {
    this.requireManager(user, input.branchId, 'IMPORT');
    return this.db.transaction(async (manager) => {
      const batches = await manager.query<Batch[]>(
        `SELECT id,branch_id AS "branchId",template_snapshot AS template,status,filename,dates,source_count AS "sourceCount" FROM attendance_import_batches WHERE id=$1 AND branch_id=$2`, [id, input.branchId],
      );
      const batch = batches[0];
      if (!batch) throw new NotFoundException('Import not found.');
      const plan = await this.prepareImport(manager, batch, input);
      const branches = await manager.query<{ name: string }[]>(`SELECT name FROM branches WHERE id=$1`, [input.branchId]);
      const rows: DtrRecord[] = [];
      for (const { employee, date, sources } of plan.groups.values()) {
        const context = await plan.getContext(employee, date);
        rows.push({
          id: `preview:${employee.id}:${date}`, employeeId: employee.id, employeeName: employee.name,
          branchId: input.branchId, branchName: branches[0]?.name ?? '', workDate: date,
          data: {
            batchId: id, sourceKeys: [...new Set(sources.map((s) => s.key))], source: sources,
            override: plan.getOverride(employee.id, date), policy: context.policy, pairing: batch.template.pairing, approval: 'DRAFT', revision: 0,
            calculation: calculateDtr({ workDate: date, sources, ...context, pairing: batch.template.pairing, override: plan.getOverride(employee.id, date) }),
          },
        });
      }
      return { ...(await this.importContextHash(plan)),cutoff: plan.cutoff, rows, summary: summarizeDtr(rows), unmappedSourceRows: plan.unmapped,
        invalidSourceRows: plan.invalid, outsideCutoffRows: plan.outsideCutoff, sourceCount: batch.sourceCount };
    });
  }

  async commit(user: AuthUserContext, id: string, input: DtrCommitDto) {
    this.requireManager(user, input.branchId, 'IMPORT');
    requireDtrCutoff(input);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const batches = await manager.query<Batch[]>(
        `SELECT id,branch_id AS "branchId",template_snapshot AS template,status,filename,dates,source_count AS "sourceCount" FROM attendance_import_batches WHERE id=$1 AND branch_id=$2 FOR UPDATE`,
        [id, input.branchId],
      );
      const batch = batches[0];
      if (!batch) throw new NotFoundException('Import not found.');
      if (batch.status === 'COMMITTED' && !input.reprocess)
        return {
          id,
          duplicate: true,
          saved: 0,
          cutoff: batch.template.cutoff ? requireDtrCutoff(batch.template.cutoff) : undefined,
        };
      const plan = await this.prepareImport(manager, batch, input);
      const { mappings, groups, getContext, getOverride, unmapped, unmappedKeys, invalid, outsideCutoff } = plan;
      const currentContext=await this.importContextHash(plan);
      if(input.contextHash&&input.contextHash!==currentContext.contextHash||currentContext.hasOb&&!input.contextHash)throw new ConflictException('Attendance inputs or approved OB changed. Recalculate the import preview before saving.');
      if (invalid) throw new BadRequestException('Correct invalid source dates in a new preview before saving.');
      if (!groups.size) throw new BadRequestException('No matched attendance falls within the selected cutoff.');
      await this.mutable(manager, input.branchId, input.from, input.to);
      const includedKeys = new Set([...groups.values()].flatMap((group) => group.sources.map((source) => source.key)));
      for (const [key, employeeId] of mappings) {
        if (!includedKeys.has(key)) continue;
        await manager.query(
          `INSERT INTO employee_biometric_mappings(branch_id,source_key,employee_id,approved_by) VALUES($1,$2,$3,$4) ON CONFLICT(branch_id,source_key) DO UPDATE SET employee_id=EXCLUDED.employee_id,approved_by=EXCLUDED.approved_by,approved_at=now()`,
          [input.branchId, key, employeeId, user.userId],
        );
      }
      if (batch.status === 'COMMITTED' && input.reprocess) {
        const prior = await manager.query<
          { id: string; employeeId: string; workDate: string; data: DtrData }[]
        >(
          `SELECT id,employee_id AS "employeeId",work_date::text AS "workDate",dtr_data AS data FROM attendance_records WHERE branch_id=$1 AND dtr_data->>'batchId'=$2 AND work_date BETWEEN $3::date AND $4::date FOR UPDATE`,
          [input.branchId, id, input.from, input.to],
        );
        for (const row of prior) {
          const targets = new Set(
            row.data.sourceKeys.map(
              (key) => mappings.get(key) ?? row.employeeId,
            ),
          );
          if (targets.size !== 1)
            throw new ConflictException(
              'This employee-day combines identities mapped to different employees. Reconcile the identity mapping before reprocessing.',
            );
          const target = [...targets][0];
          if (target !== row.employeeId) {
            if((await approvedOfficialBusiness(manager,row.employeeId,input.branchId,row.workDate)).length)throw new ConflictException('Cancel or reconcile approved OB before remapping this employee attendance.');
            await this.mutable(manager, input.branchId, row.workDate);
            if (input.overlap !== 'REPLACE')
              throw new ConflictException(
                'Changing an employee mapping requires explicit replacement.',
              );
            const conflict = await manager.query(
              `SELECT id FROM attendance_records WHERE employee_id=$1 AND work_date=$2::date AND id<>$3`,
              [target, row.workDate, row.id],
            );
            if (conflict.length)
              throw new ConflictException(
                'The mapped employee already has attendance on this date. Resolve the overlap first.',
              );
            await manager.query(
              `UPDATE attendance_records SET employee_id=$2 WHERE id=$1`,
              [row.id, target],
            );
            await this.audit(
              manager,
              input.branchId,
              user.userId,
              'REMAP',
              input.reason,
              { employeeId: row.employeeId },
              { employeeId: target },
              row.id,
            );
          }
        }
      }
      for (const { employee, date, sources } of groups.values()) {
        await this.mutable(manager, input.branchId, date);
        const existing = await manager.query<
          { id: string; branchId: string; data: DtrData | null }[]
        >(
          `SELECT id,branch_id AS "branchId",dtr_data AS data FROM attendance_records WHERE employee_id=$1 AND work_date=$2::date FOR UPDATE`,
          [employee.id, date],
        );
        if (existing[0] && existing[0].branchId !== input.branchId)
          throw new ConflictException(
            'Attendance already exists for this employee-date in a different branch. Cross-branch replacement is not permitted.',
          );
        if (
          existing.length &&
          (input.overlap !== 'REPLACE' || !existing[0].data)
        )
          throw new ConflictException(
            'Attendance overlaps an existing employee-day. Use reasoned replacement for unlocked DTR rows; live clock records must be reconciled separately.',
          );
        const context = await getContext(employee, date);
        const data: DtrData = {
          batchId: id,
          sourceKeys: [...new Set(sources.map((s) => s.key))],
          source: sources,
          override: getOverride(employee.id, date),
          policy: context.policy,
          pairing: batch.template.pairing,
          approval: 'DRAFT',
          revision: (existing[0]?.data?.revision ?? 0) + 1,
          calculation: calculateDtr({
            workDate: date,
            sources,
            ...context,
            pairing: batch.template.pairing,
            override: getOverride(employee.id, date),
          }),
        };
        const recordId = existing[0]?.id ?? randomUUID();
        await this.persist(
          manager,
          recordId,
          employee.id,
          input.branchId,
          date,
          data,
        );
        await this.audit(
          manager,
          input.branchId,
          user.userId,
          existing.length ? 'REPLACE' : 'IMPORT',
          input.reason,
          existing[0]?.data,
          data,
          recordId,
        );
      }
      await manager.query(
        `UPDATE attendance_import_batches SET status='COMMITTED',committed_at=now() WHERE id=$1`,
        [id],
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'COMMIT',
        input.reason,
        null,
        { id, saved: groups.size, unmappedSourceRows: unmapped, excludedSourceKeys: unmappedKeys, invalid, outsideCutoff, cutoff: plan.cutoff,
          mappings: [...mappings].filter(([key]) => includedKeys.has(key)) },
      );
      await manager.query(
        `INSERT INTO attendance_dtr_periods(id,branch_id,date_from,date_to,state,actor_id) VALUES($1,$2,$3::date,$4::date,'DRAFT',$5) ON CONFLICT(branch_id,date_from,date_to) DO UPDATE SET actor_id=EXCLUDED.actor_id,updated_at=now()`,
        [randomUUID(), input.branchId, input.from, input.to, user.userId],
      );
      return { id, saved: groups.size, unmappedSourceRows: unmapped, invalid, outsideCutoff, cutoff: plan.cutoff, duplicate: false };
    });
  }
  async context(
    manager: EntityManager,
    branchId: string,
    employee: Employee,
    date: string,
  ) {
    const schedules = await manager.query<WorkScheduleDefinition[]>(
      `SELECT time_zone AS "timeZone",work_days AS "workDays",shift_start::text AS "shiftStart",shift_end::text AS "shiftEnd",break_minutes AS "breakMinutes",grace_minutes AS "graceMinutes" FROM (
      SELECT time_zone,work_days,shift_start,shift_end,break_minutes,grace_minutes,1 AS priority,effective_date FROM employee_work_schedule_history WHERE employee_id=$1 AND branch_id=$2 AND effective_date <= $3::date
      UNION ALL SELECT time_zone,work_days,shift_start,shift_end,break_minutes,grace_minutes,2 AS priority,NULL::date FROM attendance_schedules WHERE branch_id=$2
    ) s ORDER BY priority,effective_date DESC LIMIT 1`,
      [employee.id, branchId, date],
    );
    let schedule = schedules[0]
      ? {
          ...schedules[0],
          shiftStart: schedules[0].shiftStart.slice(0, 5),
          shiftEnd: schedules[0].shiftEnd.slice(0, 5),
        }
      : null;
    const days = await manager.query(
      `SELECT day_type,shift_start::text,shift_end::text,assignment_label FROM employee_work_schedule_days WHERE employee_id=$1 AND branch_id=$2 AND work_date=$3::date`,
      [employee.id, branchId, date],
    );
    if (schedule && days[0])
      schedule = {
        ...schedule,
        workDays:
          days[0].day_type === 'REST_DAY' ? [] : [new Date(date).getUTCDay()],
        shiftStart: days[0].shift_start?.slice(0, 5) ?? schedule.shiftStart,
        shiftEnd: days[0].shift_end?.slice(0, 5) ?? schedule.shiftEnd,
      };
    const settings = await manager.query<
      { policy: DtrPolicy; holidays: Record<string, string> }[]
    >(
      `SELECT policy,holidays FROM attendance_dtr_settings WHERE branch_id=$1`,
      [branchId],
    );
    const assignments = await manager.query<{ status: string }[]>(
      `SELECT employee_status AS status FROM employee_assignment_history WHERE employee_id=$1 AND branch_id=$2 AND effective_date IS NOT NULL AND effective_date <= $3::date ORDER BY effective_date DESC,recorded_at DESC LIMIT 1`,
      [employee.id, branchId, date],
    );
    const active =
      (assignments[0]?.status ?? employee.status) === 'ACTIVE' &&
      Boolean(
        employee.employment.startDate &&
        validDate(employee.employment.startDate) &&
        employee.employment.startDate <= date &&
        (!employee.employment.endDate || employee.employment.endDate >= date),
      );
    return {
      schedule,
      scheduledArrangement: /^(WFH|OB)(: |$)/.exec(days[0]?.assignment_label ?? '')?.[1] as 'WFH' | 'OB' | undefined,
      assignmentLabel: days[0]?.assignment_label as string | undefined,
      policy: { ...DEFAULT_DTR_POLICY, ...settings[0]?.policy },
      ...(await approvedLeave(manager,employee.id,branchId,date)),
      officialBusiness: await approvedOfficialBusiness(manager,employee.id,branchId,date),
      holiday: settings[0]?.holidays[date] ?? null,
      active,
    };
  }
  async persist(
    manager: EntityManager,
    id: string,
    employeeId: string,
    branchId: string,
    date: string,
    data: DtrData,
  ) {
    const c = data.calculation;
    // Original times remain in source rows and audit; the canonical record stores effective attendance.
    await manager.query(
      `INSERT INTO attendance_records(id,employee_id,branch_id,work_date,time_in,time_out,scheduled_start,scheduled_end,schedule_break_minutes,schedule_grace_minutes,schedule_time_zone,source,status,dtr_data,dtr_stale)
      VALUES($1,$2,$3,$4::date,$5::timestamptz,$6::timestamptz,$7::time,$8::time,$9,$10,$11,'IMPORT',$12,$13::jsonb,false)
      ON CONFLICT(employee_id,work_date) DO UPDATE SET time_in=EXCLUDED.time_in,time_out=EXCLUDED.time_out,scheduled_start=EXCLUDED.scheduled_start,scheduled_end=EXCLUDED.scheduled_end,schedule_break_minutes=EXCLUDED.schedule_break_minutes,schedule_grace_minutes=EXCLUDED.schedule_grace_minutes,schedule_time_zone=EXCLUDED.schedule_time_zone,status=EXCLUDED.status,dtr_data=EXCLUDED.dtr_data,dtr_stale=false,updated_at=now()`,
      [
        id,
        employeeId,
        branchId,
        date,
        c.actualIn,
        c.actualOut,
        c.schedule?.shiftStart ?? null,
        c.schedule?.shiftEnd ?? null,
        c.schedule?.breakMinutes ?? null,
        c.schedule?.graceMinutes ?? null,
        c.timeZone,
        c.absent ? 'ABSENT' : c.restDay ? 'REST_DAY' : 'RECORDED',
        JSON.stringify(data),
      ],
    );
  }
  private async records(
    manager: EntityManager,
    query: DtrQueryDto,
    ownId?: string,
  ): Promise<DtrRecord[]> {
    const rows = await manager.query<(DtrRecord & { stale: boolean })[]>(
      `SELECT a.id,a.employee_id AS "employeeId",e.name AS "employeeName",a.branch_id AS "branchId",b.name AS "branchName",a.work_date::text AS "workDate",a.dtr_data AS data,a.dtr_stale AS stale FROM attendance_records a JOIN employees e ON e.id=a.employee_id AND e.branch_id=a.branch_id JOIN branches b ON b.id=a.branch_id WHERE a.branch_id=$1 AND a.work_date BETWEEN $2::date AND $3::date AND a.dtr_data IS NOT NULL AND ($4::varchar IS NULL OR a.employee_id=$4) ORDER BY e.name,a.employee_id,a.work_date LIMIT 20001`,
      [query.branchId, query.from, query.to, ownId ?? query.employeeId ?? null],
    );
    if (rows.length > 20000)
      throw new BadRequestException(
        'Narrow the period or employee filter (maximum 20,000 employee-days).',
      );
    return rows.map(({ stale, ...row }) =>
      stale
        ? {
            ...row,
            data: {
              ...row.data,
              approval: 'DRAFT',
              calculation: {
                ...row.data.calculation,
                payrollReady: false,
                approvedOtMinutes: 0,
                exceptions: [
                  ...row.data.calculation.exceptions,
                  'Inputs changed: recalculate period',
                ],
              },
            },
          }
        : row,
    );
  }
  async ledger(user: AuthUserContext, query: DtrQueryDto) {
    this.range(query);
    let ownId: string | undefined;
    if (['EMPLOYEE', 'STAFF'].includes(user.role)) {
      const employees = await this.db.query(
        `SELECT employee_id AS id FROM users WHERE id=$1 AND employee_id IS NOT NULL`,
        [user.userId],
      );
      if (!employees[0])
        throw new ForbiddenException('Linked employee required.');
      ownId = employees[0].id;
      const employee = await this.db.query(
        `SELECT branch_id AS "branchId" FROM employees WHERE id=$1`,
        [ownId],
      );
      if (
        employee[0]?.branchId !== query.branchId ||
        (query.employeeId && query.employeeId !== ownId)
      )
        throw new ForbiddenException('Own attendance access only.');
    } else this.requireManager(user, query.branchId);
    let rows = await this.records(this.db.manager, query, ownId);
    if (ownId)
      rows = rows
        .filter((row) => row.data.approval === 'APPROVED')
        .map((row) => ({
          ...row,
          data: { ...row.data, source: [], sourceKeys: [] },
        }));
    return {
      rows,
      summary: {
        ...summarizeDtr(rows),
        unmatchedSourceRows: ownId
          ? 0
          : await this.unresolved(this.db.manager, query),
      },
    };
  }
  async detail(user: AuthUserContext, branchId: string, id: string) {
    this.requireManager(user, branchId);
    const rows = await this.db.query(
      `SELECT a.dtr_data AS data FROM attendance_records a JOIN employees e ON e.id=a.employee_id AND e.branch_id=a.branch_id WHERE a.id=$1 AND a.branch_id=$2`,
      [id, branchId],
    );
    if (!rows[0]) throw new NotFoundException('Attendance not found.');
    const audit = await this.db.query(
      `SELECT action,actor_id AS "actorId",reason,before_value AS "before",after_value AS "after",created_at AS "createdAt" FROM attendance_dtr_audit WHERE record_id=$1 AND branch_id=$2 ORDER BY created_at DESC LIMIT 100`,
      [id, branchId],
    );
    return { ...rows[0], audit };
  }
  async correct(user: AuthUserContext, id: string, input: DtrCorrectionDto) {
    this.requireManager(user, input.branchId, 'UPDATE');
    if ((input.override.approvedOtMinutes ?? 0) > 0)
      this.requireManager(user, input.branchId, 'APPROVE');
    if (Boolean(input.override.shiftStart) !== Boolean(input.override.shiftEnd))
      throw new BadRequestException('Provide both shift boundaries.');
    for (const v of [input.override.actualIn, input.override.actualOut])
      if (v && !Number.isFinite(Date.parse(v)))
        throw new BadRequestException('Invalid actual timestamp.');
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const rows = await manager.query<
        { id: string; employeeId: string; workDate: string; data: DtrData }[]
      >(
        `SELECT id,employee_id AS "employeeId",work_date::text AS "workDate",dtr_data AS data FROM attendance_records WHERE id=$1 AND branch_id=$2 FOR UPDATE`,
        [id, input.branchId],
      );
      const row = rows[0];
      if (!row?.data) throw new NotFoundException('Attendance not found.');
      await this.mutable(manager, input.branchId, row.workDate);
      if (row.data.revision !== input.revision)
        throw new ConflictException(
          'Attendance changed. Reload before editing.',
        );
      const employees = await manager.query<Employee[]>(
        `SELECT id,name,employee_number AS "employeeNumber",status,employment FROM employees WHERE id=$1 AND branch_id=$2 FOR SHARE`,
        [row.employeeId, input.branchId],
      );
      if (!employees[0])
        throw new ForbiddenException(
          'Employee no longer belongs to this branch.',
        );
      const context = await this.context(
        manager,
        input.branchId,
        employees[0],
        row.workDate,
      );
      const override = Object.assign({}, row.data.override, input.override);
      // Any changed attendance invalidates prior payable OT unless explicitly reapproved.
      if (input.override.approvedOtMinutes === undefined)
        override.approvedOtMinutes = 0;
      const data: DtrData = {
        ...row.data,
        override,
        policy: context.policy,
        revision: row.data.revision + 1,
        approval: 'DRAFT',
        calculation: calculateDtr({
          workDate: row.workDate,
          sources: row.data.source,
          ...context,
          pairing: row.data.pairing,
          override,
        }),
      };
      if (
        (override.approvedOtMinutes ?? 0) > data.calculation.potentialOtMinutes
      )
        throw new BadRequestException(
          'Approved OT cannot exceed calculated potential OT.',
        );
      await this.persist(
        manager,
        id,
        row.employeeId,
        input.branchId,
        row.workDate,
        data,
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'CORRECT',
        input.reason,
        row.data,
        data,
        id,
      );
      return { saved: true, data };
    });
  }
  async period(user: AuthUserContext, input: DtrPeriodDto) {
    this.requireManager(user, input.branchId, 'APPROVE');
    this.range(input);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const rows = await this.records(manager, input);
      if (input.action === 'REOPEN') {
        const periods = await manager.query(
          `UPDATE attendance_dtr_periods SET state='REOPENED',revision=revision+1,actor_id=$4,updated_at=now() WHERE branch_id=$1 AND date_from >= $2::date AND date_to <= $3::date AND state IN ('APPROVED','LOCKED') RETURNING id`,
          [input.branchId, input.from, input.to, user.userId],
        );
        const partial = await manager.query(
          `SELECT id FROM attendance_dtr_periods WHERE branch_id=$1 AND state IN ('APPROVED','LOCKED') AND date_from <= $3::date AND date_to >= $2::date`,
          [input.branchId, input.from, input.to],
        );
        if (partial.length)
          throw new ConflictException(
            'Reopen the entire overlapping protected period.',
          );
        await manager.query(
          `UPDATE attendance_records SET dtr_data=jsonb_set(dtr_data,'{approval}','"DRAFT"'::jsonb) WHERE branch_id=$1 AND work_date BETWEEN $2::date AND $3::date AND dtr_data IS NOT NULL`,
          [input.branchId, input.from, input.to],
        );
        await this.audit(
          manager,
          input.branchId,
          user.userId,
          'REOPEN',
          input.reason,
          null,
          {
            periods: periods.map((p: { id: string }) => p.id),
            from: input.from,
            to: input.to,
          },
        );
        return { reopened: periods.length };
      }
      await this.mutable(manager, input.branchId, input.from, input.to);
      if (input.action === 'SAVE') {
        if (input.employeeId)
          throw new BadRequestException(
            'Save cutoffs for the complete branch.',
          );
        const periods = await manager.query(
          `INSERT INTO attendance_dtr_periods(id,branch_id,date_from,date_to,state,actor_id) VALUES($1,$2,$3::date,$4::date,'DRAFT',$5) ON CONFLICT(branch_id,date_from,date_to) DO UPDATE SET actor_id=EXCLUDED.actor_id,updated_at=now() RETURNING id`,
          [randomUUID(), input.branchId, input.from, input.to, user.userId],
        );
        await this.audit(
          manager,
          input.branchId,
          user.userId,
          'SAVE_CUTOFF',
          input.reason,
          null,
          { from: input.from, to: input.to },
        );
        return { saved: periods[0].id };
      }
      if (input.action === 'RECALCULATE') {
        for (const row of rows) {
          const employee = await manager.query<Employee[]>(
            `SELECT id,name,employee_number AS "employeeNumber",status,employment FROM employees WHERE id=$1 AND branch_id=$2 FOR SHARE`,
            [row.employeeId, input.branchId],
          );
          const context = await this.context(
            manager,
            input.branchId,
            employee[0],
            row.workDate,
          );
          const override = { ...row.data.override, approvedOtMinutes: 0 };
          const data: DtrData = {
            ...row.data,
            override,
            policy: context.policy,
            revision: row.data.revision + 1,
            approval: 'DRAFT',
            calculation: calculateDtr({
              workDate: row.workDate,
              sources: row.data.source,
              ...context,
              pairing: row.data.pairing,
              override,
            }),
          };
          await this.persist(
            manager,
            row.id,
            row.employeeId,
            input.branchId,
            row.workDate,
            data,
          );
          await this.audit(
            manager,
            input.branchId,
            user.userId,
            'RECALCULATE',
            input.reason,
            row.data,
            data,
            row.id,
          );
        }
        return { recalculated: rows.length };
      }
      if (input.employeeId)
        throw new BadRequestException(
          'Approve the complete branch period, without an employee filter.',
        );
      if (!rows.length || rows.some((r) => !r.data.calculation.payrollReady))
        throw new ConflictException(
          'Resolve all period exceptions before approval.',
        );
      const unresolved = await this.unresolved(manager, input);
      if (unresolved)
        throw new ConflictException(
          'Unmatched or invalid source rows remain in this period. Map and reprocess them before approval.',
        );
      const id = randomUUID();
      await manager.query(
        `INSERT INTO attendance_dtr_periods(id,branch_id,date_from,date_to,state,actor_id) VALUES($1,$2,$3::date,$4::date,'APPROVED',$5) ON CONFLICT(branch_id,date_from,date_to) DO UPDATE SET state='APPROVED',actor_id=EXCLUDED.actor_id,updated_at=now()`,
        [id, input.branchId, input.from, input.to, user.userId],
      );
      await manager.query(
        `UPDATE attendance_records SET dtr_data=jsonb_set(dtr_data,'{approval}','"APPROVED"'::jsonb) WHERE branch_id=$1 AND work_date BETWEEN $2::date AND $3::date AND dtr_data IS NOT NULL`,
        [input.branchId, input.from, input.to],
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'APPROVE',
        input.reason,
        null,
        { from: input.from, to: input.to, count: rows.length },
      );
      return { approved: rows.length };
    });
  }
  private async unresolved(manager: EntityManager, query: DtrQueryDto) {
    const rows = await manager.query(
      `SELECT count(*)::int AS count
       FROM attendance_source_rows s
       JOIN attendance_import_batches b ON b.id=s.batch_id
       LEFT JOIN LATERAL (
         SELECT a.after_value->'excludedSourceKeys' AS excluded_keys
         FROM attendance_dtr_audit a
         WHERE a.branch_id=b.branch_id AND a.record_id IS NULL
           AND a.action='COMMIT' AND a.after_value->>'id'=b.id
         ORDER BY a.created_at DESC, a.id DESC LIMIT 1
       ) latest_commit ON true
       WHERE b.branch_id=$1 AND b.status='COMMITTED' AND ((s.normalized->>'date') IS NULL OR b.template_snapshot->'cutoff' IS NULL OR (s.normalized->>'date') BETWEEN b.template_snapshot->'cutoff'->>'from' AND b.template_snapshot->'cutoff'->>'to') AND ((s.normalized->>'date') IS NULL OR (s.normalized->>'date') BETWEEN $2 AND $3) AND ((s.normalized->>'date') IS NULL OR (NOT EXISTS(SELECT 1 FROM employee_biometric_mappings m JOIN employees e ON e.id=m.employee_id AND e.branch_id=m.branch_id WHERE m.branch_id=b.branch_id AND m.source_key=s.normalized->>'key') AND NOT COALESCE(COALESCE(latest_commit.excluded_keys, b.template_snapshot->'excludedSourceKeys') ? (s.normalized->>'key'), false)))`,
      [query.branchId, query.from, query.to],
    );
    return Number(rows[0]?.count ?? 0);
  }
  async export(user: AuthUserContext, input: DtrExportDto) {
    this.requireManager(user, input.branchId, 'EXPORT');
    this.range(input);
    return this.db.transaction(async (manager) => {
      await this.lock(manager, input.branchId);
      const all = await this.records(manager, {
        branchId: input.branchId,
        from: input.from,
        to: input.to,
      });
      const rows = input.employeeId
        ? all.filter((r) => r.employeeId === input.employeeId)
        : all;
      if (
        !rows.length ||
        all.some(
          (r) =>
            r.data.approval !== 'APPROVED' || !r.data.calculation.payrollReady,
        )
      )
        throw new ConflictException(
          'Approve the complete period and resolve exceptions before payroll export.',
        );
      const periods = await manager.query(
        `SELECT id,revision FROM attendance_dtr_periods WHERE branch_id=$1 AND date_from=$2::date AND date_to=$3::date AND state IN ('APPROVED','LOCKED') FOR UPDATE`,
        [input.branchId, input.from, input.to],
      );
      if (!periods[0])
        throw new ConflictException(
          'Approve this exact date range before export.',
        );
      const bytes = await exportDtr(rows, {
        branchName: rows[0].branchName,
        from: input.from,
        to: input.to,
        actor: user.email,
        format: input.format,
        report: input.report,
      });
      await manager.query(
        `UPDATE attendance_dtr_periods SET state='LOCKED',actor_id=$2,updated_at=now() WHERE id=$1`,
        [periods[0].id, user.userId],
      );
      await manager.query(
        `INSERT INTO attendance_exports(id,branch_id,period_id,revision,format,file_hash,snapshot,generated_by) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
        [
          randomUUID(),
          input.branchId,
          periods[0].id,
          periods[0].revision,
          input.format,
          hash(bytes),
          JSON.stringify(rows),
          user.userId,
        ],
      );
      await this.audit(
        manager,
        input.branchId,
        user.userId,
        'EXPORT',
        'Payroll report generated; period locked',
        null,
        {
          from: input.from,
          to: input.to,
          employeeId: input.employeeId,
          hash: hash(bytes),
          format: input.format,
        },
      );
      const branch = rows[0].branchName.replace(/[^a-zA-Z0-9_-]/g, '_');
      return {
        bytes,
        filename: `${branch}_${input.report === 'SUMMARY' ? 'Summary' : 'DTR'}_${input.from}_to_${input.to}.${input.format}`,
      };
    });
  }
}
