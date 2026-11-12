import { BadRequestException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  workScheduleValidationError,
  type WorkScheduleDefinition,
} from '../attendance/attendance.types.js';

import {
  EMPLOYEE_STATUSES,
  validateEmployment,
  type EmploymentType,
} from './employee-options.js';

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export type EmployeeEmployment = {
  workBranchIds?: string[];
  allWorkBranches?: boolean;
  employeeType: EmploymentType;
  startDate: string;
  endDate?: string;
  probationEndDate?: string | null;
  evaluationDueDate?: string | null;
};

export type EmployeeEmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type EmployeeRecord = {
  id: string;
  employeeNumber: string;
  branchId: string;
  name: string;
  email: string;
  position: string;
  department: string;
  departmentId?: string | null;
  status: EmployeeStatus;
  employment: EmployeeEmployment;
  emergencyContact?: EmployeeEmergencyContact;
  governmentIds?: string[];
  documents?: string[];
  salary?: number;
  branchName?: string | null;
  workBranches?: { id: string; name: string }[];
  profilePictureUpdatedAt?: string | null;
  hasUserAccount?: boolean;
  phone?: string | null;
  manager?: string | null;
  managerEmployeeId?: string | null;
  positionId?: string | null;
  attendance?: Array<{
    date: string;
    shift: string;
    timeIn: string;
    timeOut: string;
  }>;
};

export type EmployeeAssignmentEventType =
  'INITIAL' | 'TRANSFER' | 'PROMOTION' | 'STATUS_CHANGE' | 'ASSIGNMENT_CHANGE';

export type EmployeeAssignmentHistory = {
  workBranchIds?: string[];
  allWorkBranches?: boolean;
  id: string;
  employeeId: string;
  branchId: string;
  branchName: string;
  departmentId: string | null;
  department: string;
  positionId: string | null;
  position: string;
  manager: string | null;
  managerEmployeeId: string | null;
  employmentType: EmployeeEmployment['employeeType'];
  status: EmployeeStatus;
  eventType: EmployeeAssignmentEventType;
  effectiveDate: string | null;
  changedBy: string | null;
  changedByName?: string | null;
  recordedAt: string;
};

export type EmployeeChangeActor = {
  userId?: string;
  role?: string;
  ip?: string;
  userAgent?: string;
  effectiveDate?: string;
};

export type CreateEmployeeInput = Omit<
  EmployeeRecord,
  'id' | 'employeeNumber'
> & {
  workSchedule?: WorkScheduleDefinition;
};
export type EmployeeDocumentInput = {
  label: string;
  kind: string;
  updated: string;
  fileName: string;
};

export class EmployeeService {
  private employees = new Map<string, EmployeeRecord>();
  private assignmentHistory = new Map<string, EmployeeAssignmentHistory[]>();

  constructor(private readonly dataSource?: DataSource) {}

  create(input: EmployeeRecord): EmployeeRecord {
    this.employees.set(input.id, input);
    this.assignmentHistory.set(input.id, [
      this.toHistoryEvent(
        input,
        'INITIAL',
        input.employment.startDate,
        undefined,
      ),
    ]);
    return input;
  }

