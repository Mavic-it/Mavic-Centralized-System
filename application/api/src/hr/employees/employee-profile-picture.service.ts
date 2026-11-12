import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';

export type EmployeeProfilePicture = {
  mimeType: string;
  data: Buffer;
  updatedAt: string;
};

export class EmployeeProfilePictureService {
  constructor(private readonly dataSource: DataSource) {}

  async get(employeeId: string): Promise<EmployeeProfilePicture | undefined> {
    const rows = await this.dataSource.query<EmployeeProfilePicture[]>(
      `SELECT mime_type AS "mimeType", file_data AS data,
              updated_at AS "updatedAt"
       FROM employee_profile_pictures WHERE employee_id = $1`,
      [employeeId],
    );
    return rows[0];
  }

  async save(
    employeeId: string,
    branchId: string,
    uploadedBy: string,
    mimeType: string,
    data: Buffer,
  ): Promise<{ updatedAt: string }> {
    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Array<{ updatedAt: string }>>(
        `INSERT INTO employee_profile_pictures
           (employee_id, mime_type, file_data, uploaded_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (employee_id) DO UPDATE
         SET mime_type = EXCLUDED.mime_type,
             file_data = EXCLUDED.file_data,
             uploaded_by = EXCLUDED.uploaded_by,
             updated_at = now()
         RETURNING updated_at AS "updatedAt"`,
        [employeeId, mimeType, data, uploadedBy],
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'PROFILE_PICTURE_UPDATED', $4, $5, now())`,
        [
          randomUUID(),
          uploadedBy,
          branchId,
          `employee:${employeeId}:profile-picture`,
          JSON.stringify({ employeeId, mimeType, sizeBytes: data.byteLength }),
        ],
      );
      return rows[0];
    });
  }
}
