import { Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';

export type AuditLog = {
  id: string;
  userId: string;
  branchId: string | null;
  action: string;
  resource: string;
  details: string;
  createdAt: string;
};

type AuditLogRow = {
  id: string;
  userId: string;
  branchId: string | null;
  action: string;
  resource: string;
  details: string;
  createdAt: Date | string;
};

@Injectable()
export class AuditService {
  constructor(private readonly dataSource: DataSource) {}

  async record(input: AuditLog): Promise<AuditLog> {
    const rows = await this.dataSource.query<AuditLogRow[]>(
      `INSERT INTO audit_logs
         (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, user_id AS "userId", branch_id AS "branchId",
                 action, resource, details, created_at AS "createdAt"`,
      [
        input.id,
        input.userId,
        input.branchId,
        input.action,
        input.resource,
        input.details,
        input.createdAt,
      ],
    );
    return this.normalize(rows[0]);
  }

  async list(branchId?: string): Promise<AuditLog[]> {
    const parameters: string[] = [];
    const branchFilter = branchId
      ? `WHERE branch_id = $1 AND branch_id IS NOT NULL`
      : '';
    if (branchId) parameters.push(branchId);
    const rows = await this.dataSource.query<AuditLogRow[]>(
      `SELECT id, user_id AS "userId", branch_id AS "branchId",
              action, resource, details, created_at AS "createdAt"
       FROM audit_logs
       ${branchFilter}
       ORDER BY created_at DESC`,
      parameters,
    );
    return rows.map((row) => this.normalize(row));
  }

  private normalize(row: AuditLogRow): AuditLog {
    return {
      ...row,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