  async createEmployee(
    input: CreateEmployeeInput,
    actor: EmployeeChangeActor = {},
  ): Promise<EmployeeRecord> {
    input = { ...input, employment: {
      workBranchIds: input.employment.allWorkBranches ? [] : [input.branchId], allWorkBranches: false, ...input.employment,
    } };
    validateEmployment(input.employment);
    const id = randomUUID();
    const employee: EmployeeRecord = { ...input, id, employeeNumber: '' };
    if (!this.dataSource) {
      await this.validateWorkBranches(undefined, input.branchId, input.employment);
      employee.employeeNumber = `EMP${String(this.employees.size + 1).padStart(3, '0')}`;
      this.employees.set(id, employee);
      this.assignmentHistory.set(id, [
        this.toHistoryEvent(
          employee,
          'INITIAL',
          input.employment.startDate,
          actor.userId,
        ),
      ]);
      return employee;
    }
    return this.dataSource.transaction(async (manager) => {
      await this.validateWorkBranches(manager, input.branchId, input.employment);
      if (input.workSchedule) {
        const scheduleError = workScheduleValidationError(input.workSchedule);
        if (scheduleError) throw new BadRequestException(scheduleError);
      }
      const workSchedule =
        input.workSchedule ??
        (await this.getBranchSchedule(manager, input.branchId));
      if (!workSchedule) {
        throw new BadRequestException(
          'Configure a branch attendance schedule or assign an employee schedule before creating this employee.',
        );
      }
      const supervisor = await this.resolveSupervisor(
        manager,
        input.branchId,
        undefined,
        input.managerEmployeeId,
        input.manager,
      );
      const departmentId = await this.requireDepartmentId(
        manager,
        input.branchId,
        input.department,
      );
      const positionId = await this.resolvePositionId(manager, input.position);
      const rows = await manager.query<EmployeeRecord[]>(
        `INSERT INTO employees
         (id, employee_number, branch_id, name, email, position, department, status, employment, emergency_contact, government_ids, documents, salary, phone, manager_name, manager_employee_id, department_id, position_id)
       VALUES ($1, 'EMP' || lpad(nextval('employee_number_seq')::text, 3, '0'), $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, $14, $15, $16, $17)
       RETURNING id, employee_number AS "employeeNumber", branch_id AS "branchId", name, email, position, department,
                 status, employment, emergency_contact AS "emergencyContact",
                 government_ids AS "governmentIds", documents, salary, phone,
                 manager_name AS "manager", manager_employee_id AS "managerEmployeeId",
                 department_id AS "departmentId",
                 position_id AS "positionId"`,
        [
          id,
          input.branchId,
          input.name,
          input.email,
          input.position,
          input.department,
          input.status,
          JSON.stringify(input.employment),
          JSON.stringify(input.emergencyContact ?? null),
          JSON.stringify(input.governmentIds ?? []),
          JSON.stringify(input.documents ?? []),
          input.salary ?? null,
          input.phone ?? null,
          supervisor.name,
          supervisor.id,
          departmentId,
          positionId,
        ],
      );
      const created = this.normalize(rows[0]);
      await this.insertEmployeeWorkSchedule(
        manager,
        created.id,
        created.branchId,
        input.employment.startDate,
        workSchedule,
        actor.userId,
      );
      await this.insertAssignmentEvent(
        manager,
        created,
        'INITIAL',
        created.employment.startDate,
        actor,
      );
      if (actor.userId) {
        await manager.query(
          `INSERT INTO audit_logs
             (id, user_id, branch_id, action, resource, details, created_at)
           VALUES ($1, $2, $3, 'CREATE', 'employee_assignment_history', $4, now())`,
          [
            randomUUID(),
            actor.userId,
            created.branchId,
            JSON.stringify({
              employeeId: created.id,
              eventType: 'INITIAL',
              after: this.assignmentSnapshot(created),
              ip: actor.ip,
              userAgent: actor.userAgent,
            }),
          ],
        );
      }
      return created;
    });
  }

