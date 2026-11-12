import type { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { EmployeeService } from '../../hr/employees/employee.service.js';

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' | 'PENDING';
export type CredentialEmailStatus = 'NOT_REQUIRED' | 'PENDING' | 'PROCESSING' | 'ACCEPTED_BY_PROVIDER' | 'FAILED';

export type UserRecord = {
  id: string;
  profilePictureUpdatedAt?: Date | string | null;
  lastLoginAt?: Date | string | null;
  email: string;
  name: string;
  passwordHash?: string;
  role: string;
  branchId?: string;
  employeeId?: string;
  status: UserStatus;
  branchName?: string | null;
  branchAccessMode?: 'ASSIGNED' | 'SELECTED' | 'ALL';
  accessibleBranches?: { id: string; name: string }[];
  mustChangePassword?: boolean;
  temporaryPasswordExpiresAt?: Date | string | null;
  credentialEmailStatus?: CredentialEmailStatus;
  credentialEmailSentAt?: Date | string | null;
};

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  branchId?: string | null;
  employeeId?: string | null;
  temporaryPasswordExpiresAt?: Date;
  actorId?: string;
};

export type BranchManagerOption = Pick<
  UserRecord,
  'id' | 'name' | 'email' | 'role' | 'status' | 'branchId' | 'branchName'
> & {
  phone: string | null;
  isAssignable: boolean;
  unavailableReason: string | null;
  managedBranches: Array<{ id: string; name: string }>;
};

type BranchManagerCandidate = Omit<BranchManagerOption, 'isAssignable' | 'unavailableReason'> & {
  hasEmployeeLink: boolean;
};

