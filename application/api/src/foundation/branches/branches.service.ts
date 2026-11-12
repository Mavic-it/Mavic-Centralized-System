import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { EmployeeService, type EmployeeEmployment } from '../../hr/employees/employee.service.js';
import { seedDefaultDepartments } from './default-departments.js';

export type BranchStatus = 'ACTIVE' | 'INACTIVE';

export type AccessibleBranch = { id: string; name: string };

export type Branch = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string;
  city: string;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  managerUserId: string | null;
  latitude: number | null;
  longitude: number | null;
  status: BranchStatus;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BranchWithStats = Branch & {
  employeeCount: number;
  roomCount: number;
  reservationCount: number;
  inquiryCount: number;
  inventoryItemCount: number;
};

export type BranchListFilter = {
  status?: BranchStatus | 'ALL';
  search?: string;
  branchId?: string;
  branchIds?: string[];
  page?: number;
  pageSize?: number;
};

export type CreateBranchInput = {
  code: string;
  name: string;
  description?: string | null;
  address: string;
  city: string;
  province?: string | null;
  postalCode?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  managerUserId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  status?: BranchStatus;
};

export type UpdateBranchInput = Partial<Omit<CreateBranchInput, 'code'>>;

export type BranchListResult = {
  items: BranchWithStats[];
  total: number;
  page: number;
  pageSize: number;
};

type BranchRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  managerName: string | null;
  managerUserId: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  status: BranchStatus;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  employeeCount?: string | number;
  roomCount?: string | number;
  reservationCount?: string | number;
  inquiryCount?: string | number;
  inventoryItemCount?: string | number;
};

const branchSelect = `
  SELECT
    b.id,
    b.code,
    b.name,
    b.description,
    b.address,
    b.city,
    b.province,
    b.postal_code AS "postalCode",
    b.phone,
    b.email,
    COALESCE(manager_user.name, b.manager_name) AS "managerName",
    b.manager_user_id AS "managerUserId",
    b.latitude,
    b.longitude,
    b.status,
    b.is_active AS "isActive",
    b.created_at AS "createdAt",
    b.updated_at AS "updatedAt",
    (SELECT COUNT(*) FROM employees e WHERE e.branch_id = b.id)::int AS "employeeCount",
    (SELECT COUNT(*) FROM rooms r WHERE r.branch_id = b.id)::int AS "roomCount",
    (SELECT COUNT(*) FROM reservations rs WHERE rs.branch_id = b.id)::int AS "reservationCount",
    (SELECT COUNT(*) FROM inquiries i WHERE i.branch_id = b.id)::int AS "inquiryCount",
    (SELECT COUNT(*) FROM inventory_items ii WHERE ii.branch_id = b.id)::int AS "inventoryItemCount"
  FROM branches b
  LEFT JOIN users manager_user ON manager_user.id = b.manager_user_id`;

export type AdminBranchAccess = {
  mode: 'ASSIGNED' | 'SELECTED' | 'ALL';
  branchIds: string[];
};

@Injectable()
export class BranchService {
  private readonly memoryAccess = new Map<string, AdminBranchAccess>();
  private readonly memoryBranches = new Map<string, Branch>();

  constructor(private readonly dataSource?: DataSource) {}

