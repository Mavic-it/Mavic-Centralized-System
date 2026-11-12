import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { DEFAULT_DEPARTMENTS } from './default-departments.js';

export type Department = {
  id: string;
  branchId: string;
  name: string;
  createdAt: string;
};

@Injectable()
export class DepartmentService {
  private readonly memoryDepartments = new Map<string, Department>();
  private readonly initializedBranches = new Set<string>();

  private initializeDefaults(branchId: string) {
    if (this.initializedBranches.has(branchId)) return;
    this.initializedBranches.add(branchId);
    for (const name of DEFAULT_DEPARTMENTS) {
      const department = {
        id: randomUUID(),
        branchId,
        name,
        createdAt: new Date().toISOString(),
      };
      this.memoryDepartments.set(department.id, department);
    }
  }

  constructor(private readonly dataSource?: DataSource) {}

  async list(branchId: string): Promise<Department[]> {
    if (!this.dataSource) {
      this.initializeDefaults(branchId);
      return Array.from(this.memoryDepartments.values())
        .filter((department) => department.branchId === branchId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return this.dataSource.query<Department[]>(
      `SELECT id, branch_id AS "branchId", name, created_at AS "createdAt"
       FROM departments WHERE branch_id = $1 ORDER BY name ASC`,
      [branchId],
    );
  }

  async create(
    branchId: string,
    name: string,
    actorId: string,
  ): Promise<Department> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new ConflictException('Department name is required');
    }

    if (!this.dataSource) {
      this.initializeDefaults(branchId);
      const exists = Array.from(this.memoryDepartments.values()).some(
        (department) =>
          department.branchId === branchId &&
          department.name.toLocaleLowerCase() ===
            normalizedName.toLocaleLowerCase(),
      );
      if (exists) {
        throw new ConflictException('Department already exists in this branch');
      }
      const department = {
        id: randomUUID(),
        branchId,
        name: normalizedName,
        createdAt: new Date().toISOString(),
      };
      this.memoryDepartments.set(department.id, department);
      return department;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const branch = await manager.query<Array<{ id: string }>>(
          'SELECT id FROM branches WHERE id = $1',
          [branchId],
        );
        if (!branch[0]) throw new NotFoundException('Branch not found');
        const rows = await manager.query<Department[]>(
          `INSERT INTO departments (id, branch_id, name)
           VALUES ($1, $2, $3)
           RETURNING id, branch_id AS "branchId", name, created_at AS "createdAt"`,
          [randomUUID(), branchId, normalizedName],
        );
        const department = rows[0];
        await manager.query(
          `INSERT INTO audit_logs
             (id, user_id, branch_id, action, resource, details, created_at)
           VALUES ($1, $2, $3, 'DEPARTMENT_CREATED', $4, $5, now())`,
          [
            randomUUID(),
            actorId,
            branchId,
            `department:${department.id}`,
            JSON.stringify({
              entityType: 'department',
              entityId: department.id,
              previousValues: null,
              newValues: department,
            }),
          ],
        );
        return department;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Department already exists in this branch');
      }
      throw error;
    }
  }

  async update(
    branchId: string,
    departmentId: string,
    name: string,
    actorId: string,
  ): Promise<Department> {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new ConflictException('Department name is required');
    }

    if (!this.dataSource) {
      const current = this.memoryDepartments.get(departmentId);
      if (!current || current.branchId !== branchId) {
        throw new NotFoundException('Department not found');
      }
      const duplicate = Array.from(this.memoryDepartments.values()).some(
        (department) =>
          department.id !== departmentId &&
          department.branchId === branchId &&
          department.name.toLocaleLowerCase() ===
            normalizedName.toLocaleLowerCase(),
      );
      if (duplicate) {
        throw new ConflictException('Department already exists in this branch');
      }
      const updated = { ...current, name: normalizedName };
      this.memoryDepartments.set(departmentId, updated);
      return updated;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const currentRows = await manager.query<Department[]>(
          `SELECT id, branch_id AS "branchId", name,
                  created_at AS "createdAt"
           FROM departments WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
          [departmentId, branchId],
        );
        const current = currentRows[0];
        if (!current) throw new NotFoundException('Department not found');

        const updatedRows = await manager.query<Department[]>(
          `UPDATE departments SET name = $3
           WHERE id = $1 AND branch_id = $2
           RETURNING id, branch_id AS "branchId", name,
                     created_at AS "createdAt"`,
          [departmentId, branchId, normalizedName],
        );
        const updated = updatedRows[0];
        await manager.query(
          `UPDATE employees SET department = $3
           WHERE branch_id = $1 AND lower(trim(department)) = lower($2)`,
          [branchId, current.name, normalizedName],
        );
        await manager.query(
          `INSERT INTO audit_logs
             (id, user_id, branch_id, action, resource, details, created_at)
           VALUES ($1, $2, $3, 'DEPARTMENT_UPDATED', $4, $5, now())`,
          [
            randomUUID(),
            actorId,
            branchId,
            `department:${departmentId}`,
            JSON.stringify({
              entityType: 'department',
              entityId: departmentId,
              previousValues: current,
              newValues: updated,
            }),
          ],
        );
        return updated;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('Department already exists in this branch');
      }
      throw error;
    }
  }

  async delete(
    branchId: string,
    departmentId: string,
    actorId: string,
  ): Promise<Department> {
    if (!this.dataSource) {
      const current = this.memoryDepartments.get(departmentId);
      if (!current || current.branchId !== branchId) {
        throw new NotFoundException('Department not found');
      }
      this.memoryDepartments.delete(departmentId);
      return current;
    }

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<Department[]>(
        `SELECT id, branch_id AS "branchId", name,
                created_at AS "createdAt"
         FROM departments WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [departmentId, branchId],
      );
      const department = rows[0];
      if (!department) throw new NotFoundException('Department not found');

      const assignments = await manager.query<
        Array<{ count: number | string }>
      >(
        `SELECT count(*) AS count FROM employees
         WHERE branch_id = $1 AND lower(trim(department)) = lower($2)`,
        [branchId, department.name],
      );
      if (Number(assignments[0]?.count ?? 0) > 0) {
        throw new ConflictException(
          'This department is assigned to employees. Reassign them before deleting it.',
        );
      }

      await manager.query(
        'DELETE FROM departments WHERE id = $1 AND branch_id = $2',
        [departmentId, branchId],
      );
      await manager.query(
        `INSERT INTO audit_logs
           (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'DEPARTMENT_DELETED', $4, $5, now())`,
        [
          randomUUID(),
          actorId,
          branchId,
          `department:${departmentId}`,
          JSON.stringify({
            entityType: 'department',
            entityId: departmentId,
            previousValues: department,
            newValues: null,
          }),
        ],
      );
      return department;
    });
  }

  async hasName(branchId: string, name: string): Promise<boolean> {
    const normalizedName = name.trim();
    if (!this.dataSource) {
      this.initializeDefaults(branchId);
      return Array.from(this.memoryDepartments.values()).some(
        (department) =>
          department.branchId === branchId &&
          department.name.toLocaleLowerCase() ===
            normalizedName.toLocaleLowerCase(),
      );
    }
    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM departments
         WHERE branch_id = $1 AND lower(name) = lower($2)
       ) AS exists`,
      [branchId, normalizedName],
    );
    return rows[0]?.exists === true;
  }
}
