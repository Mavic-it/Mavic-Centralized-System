import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import type { UserRecord } from './user.service.js';
import type { EmailDelivery } from '../../email/email.service.js';

export type DeliveryAccount = UserRecord & { startedAt: Date | string | null };

export class AccountCredentialRepository {
  constructor(private readonly db: DataSource) {}

  async prepare(
    id: string,
    input: {
      hash: string;
      expiresAt: Date;
      attemptId: string;
      actorId: string;
      regenerated: boolean;
    },
    assertAllowed: (
      account: DeliveryAccount | undefined,
    ) => asserts account is DeliveryAccount,
  ): Promise<DeliveryAccount> {
    return this.db.transaction(async (manager) => {
      const rows = await manager.query<DeliveryAccount[]>(
        `SELECT id,email,name,role,status,branch_id AS "branchId",employee_id AS "employeeId",
        must_change_password AS "mustChangePassword",credential_email_status AS "credentialEmailStatus",credential_email_started_at AS "startedAt"
        FROM users WHERE id=$1 FOR UPDATE`,
        [id],
      );
      const account = rows[0];
      assertAllowed(account);
      await manager.query(
        `UPDATE users SET password_hash=$2,must_change_password=true,temporary_password_expires_at=$3,
        credential_email_status='PROCESSING',credential_email_attempt_id=$4,credential_email_started_at=now(),credential_email_sent_at=NULL,credential_email_failure=NULL WHERE id=$1`,
        [id, input.hash, input.expiresAt, input.attemptId],
      );
      await manager.query(
        `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
        VALUES($1,$2,$3,'ACCOUNT_CREDENTIAL_EMAIL_STARTED','users',$4::jsonb,now())`,
        [
          randomUUID(),
          input.actorId,
          account.branchId ?? null,
          JSON.stringify({
            targetUserId: id,
            attemptId: input.attemptId,
            regenerated: input.regenerated,
          }),
        ],
      );
      return account;
    });
  }

  async finish(
    account: DeliveryAccount,
    actorId: string,
    attemptId: string,
    delivery: EmailDelivery,
  ): Promise<boolean> {
    return this.db.transaction(async (manager) => {
      // SELECT gives a stable row-array contract; TypeORM wraps raw UPDATE results.
      const updated = await manager.query<Array<{ id: string }>>(
        `WITH updated AS (UPDATE users SET credential_email_status=$3::varchar,credential_email_failure=$4,
        credential_email_sent_at=CASE WHEN $3::varchar='ACCEPTED_BY_PROVIDER' THEN now() ELSE NULL END
        WHERE id=$1 AND credential_email_attempt_id=$2 AND credential_email_status='PROCESSING'
          AND email=$5 AND must_change_password=true RETURNING id) SELECT id FROM updated`,
        [
          account.id,
          attemptId,
          delivery.status,
          delivery.failure,
          account.email,
        ],
      );
      if (!updated[0]) return false;
      await manager.query(
        `INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
        VALUES($1,$2,$3,'ACCOUNT_CREDENTIAL_EMAIL_FINISHED','users',$4::jsonb,now())`,
        [
          randomUUID(),
          actorId,
          account.branchId ?? null,
          JSON.stringify({
            targetUserId: account.id,
            attemptId,
            status: delivery.status,
            failure: delivery.failure,
          }),
        ],
      );
      return true;
    });
  }
}