  async getAdminBranchAccess(userId: string): Promise<AdminBranchAccess> {
    if (!this.dataSource)
      return (
        this.memoryAccess.get(userId) ?? { mode: 'ASSIGNED', branchIds: [] }
      );
    const [row] = await this.dataSource.query<AdminBranchAccess[]>(
      `SELECT mode, branch_ids AS "branchIds" FROM employee_branch_access WHERE user_id=$1`,
      [userId],
    );
    return row ?? { mode: 'ASSIGNED', branchIds: [] };
  }
  async saveAdminBranchAccess(
    userId: string,
    access: AdminBranchAccess,
    actorId: string,
  ) {
    const ids = [...new Set(access.branchIds)];
    if (access.mode === 'SELECTED' ? !ids.length : ids.length > 0)
      throw new BadRequestException(
        'Choose at least one branch for selected access; other modes cannot include branch IDs.',
      );
    if (!this.dataSource) {
      if (ids.some((id) => this.memoryBranches.get(id)?.status !== 'ACTIVE'))
        throw new BadRequestException('Select active branches only.');
      this.memoryAccess.set(userId, { ...access, branchIds: ids });
      return;
    }
    await this.dataSource.transaction(async (manager) => {
      const [target] = await manager.query<{ role: string; employeeId?: string }[]>(
        `SELECT role,employee_id AS "employeeId" FROM users WHERE id=$1`,
        [userId],
      );
      if (!target || !['HR_ADMIN', 'BRANCH_MANAGER'].includes(target.role))
        throw new BadRequestException(
          'Branch access settings apply to HR administrators and branch managers.',
        );
      const branches = await manager.query<{ id: string }[]>(
        `SELECT id FROM branches WHERE id=ANY($1::text[]) AND status='ACTIVE' FOR SHARE`,
        [ids],
      );
      if (branches.length !== ids.length)
        throw new BadRequestException('Select active branches only.');
      const [before] = await manager.query(
        `SELECT mode,branch_ids AS "branchIds" FROM employee_branch_access WHERE user_id=$1`,
        [userId],
      );
      if (target.employeeId) {
        // Lock employee before account, matching transfers and role changes.
        const employeeRows = await manager.query<{ branchId: string }[]>(
          'SELECT branch_id AS "branchId" FROM employees WHERE id=$1 FOR UPDATE', [target.employeeId]);
        const primary = employeeRows[0]?.branchId;
        if (!primary) throw new BadRequestException('Linked employee not found.');
        const [locked] = await manager.query<{ employeeId: string }[]>(
          'SELECT employee_id AS "employeeId" FROM users WHERE id=$1 FOR UPDATE', [userId]);
        if (locked?.employeeId !== target.employeeId) throw new BadRequestException('Employee link changed. Refresh and retry.');
        const employeeService = new EmployeeService(this.dataSource);
        const [employee] = await manager.query<{ employment: EmployeeEmployment }[]>(
          'SELECT employment FROM employees WHERE id=$1', [target.employeeId]);
        if (!employee) throw new BadRequestException('Linked employee not found.');
        await employeeService.updateEmployee(target.employeeId, {
          employment: { ...employee.employment, allWorkBranches: access.mode === 'ALL',
            workBranchIds: access.mode === 'ALL' ? [] : access.mode === 'ASSIGNED' ? [primary] : ids },
        }, { userId: actorId }, manager);
      } else {
        await manager.query(
          `INSERT INTO user_branch_access(user_id,mode,branch_ids,updated_by) VALUES($1,$2,$3::text[],$4) ON CONFLICT(user_id) DO UPDATE SET mode=EXCLUDED.mode,branch_ids=EXCLUDED.branch_ids,updated_by=EXCLUDED.updated_by,updated_at=now()`,
          [userId, access.mode, ids, actorId],
        );
      }
      await manager.query(
        `INSERT INTO audit_logs(id,user_id,action,resource,details,created_at) VALUES($1,$2,'UPDATE','user_branch_access',$3::jsonb,now())`,
        [
          randomUUID(),
          actorId,
          JSON.stringify({
            targetUserId: userId,
            before: before ?? null,
            after: { ...access, branchIds: ids },
          }),
        ],
      );
    });
  }
  async listAllActiveBranches(): Promise<AccessibleBranch[]> {
    if (!this.dataSource)
      return [...this.memoryBranches.values()]
        .filter((b) => b.status === 'ACTIVE')
        .map(({ id, name }) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return this.dataSource.query<AccessibleBranch[]>(
      `SELECT id,name FROM branches WHERE status='ACTIVE' ORDER BY name`,
    );
  }
  async listAccessibleBranches(
    userId: string,
    primaryBranchId: string | undefined,
    _role: string,
  ): Promise<AccessibleBranch[]> {
    const access = await this.getAdminBranchAccess(userId);
    if (access.mode === 'ALL') return this.listAllActiveBranches();
    if (access.mode === 'SELECTED')
      return (await this.listAllActiveBranches()).filter((branch) =>
        access.branchIds.includes(branch.id),
      );
    if (!this.dataSource) {
      return Array.from(this.memoryBranches.values())
        .filter(
          (branch) =>
            branch.status === 'ACTIVE' &&
            (branch.id === primaryBranchId || branch.managerUserId === userId),
        )
        .sort((left, right) => left.name.localeCompare(right.name))
        .map(({ id, name }) => ({ id, name }));
    }
    return this.dataSource.query<AccessibleBranch[]>(
      `SELECT id, name FROM branches
       WHERE status = 'ACTIVE' AND (id = $2 OR manager_user_id = $1)
       ORDER BY name ASC`,
      [userId, primaryBranchId ?? null],
    );
  }

  async create(input: CreateBranchInput, actorId?: string): Promise<Branch> {
    const code = this.normalizeCode(input.code);
    this.assertCoordinates(input.latitude, input.longitude);
    if (!this.dataSource) {
      if (
        Array.from(this.memoryBranches.values()).some(
          (branch) => branch.code === code,
        )
      ) {
        throw new ConflictException('Branch code already exists');
      }
      const now = new Date().toISOString();
      const branch = this.normalizeBranch({
        id: randomUUID(),
        ...input,
        code,
        description: this.nullable(input.description),
        province: this.nullable(input.province),
        postalCode: this.nullable(input.postalCode),
        phone: this.nullable(input.phone),
        email: this.nullable(input.email),
        managerName: this.nullable(input.managerName),
        managerUserId: input.managerUserId ?? null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        status: input.status ?? 'ACTIVE',
        isActive: (input.status ?? 'ACTIVE') === 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      });
      this.memoryBranches.set(branch.id, branch);
      return branch;
    }

    const id = randomUUID();
    const status = input.status ?? 'ACTIVE';
    try {
      return await this.dataSource.transaction(async (manager) => {
        const rows = await manager.query<BranchRow[]>(
          `INSERT INTO branches (
             id, code, name, description, address, city, province, postal_code,
             phone, email, manager_name, manager_user_id, latitude, longitude, status, is_active, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL, $12, $13, $14, $15, now(), now())
           RETURNING id, code, name, description, address, city, province,
             postal_code AS "postalCode", phone, email,
             manager_name AS "managerName", manager_user_id AS "managerUserId", latitude, longitude, status, is_active AS "isActive",
             created_at AS "createdAt", updated_at AS "updatedAt"`,
          [
            id,
            code,
            input.name.trim(),
            this.nullable(input.description),
            input.address.trim(),
            input.city.trim(),
            this.nullable(input.province),
            this.nullable(input.postalCode),
            this.nullable(input.phone),
            this.nullable(input.email)?.toLowerCase() ?? null,
            this.nullable(input.managerName),
            input.latitude ?? null,
            input.longitude ?? null,
            status,
            status === 'ACTIVE',
          ],
        );
        let branch: Branch = this.normalizeBranch(rows[0]);
        await seedDefaultDepartments(manager, id);
        if (input.managerUserId) {
          const managerUser = await this.assignManagerUser(
            manager,
            id,
            input.managerUserId,
            actorId,
          );
          await manager.query(
            `UPDATE branches SET manager_user_id = $2, manager_name = $3,
               updated_at = now() WHERE id = $1`,
            [id, managerUser.id, managerUser.name],
          );
          const refreshed = await this.findInManager(manager, id);
          if (!refreshed) throw new NotFoundException('Branch not found');
          branch = refreshed;
        }
        await this.writeAudit(
          manager,
          actorId,
          'BRANCH_CREATED',
          branch.id,
          null,
          branch,
        );
        return branch;
      });
    } catch (error) {
      this.rethrowCodeConflict(error);
    }
  }

  async list(filter: BranchListFilter = {}): Promise<BranchListResult> {
    if (!this.dataSource) {
      const all = Array.from(this.memoryBranches.values()).filter((branch) => {
        const search = filter.search?.trim().toLowerCase();
        const matchesSearch =
          !search ||
          [branch.code, branch.name, branch.city, branch.managerName].some(
            (value) => value?.toLowerCase().includes(search),
          );
        return (
          matchesSearch &&
          (!filter.branchId || branch.id === filter.branchId) &&
          (filter.branchIds === undefined ||
            filter.branchIds.includes(branch.id)) &&
          (!filter.status ||
            filter.status === 'ALL' ||
            branch.status === filter.status)
        );
      });
      const page = filter.page ?? 1;
      const pageSize = filter.pageSize ?? 20;
      return {
        items: all
          .sort((left, right) => left.name.localeCompare(right.name))
          .slice((page - 1) * pageSize, page * pageSize)
          .map((branch) => this.withEmptyStats(branch)),
        total: all.length,
        page,
        pageSize,
      };
    }

    const { where, parameters } = this.buildWhere(filter);
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const offset = (page - 1) * pageSize;
    const [rows, countRows] = await Promise.all([
      this.dataSource.query<BranchRow[]>(
        `${branchSelect} ${where} ORDER BY b.name ASC LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
        [...parameters, pageSize, offset],
      ),
      this.dataSource.query<Array<{ total: string | number }>>(
        `SELECT COUNT(*)::int AS total FROM branches b
         LEFT JOIN users manager_user ON manager_user.id = b.manager_user_id
         ${where}`,
        parameters,
      ),
    ]);

    return {
      items: rows.map((row) => this.normalizeBranch(row, true)),
      total: Number(countRows[0]?.total ?? 0),
      page,
      pageSize,
    };
  }

  async findById(id: string): Promise<BranchWithStats | undefined> {
    if (!this.dataSource) {
      const branch = this.memoryBranches.get(id);
      return branch ? this.withEmptyStats(branch) : undefined;
    }
    const rows = await this.dataSource.query<BranchRow[]>(
      `${branchSelect} WHERE b.id = $1`,
      [id],
    );
    return rows[0] ? this.normalizeBranch(rows[0], true) : undefined;
  }

  async update(
    id: string,
    input: UpdateBranchInput,
    actorId?: string,
  ): Promise<Branch> {
    this.assertCoordinates(input.latitude, input.longitude);
    if (!this.dataSource) {
      const current = this.memoryBranches.get(id);
      if (!current) throw new NotFoundException('Branch not found');
      const updated = this.normalizeBranch({
        ...current,
        ...input,
        id,
        code: current.code,
        updatedAt: new Date().toISOString(),
      });
      this.memoryBranches.set(id, updated);
      return updated;
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findInManager(manager, id);
      if (!existing) throw new NotFoundException('Branch not found');
      let effectiveInput = input;
      if (input.managerUserId !== undefined) {
        const managerUser = input.managerUserId
          ? await this.assignManagerUser(
              manager,
              id,
              input.managerUserId,
              actorId,
              input.managerUserId === existing.managerUserId,
            )
          : null;
        effectiveInput = {
          ...input,
          managerName: managerUser?.name ?? input.managerName ?? null,
        };
      }
      const update = this.buildUpdate(effectiveInput);
      if (input.managerUserId !== undefined) {
        update.assignments.push(
          `manager_user_id = $${update.values.length + 1}`,
        );
        update.values.push(input.managerUserId || null);
      }
      if (update.assignments.length === 0) return existing;
      await manager.query(
        `UPDATE branches SET ${update.assignments.join(', ')}, updated_at = now()
         WHERE id = $${update.values.length + 1}`,
        [...update.values, id],
      );
      const branch = await this.findInManager(manager, id);
      if (!branch) throw new NotFoundException('Branch not found');
      await this.writeAudit(
        manager,
        actorId,
        'BRANCH_UPDATED',
        id,
        existing,
        branch,
      );
      return branch;
    });
  }

  async setStatus(
    id: string,
    status: BranchStatus,
    actorId?: string,
  ): Promise<Branch> {
    if (!this.dataSource) {
      const current = this.memoryBranches.get(id);
      if (!current) throw new NotFoundException('Branch not found');
      const updated = {
        ...current,
        status,
        isActive: status === 'ACTIVE',
        updatedAt: new Date().toISOString(),
      };
      this.memoryBranches.set(id, updated);
      return updated;
    }

    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findInManager(manager, id);
      if (!existing) throw new NotFoundException('Branch not found');
      await manager.query(
        `UPDATE branches SET status = $1, is_active = $2, updated_at = now()
         WHERE id = $3`,
        [status, status === 'ACTIVE', id],
      );
      const branch = await this.findInManager(manager, id);
      if (!branch) throw new NotFoundException('Branch not found');
      const action =
        status === 'ACTIVE' ? 'BRANCH_ACTIVATED' : 'BRANCH_DEACTIVATED';
      await this.writeAudit(manager, actorId, action, id, existing, branch);
      return branch;
    });
  }

  async findActiveById(id: string): Promise<Branch | undefined> {
    const branch = await this.findById(id);
    return branch?.status === 'ACTIVE' ? branch : undefined;
  }

  async delete(id: string, actorId: string): Promise<Branch> {
    if (!this.dataSource) {
      const branch = this.memoryBranches.get(id);
      if (!branch) throw new NotFoundException('Branch not found');
      this.memoryBranches.delete(id);
      return branch;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        const branch = await this.findInManager(manager, id);
        if (!branch) throw new NotFoundException('Branch not found');

        const relatedTables = await this.findRelatedTables(manager, id);
        if (relatedTables.length > 0) {
          throw new ConflictException(
            'Branch cannot be deleted because it contains related records. Deactivate the branch instead.',
          );
        }

        await manager.query(
          'UPDATE audit_logs SET branch_id = NULL WHERE branch_id = $1',
          [id],
        );
        await this.writeDeletionAudit(manager, actorId, branch);
        await manager.query('DELETE FROM branches WHERE id = $1', [id]);
        return branch;
      });
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new ConflictException(
          'Branch cannot be deleted because it contains related records. Deactivate the branch instead.',
        );
      }
      throw error;
    }
  }

  private async assignManagerUser(
    manager: EntityManager,
    branchId: string,
    userId: string,
    actorId: string | undefined,
    allowInactiveCurrentAssignment = false,
  ): Promise<{ id: string; name: string }> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
      userId,
    ]);
    const rows = await manager.query<
      Array<{
        id: string;
        name: string;
        role: string;
        status: string;
        branchId: string | null;
        employeeId: string | null;
      }>
    >(
      `SELECT id, name, role, status, branch_id AS "branchId",
              employee_id AS "employeeId"
       FROM users WHERE id = $1 FOR UPDATE`,
      [userId],
    );
    const user = rows[0];
    if (
      !user ||
      !['BRANCH_MANAGER', 'HR_ADMIN'].includes(user.role) ||
      !user.employeeId
    ) {
      throw new BadRequestException(
        'Select an employee-linked account with the HR Admin or Branch Manager role.',
      );
    }
    if (user.status !== 'ACTIVE' && !allowInactiveCurrentAssignment) {
      throw new BadRequestException(
        'The selected manager account is inactive.',
      );
    }
    if (!user.branchId && user.role === 'BRANCH_MANAGER') {
      await manager.query('UPDATE users SET branch_id = $2 WHERE id = $1', [
        user.id,
        branchId,
      ]);
      if (!actorId)
        throw new Error('Audit actor is required for manager assignment');
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'BRANCH_MANAGER_SCOPE_ASSIGNED', $4, $5, now())`,
        [
          randomUUID(),
          actorId,
          branchId,
          `user:${user.id}`,
          JSON.stringify({
            entityType: 'user',
            entityId: user.id,
            changedFields: ['branchId'],
            previousValues: { branchId: null },
            newValues: { branchId },
          }),
        ],
      );
    }
    return { id: user.id, name: user.name };
  }

  private async findInManager(
    manager: EntityManager,
    id: string,
  ): Promise<Branch | undefined> {
    const rows = await manager.query<BranchRow[]>(
      `SELECT b.id, b.code, b.name, b.description, b.address, b.city, b.province,
         b.postal_code AS "postalCode", b.phone, b.email,
         COALESCE(manager_user.name, b.manager_name) AS "managerName",
         b.manager_user_id AS "managerUserId",
         b.latitude, b.longitude,
         b.status, b.is_active AS "isActive", b.created_at AS "createdAt", b.updated_at AS "updatedAt"
       FROM branches b
       LEFT JOIN users manager_user ON manager_user.id = b.manager_user_id
       WHERE b.id = $1 FOR UPDATE OF b`,
      [id],
    );
    return rows[0] ? this.normalizeBranch(rows[0]) : undefined;
  }

  private async writeAudit(
    manager: EntityManager,
    actorId: string | undefined,
    action: string,
    branchId: string,
    previousValues: Branch | null,
    newValues: Branch,
  ): Promise<void> {
    if (!actorId) throw new Error('Audit actor is required for branch changes');
    await manager.query(
      `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [
        randomUUID(),
        actorId,
        branchId,
        action,
        `branch:${branchId}`,
        JSON.stringify({
          entityType: 'branch',
          entityId: branchId,
          previousValues,
          newValues,
        }),
      ],
    );
  }

  private async writeDeletionAudit(
    manager: EntityManager,
    actorId: string,
    branch: Branch,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
       VALUES ($1, $2, NULL, 'BRANCH_DELETED', $3, $4, now())`,
      [
        randomUUID(),
        actorId,
        `branch:${branch.id}`,
        JSON.stringify({
          entityType: 'branch',
          entityId: branch.id,
          previousValues: branch,
          newValues: null,
        }),
      ],
    );
  }

  private async findRelatedTables(
    manager: EntityManager,
    branchId: string,
  ): Promise<string[]> {
    const columns = await manager.query<
      Array<{ schemaName: string; tableName: string; columnName: string }>
    >(`
      SELECT namespace.nspname AS "schemaName",
             relation.relname AS "tableName",
             attribute.attname AS "columnName"
      FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      JOIN pg_attribute attribute ON attribute.attrelid = relation.oid
      WHERE relation.relkind IN ('r', 'p')
        AND attribute.attname = 'branch_id'
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
        AND namespace.nspname NOT IN ('pg_catalog', 'information_schema')
        AND relation.relname <> 'branches'
    `);
    const relatedTables: string[] = [];

    for (const column of columns) {
      if (column.tableName === 'audit_logs') continue;
      const matches = await manager.query<Array<{ exists: boolean }>>(
        `SELECT EXISTS (
           SELECT 1 FROM ${this.quoteIdentifier(column.schemaName)}.${this.quoteIdentifier(column.tableName)}
           WHERE ${this.quoteIdentifier(column.columnName)} = $1
         ) AS exists`,
        [branchId],
      );
      if (matches[0]?.exists) relatedTables.push(column.tableName);
    }

    return relatedTables;
  }

  private buildWhere(filter: BranchListFilter): {
    where: string;
    parameters: unknown[];
  } {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    if (filter.status && filter.status !== 'ALL') {
      parameters.push(filter.status);
      conditions.push(`b.status = $${parameters.length}`);
    }
    if (filter.branchId) {
      parameters.push(filter.branchId);
      conditions.push(`b.id = $${parameters.length}`);
    }
    if (filter.branchIds !== undefined) {
      parameters.push(filter.branchIds);
      conditions.push(`b.id = ANY($${parameters.length}::text[])`);
    }
    if (filter.search?.trim()) {
      parameters.push(`%${filter.search.trim()}%`);
      const index = parameters.length;
      conditions.push(
        `(b.code ILIKE $${index} OR b.name ILIKE $${index} OR COALESCE(b.city, '') ILIKE $${index} OR COALESCE(manager_user.name, b.manager_name, '') ILIKE $${index})`,
      );
    }
    return {
      where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
      parameters,
    };
  }

  private buildUpdate(input: UpdateBranchInput): {
    assignments: string[];
    values: unknown[];
  } {
    const columns: Array<[keyof UpdateBranchInput, string]> = [
      ['name', 'name'],
      ['description', 'description'],
      ['address', 'address'],
      ['city', 'city'],
      ['province', 'province'],
      ['postalCode', 'postal_code'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['managerName', 'manager_name'],
      ['latitude', 'latitude'],
      ['longitude', 'longitude'],
    ];
    const assignments: string[] = [];
    const values: unknown[] = [];
    for (const [key, column] of columns) {
      if (input[key] === undefined) continue;
      const value = input[key];
      values.push(typeof value === 'string' ? value.trim() || null : value);
      assignments.push(`${column} = $${values.length}`);
    }
    if (input.status !== undefined) {
      values.push(input.status);
      assignments.push(`status = $${values.length}`);
      values.push(input.status === 'ACTIVE');
      assignments.push(`is_active = $${values.length}`);
    }
    if (input.email !== undefined) {
      const emailIndex = columns.findIndex(([key]) => key === 'email');
      const valueIndex =
        columns
          .slice(0, emailIndex + 1)
          .filter(([key]) => input[key] !== undefined).length - 1;
      if (valueIndex >= 0 && typeof values[valueIndex] === 'string') {
        values[valueIndex] = (values[valueIndex] as string).toLowerCase();
      }
    }
    return { assignments, values };
  }

  private normalizeBranch(row: BranchRow, withStats = false): BranchWithStats {
    const status = row.status ?? (row.isActive ? 'ACTIVE' : 'INACTIVE');
    const branch: Branch = {
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description ?? null,
      address: row.address ?? '',
      city: row.city ?? '',
      province: row.province ?? null,
      postalCode: row.postalCode ?? null,
      phone: row.phone ?? null,
      email: row.email ?? null,
      managerName: row.managerName ?? null,
      managerUserId: row.managerUserId ?? null,
      latitude: row.latitude == null ? null : Number(row.latitude),
      longitude: row.longitude == null ? null : Number(row.longitude),
      status,
      isActive: status === 'ACTIVE',
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    };
    return withStats
      ? this.withStats(branch, row)
      : this.withEmptyStats(branch);
  }

  private withStats(branch: Branch, row: BranchRow): BranchWithStats {
    return {
      ...branch,
      employeeCount: Number(row.employeeCount ?? 0),
      roomCount: Number(row.roomCount ?? 0),
      reservationCount: Number(row.reservationCount ?? 0),
      inquiryCount: Number(row.inquiryCount ?? 0),
      inventoryItemCount: Number(row.inventoryItemCount ?? 0),
    };
  }

  private withEmptyStats(branch: Branch): BranchWithStats {
    return {
      ...branch,
      employeeCount: 0,
      roomCount: 0,
      reservationCount: 0,
      inquiryCount: 0,
      inventoryItemCount: 0,
    };
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private nullable(value: string | null | undefined): string | null {
    return typeof value === 'string' ? value.trim() || null : null;
  }

  private assertCoordinates(
    latitude: number | null | undefined,
    longitude: number | null | undefined,
  ): void {
    if ((latitude == null) !== (longitude == null)) {
      throw new BadRequestException(
        'Latitude and longitude must be provided together',
      );
    }
    if (
      (latitude != null &&
        (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
      (longitude != null &&
        (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))
    ) {
      throw new BadRequestException('Location coordinates are invalid');
    }
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replaceAll('"', '""')}"`;
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23503'
    );
  }

  private rethrowCodeConflict(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23505'
    ) {
      throw new ConflictException('Branch code already exists');
    }
    throw error;
  }
}