  async updateEmployee(
    id: string,
    input: Partial<CreateEmployeeInput>,
    actor: EmployeeChangeActor = {},
    transactionManager?: EntityManager,
  ): Promise<EmployeeRecord | undefined> {
    // Nest's transformed DTO can include omitted properties with undefined values.
    const updates = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ) as Partial<CreateEmployeeInput>;
    if (!this.dataSource) {
      const current = await this.findById(id);
      if (!current) return undefined;
      const next = this.mergeEmployee(current, updates);
      await this.validateWorkBranches(undefined, next.branchId, next.employment);
      const eventType = this.assignmentEventType(current, next);
      if (eventType) {
        const events = this.assignmentHistory.get(id) ?? [];
        events.push(
          this.toHistoryEvent(
            next,
            eventType,
            actor.effectiveDate,
            actor.userId,
          ),
        );
        this.assignmentHistory.set(id, events);
      }
      this.employees.set(id, next);
      return next;
    }
    const update = async (manager: EntityManager) => {
      const currentRows = await manager.query<EmployeeRecord[]>(
        `SELECT e.id, e.employee_number AS "employeeNumber", e.name, e.email,
                COALESCE(p.name, e.position) AS position,
                COALESCE(d.name, e.department) AS department,
                e.department_id AS "departmentId", e.position_id AS "positionId",
                e.status, e.employment,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',wb.id,'name',wb.name) ORDER BY wb.name),'[]'::jsonb)
                 FROM branches wb WHERE wb.status='ACTIVE' AND (
                   e.employment->>'allWorkBranches'='true' OR
                   CASE WHEN jsonb_typeof(e.employment->'workBranchIds')='array'
                     THEN e.employment->'workBranchIds' ? wb.id::text ELSE wb.id=e.branch_id END)) AS "workBranches",
                e.emergency_contact AS "emergencyContact",
                e.government_ids AS "governmentIds", e.documents, e.salary, e.phone,
                COALESCE(supervisor.name, e.manager_name) AS manager,
                e.manager_employee_id AS "managerEmployeeId", e.branch_id AS "branchId"
         FROM employees e
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employee_positions p ON p.id = e.position_id
         LEFT JOIN employees supervisor ON supervisor.id = e.manager_employee_id
         WHERE e.id = $1 FOR UPDATE OF e`,
        [id],
      );
      if (!currentRows[0]) return undefined;
      const current = this.normalize(currentRows[0]);
      const next = this.mergeEmployee(current, updates);
      if (updates.employment?.workBranchIds !== undefined || updates.employment?.allWorkBranches !== undefined || updates.branchId !== undefined)
        await this.validateWorkBranches(manager, next.branchId, next.employment);
      const workScopeChanged = next.branchId !== current.branchId ||
        next.employment.allWorkBranches !== current.employment.allWorkBranches ||
        JSON.stringify([...(next.employment.workBranchIds ?? [])].sort()) !== JSON.stringify([...(current.employment.workBranchIds ?? [])].sort());
      if (workScopeChanged) {
        const linked = await manager.query<{ role: string }[]>(
          "SELECT role FROM users WHERE employee_id=$1 AND role IN ('HR_ADMIN','BRANCH_MANAGER')", [id]);
        if (linked.some(account => ['HR_ADMIN','BRANCH_MANAGER'].includes(account.role))) {
          const actorRole = actor.role ?? (await manager.query<{role:string}[]>('SELECT role FROM users WHERE id=$1', [actor.userId]))[0]?.role;
          if (actorRole !== 'SUPER_ADMIN' && !(actorRole === 'IT_ADMIN' && linked.every(account => account.role === 'HR_ADMIN')))
            throw new BadRequestException('Only an authorized account administrator can change this employee branch assignment.');
        }
      }
      if (!next.name?.trim() || !next.email?.trim()) {
        throw new BadRequestException(
          'Employee name and email are required for linked account synchronization.',
        );
      }
      if (
        updates.managerEmployeeId !== undefined ||
        updates.manager !== undefined
      ) {
        const supervisor = await this.resolveSupervisor(
          manager,
          next.branchId,
          id,
          updates.managerEmployeeId,
          updates.manager,
        );
        next.managerEmployeeId = supervisor.id;
        next.manager = supervisor.name;
      }
      const departmentAssignmentChanged =
        next.branchId !== current.branchId ||
        next.department !== current.department;
      next.departmentId = departmentAssignmentChanged
        ? await this.requireDepartmentId(
            manager,
            next.branchId,
            next.department,
          )
        : (current.departmentId ??
          (await this.findDepartmentId(
            manager,
            next.branchId,
            next.department,
          )) ??
          null);
      next.positionId = next.position.trim()
        ? await this.resolvePositionId(manager, next.position)
        : (current.positionId ?? null);
      const eventType = this.assignmentEventType(current, next);
      const rows = await manager.query<EmployeeRecord[] | [EmployeeRecord[], number]>(
        `UPDATE employees SET branch_id = $2, name = $3, email = $4, position = $5,
         department = $6, status = $7, employment = $8::jsonb,
         emergency_contact = $9::jsonb, government_ids = $10::jsonb,
         documents = $11::jsonb, salary = $12, phone = $13, manager_name = $14,
         manager_employee_id = $15, department_id = $16, position_id = $17
       WHERE id = $1
       RETURNING id, employee_number AS "employeeNumber", branch_id AS "branchId", name, email, position, department,
                 status, employment, emergency_contact AS "emergencyContact",
                 government_ids AS "governmentIds", documents, salary, phone,
                 manager_name AS "manager", manager_employee_id AS "managerEmployeeId",
                 department_id AS "departmentId",
                 position_id AS "positionId"`,
        [
          id,
          next.branchId,
          next.name,
          next.email,
          next.position,
          next.department,
          next.status,
          JSON.stringify(next.employment),
          JSON.stringify(next.emergencyContact ?? null),
          JSON.stringify(next.governmentIds ?? []),
          JSON.stringify(next.documents ?? []),
          next.salary ?? null,
          next.phone ?? null,
          next.manager ?? null,
          next.managerEmployeeId ?? null,
          next.departmentId,
          next.positionId,
        ],
      );
      // PostgreSQL UPDATE RETURNING can include the affected-row count.
      const returned = Array.isArray(rows[0]) ? rows[0][0] : rows[0];
      if (!returned) return undefined;
      const updated = this.normalize(returned);
      const changedFields = this.changedFieldNames(current, updated, updates);
      if (next.name !== current.name || next.email !== current.email) {
        await manager.query(
          'UPDATE users SET name = $2, email = $3 WHERE employee_id = $1',
          [id, next.name, next.email],
        );
      }
      if (eventType) {
        const effectiveDate =
          actor.effectiveDate ?? new Date().toISOString().slice(0, 10);
        if (eventType === 'TRANSFER') {
          await manager.query(
            `UPDATE users SET branch_id = $3
             WHERE employee_id = $1 AND role <> 'SUPER_ADMIN'
               AND branch_id = $2`,
            [id, current.branchId, next.branchId],
          );
        }
        await this.insertAssignmentEvent(
          manager,
          next,
          eventType,
          effectiveDate,
          actor,
        );
        if (actor.userId) {
          await manager.query(
            `INSERT INTO audit_logs
               (id, user_id, branch_id, action, resource, details, created_at)
             VALUES ($1, $2, $3, 'UPDATE', 'employee_assignment_history', $4, now())`,
            [
              randomUUID(),
              actor.userId,
              updated.branchId,
              JSON.stringify({
                employeeId: id,
                eventType,
                before: this.assignmentSnapshot(current),
                after: this.assignmentSnapshot(updated),
                changedFields,
                ip: actor.ip,
                userAgent: actor.userAgent,
              }),
            ],
          );
        }
      } else if (actor.userId && changedFields.length > 0) {
        await manager.query(
          `INSERT INTO audit_logs
             (id, user_id, branch_id, action, resource, details, created_at)
           VALUES ($1, $2, $3, 'UPDATE', 'employees', $4, now())`,
          [
            randomUUID(),
            actor.userId,
            updated.branchId,
            JSON.stringify({
              employeeId: id,
              changedFields,
              ip: actor.ip,
              userAgent: actor.userAgent,
            }),
          ],
        );
      }
      return updated;
    };
    return transactionManager
      ? update(transactionManager)
      : this.dataSource.transaction(update);
  }

  async listAssignmentHistory(
    employeeId: string,
  ): Promise<EmployeeAssignmentHistory[]> {
    if (!this.dataSource) {
      return [...(this.assignmentHistory.get(employeeId) ?? [])].reverse();
    }
    const rows = await this.dataSource.query<EmployeeAssignmentHistory[]>(
      `SELECT h.id, h.employee_id AS "employeeId", h.branch_id AS "branchId",
              h.branch_name AS "branchName", h.department_id AS "departmentId",
              h.department, h.position_id AS "positionId", h.position,
              h.manager_name AS "manager",
              h.manager_employee_id AS "managerEmployeeId",
              h.employment_type AS "employmentType",
              h.employee_status AS status, h.event_type AS "eventType",
              h.effective_date::text AS "effectiveDate", h.changed_by AS "changedBy",
              u.name AS "changedByName", h.recorded_at AS "recordedAt"
       FROM employee_assignment_history h
       LEFT JOIN users u ON u.id = h.changed_by
       WHERE h.employee_id = $1
       ORDER BY h.effective_date DESC NULLS LAST, h.recorded_at DESC, h.id DESC`,
      [employeeId],
    );
    return rows.map((row) => ({
      ...row,
      effectiveDate: row.effectiveDate
        ? String(row.effectiveDate).slice(0, 10)
        : null,
      recordedAt: new Date(row.recordedAt).toISOString(),
    }));
  }

  async deleteEmployee(id: string): Promise<void> {
    if (!this.dataSource) {
      this.employees.delete(id);
      return;
    }
    try {
      await this.dataSource.query('DELETE FROM employees WHERE id = $1', [id]);
    } catch (error) {
      if ((error as { code?: string }).code === '23503')
        throw new Error('Employee has related records and cannot be deleted.');
      throw error;
    }
  }

  async addDocument(
    id: string,
    document: EmployeeDocumentInput,
    actor: EmployeeChangeActor = {},
  ): Promise<EmployeeRecord | undefined> {
    const current = await this.findById(id);
    if (!current) return undefined;
    const documents = [
      ...(current.documents ?? []),
      document as unknown as string,
    ];
    return this.updateEmployee(id, { documents }, actor);
  }

  async removeLegacyDocument(
    id: string,
    documentIndex: number,
    actor: EmployeeChangeActor = {},
  ): Promise<EmployeeRecord | undefined> {
    if (!Number.isInteger(documentIndex) || documentIndex < 0) {
      throw new BadRequestException('Invalid employee document reference.');
    }
    if (!this.dataSource) {
      const current = this.employees.get(id);
      if (!current) return undefined;
      const documents = [...(current.documents ?? [])];
      if (documentIndex >= documents.length) {
        throw new BadRequestException(
          'This document reference is no longer available. Refresh and try again.',
        );
      }
      documents.splice(documentIndex, 1);
      const updated = { ...current, documents };
      this.employees.set(id, updated);
      return updated;
    }

    return this.dataSource.transaction(async (manager) => {
      const rows = await manager.query<EmployeeRecord[]>(
        `SELECT id, employee_number AS "employeeNumber", branch_id AS "branchId",
                name, email, position, department, status, employment,
                emergency_contact AS "emergencyContact",
                government_ids AS "governmentIds", documents, salary, phone,
                manager_name AS manager, manager_employee_id AS "managerEmployeeId",
                department_id AS "departmentId", position_id AS "positionId"
         FROM employees WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!rows[0]) return undefined;
      const current = this.normalize(rows[0]);
      const documents = [...(current.documents ?? [])];
      if (documentIndex >= documents.length) {
        throw new BadRequestException(
          'This document reference is no longer available. Refresh and try again.',
        );
      }
      documents.splice(documentIndex, 1);
      const updatedRows = await manager.query<EmployeeRecord[]>(
        `UPDATE employees SET documents = $2::jsonb WHERE id = $1
         RETURNING id, employee_number AS "employeeNumber", branch_id AS "branchId",
                   name, email, position, department, status, employment,
                   emergency_contact AS "emergencyContact",
                   government_ids AS "governmentIds", documents, salary, phone,
                   manager_name AS manager, manager_employee_id AS "managerEmployeeId",
                   department_id AS "departmentId", position_id AS "positionId"`,
        [id, JSON.stringify(documents)],
      );
      if (!updatedRows[0]) return undefined;
      const updated = this.normalize(updatedRows[0]);
      if (actor.userId) {
        await manager.query(
          `INSERT INTO audit_logs
             (id, user_id, branch_id, action, resource, details, created_at)
           VALUES ($1, $2, $3, 'UPDATE', 'employees', $4, now())`,
          [
            randomUUID(),
            actor.userId,
            updated.branchId,
            JSON.stringify({
              employeeId: id,
              changedFields: ['documents'],
              change: 'remove_legacy_document',
              documentIndex,
              ip: actor.ip,
              userAgent: actor.userAgent,
            }),
          ],
        );
      }
      return updated;
    });
  }

  async list(branchId?: string): Promise<EmployeeRecord[]> {
    if (this.dataSource) {
      const parameters: string[] = [];
      const branchFilter = branchId ? 'WHERE e.branch_id = $1' : '';
      if (branchId) parameters.push(branchId);
      const rows = await this.dataSource.query<EmployeeRecord[]>(
        `SELECT e.id, e.employee_number AS "employeeNumber", e.name, e.email,
                COALESCE(p.name, e.position) AS position,
                COALESCE(d.name, e.department) AS department,
                e.department_id AS "departmentId", e.position_id AS "positionId", e.status,
                e.employment,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',wb.id,'name',wb.name) ORDER BY wb.name),'[]'::jsonb)
                 FROM branches wb WHERE wb.status='ACTIVE' AND (
                   e.employment->>'allWorkBranches'='true' OR
                   CASE WHEN jsonb_typeof(e.employment->'workBranchIds')='array'
                     THEN e.employment->'workBranchIds' ? wb.id::text ELSE wb.id=e.branch_id END)) AS "workBranches",
                e.emergency_contact AS "emergencyContact",
                e.government_ids AS "governmentIds", e.documents,
                COALESCE(supervisor.name, e.manager_name) AS manager,
                e.manager_employee_id AS "managerEmployeeId",
                e.salary, e.phone, e.branch_id AS "branchId", b.name AS "branchName",
                (SELECT picture.updated_at FROM employee_profile_pictures picture
                 WHERE picture.employee_id = e.id) AS "profilePictureUpdatedAt"
         FROM employees e
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employee_positions p ON p.id = e.position_id
         LEFT JOIN employees supervisor ON supervisor.id = e.manager_employee_id
         ${branchFilter}
         ORDER BY e.name ASC`,
        parameters,
      );
      return rows.map((row) => this.normalize(row));
    }

    const employees = Array.from(this.employees.values());
    return branchId
      ? employees.filter((employee) => employee.branchId === branchId)
      : employees;
  }

  async findById(id: string): Promise<EmployeeRecord | undefined> {
    if (this.dataSource) {
      const rows = await this.dataSource.query<EmployeeRecord[]>(
        `SELECT e.id, e.employee_number AS "employeeNumber", e.name, e.email,
                COALESCE(p.name, e.position) AS position,
                COALESCE(d.name, e.department) AS department,
                e.department_id AS "departmentId", e.position_id AS "positionId", e.status,
                e.employment,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',wb.id,'name',wb.name) ORDER BY wb.name),'[]'::jsonb)
                 FROM branches wb WHERE wb.status='ACTIVE' AND (
                   e.employment->>'allWorkBranches'='true' OR
                   CASE WHEN jsonb_typeof(e.employment->'workBranchIds')='array'
                     THEN e.employment->'workBranchIds' ? wb.id::text ELSE wb.id=e.branch_id END)) AS "workBranches",
                e.emergency_contact AS "emergencyContact",
                e.government_ids AS "governmentIds", e.documents,
                COALESCE(supervisor.name, e.manager_name) AS manager,
                e.manager_employee_id AS "managerEmployeeId",
                e.salary, e.phone, e.branch_id AS "branchId", b.name AS "branchName",
                (SELECT picture.updated_at FROM employee_profile_pictures picture
                 WHERE picture.employee_id = e.id) AS "profilePictureUpdatedAt"
         FROM employees e
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employee_positions p ON p.id = e.position_id
         LEFT JOIN employees supervisor ON supervisor.id = e.manager_employee_id
         WHERE e.id = $1`,
        [id],
      );
      return rows[0] ? this.normalize(rows[0]) : undefined;
    }
    return this.employees.get(id);
  }

  async findByEmail(email: string): Promise<EmployeeRecord | undefined> {
    if (this.dataSource) {
      const rows = await this.dataSource.query<EmployeeRecord[]>(
        `SELECT e.id, e.employee_number AS "employeeNumber", e.name, e.email,
                COALESCE(p.name, e.position) AS position,
                COALESCE(d.name, e.department) AS department,
                e.department_id AS "departmentId", e.position_id AS "positionId", e.status,
                e.employment,
                (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',wb.id,'name',wb.name) ORDER BY wb.name),'[]'::jsonb)
                 FROM branches wb WHERE wb.status='ACTIVE' AND (
                   e.employment->>'allWorkBranches'='true' OR
                   CASE WHEN jsonb_typeof(e.employment->'workBranchIds')='array'
                     THEN e.employment->'workBranchIds' ? wb.id::text ELSE wb.id=e.branch_id END)) AS "workBranches",
                e.emergency_contact AS "emergencyContact",
                e.government_ids AS "governmentIds", e.documents,
                COALESCE(supervisor.name, e.manager_name) AS manager,
                e.manager_employee_id AS "managerEmployeeId",
                e.salary, e.phone, e.branch_id AS "branchId", b.name AS "branchName",
                (SELECT picture.updated_at FROM employee_profile_pictures picture
                 WHERE picture.employee_id = e.id) AS "profilePictureUpdatedAt"
         FROM employees e
         LEFT JOIN branches b ON b.id = e.branch_id
         LEFT JOIN departments d ON d.id = e.department_id
         LEFT JOIN employee_positions p ON p.id = e.position_id
         LEFT JOIN employees supervisor ON supervisor.id = e.manager_employee_id
         WHERE LOWER(e.email) = LOWER($1)
         LIMIT 1`,
        [email.trim()],
      );
      return rows[0] ? this.normalize(rows[0]) : undefined;
    }
    return Array.from(this.employees.values()).find(
      (employee) => employee.email.toLowerCase() === email.trim().toLowerCase(),
    );
  }

  private normalize(employee: EmployeeRecord): EmployeeRecord {
    return {
      ...employee,
      employeeNumber: employee.employeeNumber ?? 'Not assigned',
      branchName: employee.branchName ?? null,
      phone: employee.phone ?? null,
      manager: employee.manager ?? null,
      governmentIds: Array.isArray(employee.governmentIds)
        ? employee.governmentIds
        : [],
      documents: Array.isArray(employee.documents) ? employee.documents : [],
      attendance: employee.attendance ?? [],
    };
  }

  private async requireDepartmentId(
    manager: EntityManager,
    branchId: string,
    departmentName: string,
  ): Promise<string> {
    const departmentId = await this.findDepartmentId(
      manager,
      branchId,
      departmentName,
    );
    if (!departmentId) {
      throw new BadRequestException(
        'Select a department that belongs to the selected branch.',
      );
    }
    return departmentId;
  }

  private async findDepartmentId(
    manager: EntityManager,
    branchId: string,
    departmentName: string,
  ): Promise<string | undefined> {
    const rows = await manager.query<Array<{ id: string }>>(
      `SELECT id FROM departments
       WHERE branch_id = $1 AND lower(trim(name)) = lower(trim($2))
       LIMIT 1`,
      [branchId, departmentName],
    );
    return rows[0]?.id;
  }

  private async resolvePositionId(
    manager: EntityManager,
    positionName: string,
  ): Promise<string> {
    const rows = await manager.query<Array<{ id: string }>>(
      `INSERT INTO employee_positions (id, name)
       VALUES ($1, $2)
       ON CONFLICT (lower(name)) DO UPDATE
         SET name = employee_positions.name
       RETURNING id`,
      [randomUUID(), positionName.trim()],
    );
    return rows[0].id;
  }

  private async resolveSupervisor(
    manager: EntityManager,
    branchId: string,
    employeeId: string | undefined,
    supervisorEmployeeId: string | null | undefined,
    legacySupervisorName: string | null | undefined,
  ): Promise<{ id: string | null; name: string | null }> {
    if (supervisorEmployeeId === null) return { id: null, name: null };
    if (supervisorEmployeeId) {
      return this.requireSupervisor(
        manager,
        branchId,
        supervisorEmployeeId,
        employeeId,
      );
    }
    const name = legacySupervisorName?.trim();
    if (!name) return { id: null, name: null };
    const matches = await manager.query<
      Array<{ id: string; name: string; status: EmployeeStatus }>
    >(
      `SELECT id, name, status FROM employees
       WHERE branch_id = $1 AND lower(trim(name)) = lower(trim($2))
       ORDER BY id LIMIT 2`,
      [branchId, name],
    );
    if (matches.length !== 1) {
      throw new BadRequestException(
        matches.length === 0
          ? 'Select a supervisor from the employee list.'
          : 'More than one employee has this name. Select the supervisor by employee record.',
      );
    }
    if (matches[0].status !== 'ACTIVE') {
      throw new BadRequestException('Select an active employee as supervisor.');
    }
    return this.requireSupervisor(manager, branchId, matches[0].id, employeeId);
  }

  private async getBranchSchedule(
    manager: EntityManager,
    branchId: string,
  ): Promise<WorkScheduleDefinition | undefined> {
    const rows = await manager.query<
      Array<{
        timeZone: string;
        workDays: number[] | string;
        shiftStart: string;
        shiftEnd: string;
        breakMinutes: number;
        graceMinutes: number;
      }>
    >(
      `SELECT time_zone AS "timeZone", work_days AS "workDays",
              shift_start::text AS "shiftStart", shift_end::text AS "shiftEnd",
              break_minutes AS "breakMinutes", grace_minutes AS "graceMinutes"
       FROM attendance_schedules WHERE branch_id = $1`,
      [branchId],
    );
    const schedule = rows[0];
    if (!schedule) return undefined;
    const workDays = Array.isArray(schedule.workDays)
      ? schedule.workDays.map(Number)
      : String(schedule.workDays)
          .replace(/^\{|\}$/g, '')
          .split(',')
          .filter(Boolean)
          .map(Number);
    return {
      timeZone: schedule.timeZone,
      workDays,
      shiftStart: String(schedule.shiftStart).slice(0, 5),
      shiftEnd: String(schedule.shiftEnd).slice(0, 5),
      breakMinutes: Number(schedule.breakMinutes),
      graceMinutes: Number(schedule.graceMinutes),
    };
  }

  private async requireSupervisor(
    manager: EntityManager,
    branchId: string,
    supervisorEmployeeId: string,
    employeeId: string | undefined,
  ): Promise<{ id: string; name: string }> {
    const supervisors = await manager.query<
      Array<{
        id: string;
        name: string;
        status: EmployeeStatus;
        branchId: string;
      }>
    >(
      'SELECT id, name, status, branch_id AS "branchId" FROM employees WHERE id = $1 FOR SHARE',
      [supervisorEmployeeId],
    );
    const supervisor = supervisors[0];
    if (!supervisor || supervisor.status !== 'ACTIVE') {
      throw new BadRequestException('Select an active employee as supervisor.');
    }
    if (supervisor.branchId !== branchId) {
      throw new BadRequestException(
        'Select a supervisor assigned to the employee branch.',
      );
    }
    if (employeeId) {
      const cycles = await manager.query<Array<{ createsCycle: boolean }>>(
        `WITH RECURSIVE supervisor_chain AS (
           SELECT id, manager_employee_id, ARRAY[id]::varchar[] AS visited
           FROM employees WHERE id = $1
           UNION ALL
           SELECT parent.id, parent.manager_employee_id,
                  chain.visited || parent.id
           FROM employees parent
           JOIN supervisor_chain chain
             ON parent.id = chain.manager_employee_id
           WHERE NOT parent.id = ANY(chain.visited)
         )
         SELECT EXISTS (
           SELECT 1 FROM supervisor_chain WHERE id = $2
         ) AS "createsCycle"`,
        [supervisorEmployeeId, employeeId],
      );
      if (cycles[0]?.createsCycle) {
        throw new BadRequestException(
          'An employee cannot report to themself or to one of their reports.',
        );
      }
    }
    return { id: supervisor.id, name: supervisor.name };
  }

  private async insertEmployeeWorkSchedule(
    manager: EntityManager,
    employeeId: string,
    branchId: string,
    effectiveDate: string,
    schedule: WorkScheduleDefinition,
    assignedBy?: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO employee_work_schedule_history
         (id, employee_id, branch_id, effective_date, time_zone, work_days,
          shift_start, shift_end, break_minutes, grace_minutes, assigned_by)
       VALUES ($1, $2, $3, $4::date, $5, $6::smallint[], $7::time, $8::time,
               $9, $10, $11)`,
      [
        randomUUID(),
        employeeId,
        branchId,
        effectiveDate,
        schedule.timeZone,
        schedule.workDays,
        schedule.shiftStart,
        schedule.shiftEnd,
        schedule.breakMinutes,
        schedule.graceMinutes,
        assignedBy ?? null,
      ],
    );
  }

  private mergeEmployee(
    current: EmployeeRecord,
    updates: Partial<CreateEmployeeInput>,
  ): EmployeeRecord {
    const employment = { ...current.employment, ...updates.employment };
    if (updates.branchId && updates.employment?.workBranchIds === undefined && !employment.allWorkBranches && employment.workBranchIds)
      employment.workBranchIds = [...new Set([...employment.workBranchIds, updates.branchId])];
    if (updates.employment) validateEmployment(employment);
    return {
      ...current,
      ...updates,
      employment,
    };
  }

  private assignmentEventType(
    current: EmployeeRecord,
    next: EmployeeRecord,
  ): EmployeeAssignmentEventType | undefined {
    const fields = this.assignmentChangedFields(current, next);
    if (fields.length === 0) return undefined;
    if (fields.includes('branchId')) return 'TRANSFER';
    if (fields.includes('status')) return 'STATUS_CHANGE';
    if (fields.includes('position')) return 'PROMOTION';
    return 'ASSIGNMENT_CHANGE';
  }

  private async validateWorkBranches(manager: EntityManager | undefined, primary: string, employment: EmployeeEmployment) {
    if (employment.workBranchIds === undefined && employment.allWorkBranches === undefined) return;
    const ids = employment.workBranchIds ?? [];
    if (employment.allWorkBranches) {
      if (ids.length) throw new BadRequestException('All work branches cannot include a selected branch list.');
      return;
    }
    if (!ids.length || !ids.includes(primary))
      throw new BadRequestException('Select at least one work branch and include the primary branch.');
    if (!manager) return;
    const active = await manager.query<{id: string}[]>(
      "SELECT id FROM branches WHERE id=ANY($1::text[]) AND status='ACTIVE' FOR SHARE", [ids]);
    if (active.length !== ids.length) throw new BadRequestException('Select active work branches only.');
  }

  private assignmentChangedFields(
    current: EmployeeRecord,
    next: EmployeeRecord,
  ): string[] {
    const fields: Array<keyof EmployeeRecord> = [
      'branchId',
      'department',
      'position',
      'manager',
      'managerEmployeeId',
      'status',
    ];
    const changed = fields
      .filter((field) => current[field] !== next[field])
      .map(String);
    if (current.employment?.employeeType !== next.employment?.employeeType) {
      changed.push('employmentType');
    }
    if (JSON.stringify(current.employment.workBranchIds) !== JSON.stringify(next.employment.workBranchIds) ||
        current.employment.allWorkBranches !== next.employment.allWorkBranches) changed.push('workBranches');
    return changed;
  }

  private assignmentSnapshot(employee: EmployeeRecord) {
    return {
      branchId: employee.branchId,
      department: employee.department,
      position: employee.position,
      manager: employee.manager ?? null,
      managerEmployeeId: employee.managerEmployeeId ?? null,
      employmentType: employee.employment.employeeType,
      workBranchIds: employee.employment.workBranchIds,
      allWorkBranches: employee.employment.allWorkBranches,
      status: employee.status,
    };
  }

  private changedFieldNames(
    current: EmployeeRecord,
    next: EmployeeRecord,
    updates: Partial<CreateEmployeeInput>,
  ): string[] {
    const changed: string[] = [];
    for (const field of Object.keys(updates) as Array<
      keyof CreateEmployeeInput
    >) {
      if (field === 'workSchedule') continue;
      if (field === 'employment') {
        for (const employmentField of Object.keys(
          updates.employment ?? {},
        ) as Array<keyof EmployeeEmployment>) {
          if (
            current.employment?.[employmentField] !==
            next.employment?.[employmentField]
          ) {
            changed.push(`employment.${employmentField}`);
          }
        }
      } else if (
        JSON.stringify(current[field]) !== JSON.stringify(next[field])
      ) {
        changed.push(String(field));
      }
    }
    return changed;
  }

  private toHistoryEvent(
    employee: EmployeeRecord,
    eventType: EmployeeAssignmentEventType,
    effectiveDate: string | undefined,
    changedBy: string | undefined,
  ): EmployeeAssignmentHistory {
    return {
      id: randomUUID(),
      employeeId: employee.id,
      branchId: employee.branchId,
      branchName: employee.branchName ?? employee.branchId,
      departmentId: employee.departmentId ?? null,
      department: employee.department,
      positionId: employee.positionId ?? null,
      position: employee.position,
      manager: employee.manager ?? null,
      managerEmployeeId: employee.managerEmployeeId ?? null,
      employmentType: employee.employment.employeeType,
      workBranchIds: employee.employment.workBranchIds,
      allWorkBranches: employee.employment.allWorkBranches,
      status: employee.status,
      eventType,
      effectiveDate: effectiveDate ?? new Date().toISOString().slice(0, 10),
      changedBy: changedBy ?? null,
      recordedAt: new Date().toISOString(),
    };
  }

  private async insertAssignmentEvent(
    manager: EntityManager,
    employee: EmployeeRecord,
    eventType: EmployeeAssignmentEventType,
    effectiveDate: string,
    actor: EmployeeChangeActor,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO employee_assignment_history
         (id, employee_id, branch_id, branch_name, department_id, department,
          position_id, position, manager_name, manager_employee_id,
          employment_type, employee_status, event_type,
          effective_date, changed_by, recorded_at)
       SELECT $1, $2, b.id, b.name, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::date, $14, now()
       FROM branches b WHERE b.id = $3`,
      [
        randomUUID(),
        employee.id,
        employee.branchId,
        employee.departmentId ?? null,
        employee.department,
        employee.positionId ?? null,
        employee.position,
        employee.manager ?? null,
        employee.managerEmployeeId ?? null,
        employee.employment.employeeType,
        employee.status,
        eventType,
        effectiveDate,
        actor.userId ?? null,
      ],
    );
  }
}
