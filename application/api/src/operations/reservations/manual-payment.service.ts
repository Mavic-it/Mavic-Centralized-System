import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
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
import { ReservationManagementService } from './reservation-management.service.js';
import {
  matchesPaymentToken,
  proofLimit,
  validatePaymentFile,
} from './manual-payment.security.js';
import type {
  PaymentAccountDto,
  PaymentDecisionDto,
  PaymentPolicyDto,
  PaymentProofDto,
  PaymentQueueDto,
} from './manual-payment.dto.js';

type Row = Record<string, unknown>;
const accountFields = `id,branch_id AS "branchId",payment_method AS "paymentMethod",bank_name AS "bankName",
  account_name AS "accountName",account_number AS "accountNumber",qr_code_data AS "qrCodeData",instructions,
  is_active AS "isActive",is_default AS "isDefault"`;
export class ManualPaymentService {
  constructor(
    private readonly db: DataSource,
    private readonly reservations: ReservationManagementService,
  ) {}
  async authorize(
    user: AuthUserContext,
    key: string,
    write = false,
    branchId?: string,
  ) {
    if (branchId && !includesBranch(user, branchId))
      throw new ForbiddenException('Branch access denied.');
    if (user.role === 'SUPER_ADMIN') return;
    const rows = await this.db.query<
      Array<{ permission_key: string; effect: string }>
    >(
      'SELECT permission_key,effect FROM user_module_permissions WHERE user_id=$1',
      [user.userId],
    );
    const overrides = new Map(rows.map((r) => [r.permission_key, r.effect]));
    let item = registryEntry(key);
    while (item) {
      const effect = overrides.get(item.key);
      const mode =
        effect === 'ALLOW'
          ? 'EDIT'
          : (effect ?? defaultModuleAccess(item, user.role));
      if (
        effect === 'DENY' ||
        (item.key === key && (mode === 'DENY' || (write && mode !== 'EDIT')))
      )
        throw new ForbiddenException('Payment permission denied.');
      item = item.parentKey ? registryEntry(item.parentKey) : undefined;
    }
  }
  async accounts(user: AuthUserContext, branchId?: string) {
    await this.authorize(
      user,
      'operations.reservations.settings',
      false,
      branchId,
    );
    return this.db.query(
      `SELECT ${accountFields} FROM reservation_payment_accounts WHERE
      (branch_id IS NULL OR ($1::varchar IS NOT NULL AND branch_id=$1) OR ($1::varchar IS NULL AND ($2::varchar[] IS NULL OR branch_id=ANY($2))))
      ORDER BY is_active DESC,is_default DESC,created_at`,
      [branchId ?? null, selectedBranchScope(user) ?? null],
    );
  }
  async capabilities(user: AuthUserContext, settings: boolean) {
    const key = settings
      ? 'operations.reservations.settings'
      : 'operations.reservations.list';
    await this.authorize(user, key);
    let canEdit = true;
    try {
      await this.authorize(user, key, true);
    } catch (error) {
      if (error instanceof ForbiddenException) canEdit = false;
      else throw error;
    }
    return { canEdit, canGlobal: user.role === 'SUPER_ADMIN' };
  }
  async settingsBranches(user: AuthUserContext) {
    await this.authorize(user, 'operations.reservations.settings');
    return this.db.query(
      'SELECT id,name FROM branches WHERE is_active AND ($1::varchar[] IS NULL OR id=ANY($1)) ORDER BY name',
      [selectedBranchScope(user) ?? null],
    );
  }
  async saveAccount(user: AuthUserContext, d: PaymentAccountDto, id?: string) {
    await this.authorize(
      user,
      'operations.reservations.settings',
      true,
      d.branchId,
    );
    if (!d.branchId && user.role !== 'SUPER_ADMIN')
      throw new ForbiddenException(
        'Only Super Admin may configure global receiving accounts.',
      );
    if (d.paymentMethod === 'BANK_TRANSFER' && !d.bankName?.trim())
      throw new BadRequestException('Bank name is required.');
    if (
      d.paymentMethod === 'GCASH' &&
      !/^(\+63|0)9\d{9}$/.test(d.accountNumber)
    )
      throw new BadRequestException('Enter a valid GCash mobile number.');
    if (d.qrCodeData) {
      const match = /^data:(image\/(?:png|jpeg));base64,(.+)$/.exec(
        d.qrCodeData,
      );
      if (!match || match[2].length > 1400000)
        throw new BadRequestException('QR must be JPG or PNG up to 1 MB.');
      validatePaymentFile(match[2], match[1]);
    }
    return this.db.transaction(async (m) => {
      await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        `payment-account:${d.branchId ?? 'GLOBAL'}:${d.paymentMethod}`,
      ]);
      if (
        d.branchId &&
        !(
          await m.query('SELECT id FROM branches WHERE id=$1 AND is_active', [
            d.branchId,
          ])
        ).length
      )
        throw new BadRequestException('Choose an active branch.');
      let old: Row | undefined;
      if (id) {
        [old] = await m.query<Row[]>(
          'SELECT * FROM reservation_payment_accounts WHERE id=$1 FOR UPDATE',
          [id],
        );
        if (!old) throw new NotFoundException('Payment account not found.');
        if (!old.branch_id && user.role !== 'SUPER_ADMIN')
          throw new ForbiddenException('Global payment account is protected.');
        if (
          typeof old.branch_id === 'string' &&
          !includesBranch(user, old.branch_id)
        )
          throw new ForbiddenException('Branch access denied.');
      }
      if (d.isDefault && d.isActive)
        await m.query(
          `UPDATE reservation_payment_accounts SET is_default=false,updated_by=$3,updated_at=now()
        WHERE branch_id IS NOT DISTINCT FROM $1::varchar AND payment_method=$2 AND is_default`,
          [d.branchId ?? null, d.paymentMethod, user.userId],
        );
      const values = [
        d.branchId ?? null,
        d.paymentMethod,
        d.bankName ?? null,
        d.accountName,
        d.accountNumber,
        d.qrCodeData || null,
        d.instructions ?? null,
        d.isActive,
        d.isDefault,
        user.userId,
      ];
      const rows = id
        ? await m.query<Row[]>(
            `WITH updated AS (UPDATE reservation_payment_accounts SET branch_id=$1,payment_method=$2,bank_name=$3,
        account_name=$4,account_number=$5,qr_code_data=$6,instructions=$7,is_active=$8,is_default=$9,updated_by=$10,updated_at=now() WHERE id=$11 RETURNING id) SELECT * FROM updated`,
            [...values, id],
          )
        : await m.query<Row[]>(
            `INSERT INTO reservation_payment_accounts(branch_id,payment_method,bank_name,account_name,account_number,qr_code_data,instructions,is_active,is_default,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10) RETURNING id`,
            values,
          );
      await m.query(
        `INSERT INTO reservation_payment_audit_logs(payment_account_id,action,performed_by,notes)
        VALUES($1,$2,$3,$4)`,
        [
          rows[0].id,
          id ? 'ACCOUNT_UPDATED' : 'ACCOUNT_CREATED',
          user.userId,
          JSON.stringify({
            before: old
              ? { ...old, qr_code_data: old.qr_code_data ? '[image]' : null }
              : null,
            after: {
              branchId: d.branchId,
              paymentMethod: d.paymentMethod,
              bankName: d.bankName,
              accountName: d.accountName,
              accountNumber: d.accountNumber,
              instructions: d.instructions,
              isActive: d.isActive,
              isDefault: d.isDefault,
              qrCodeData: d.qrCodeData ? '[image]' : null,
            },
          }),
        ],
      );
      return { id: rows[0].id };
    });
  }
  async policy(user: AuthUserContext, branchId: string) {
    if (!branchId || branchId.length > 100)
      throw new BadRequestException('A valid branch is required.');
    await this.authorize(
      user,
      'operations.reservations.settings',
      false,
      branchId,
    );
    const rows = await this.db.query(
      `SELECT hold_minutes AS "holdMinutes",review_minutes AS "reviewMinutes",reminder_minutes AS "reminderMinutes",deposit_percent AS "depositPercent" FROM reservation_payment_policy WHERE branch_id=$1`,
      [branchId],
    );
    return (
      rows[0] ?? {
        holdMinutes: 30,
        reviewMinutes: 1440,
        reminderMinutes: 10,
        depositPercent: 100,
      }
    );
  }
  async savePolicy(
    user: AuthUserContext,
    branchId: string,
    d: PaymentPolicyDto,
  ) {
    if (!branchId || branchId.length > 100)
      throw new BadRequestException('A valid branch is required.');
    await this.authorize(
      user,
      'operations.reservations.settings',
      true,
      branchId,
    );
    if (d.reminderMinutes >= d.holdMinutes)
      throw new BadRequestException(
        'Reminder must be shorter than the payment hold, or zero to disable.',
      );
    await this.db.transaction(async (m) => {
      await m.query(
        `INSERT INTO reservation_payment_policy(branch_id,hold_minutes,review_minutes,reminder_minutes,deposit_percent,updated_by)
        VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(branch_id) DO UPDATE SET hold_minutes=$2,review_minutes=$3,reminder_minutes=$4,deposit_percent=$5,updated_by=$6,updated_at=now()`,
        [
          branchId,
          d.holdMinutes,
          d.reviewMinutes,
          d.reminderMinutes,
          d.depositPercent,
          user.userId,
        ],
      );
      await m.query(
        `INSERT INTO reservation_payment_audit_logs(action,performed_by,notes) VALUES('POLICY_UPDATED',$1,$2)`,
        [
          user.userId,
          JSON.stringify({
            branchId,
            holdMinutes: d.holdMinutes,
            reviewMinutes: d.reviewMinutes,
            reminderMinutes: d.reminderMinutes,
            depositPercent: d.depositPercent,
          }),
        ],
      );
    });
    return this.policy(user, branchId);
  }
  async publicAccounts(branchId: string) {
    return this.db.query(
      `SELECT ${accountFields} FROM reservation_payment_accounts WHERE is_active AND (branch_id=$1 OR branch_id IS NULL)
      AND EXISTS(SELECT 1 FROM branches WHERE id=$1 AND is_active) ORDER BY branch_id NULLS LAST,is_default DESC,created_at`,
      [branchId],
    );
  }
  async owned(
    reference: string,
    token: string,
    m = this.db.manager,
    lock = false,
  ): Promise<Row> {
    if (
      !/^RSV-[A-Z0-9]+-[A-Z0-9]+$/.test(reference) ||
      reference.length > 100 ||
      !/^[a-f0-9]{64}$/.test(token)
    )
      throw new NotFoundException(
        'Booking access is invalid. Use your private booking link.',
      );
    const [r] = await m.query<Row[]>(
      `SELECT r.*,b.name AS "branchName",s.name AS "spaceName" FROM reservations r
      JOIN branches b ON b.id=r.branch_id LEFT JOIN rooms s ON s.id=r.room_id
      WHERE r.reference=$1 AND r.source='PUBLIC_PORTAL' ${lock ? 'FOR UPDATE OF r' : ''}`,
      [reference],
    );
    if (
      !r ||
      typeof r.public_key_hash !== 'string' ||
      !matchesPaymentToken(token, reference, r.public_key_hash)
    )
      throw new NotFoundException(
        'Booking access is invalid. Use your private booking link.',
      );
    return r;
  }
  async payment(reference: string, token: string) {
    const r = await this.owned(reference, token);
    const submissions = await this.db.query(
      `SELECT id,payment_method AS "paymentMethod",transaction_reference AS "transactionReference",
      submitted_amount::float AS "submittedAmount",verification_status AS status,rejection_reason AS "rejectionReason",verified_amount::float AS "verifiedAmount",
      submitted_at AS "submittedAt",verified_at AS "verifiedAt" FROM reservation_payment_submissions WHERE reservation_id=$1 ORDER BY submitted_at DESC`,
      [r.id],
    );
    const [paid] = await this.db.query<Array<{ amount: number }>>(
      'SELECT (COALESCE(sum(amount),0)-COALESCE((SELECT sum(f.amount) FROM reservation_payment_refunds f WHERE f.reservation_id=$1),0))::float AS amount FROM reservation_payments WHERE reservation_id=$1',
      [r.id],
    );
    return {
      reference: r.reference,
      customerName: r.customer_name,
      branchName: r.branchName,
      spaceName: r.spaceName,
      startAt: r.start_date_time,
      endAt: r.end_date_time,
      amount: Number(r.amount),
      paidAmount: Number(paid.amount),
      requiredAmount:
        Math.ceil(Number(r.amount) * Number(r.payment_deposit_percent)) / 100,
      paymentStatus: r.payment_status,
      reservationStatus: r.status,
      holdUntil: r.payment_hold_until,
      paymentDeadline: r.payment_deadline,
      expired:
        Boolean(r.payment_hold_expired_at) ||
        (r.status === 'PENDING' &&
          new Date(String(r.payment_hold_until)).getTime() <= Date.now()),
      required: Boolean(r.manual_payment_required),
      submissions,
      accounts: await this.publicAccounts(String(r.branch_id)),
      maxProofBytes: proofLimit(),
    };
  }
  async submit(reference: string, token: string, d: PaymentProofDto) {
    if (!/\.(jpe?g|png|pdf)$/i.test(d.fileName))
      throw new BadRequestException('Select a JPG, PNG or PDF file.');
    const proof = validatePaymentFile(d.proofBase64, d.mime);
    const paymentDate = new Date(d.paymentDateTime);
    if (
      +paymentDate > Date.now() + 60000 ||
      +paymentDate < Date.now() - 365 * 86400000
    )
      throw new BadRequestException(
        'Choose a valid payment date within the last year.',
      );
    try {
      return await this.db.transaction(async (m) => {
        const r = await this.owned(reference, token, m, true);
        if (
          !r.manual_payment_required ||
          !['PENDING', 'CONFIRMED'].includes(String(r.status)) ||
          r.payment_hold_expired_at
        )
          throw new ConflictException(
            'This booking cannot accept proof. Contact the branch for payment reconciliation.',
          );
        if (
          r.status === 'PENDING' &&
          new Date(String(r.payment_hold_until)).getTime() <= Date.now()
        )
          throw new ConflictException(
            'Booking hold expired. Contact the branch before sending money.',
          );
        const [account] = await m.query<Row[]>(
          `SELECT ${accountFields} FROM reservation_payment_accounts WHERE id=$1 AND is_active AND (branch_id=$2 OR branch_id IS NULL) FOR SHARE`,
          [d.paymentAccountId, r.branch_id],
        );
        if (!account)
          throw new BadRequestException(
            'Select an active official payment account for this branch.',
          );
        const pending = await m.query(
          "SELECT id FROM reservation_payment_submissions WHERE reservation_id=$1 AND verification_status='AWAITING_VERIFICATION'",
          [r.id],
        );
        if (pending.length)
          throw new ConflictException(
            'Your previous proof is already awaiting verification.',
          );
        const [s] = await m.query<Row[]>(
          `INSERT INTO reservation_payment_submissions(reservation_id,payment_account_id,account_snapshot,payment_method,
          transaction_reference,submitted_amount,payment_datetime,proof_data,proof_mime,proof_name,notes)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [
            r.id,
            d.paymentAccountId,
            JSON.stringify(account),
            account.paymentMethod,
            d.transactionReference,
            d.amount,
            paymentDate,
            proof,
            d.mime,
            d.fileName,
            d.notes ?? null,
          ],
        );
        // One bounded review window, anchored to the original payment deadline, never reset by resubmission.
        await m.query(
          `UPDATE reservations SET payment_status='AWAITING_VERIFICATION',payment_hold_until=LEAST(start_date_time,
          payment_deadline+make_interval(mins=>payment_review_minutes)),updated_at=now() WHERE id=$1`,
          [r.id],
        );
        await this.audit(
          m,
          String(s.id),
          String(r.id),
          'PROOF_SUBMITTED',
          null,
          'AWAITING_VERIFICATION',
          null,
        );
        await this.mail(
          m,
          String(r.id),
          'PAYMENT_SUBMITTED',
          `${String(s.id)}:submitted`,
          'Payment submitted — awaiting verification. Staff will check the actual company transaction records. Uploading proof does not confirm your booking.',
        );
        await this.reservations.notifyCancellation(
          m,
          String(r.id),
          String(r.branch_id),
          `Payment awaiting verification: ${reference}`,
        );
        return { id: s.id, status: 'AWAITING_VERIFICATION' };
      });
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '23505'
      )
        throw new ConflictException(
          'This transaction reference is already allocated, or proof is already awaiting review. Contact the branch if you need help.',
        );
      throw error;
    }
  }
  async queue(user: AuthUserContext, q: PaymentQueueDto) {
    await this.authorize(
      user,
      'operations.reservations.list',
      false,
      q.branchId,
    );
    return this.db.query(
      `SELECT s.id,r.id AS "reservationId",r.reference,r.customer_name AS "customerName",b.name AS "branchName",
      room.name AS "spaceName",r.start_date_time AS "startAt",r.amount::float AS "totalAmount",s.payment_method AS "paymentMethod",
      s.submitted_amount::float AS "submittedAmount",s.transaction_reference AS "transactionReference",s.submitted_at AS "submittedAt",s.verification_status AS status,
      (r.payment_hold_expired_at IS NOT NULL OR r.status='PENDING' AND r.payment_hold_until<=now()) AS "needsReconciliation",count(*) OVER()::int AS total
      FROM reservation_payment_submissions s JOIN reservations r ON r.id=s.reservation_id JOIN branches b ON b.id=r.branch_id LEFT JOIN rooms room ON room.id=r.room_id
      WHERE ($1::varchar[] IS NULL OR r.branch_id=ANY($1)) AND ($2::varchar IS NULL OR r.branch_id=$2)
      AND ($3::varchar IS NULL OR s.verification_status=$3) AND ($4::varchar IS NULL OR s.payment_method=$4)
      AND ($5::timestamptz IS NULL OR s.submitted_at>=$5) AND ($6::timestamptz IS NULL OR s.submitted_at<$6)
      AND ($7::varchar IS NULL OR r.reference ILIKE '%'||$7||'%' OR r.customer_name ILIKE '%'||$7||'%')
      ORDER BY s.submitted_at DESC LIMIT 50 OFFSET $8`,
      [
        selectedBranchScope(user) ?? null,
        q.branchId ?? null,
        q.status ?? null,
        q.method ?? null,
        q.from ?? null,
        q.to ?? null,
        q.search || null,
        (q.page - 1) * 50,
      ],
    );
  }
  async detail(user: AuthUserContext, id: string): Promise<Row> {
    const [s] = await this.db.query<Row[]>(
      `SELECT s.id,s.reservation_id AS "reservationId",s.account_snapshot AS account,s.payment_method AS "paymentMethod",
      s.transaction_reference AS "transactionReference",s.submitted_amount::float AS "submittedAmount",s.payment_datetime AS "paymentDateTime",
      s.verification_status AS status,s.notes,s.rejection_reason AS "rejectionReason",s.verification_notes AS "verificationNotes",
      s.verified_by AS "verifiedBy",s.verified_at AS "verifiedAt",s.verified_amount::float AS "verifiedAmount",s.submitted_at AS "submittedAt",
      r.branch_id AS "branchId",r.reference,r.customer_name AS "customerName",r.customer_email AS "customerEmail",r.customer_phone AS "customerPhone",
      r.amount::float AS "totalAmount",r.status AS "reservationStatus",r.start_date_time AS "startAt",r.end_date_time AS "endAt",
      r.payment_hold_until AS "holdUntil",r.payment_hold_expired_at AS "expiredAt",(r.payment_hold_expired_at IS NOT NULL OR r.status='PENDING' AND r.payment_hold_until<=now()) AS "needsReconciliation",b.name AS "branchName",room.name AS "spaceName"
      FROM reservation_payment_submissions s JOIN reservations r ON r.id=s.reservation_id JOIN branches b ON b.id=r.branch_id
      LEFT JOIN rooms room ON room.id=r.room_id WHERE s.id=$1`,
      [id],
    );
    if (!s) throw new NotFoundException('Payment submission not found.');
    await this.authorize(
      user,
      'operations.reservations.list',
      false,
      String(s.branchId),
    );
    const history = await this.db.query(
      `SELECT a.action,a.previous_status AS "previousStatus",a.new_status AS "newStatus",a.notes,a.created_at AS "createdAt",u.name AS "performedBy"
      FROM reservation_payment_audit_logs a LEFT JOIN users u ON u.id=a.performed_by WHERE a.payment_submission_id=$1 ORDER BY a.created_at`,
      [id],
    );
    return { ...s, history };
  }
  async proof(user: AuthUserContext, id: string) {
    await this.detail(user, id);
    const [s] = await this.db.query<
      Array<{ proof_data: Buffer; proof_mime: string }>
    >(
      'SELECT proof_data,proof_mime FROM reservation_payment_submissions WHERE id=$1',
      [id],
    );
    return s;
  }
  async decide(
    user: AuthUserContext,
    id: string,
    action: string,
    d: PaymentDecisionDto,
  ) {
    if (
      !['verify', 'reject', 'request-resubmission', 'confirm-refund'].includes(
        action,
      )
    )
      throw new BadRequestException('Unknown payment action.');
    const info = await this.detail(user, id);
    await this.authorize(
      user,
      'operations.reservations.list',
      true,
      String(info.branchId),
    );
    return this.db.transaction(async (m) => {
      // Room -> reservation -> submission is the common ordering used by booking/expiry.
      const [context] = await m.query<Row[]>(
        'SELECT room_id FROM reservations WHERE id=$1',
        [info.reservationId],
      );
      await m.query('SELECT id FROM rooms WHERE id=$1 FOR UPDATE', [
        context.room_id,
      ]);
      const [r] = await m.query<Row[]>(
        'SELECT * FROM reservations WHERE id=$1 FOR UPDATE',
        [info.reservationId],
      );
      const [s] = await m.query<Row[]>(
        'SELECT * FROM reservation_payment_submissions WHERE id=$1 FOR UPDATE',
        [id],
      );
      if (action === 'confirm-refund') {
        if (s.verification_status === 'REFUNDED')
          return { status: 'REFUNDED', reservationStatus: r.status };
        if (
          s.verification_status !== 'VERIFIED' ||
          !['CANCELLED', 'REJECTED'].includes(String(r.status))
        )
          throw new ConflictException(
            'Only verified payments on cancelled or rejected bookings can be refunded.',
          );
        if (!d.independentlyChecked || !d.refundReference)
          throw new BadRequestException(
            'Independently confirm the actual refund and provide its transaction reference.',
          );
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `refund:${d.refundReference.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()}`,
        ]);
        if (
          (
            await m.query(
              "SELECT id FROM reservation_payment_refunds WHERE lower(regexp_replace(reference,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace($1,'[^a-zA-Z0-9]','','g'))",
              [d.refundReference],
            )
          ).length
        )
          throw new ConflictException(
            'This refund transaction has already been recorded.',
          );
        await m.query(
          `INSERT INTO reservation_payment_refunds(payment_submission_id,reservation_id,amount,reference,recorded_by,notes) VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            r.id,
            s.verified_amount,
            d.refundReference,
            user.userId,
            d.notes,
          ],
        );
        await m.query(
          "UPDATE reservation_payment_submissions SET verification_status='REFUNDED' WHERE id=$1",
          [id],
        );
        const [balance] = await m.query<Array<{ net: number }>>(
          `SELECT (COALESCE((SELECT sum(amount) FROM reservation_payments WHERE reservation_id=$1),0)-COALESCE((SELECT sum(amount) FROM reservation_payment_refunds WHERE reservation_id=$1),0))::float AS net`,
          [r.id],
        );
        await m.query(
          'UPDATE reservations SET payment_status=$2,updated_at=now() WHERE id=$1',
          [r.id, balance.net <= 0 ? 'REFUNDED' : 'PARTIALLY_PAID'],
        );
        await this.audit(
          m,
          id,
          String(r.id),
          'REFUND_CONFIRMED',
          'VERIFIED',
          'REFUNDED',
          user.userId,
          `${d.notes} Refund transaction: ${d.refundReference}`,
        );
        await this.mail(
          m,
          String(r.id),
          'PAYMENT_REFUNDED',
          `${id}:refunded`,
          'Staff independently confirmed that the refund was completed. Your booking remains cancelled or rejected.',
        );
        return { status: 'REFUNDED', reservationStatus: r.status };
      }
      if (s.verification_status !== 'AWAITING_VERIFICATION') {
        if (s.verification_status === 'VERIFIED' && action === 'verify')
          return { status: 'VERIFIED', reservationStatus: r.status };
        throw new ConflictException('Payment has already been reviewed.');
      }
      const next =
        action === 'verify'
          ? 'VERIFIED'
          : action === 'reject'
            ? 'REJECTED'
            : 'RESUBMISSION_REQUESTED';
      if (action === 'verify') {
        if (!d.independentlyChecked || !d.verifiedAmount)
          throw new BadRequestException(
            'Confirm you checked the actual receiving account and enter the amount received.',
          );
        if (
          Math.round(d.verifiedAmount * 100) !==
          Math.round(Number(s.submitted_amount) * 100)
        )
          throw new BadRequestException(
            'Verified amount must match the submitted transaction. Request corrected details if it differs.',
          );
        await m.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `${String(s.payment_method)}:${String(s.transaction_reference)
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase()}`,
        ]);
        const allocated = await m.query(
          `SELECT id FROM reservation_payments WHERE reservation_id<>$1 AND method=$2
          AND lower(regexp_replace(reference,'[^a-zA-Z0-9]','','g'))=lower(regexp_replace($3,'[^a-zA-Z0-9]','','g')) LIMIT 1`,
          [r.id, s.payment_method, s.transaction_reference],
        );
        if (allocated.length)
          throw new ConflictException(
            'This external transaction was already recorded against another reservation.',
          );
        const [payment] = await m.query<Row[]>(
          `INSERT INTO reservation_payments(reservation_id,amount,method,reference,note,recorded_by)
          VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
          [
            r.id,
            d.verifiedAmount,
            s.payment_method,
            s.transaction_reference,
            d.notes,
            user.userId,
          ],
        );
        await m.query(
          'UPDATE reservation_payment_submissions SET ledger_payment_id=$2 WHERE id=$1',
          [id, payment.id],
        );
      }
      await m.query(
        `UPDATE reservation_payment_submissions SET verification_status=$2,verified_by=$3,verified_at=now(),
        verified_amount=$4,verification_notes=$5,rejection_reason=$6 WHERE id=$1`,
        [
          id,
          next,
          user.userId,
          action === 'verify' ? d.verifiedAmount : null,
          d.notes,
          action === 'verify' ? null : d.notes,
        ],
      );
      const [paid] = await m.query<Array<{ amount: number }>>(
        'SELECT (COALESCE(sum(amount),0)-COALESCE((SELECT sum(f.amount) FROM reservation_payment_refunds f WHERE f.reservation_id=$1),0))::float AS amount FROM reservation_payments WHERE reservation_id=$1',
        [r.id],
      );
      const total = Number(paid.amount),
        due = Number(r.amount),
        required = Math.ceil(due * Number(r.payment_deposit_percent)) / 100;
      const paymentStatus =
        total >= due && total > 0
          ? 'VERIFIED'
          : total > 0
            ? 'PARTIALLY_PAID'
            : next;
      let status = String(r.status);
      const expired =
        Boolean(r.payment_hold_expired_at) ||
        (r.status === 'PENDING' &&
          +new Date(String(r.payment_hold_until)) <= Date.now());
      if (
        action === 'verify' &&
        total >= required &&
        status === 'PENDING' &&
        !expired
      ) {
        if (
          await this.reservations.conflict(
            m,
            String(r.room_id),
            new Date(String(r.start_date_time)),
            new Date(String(r.end_date_time)),
            String(r.id),
            Number(r.guest_count),
          )
        )
          throw new ConflictException(
            'The slot is no longer available. Reconcile this payment with the branch.',
          );
        status = 'CONFIRMED';
        await m.query(
          `INSERT INTO reservation_events(reservation_id,action,actor_id,previous_status,new_status,reason)
          VALUES($1,'PAYMENT_CONFIRMED',$2,$3,'CONFIRMED',$4)`,
          [r.id, user.userId, r.status, d.notes],
        );
        await m.query(
          `INSERT INTO reservation_customer_mail(reservation_id,event) VALUES($1,'CONFIRMED') ON CONFLICT DO NOTHING`,
          [r.id],
        );
      }
      await m.query(
        `UPDATE reservations SET payment_status=$2,status=$3,approved_by=CASE WHEN status<>$3 AND $3='CONFIRMED' THEN $4 ELSE approved_by END,
        approved_at=CASE WHEN status<>$3 AND $3='CONFIRMED' THEN now() ELSE approved_at END,updated_at=now() WHERE id=$1`,
        [r.id, paymentStatus, status, user.userId],
      );
      await this.audit(
        m,
        id,
        String(r.id),
        action.toUpperCase(),
        String(s.verification_status),
        next,
        user.userId,
        d.notes,
      );
      const message =
        action === 'verify'
          ? `Staff verified your payment. ${expired || !['PENDING', 'CONFIRMED'].includes(status) ? 'Your booking requires staff reconciliation; payment verification does not restore an expired or cancelled booking.' : status === 'CONFIRMED' ? 'Your reservation is confirmed.' : 'More payment is required before your booking can be confirmed.'}`
          : `Payment ${action === 'reject' ? 'rejected' : 'resubmission requested'}: ${d.notes}. Use your private booking link to submit corrected proof before the hold expires.`;
      await this.mail(
        m,
        String(r.id),
        `PAYMENT_${next}`,
        `${id}:${next}`,
        message,
      );
      await this.reservations.notifyCancellation(
        m,
        String(r.id),
        String(r.branch_id),
        `Payment ${next.toLowerCase().replaceAll('_', ' ')}: ${String(r.reference)}`,
        user.userId,
      );
      return {
        status: next,
        reservationStatus: status,
        needsReconciliation: expired,
      };
    });
  }
  async mail(
    m: EntityManager,
    id: string,
    event: string,
    key: string,
    message: string,
  ) {
    await m.query(
      `INSERT INTO reservation_payment_mail(reservation_id,event,event_key,message) VALUES($1,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING`,
      [id, event, key, message],
    );
  }
  private async audit(
    m: EntityManager,
    submission: string,
    reservation: string,
    action: string,
    previous: string | null,
    next: string,
    actor: string | null,
    notes?: string,
  ) {
    await m.query(
      `INSERT INTO reservation_payment_audit_logs(payment_submission_id,reservation_id,action,previous_status,new_status,performed_by,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [submission, reservation, action, previous, next, actor, notes ?? null],
    );
  }
}
