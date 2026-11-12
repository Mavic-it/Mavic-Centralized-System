import { randomUUID } from 'node:crypto';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';

export type EmployeeDocumentRecord = {
  id: string;
  employeeId: string;
  requirementId?: string | null;
  category: 'GOVERNMENT_ID' | 'CONTRACT_RECORD';
  documentType: string;
  fileName: string;
  fileSizeBytes: number | null;
  mimeType: string | null;
  hasFile: boolean;
  uploadedBy: string;
  expirationDate: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'ARCHIVED';
  version: number;
  createdAt: string;
};

export type EmployeeDocumentFile = {
  fileName: string;
  mimeType: string;
  data: Buffer;
};

export type CreateEmployeeDocumentUpload = {
  employeeId: string;
  requirementId?: string;
  category: EmployeeDocumentRecord['category'];
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  fileData: Buffer;
  uploadedBy: string;
  expirationDate: string | null;
};

export type EmployeeDocumentRequirement = {
  id: string;
  branchId: string;
  name: string;
  category: EmployeeDocumentRecord['category'];
  isRequired: boolean;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDocumentChecklistItem = {
  id: string;
  name: string;
  category: EmployeeDocumentRecord['category'];
  isRequired: boolean;
  isComplete: boolean;
  documentId: string | null;
  fileName: string | null;
  expirationDate: string | null;
  documentStatus: EmployeeDocumentRecord['status'] | null;
  version: number | null;
};

export type EmployeeDocumentChecklist = {
  employeeId: string;
  branchId: string;
  status: 'NOT_CONFIGURED' | 'INCOMPLETE' | 'COMPLETE';
  requiredCount: number;
  completedRequiredCount: number;
  requirements: EmployeeDocumentChecklistItem[];
};

export type CreateEmployeeDocumentRequirement = {
  name: string;
  category: EmployeeDocumentRecord['category'];
  isRequired: boolean;
};

export type UpdateEmployeeDocumentRequirement = Partial<
  CreateEmployeeDocumentRequirement & { isActive: boolean }
>;

export class EmployeeDocumentService {
  constructor(private readonly dataSource: DataSource) {}

  async list(employeeId: string): Promise<EmployeeDocumentRecord[]> {
    const rows = await this.dataSource.query<EmployeeDocumentRecord[]>(
      `SELECT id, employee_id AS "employeeId",
              document_category AS category, document_type AS "documentType",
              requirement_id AS "requirementId",
              file_name AS "fileName", file_size_bytes AS "fileSizeBytes",
              mime_type AS "mimeType", file_data IS NOT NULL AS "hasFile",
              uploaded_by AS "uploadedBy", expiration_date::text AS "expirationDate",
              CASE WHEN status = 'ACTIVE' AND expiration_date < CURRENT_DATE
                   THEN 'EXPIRED' ELSE status END AS status,
              version, created_at AS "createdAt"
       FROM employee_documents
       WHERE employee_id = $1
       ORDER BY created_at DESC, id DESC`,
      [employeeId],
    );
    return rows.map((row) => ({
      ...row,
      fileSizeBytes:
        row.fileSizeBytes === null ? null : Number(row.fileSizeBytes),
      expirationDate: row.expirationDate
        ? String(row.expirationDate).slice(0, 10)
        : null,
      version: Number(row.version),
    }));
  }

  async getChecklist(
    employeeId: string,
    branchId: string,
  ): Promise<EmployeeDocumentChecklist> {
    const rows = await this.dataSource.query<
      Array<{
        id: string;
        name: string;
        category: EmployeeDocumentRecord['category'];
        isRequired: boolean;
        isComplete: boolean;
        documentId: string | null;
        fileName: string | null;
        expirationDate: string | null;
        documentStatus: EmployeeDocumentRecord['status'] | null;
        version: number | null;
      }>
    >(
      `SELECT r.id, r.name, r.category, r.is_required AS "isRequired",
              COALESCE(doc.file_data IS NOT NULL
                AND doc.status = 'ACTIVE'
                AND (doc.expiration_date IS NULL OR doc.expiration_date >= CURRENT_DATE),
                false) AS "isComplete",
              doc.id AS "documentId", doc.file_name AS "fileName",
              doc.expiration_date::text AS "expirationDate",
              CASE WHEN doc.status = 'ACTIVE'
                        AND doc.expiration_date < CURRENT_DATE
                   THEN 'EXPIRED' ELSE doc.status END AS "documentStatus",
              doc.version
       FROM employee_document_requirements r
       LEFT JOIN LATERAL (
         SELECT d.id, d.file_data, d.file_name, d.expiration_date,
                d.status, d.version, d.created_at
         FROM employee_documents d
         WHERE d.employee_id = $1 AND d.requirement_id = r.id
         ORDER BY d.version DESC, d.created_at DESC, d.id DESC
         LIMIT 1
       ) doc ON true
       WHERE r.branch_id = $2 AND r.is_active = true
       ORDER BY r.is_required DESC, lower(r.name), r.id`,
      [employeeId, branchId],
    );
    const requirements = rows.map((row) => ({
      ...row,
      isRequired: Boolean(row.isRequired),
      isComplete: Boolean(row.isComplete),
      expirationDate: row.expirationDate
        ? String(row.expirationDate).slice(0, 10)
        : null,
      version: row.version === null ? null : Number(row.version),
    }));
    const requiredCount = requirements.filter((item) => item.isRequired).length;
    const completedRequiredCount = requirements.filter(
      (item) => item.isRequired && item.isComplete,
    ).length;
    const status =
      requirements.length === 0
        ? 'NOT_CONFIGURED'
        : completedRequiredCount === requiredCount
          ? 'COMPLETE'
          : 'INCOMPLETE';
    return {
      employeeId,
      branchId,
      status,
      requiredCount,
      completedRequiredCount,
      requirements,
    };
  }

  async listRequirements(
    branchId: string,
    includeInactive = false,
  ): Promise<EmployeeDocumentRequirement[]> {
    return this.dataSource.query<EmployeeDocumentRequirement[]>(
      `SELECT id, branch_id AS "branchId", name, category,
              is_required AS "isRequired", is_active AS "isActive",
              created_by AS "createdBy", created_at AS "createdAt",
              updated_at AS "updatedAt"
       FROM employee_document_requirements
       WHERE branch_id = $1 AND ($2::boolean OR is_active = true)
       ORDER BY is_required DESC, lower(name), id`,
      [branchId, includeInactive],
    );
  }

  async createRequirement(
    branchId: string,
    input: CreateEmployeeDocumentRequirement,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeDocumentRequirement> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query<EmployeeDocumentRequirement[]>(
          `INSERT INTO employee_document_requirements
             (id, branch_id, name, category, is_required, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, branch_id AS "branchId", name, category,
                     is_required AS "isRequired", is_active AS "isActive",
                     created_by AS "createdBy", created_at AS "createdAt",
                     updated_at AS "updatedAt"`,
          [
            randomUUID(),
            branchId,
            input.name.trim(),
            input.category,
            input.isRequired,
            actor.userId,
          ],
        );
        const requirement = rows[0];
        await this.writeRequirementAudit(manager, actor, branchId, 'CREATE', {
          requirementId: requirement.id,
          name: requirement.name,
          category: requirement.category,
          isRequired: requirement.isRequired,
        });
        return requirement;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'An active requirement with this name already exists for the branch.',
        );
      }
      throw error;
    }
  }

  async updateRequirement(
    branchId: string,
    requirementId: string,
    input: UpdateEmployeeDocumentRequirement,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeDocumentRequirement> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const existingRows = await manager.query<EmployeeDocumentRequirement[]>(
          `SELECT id, branch_id AS "branchId", name, category,
                is_required AS "isRequired", is_active AS "isActive",
                created_by AS "createdBy", created_at AS "createdAt",
                updated_at AS "updatedAt"
         FROM employee_document_requirements
         WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
          [requirementId, branchId],
        );
        const existing = existingRows[0];
        if (!existing)
          throw new NotFoundException('Document requirement not found.');
        const updatedRows = await manager.query<EmployeeDocumentRequirement[]>(
          `UPDATE employee_document_requirements
         SET name = $3, category = $4, is_required = $5, is_active = $6,
             updated_at = now()
         WHERE id = $1 AND branch_id = $2
         RETURNING id, branch_id AS "branchId", name, category,
                   is_required AS "isRequired", is_active AS "isActive",
                   created_by AS "createdBy", created_at AS "createdAt",
                   updated_at AS "updatedAt"`,
          [
            requirementId,
            branchId,
            input.name?.trim() ?? existing.name,
            input.category ?? existing.category,
            input.isRequired ?? existing.isRequired,
            input.isActive ?? existing.isActive,
          ],
        );
        const updated = updatedRows[0];
        await this.writeRequirementAudit(manager, actor, branchId, 'UPDATE', {
          requirementId,
          changedFields: Object.keys(input),
        });
        return updated;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new BadRequestException(
          'An active requirement with this name already exists for the branch.',
        );
      }
      throw error;
    }
  }

  async create(
    input: CreateEmployeeDocumentUpload,
    branchId: string,
  ): Promise<EmployeeDocumentRecord> {
    return this.dataSource.transaction(async (manager) => {
      const employeeRows = await manager.query<Array<{ id: string }>>(
        'SELECT id FROM employees WHERE id = $1 FOR UPDATE',
        [input.employeeId],
      );
      if (!employeeRows[0]) throw new NotFoundException('Employee not found.');

      let version = 1;
      if (input.requirementId) {
        const requirements = await manager.query<
          Array<{ id: string; category: EmployeeDocumentRecord['category'] }>
        >(
          `SELECT id, category FROM employee_document_requirements
           WHERE id = $1 AND branch_id = $2 AND is_active = true`,
          [input.requirementId, branchId],
        );
        if (!requirements[0]) {
          throw new BadRequestException(
            'This document requirement is no longer active for the employee branch.',
          );
        }
        if (requirements[0].category !== input.category) {
          throw new BadRequestException(
            'The uploaded document type does not match this requirement.',
          );
        }
        const versions = await manager.query<Array<{ version: number }>>(
          `SELECT COALESCE(MAX(version), 0) + 1 AS version
           FROM employee_documents
           WHERE employee_id = $1 AND requirement_id = $2`,
          [input.employeeId, input.requirementId],
        );
        version = Number(versions[0]?.version ?? 1);
      }
      const id = randomUUID();
      const rows = await manager.query<EmployeeDocumentRecord[]>(
        `INSERT INTO employee_documents
           (id, employee_id, document_category, document_type, file_name,
            file_size_bytes, mime_type, file_data, uploaded_by, expiration_date,
            status, version, requirement_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::date, 'ACTIVE', $11, $12)
         RETURNING id, employee_id AS "employeeId",
                   document_category AS category, document_type AS "documentType",
                   requirement_id AS "requirementId",
                   file_name AS "fileName", file_size_bytes AS "fileSizeBytes",
                   mime_type AS "mimeType", true AS "hasFile",
                   uploaded_by AS "uploadedBy",
                   expiration_date::text AS "expirationDate", status, version,
                   created_at AS "createdAt"`,
        [
          id,
          input.employeeId,
          input.category,
          input.category === 'GOVERNMENT_ID'
            ? 'Government ID'
            : 'Contract / Record',
          input.fileName,
          input.fileSizeBytes,
          input.mimeType,
          input.fileData,
          input.uploadedBy,
          input.expirationDate,
          version,
          input.requirementId ?? null,
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'CREATE', 'employee_documents', $4, now())`,
        [
          randomUUID(),
          input.uploadedBy,
          branchId,
          JSON.stringify({
            documentId: id,
            employeeId: input.employeeId,
            category: input.category,
            requirementId: input.requirementId ?? null,
            fileName: input.fileName,
            fileSizeBytes: input.fileSizeBytes,
          }),
        ],
      );
      const row = rows[0];
      return {
        ...row,
        fileSizeBytes:
          row.fileSizeBytes === null ? null : Number(row.fileSizeBytes),
        expirationDate: row.expirationDate
          ? String(row.expirationDate).slice(0, 10)
          : null,
        version: Number(row.version),
      };
    });
  }

  async attachExistingDocument(
    employeeId: string,
    documentId: string,
    requirementId: string,
    branchId: string,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeDocumentRecord> {
    return this.dataSource.transaction(async (manager) => {
      const employeeRows = await manager.query<Array<{ id: string }>>(
        'SELECT id FROM employees WHERE id = $1 FOR UPDATE',
        [employeeId],
      );
      if (!employeeRows[0]) throw new NotFoundException('Employee not found.');
      const docs = await manager.query<
        Array<{
          id: string;
          category: EmployeeDocumentRecord['category'];
          requirementId: string | null;
          status: EmployeeDocumentRecord['status'];
          expirationDate: string | null;
        }>
      >(
        `SELECT id, document_category AS category, requirement_id AS "requirementId",
                CASE WHEN status = 'ACTIVE' AND expiration_date < CURRENT_DATE
                     THEN 'EXPIRED' ELSE status END AS status,
                expiration_date::text AS "expirationDate"
         FROM employee_documents
         WHERE id = $1 AND employee_id = $2 AND file_data IS NOT NULL
         FOR UPDATE`,
        [documentId, employeeId],
      );
      const document = docs[0];
      if (!document)
        throw new NotFoundException('Uploaded document not found.');
      if (document.requirementId) {
        throw new BadRequestException(
          'This file is already attached to a document requirement.',
        );
      }
      if (
        document.status !== 'ACTIVE' ||
        (document.expirationDate &&
          String(document.expirationDate).slice(0, 10) <
            new Date().toISOString().slice(0, 10))
      ) {
        throw new BadRequestException(
          'Only active, unexpired files can satisfy a document requirement.',
        );
      }
      const requirements = await manager.query<
        Array<{ id: string; category: EmployeeDocumentRecord['category'] }>
      >(
        `SELECT id, category FROM employee_document_requirements
         WHERE id = $1 AND branch_id = $2 AND is_active = true`,
        [requirementId, branchId],
      );
      const requirement = requirements[0];
      if (!requirement) {
        throw new BadRequestException(
          'This document requirement is no longer active for the employee branch.',
        );
      }
      if (requirement.category !== document.category) {
        throw new BadRequestException(
          'The uploaded file type does not match this requirement.',
        );
      }
      const versions = await manager.query<Array<{ version: number }>>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM employee_documents WHERE employee_id = $1 AND requirement_id = $2`,
        [employeeId, requirementId],
      );
      const rows = await manager.query<EmployeeDocumentRecord[]>(
        `UPDATE employee_documents
         SET requirement_id = $3, version = $4
         WHERE id = $1 AND employee_id = $2
         RETURNING id, employee_id AS "employeeId",
                   requirement_id AS "requirementId",
                   document_category AS category, document_type AS "documentType",
                   file_name AS "fileName", file_size_bytes AS "fileSizeBytes",
                   mime_type AS "mimeType", file_data IS NOT NULL AS "hasFile",
                   uploaded_by AS "uploadedBy", expiration_date::text AS "expirationDate",
                   status, version, created_at AS "createdAt"`,
        [
          documentId,
          employeeId,
          requirementId,
          Number(versions[0]?.version ?? 1),
        ],
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'UPDATE', 'employee_documents', $4, now())`,
        [
          randomUUID(),
          actor.userId,
          branchId,
          JSON.stringify({
            employeeId,
            documentId,
            requirementId,
            action: 'ATTACH_EXISTING_FILE',
            ip: actor.ip,
            userAgent: actor.userAgent,
          }),
        ],
      );
      return rows[0];
    });
  }

  async getFile(
    employeeId: string,
    documentId: string,
  ): Promise<EmployeeDocumentFile | undefined> {
    const rows = await this.dataSource.query<EmployeeDocumentFile[]>(
      `SELECT file_name AS "fileName", mime_type AS "mimeType", file_data AS data
       FROM employee_documents
       WHERE employee_id = $1 AND id = $2 AND file_data IS NOT NULL`,
      [employeeId, documentId],
    );
    return rows[0];
  }

  async archiveDocument(
    employeeId: string,
    documentId: string,
    branchId: string,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeDocumentRecord> {
    return this.updateDocumentStatus(
      employeeId,
      documentId,
      branchId,
      actor,
      'ARCHIVED',
      'ARCHIVE',
    );
  }

  async restoreDocument(
    employeeId: string,
    documentId: string,
    branchId: string,
    actor: { userId: string; ip?: string; userAgent?: string },
  ): Promise<EmployeeDocumentRecord> {
    return this.updateDocumentStatus(
      employeeId,
      documentId,
      branchId,
      actor,
      'ACTIVE',
      'RESTORE',
    );
  }

  private async updateDocumentStatus(
    employeeId: string,
    documentId: string,
    branchId: string,
    actor: { userId: string; ip?: string; userAgent?: string },
    status: 'ACTIVE' | 'ARCHIVED',
    action: 'ARCHIVE' | 'RESTORE',
  ): Promise<EmployeeDocumentRecord> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<EmployeeDocumentRecord[]>(
        `UPDATE employee_documents
         SET status = $3
         WHERE id = $1 AND employee_id = $2
         RETURNING id, employee_id AS "employeeId",
                   document_category AS category, document_type AS "documentType",
                   requirement_id AS "requirementId",
                   file_name AS "fileName", file_size_bytes AS "fileSizeBytes",
                   mime_type AS "mimeType", file_data IS NOT NULL AS "hasFile",
                   uploaded_by AS "uploadedBy", expiration_date::text AS "expirationDate",
                   status, version, created_at AS "createdAt"`,
        [documentId, employeeId, status],
      );
      const document = rows[0];
      if (!document) throw new NotFoundException('Document not found.');

      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'UPDATE', 'employee_documents', $4, now())`,
        [
          randomUUID(),
          actor.userId,
          branchId,
          JSON.stringify({
            documentId,
            employeeId,
            fileName: document.fileName,
            action,
            ip: actor.ip,
            userAgent: actor.userAgent,
          }),
        ],
      );

      return {
        ...document,
        fileSizeBytes:
          document.fileSizeBytes === null
            ? null
            : Number(document.fileSizeBytes),
        expirationDate: document.expirationDate
          ? String(document.expirationDate).slice(0, 10)
          : null,
        version: Number(document.version),
      };
    });
  }

  private async writeRequirementAudit(
    manager: EntityManager,
    actor: { userId: string; ip?: string; userAgent?: string },
    branchId: string,
    action: 'CREATE' | 'UPDATE',
    details: Record<string, unknown>,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO audit_logs
         (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, $4, 'employee_document_requirements', $5, now())`,
      [
        randomUUID(),
        actor.userId,
        branchId,
        action,
        JSON.stringify({
          ...details,
          ip: actor.ip,
          userAgent: actor.userAgent,
        }),
      ],
    );
  }
}
