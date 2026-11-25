import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { AuthUserContext } from '../../foundation/auth/auth.context.js';
import { InquiryManagementService } from './inquiry-management.service.js';
import { importDate, parseInquiryWorkbook } from './inquiry-import.js';
import type { ImportOptions } from './inquiry-import-options.js';
import { inquiryStatuses } from './inquiry.domain.js';
import { selectedBranchScope } from '../../foundation/auth/branch-scope.js';

export class InquiryImportService {
  constructor(private readonly inquiries: InquiryManagementService) {}
  async run(
    user: AuthUserContext,
    buffer: Buffer,
    handlingBranchId: string,
    assignedStaffId: string,
    confirm = false,
    checksum?: string,
    options: ImportOptions = { mapping: {}, corrections: {} },
  ) {
    await this.inquiries.authorize(user, 'import', true);
    await this.inquiries.authorize(user, 'create', true);
    this.inquiries.branch(user, handlingBranchId);
    if (assignedStaffId !== user.userId)
      await this.inquiries.authorize(user, 'assign', true);
    const parsed = parseInquiryWorkbook(buffer, options.mapping);
    const previewChecksum = createHash('sha256')
      .update(parsed.checksum)
      .update(JSON.stringify(options))
      .digest('hex');
    if (confirm && checksum !== previewChecksum)
      throw new BadRequestException('Preview this file before confirming.');
    const db = this.inquiries.db;
    const [staff] = await db.query(
      `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND (branch_id=$2 OR role='SUPER_ADMIN')`,
      [assignedStaffId, handlingBranchId],
    );
    if (!staff)
      throw new BadRequestException(
        'Choose an active assignee in the handling branch.',
      );
    const branches = await db.query<{ id: string; name: string }[]>(
      `SELECT id,name FROM branches WHERE is_active ORDER BY name`,
    );
    if (!branches.some((b) => b.id === handlingBranchId))
      throw new BadRequestException('Choose an active handling branch.');
    const lookups = await db.query<
      { id: string; kind: string; label: string }[]
    >(`SELECT id,kind,label FROM inquiry_lookups WHERE active`);
    const lookup = (kind: string, label: string) =>
      lookups.find(
        (l) => l.kind === kind && l.label.toLowerCase() === label.toLowerCase(),
      )?.id;
    const existing = await db.query<{ fingerprint: string }[]>(
      `SELECT r.fingerprint FROM inquiry_import_rows r JOIN inquiries i ON i.id=r.inquiry_id WHERE r.fingerprint=ANY($1::text[]) AND ($2::varchar[] IS NULL OR i.branch_id=ANY($2))`,
      [
        parsed.rows.map((r) => r.fingerprint),
        selectedBranchScope(user) ?? null,
      ],
    );
    const fingerprints = new Set(existing.map((r) => r.fingerprint));
    const clientKeys = parsed.rows.map((r) => {
      const c = options.corrections[`${r.sheet}:${r.row}`];
      return `${(c?.clientName ?? r.clientName).toLowerCase()}|${c?.date ?? r.date ?? ''}`;
    });
    const matches = await db.query<{ key: string }[]>(
      `SELECT DISTINCT lower(trim(client_name))||'|'||COALESCE(inquiry_date::text,'') AS key FROM inquiries WHERE branch_id=$2 AND lower(trim(client_name))||'|'||COALESCE(inquiry_date::text,'')=ANY($1::text[])`,
      [clientKeys, handlingBranchId],
    );
    const matchKeys = new Set(matches.map((m) => m.key));
    const prepared = parsed.rows.map((original) => {
      const correction = Object.hasOwn(
        options.corrections,
        `${original.sheet}:${original.row}`,
      )
        ? options.corrections[`${original.sheet}:${original.row}`]
        : {};
      if (correction.clientName !== undefined && !correction.clientName.trim())
        throw new BadRequestException(
          'Corrected client names cannot be blank.',
        );
      if (
        correction.date !== undefined &&
        importDate(correction.date) !== correction.date
      )
        throw new BadRequestException(
          'Choose an unambiguous valid correction date.',
        );
      if (
        correction.status !== undefined &&
        (!inquiryStatuses.includes(
          correction.status as (typeof inquiryStatuses)[number],
        ) ||
          ['PENDING_RESERVATION', 'RESERVED', 'CONVERTED'].includes(
            correction.status,
          ))
      )
        throw new BadRequestException(
          'Choose a historical workflow status; reservation outcomes cannot be fabricated.',
        );
      const row = {
        ...original,
        clientName: correction.clientName ?? original.clientName,
        date: correction.date ?? original.date,
        status: correction.status ?? original.status,
        reason: correction.reason ?? original.reason,
      };
      const warnings = row.warnings.filter(
        (w) =>
          !(correction.date && w === 'Inquiry date needs review') &&
          !(correction.clientName && w === 'Client name is missing') &&
          !(
            correction.status &&
            correction.status !== 'NEEDS_REVIEW' &&
            w === 'Unknown historical status'
          ),
      );
      if (row.clientName.length > 200) {
        warnings.push(
          'Client name exceeds 200 characters; full source retained',
        );
        row.clientName = row.clientName.slice(0, 200);
      }
      const branch = branches.find(
        (b) => b.name.toLowerCase() === row.sheet.trim().toLowerCase(),
      );
      // Handling ownership is explicitly selected; sheet names only suggest preferred branches.
      const preferred = /both branch/i.test(row.sheet)
        ? branches.filter((b) =>
            ['makati', 'ortigas'].includes(b.name.toLowerCase()),
          )
        : branch
          ? [branch]
          : branches.filter((b) => b.id === handlingBranchId);
      for (const b of preferred) this.inquiries.branch(user, b.id);
      if (/both branch/i.test(row.sheet) && preferred.length !== 2)
        throw new BadRequestException(
          'Resolve both historical branch names before importing this sheet.',
        );
      const serviceIds =
        correction.serviceIds ??
        row.services
          .map((s) => lookup('SERVICE', s))
          .filter((s): s is string => Boolean(s));
      if (
        serviceIds.some(
          (id) => !lookups.some((l) => l.id === id && l.kind === 'SERVICE'),
        )
      )
        throw new BadRequestException(
          'Choose active services for row corrections.',
        );
      if (!correction.serviceIds && serviceIds.length !== row.services.length)
        warnings.push(
          'Some service labels need review; original text retained',
        );
      if (!serviceIds.length) warnings.push('Service needs review');
      const channelId = correction.channelId || lookup('CHANNEL', row.channel),
        sourceId = correction.sourceId || lookup('SOURCE', row.source);
      if (
        (correction.channelId &&
          !lookups.some((l) => l.id === channelId && l.kind === 'CHANNEL')) ||
        (correction.sourceId &&
          !lookups.some((l) => l.id === sourceId && l.kind === 'SOURCE'))
      )
        throw new BadRequestException(
          'Choose active channel/source corrections.',
        );
      if (!channelId) warnings.push('Channel needs review');
      if (row.source && !sourceId) warnings.push('Source needs review');
      const duplicate = fingerprints.has(row.fingerprint);
      if (
        !duplicate &&
        matchKeys.has(`${row.clientName.toLowerCase()}|${row.date ?? ''}`)
      )
        warnings.push(
          'Possible duplicate client and date; review before importing',
        );
      fingerprints.add(row.fingerprint);
      return {
        ...row,
        warnings,
        duplicate,
        preferredBranchIds: preferred.map((b) => b.id),
        serviceIds: [...new Set(serviceIds)],
        channelId,
        sourceId,
        skip: correction.skip ?? false,
      };
    });
    if (!confirm)
      return {
        checksum: previewChecksum,
        rows: prepared,
        skipped: parsed.skipped,
        total: prepared.length,
        sheets: parsed.sheets,
      };
    if (!prepared.length)
      throw new BadRequestException(
        'Map at least one inquiry worksheet before confirming.',
      );
    let imported = 0,
      skipped = 0,
      duplicates = 0;
    await db.transaction(async (m) => {
      // Serialize all import confirmations, including different users and modified workbooks.
      await m.query(`SELECT pg_advisory_xact_lock(1795910400)`);
      const batchId = randomUUID();
      const [batch] = await m.query<{ id: string }[]>(
        `INSERT INTO inquiry_import_batches(id,checksum,actor_id) VALUES($1,$2,$3) ON CONFLICT(checksum,actor_id) DO UPDATE SET checksum=EXCLUDED.checksum RETURNING id`,
        [batchId, parsed.checksum, user.userId],
      );
      for (const row of prepared) {
        if (row.skip) {
          skipped++;
          continue;
        }
        const [exists] = await m.query<{ inquiryId: string }[]>(
          `SELECT inquiry_id AS "inquiryId" FROM inquiry_import_rows WHERE fingerprint=$1`,
          [row.fingerprint],
        );
        if (exists) {
          await this.inquiries.owned(m, user, exists.inquiryId);
          duplicates++;
          continue;
        }
        const id = randomUUID(),
          status = row.warnings.length ? 'NEEDS_REVIEW' : row.status;
        await m.query(
          `INSERT INTO inquiries(id,reference,branch_id,assigned_staff_id,space_interest,budget,status,notes,client_name,client,inquiry_date,channel_id,source_id,legacy_outcome,next_action,created_by,updated_by)
          VALUES($1,next_inquiry_reference(),$2,$3,$4,NULL,$5,$6,$7,'{}',$8,$9,$10,$11,$12,$13,$13)`,
          [
            id,
            handlingBranchId,
            assignedStaffId,
            row.services.join(', '),
            status,
            [row.reason, row.remarks].filter(Boolean).join('\n'),
            row.clientName || 'Historical client needs review',
            row.date,
            row.channelId ?? null,
            row.sourceId ?? null,
            row.legacyOutcome,
            row.nextAction || null,
            user.userId,
          ],
        );
        await m.query(
          `INSERT INTO inquiry_preferred_branches SELECT $1,unnest($2::varchar[])`,
          [id, row.preferredBranchIds],
        );
        if (row.serviceIds.length)
          await m.query(
            `INSERT INTO inquiry_services SELECT $1,unnest($2::varchar[])`,
            [id, row.serviceIds],
          );
        await this.inquiries.event(
          m,
          id,
          user,
          'IMPORTED',
          'Historical inquiry imported; original row retained',
          undefined,
          status,
          true,
        );
        if (status === 'LOST' && row.reason)
          await this.inquiries.event(
            m,
            id,
            user,
            'IMPORTED_LOSS_REASON',
            row.reason,
            undefined,
            'LOST',
            false,
          );
        if (row.action)
          await this.inquiries.event(
            m,
            id,
            user,
            'IMPORTED_ACTIVITY',
            row.action,
            undefined,
            undefined,
            false,
          );
        // Historical follow-up dates remain source metadata, not newly assigned overdue tasks.
        await m.query(
          `INSERT INTO inquiry_import_rows(batch_id,worksheet,row_number,raw,normalized,inquiry_id,fingerprint) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)`,
          [
            batch.id,
            row.sheet,
            row.row,
            JSON.stringify(row.raw),
            JSON.stringify(row),
            id,
            row.fingerprint,
          ],
        );
        imported++;
      }
      await this.inquiries.audit(m, batch.id, handlingBranchId, user, 'IMPORT');
    });
    return {
      imported,
      duplicates,
      review: prepared.filter((r) => r.warnings.length).length,
      skipped,
      checksum: parsed.checksum,
    };
  }
}