export type UserAccountStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export class UserService {
  private users = new Map<string, UserRecord>();

  constructor(
    private readonly dataSource?: DataSource,
    private readonly employees = new EmployeeService(dataSource),
  ) {}

  create(input: UserRecord): UserRecord {
    this.users.set(input.id, input);
    return input;
  }

  async createAccount(input: CreateUserInput): Promise<UserRecord> {
    const isSuperAdmin = input.role === 'SUPER_ADMIN';
    const supportsAllBranches =
      input.role === 'IT_ADMIN' ||
      input.role === 'HR_ADMIN' ||
      input.role === 'BRANCH_MANAGER';
    if (isSuperAdmin && input.branchId) {
      throw new Error('Super Admin accounts cannot have a branch assignment.');
    }
    if (
      !isSuperAdmin &&
      (!input.employeeId || (!input.branchId && !supportsAllBranches))
    ) {
      throw new Error(
        supportsAllBranches
          ? 'Employee is required for this role.'
          : 'Employee and active branch are required',
      );
    }

    let accountName = input.name.trim();
    const record: UserRecord = {
      id: randomUUID(),
      name: accountName,
      email: input.email.trim().toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      branchId: input.branchId ?? undefined,
      employeeId: input.employeeId ?? undefined,
      status: 'ACTIVE',
      mustChangePassword: Boolean(input.temporaryPasswordExpiresAt),
      temporaryPasswordExpiresAt: input.temporaryPasswordExpiresAt ?? null,
      credentialEmailStatus: input.temporaryPasswordExpiresAt ? 'PENDING' : 'NOT_REQUIRED',
    };

    if (!this.dataSource) {
      const duplicate = Array.from(this.users.values()).some(
        (user) =>
          user.email.trim().toLowerCase() ===
            record.email.trim().toLowerCase() ||
          (record.employeeId !== undefined &&
            user.employeeId === record.employeeId),
      );
      if (duplicate) {
        throw new Error(
          'An account already exists for this employee or email.',
        );
      }
      this.users.set(record.id, record);
      return record;
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        if (input.employeeId) {
          const employee = await this.findEmployeeForAccount(
            manager,
            input.employeeId,
          );
          if (!employee) throw new Error('Select an existing employee.');
          if (input.role !== 'SUPER_ADMIN') {
            if (!employee.branchId) throw new Error('Employee and active branch are required');
            record.branchId = employee.branchId;
          }
          if (
            employee.email.trim().toLowerCase() !==
            input.email.trim().toLowerCase()
          ) {
            throw new Error(
              'The account email must match the selected employee.',
            );
          }
          if (
            await this.hasAccountForEmployeeInTransaction(
              manager,
              input.employeeId,
              input.email,
            )
          ) {
            throw new Error('An account already exists for this employee.');
          }
          if (record.branchId) {
            const branches = await manager.query<Array<{ isActive: boolean }>>(
              `SELECT is_active AS "isActive" FROM branches
               WHERE id = $1 FOR SHARE`,
              [record.branchId],
            );
            if (!branches[0]?.isActive) {
              throw new Error('Select an active branch.');
            }
          }
          accountName = employee.name;
          record.name = accountName;
        }
        const rows = await manager.query<UserRecord[]>(
          `INSERT INTO users (id, email, name, password_hash, role, branch_id, employee_id, status, must_change_password, temporary_password_expires_at, credential_email_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, $9, $10)
           RETURNING id, email, name, role, branch_id AS "branchId", employee_id AS "employeeId", status,
             must_change_password AS "mustChangePassword", temporary_password_expires_at AS "temporaryPasswordExpiresAt", credential_email_status AS "credentialEmailStatus"`,
          [
            record.id,
            record.email,
            record.name,
            record.passwordHash,
            record.role,
            record.branchId ?? null,
            record.employeeId ?? null,
            record.mustChangePassword,
            record.temporaryPasswordExpiresAt,
            record.credentialEmailStatus,
          ],
        );
        if (input.actorId) await manager.query(`INSERT INTO audit_logs(id,user_id,branch_id,action,resource,details,created_at)
          VALUES($1,$2,$3,'USER_ACCOUNT_CREATED','users',$4::jsonb,now())`,
        [randomUUID(), input.actorId, record.branchId ?? null, JSON.stringify({ targetUserId: record.id, credentialEmailStatus: record.credentialEmailStatus })]);
        return rows[0];
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new Error(
          'An account already exists for this employee or email.',
        );
      }
      throw error;
    }
  }

  private async findEmployeeForAccount(
    manager: EntityManager,
    employeeId: string,
  ): Promise<{ name: string; email: string; branchId: string } | undefined> {
    const rows = await manager.query<Array<{ name: string; email: string; branchId: string }>>(
      'SELECT name, email, branch_id AS "branchId" FROM employees WHERE id = $1 FOR UPDATE',
      [employeeId],
    );
    return rows[0];
  }

  private async hasAccountForEmployeeInTransaction(
    manager: EntityManager,
    employeeId: string,
    email: string,
  ): Promise<boolean> {
    const rows = await manager.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM users
         WHERE employee_id = $1 OR LOWER(email) = $2
       ) AS exists`,
      [employeeId, email.trim().toLowerCase()],
    );
    return Boolean(rows[0]?.exists);
  }

  async hasAccountForEmployee(
    employeeId: string,
    email: string,
  ): Promise<boolean> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!this.dataSource) {
      return Array.from(this.users.values()).some(
        (user) =>
          user.employeeId === employeeId ||
          user.email.trim().toLowerCase() === normalizedEmail,
      );
    }

    const rows = await this.dataSource.query<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM users
         WHERE employee_id = $1 OR LOWER(email) = $2
       ) AS exists`,
      [employeeId, normalizedEmail],
    );
    return Boolean(rows[0]?.exists);
  }

  async listAccountEmails(): Promise<string[]> {
    if (!this.dataSource) {
      return Array.from(this.users.values()).map((user) =>
        user.email.trim().toLowerCase(),
      );
    }

    const rows = await this.dataSource.query<Array<{ email: string }>>(
      'SELECT LOWER(email) AS email FROM users',
    );
    return rows.map(({ email }) => email);
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    if (!this.dataSource) {
      const user = this.users.get(userId);
      if (user?.status === 'ACTIVE') user.lastLoginAt = new Date().toISOString();
      return;
    }
    await this.dataSource.query(
      `UPDATE users SET last_login_at = now()
       WHERE id = $1 AND status = 'ACTIVE'`,
      [userId],
    );
  }

  async listLinkedEmployeeIds(): Promise<string[]> {
    if (!this.dataSource) {
      return Array.from(this.users.values())
        .map((user) => user.employeeId)
        .filter((employeeId): employeeId is string => Boolean(employeeId));
    }

    const rows = await this.dataSource.query<Array<{ employeeId: string }>>(
      'SELECT employee_id AS "employeeId" FROM users WHERE employee_id IS NOT NULL',
    );
    return rows.map(({ employeeId }) => employeeId);
  }

  async updateStatus(
    id: string,
    status: UserAccountStatus,
  ): Promise<UserRecord | undefined> {
    if (!this.dataSource) {
      const user = this.users.get(id);
      if (!user) return undefined;
      user.status = status;
      return user;
    }

    const rows = await this.dataSource.query<UserRecord[]>(
      `UPDATE users
       SET status = $2
       WHERE id = $1
       RETURNING id, email, name, role, branch_id AS "branchId", status`,
      [id, status],
    );
    return rows[0];
  }

  async updateRole(
    id: string,
    role: UserRecord['role'],
    employeeId?: string,
    branchId?: string | null,
    actorId?: string,
  ): Promise<UserRecord | undefined> {
    if (this.dataSource) {
      return this.updateDatabaseRole(id, role, employeeId, branchId, actorId);
    }

    const current = this.users.get(id);
    if (!current) return undefined;
    if (role === 'SUPER_ADMIN') {
      current.role = role;
      current.branchId = undefined;
      return current;
    }

    const nextEmployeeId = employeeId;
    const nextBranchId = branchId;
    const supportsAllBranches =
      role === 'IT_ADMIN' || role === 'HR_ADMIN' || role === 'BRANCH_MANAGER';
    if (!nextEmployeeId || (!nextBranchId && !supportsAllBranches)) {
      throw new Error(
        supportsAllBranches
          ? 'Employee is required for this role.'
          : 'Employee and active branch are required',
      );
    }

    current.role = role;
    current.employeeId = nextEmployeeId;
    current.branchId = nextBranchId ?? undefined;
    return current;
  }

  private async updateDatabaseRole(
    id: string,
    role: UserRecord['role'],
    employeeId?: string,
    branchId?: string | null,
    actorId?: string,
  ): Promise<UserRecord | undefined> {
    return this.dataSource!.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1)::bigint)',
        [id],
      );
      // Employee transfers lock the employee before updating the linked user.
      const employee = employeeId && role !== 'SUPER_ADMIN'
        ? await this.findEmployeeForAccount(manager, employeeId)
        : undefined;
      const users = await manager.query<UserRecord[]>(
        `SELECT id, email, name, role, employee_id AS "employeeId",
                branch_id AS "branchId", status
         FROM users WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const current = users[0];
      if (!current) return undefined;

      const assignments = await manager.query<Array<{ branchId: string }>>(
        `SELECT id AS "branchId" FROM branches
         WHERE manager_user_id = $1 LIMIT 1`,
        [id],
      );
      const assignedBranchId = assignments[0]?.branchId;
      if (
        assignedBranchId &&
        !['BRANCH_MANAGER', 'HR_ADMIN'].includes(role)
      ) {
        throw new Error(
          'Remove this account from all branch manager assignments before changing to this role.',
        );
      }

      if (role === 'SUPER_ADMIN') {
        const rows = await manager.query<UserRecord[]>(
          `UPDATE users SET role = $2, branch_id = NULL
           WHERE id = $1
           RETURNING id, email, name, role, employee_id AS "employeeId",
                     branch_id AS "branchId", status`,
          [id, role],
        );
        if (current.role !== role && actorId) await this.clearRoleChangeGrants(manager, id, actorId, null);
        return Array.isArray(rows[0]) ? rows[0][0] as UserRecord : rows[0];
      }

      const nextEmployeeId = employeeId;
      let nextBranchId = branchId;
      const supportsAllBranches =
        role === 'IT_ADMIN' || role === 'HR_ADMIN' || role === 'BRANCH_MANAGER';
      if (!nextEmployeeId || (!nextBranchId && !supportsAllBranches)) {
        throw new Error(
          supportsAllBranches
            ? 'Employee is required for this role.'
            : 'Employee and active branch are required',
        );
      }

      if (!employee) throw new Error('Select an existing employee.');
      if (role !== 'SUPER_ADMIN') {
        if (!employee.branchId) throw new Error('Employee and active branch are required');
        nextBranchId = employee.branchId;
      }

      if (nextBranchId) {
        const branches = await manager.query<Array<{ isActive: boolean }>>(
          `SELECT is_active AS "isActive" FROM branches
           WHERE id = $1 FOR SHARE`,
          [nextBranchId],
        );
        if (!branches[0]?.isActive) {
          throw new Error('Select an active branch.');
        }
      }

      try {
        const rows = await manager.query<UserRecord[]>(
          `UPDATE users
           SET role = $2, employee_id = $3, branch_id = $4, name = $5, email = $6
           WHERE id = $1
           RETURNING id, email, name, role, employee_id AS "employeeId",
                     branch_id AS "branchId", status`,
          [id, role, nextEmployeeId, nextBranchId, employee.name, employee.email],
        );
        if (current.role !== role && actorId) await this.clearRoleChangeGrants(manager, id, actorId, nextBranchId ?? null);
        return Array.isArray(rows[0]) ? rows[0][0] as UserRecord : rows[0];
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          throw new Error('An account with this employee email already exists.');
        }
        throw error;
      }
    });
  }

  private async clearRoleChangeGrants(manager: EntityManager, userId: string, actorId: string, branchId: string | null) {
    const grants = await manager.query<Array<{permissionKey:string;effect:string}>>(
      `SELECT permission_key AS "permissionKey",effect FROM user_module_permissions
       WHERE user_id=$1 AND effect IN ('VIEW','EDIT','ALLOW') FOR UPDATE`, [userId],
    );
    for (const grant of grants) {
      await manager.query('DELETE FROM user_module_permissions WHERE user_id=$1 AND permission_key=$2', [userId, grant.permissionKey]);
      await manager.query(
        `INSERT INTO user_module_permission_audit(id,actor_user_id,target_user_id,branch_id,permission_key,old_value,new_value,created_at)
         VALUES($1,$2,$3,$4,$5,$6,NULL,now())`,
        [randomUUID(), actorId, userId, branchId, grant.permissionKey, grant.effect],
      );
    }
  }

  async updateAccessBranch(
    id: string,
    branchId: string,
    actor: { userId: string; allowedBranchIds?: string[] },
    department?: string,
  ): Promise<UserRecord> {
    const validate = (account?: UserRecord) => {
      if (!account || !account.employeeId || !['EMPLOYEE', 'STAFF'].includes(account.role)) {
        throw new Error('Select an employee or staff account.');
      }
      if (account.id === actor.userId) throw new Error('You cannot change your own access branch.');
      if (actor.allowedBranchIds && (
        !account.branchId || !actor.allowedBranchIds.includes(account.branchId) ||
        !actor.allowedBranchIds.includes(branchId)
      )) throw new Error('Account branch access denied.');
      return account;
    };
    if (!this.dataSource) {
      const account = validate(this.users.get(id));
      const employee = await this.employees.findById(account.employeeId!);
      if (!employee) throw new Error('Linked employee not found.');
      if (actor.allowedBranchIds && !actor.allowedBranchIds.includes(employee.branchId)) throw new Error('Account branch access denied.');
      await this.employees.updateEmployee(employee.id, {
        branchId, department,
        ...(employee.branchId !== branchId ? { managerEmployeeId: null } : {}),
      }, { userId: actor.userId });
      account.branchId = branchId;
      return account;
    }
    return this.dataSource.transaction(async (manager) => {
      const links = await manager.query<Array<{ employeeId: string }>>(
        'SELECT employee_id AS "employeeId" FROM users WHERE id = $1', [id],
      );
      const employeeId = links[0]?.employeeId;
      if (!employeeId) throw new Error('Select an employee or staff account.');
      // Match the employee-transfer lock order before locking the linked account.
      const employees = await manager.query<Array<{ branchId: string }>>(
        'SELECT branch_id AS "branchId" FROM employees WHERE id = $1 FOR UPDATE', [employeeId],
      );
      const employee = employees[0];
      if (!employee) throw new Error('Linked employee not found.');
      const rows = await manager.query<UserRecord[]>(
        `SELECT id, role, employee_id AS "employeeId", branch_id AS "branchId"
         FROM users WHERE id = $1 FOR UPDATE`, [id],
      );
      const account = validate(rows[0]);
      if (account.employeeId !== employeeId) throw new Error('Employee link changed. Refresh and try again.');
      if (actor.allowedBranchIds && !actor.allowedBranchIds.includes(employee.branchId)) throw new Error('Account branch access denied.');
      const branches = await manager.query<Array<{ isActive: boolean }>>(
        'SELECT is_active AS "isActive" FROM branches WHERE id = $1 FOR SHARE', [branchId],
      );
      if (!branches[0]?.isActive) throw new Error('Select an active branch.');
      const transferred = await this.employees.updateEmployee(employeeId, {
        branchId, department,
        ...(employee.branchId !== branchId ? { managerEmployeeId: null } : {}),
      }, { userId: actor.userId }, manager);
      if (!transferred) throw new Error('Linked employee not found.');
      const updated = await manager.query<UserRecord[]>(
        `UPDATE users SET branch_id = $2 WHERE id = $1
         RETURNING id, name, email, role, employee_id AS "employeeId", branch_id AS "branchId", status`,
        [id, branchId],
      );
      await manager.query(
        `INSERT INTO audit_logs (id, user_id, branch_id, action, resource, details, created_at)
         VALUES ($1, $2, $3, 'UPDATE', 'users', $4, now())`,
        [randomUUID(), actor.userId, branchId, JSON.stringify({
          accountId: id, employeeId: account.employeeId,
          previousBranchId: account.branchId, previousEmployeeBranchId: employee.branchId,
          branchId, change: 'employee_and_account_branch',
        })],
      );
      return Array.isArray(updated[0]) ? updated[0][0] as UserRecord : updated[0];
    });
  }

  async resetPassword(
    id: string,
    passwordHash: string,
  ): Promise<UserRecord | undefined> {
    if (!this.dataSource) {
      const user = this.users.get(id);
      if (!user) return undefined;
      user.passwordHash = passwordHash;
      return user;
    }

    const rows = await this.dataSource.query<UserRecord[]>(
      `UPDATE users
       SET password_hash = $2
       WHERE id = $1
       RETURNING id, email, name, role, branch_id AS "branchId", status`,
      [id, passwordHash],
    );
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const normalizedEmail = email.trim().toLowerCase();

    if (this.dataSource) {
      const users = await this.dataSource.query<UserRecord[]>(
          `SELECT id, email, name, password_hash AS "passwordHash", role,
                  branch_id AS "branchId", status, must_change_password AS "mustChangePassword",
                  temporary_password_expires_at AS "temporaryPasswordExpiresAt", credential_email_status AS "credentialEmailStatus"
         FROM users
         WHERE LOWER(email) = $1
         LIMIT 1`,
        [normalizedEmail],
      );
      return users[0];
    }

    return Array.from(this.users.values()).find(
      (user) => user.email.trim().toLowerCase() === normalizedEmail,
    );
  }

  async getPasswordSecurityState(userId: string): Promise<{ mustChangePassword: boolean }> {
    if (!this.dataSource) return { mustChangePassword: Boolean(this.users.get(userId)?.mustChangePassword) };
    const rows = await this.dataSource.query<Array<{ mustChangePassword: boolean }>>(
      `SELECT must_change_password AS "mustChangePassword" FROM users WHERE id=$1 AND status='ACTIVE'`, [userId]);
    return { mustChangePassword: Boolean(rows[0]?.mustChangePassword) };
  }

  async deleteAccount(id: string): Promise<void> {
    if (!this.dataSource) {
      const user = this.users.get(id);
      if (!user) throw new Error('User account not found.');
      if (user.status !== 'ARCHIVED')
        throw new Error('Only archived accounts can be deleted.');
      this.users.delete(id);
      return;
    }

    const users = await this.dataSource.query<
      Array<{ email: string; status: UserStatus }>
    >('SELECT email, status FROM users WHERE id = $1', [id]);
    const user = users[0];
    if (!user) throw new Error('User account not found.');
    if (user.status !== 'ARCHIVED')
      throw new Error('Only archived accounts can be deleted.');
    const linkedEmployees = await this.dataSource.query<
      Array<{ exists: boolean }>
    >(
      'SELECT EXISTS (SELECT 1 FROM employees WHERE LOWER(email) = LOWER($1)) AS exists',
      [user.email],
    );
    if (linkedEmployees[0]?.exists)
      throw new Error(
        'This account is linked to an employee and cannot be deleted.',
      );
    const auditEntries = await this.dataSource.query<
      Array<{ exists: boolean }>
    >('SELECT EXISTS (SELECT 1 FROM audit_logs WHERE user_id = $1) AS exists', [
      id,
    ]);
    if (auditEntries[0]?.exists)
      throw new Error('This account has audit history and cannot be deleted.');
    await this.dataSource.query('DELETE FROM users WHERE id = $1', [id]);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    if (this.dataSource) {
      const rows = await this.dataSource.query<UserRecord[]>(
        `SELECT id, email, name, role, branch_id AS "branchId",
                employee_id AS "employeeId", status, must_change_password AS "mustChangePassword",
                temporary_password_expires_at AS "temporaryPasswordExpiresAt", credential_email_status AS "credentialEmailStatus",
                credential_email_sent_at AS "credentialEmailSentAt"
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [id],
      );
      return rows[0];
    }

    return this.users.get(id);
  }

  async list(branchId?: string): Promise<UserRecord[]> {
    if (this.dataSource) {
      const parameters: string[] = [];
      const branchFilter = branchId ? 'WHERE u.branch_id = $1' : '';
      if (branchId) parameters.push(branchId);
      return this.dataSource.query<UserRecord[]>(
        `SELECT u.id, u.email, u.name, u.role, u.status,
          u.branch_id AS "branchId", u.employee_id AS "employeeId", b.name AS "branchName",
          picture.updated_at AS "profilePictureUpdatedAt", u.must_change_password AS "mustChangePassword",
          u.temporary_password_expires_at AS "temporaryPasswordExpiresAt", u.credential_email_status AS "credentialEmailStatus",
          u.credential_email_sent_at AS "credentialEmailSentAt", u.last_login_at AS "lastLoginAt",
          CASE WHEN u.role IN ('SUPER_ADMIN','IT_ADMIN') OR u.role='HR_ADMIN' AND u.branch_id IS NULL AND COALESCE(access.mode,'ASSIGNED')='ASSIGNED' THEN 'ALL' WHEN u.role IN ('HR_ADMIN','BRANCH_MANAGER') THEN COALESCE(access.mode,'ASSIGNED') ELSE 'ASSIGNED' END AS "branchAccessMode",
          authorized.branches AS "accessibleBranches"
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN employee_profile_pictures picture ON picture.employee_id = u.employee_id
         LEFT JOIN employee_branch_access access ON access.user_id = u.id
         LEFT JOIN LATERAL (
           SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ab.id, 'name', ab.name) ORDER BY ab.name, ab.id), '[]'::jsonb) AS branches
           FROM branches ab WHERE ab.status='ACTIVE' AND (
             u.role IN ('SUPER_ADMIN','IT_ADMIN') OR
             u.role IN ('HR_ADMIN','BRANCH_MANAGER') AND (
               access.mode='ALL' OR access.mode='SELECTED' AND ab.id=ANY(access.branch_ids) OR
               COALESCE(access.mode,'ASSIGNED')='ASSIGNED' AND (ab.id=u.branch_id OR ab.manager_user_id=u.id OR u.role='HR_ADMIN' AND u.branch_id IS NULL)
             ) OR u.role IN ('EMPLOYEE','STAFF') AND ab.id=u.branch_id
           )
         ) authorized ON true
         ${branchFilter}
         ORDER BY u.name ASC`,
        parameters,
      );
    }

    const users = Array.from(this.users.values());
    return branchId
      ? users.filter((user) => user.branchId === branchId)
      : users;
  }

  async listBranchManagerOptions(branchId?: string): Promise<BranchManagerOption[]> {
    if (this.dataSource) {
      const conditions = [
        `u.role IN ('BRANCH_MANAGER', 'HR_ADMIN')`,
        `(
          u.status = 'ACTIVE'
          ${branchId ? `OR u.id = (SELECT manager_user_id FROM branches WHERE id = $1)` : ''}
        )`,
      ];
      const candidates = await this.dataSource.query<BranchManagerCandidate[]>(
        `SELECT u.id, u.email, u.name, u.role, u.status, e.phone,
                u.branch_id AS "branchId", b.name AS "branchName",
                (u.employee_id IS NOT NULL) AS "hasEmployeeLink",
                managed.branches AS "managedBranches"
         FROM users u
         LEFT JOIN branches b ON b.id = u.branch_id
         LEFT JOIN employees e ON e.id = u.employee_id
         LEFT JOIN LATERAL (
           SELECT COALESCE(jsonb_agg(jsonb_build_object('id', mb.id, 'name', mb.name)
             ORDER BY mb.name), '[]'::jsonb) AS branches
           FROM branches mb WHERE mb.manager_user_id = u.id
         ) managed ON true
         WHERE ${conditions.join(' AND ')}
         ORDER BY u.name ASC`,
        branchId ? [branchId] : [],
      );
      return candidates.map((candidate) => this.toBranchManagerOption(candidate));
    }

    return Array.from(this.users.values())
      .filter(
        (user) =>
          ['BRANCH_MANAGER', 'HR_ADMIN'].includes(user.role) &&
          (user.status === 'ACTIVE' ||
            Boolean(branchId && user.branchId === branchId)),
      )
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((user) => this.toBranchManagerOption({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        branchId: user.branchId,
        branchName: user.branchName,
        phone: null,
        hasEmployeeLink: Boolean(user.employeeId),
        managedBranches: [],
      }));
  }

  private toBranchManagerOption(
    candidate: BranchManagerCandidate,
  ): BranchManagerOption {
    let unavailableReason: string | null = null;
    if (candidate.status !== 'ACTIVE') {
      unavailableReason = 'Account is inactive';
    } else if (!candidate.hasEmployeeLink) {
      unavailableReason = 'Link an employee in User Access first';
    }
    return {
      id: candidate.id,
      name: candidate.name,
      email: candidate.email,
      role: candidate.role,
      status: candidate.status,
      branchId: candidate.branchId,
      branchName: candidate.branchName,
      phone: candidate.phone,
      isAssignable: unavailableReason === null,
      unavailableReason,
      managedBranches: candidate.managedBranches ?? [],
    };
  }
}
