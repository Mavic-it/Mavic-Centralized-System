import {
  includesBranch,
  selectedBranchScope,
} from '../../foundation/auth/branch-scope.js';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  ForbiddenException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Optional,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { RequirePermission } from '../../foundation/auth/auth.decorators.js';
import { UserService } from '../../foundation/users/user.service.js';
import { DepartmentService } from '../../foundation/branches/departments.service.js';
import { CreateEmployeeDto } from './employee.dto.js';
import { EmployeeHrProfileService } from './employee-hr-profile.service.js';
import {
  AddEmployeeDocumentDto,
  UpdateEmergencyContactDto,
  UpdateEmployeeDto,
} from './employee-action.dto.js';
import { EmployeeRecord, EmployeeService } from './employee.service.js';

@Controller('employees')
export class EmployeeController {
  constructor(
    private readonly service: EmployeeService,
    private readonly users: UserService,
    private readonly profiles?: EmployeeHrProfileService,
    @Optional() private readonly departments?: DepartmentService,
  ) {}

  @Post()
  async createEmployee(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: CreateEmployeeDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmployeeRecord> {
    const user = request.user;
    const canManageAllBranches =
      user?.role === 'SUPER_ADMIN' ||
      (user?.role === 'HR_ADMIN' && !user.branchId);
    const canManageOwnBranch =
      (user?.role === 'HR_ADMIN' || user?.role === 'BRANCH_MANAGER') &&
      Boolean(user.branchId) &&
      includesBranch(user, input.branchId);
    if (!canManageAllBranches && !canManageOwnBranch) {
      throw new ForbiddenException('Employee creation access denied.');
    }

    this.requireWorkBranchScope(request, input);
    const name = [
      input.firstName,
      input.middleName,
      input.lastName,
      input.suffix,
    ]
      .filter(Boolean)
      .join(' ');
    const sourceName = name || input.name?.trim() || '';
    if (!sourceName) {
      throw new BadRequestException(
        'Provide first and last name, or a full name.',
      );
    }
    if (
      this.departments &&
      !(await this.departments.hasName(input.branchId, input.department))
    ) {
      throw new BadRequestException(
        'Select a department that belongs to the selected branch.',
      );
    }
    const employee = await this.service.createEmployee(
      {
        branchId: input.branchId,
        name: sourceName,
        email: input.email,
        position: input.position,
        department: input.department,
        status: input.status,
        employment: {
          ...(input.workBranchIds !== undefined ? { workBranchIds: input.workBranchIds } : {}),
          ...(input.allWorkBranches !== undefined ? { allWorkBranches: input.allWorkBranches } : {}),
          employeeType: input.employmentType,
          startDate: input.startDate,
          ...(input.probationEndDate !== undefined
            ? { probationEndDate: input.probationEndDate }
            : {}),
          ...(input.evaluationDueDate !== undefined
            ? { evaluationDueDate: input.evaluationDueDate }
            : {}),
        },
        emergencyContact: undefined,
        phone: input.phone,
        manager: input.manager,
        managerEmployeeId: input.managerEmployeeId,
        workSchedule: input.workSchedule,
      },
      {
        userId: user.userId,
        role: user.role,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
    if (this.profiles) {
      const nameParts = sourceName.split(/\s+/).filter(Boolean);
      const firstName = input.firstName?.trim() || nameParts[0];
      const lastName =
        input.lastName?.trim() ||
        (nameParts.length > 1 ? nameParts.at(-1) : undefined);
      const middleName =
        input.middleName?.trim() ||
        (nameParts.length > 2 ? nameParts.slice(1, -1).join(' ') : undefined);
      await this.profiles.update(
        employee.id,
        {
          ...(firstName ? { firstName } : {}),
          ...(middleName ? { middleName } : {}),
          ...(lastName ? { lastName } : {}),
          ...(input.suffix ? { suffix: input.suffix } : {}),
        },
        input.branchId,
        {
          userId: user.userId,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        },
      );
    }
    return employee;
  }

  create(input: EmployeeRecord): EmployeeRecord {
    return this.service.create(input);
  }

  @Patch(':id')
  async updateEmployee(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: UpdateEmployeeDto,
  ): Promise<EmployeeRecord> {
    await this.requireUpdateAccess(id, request, ['phone'], input);
    const current = await this.service.findById(id);
    if (!current) throw new NotFoundException('Employee not found.');
    const branchId = input.branchId ?? current.branchId;
    if (
      branchId !== current.branchId &&
      request.user?.role !== 'SUPER_ADMIN' &&
      !(
        request.user?.role === 'HR_ADMIN' &&
        (request.user.scope === 'ALL' || !request.user.branchId) &&
        includesBranch(request.user, branchId)
      )
    ) {
      throw new ForbiddenException('Branch reassignment access denied.');
    }
    this.requireWorkBranchScope(request, input);
    const department = input.department ?? current.department;
    if (
      this.departments &&
      !(await this.departments.hasName(branchId, department))
    ) {
      throw new BadRequestException(
        'Select a department that belongs to the selected branch.',
      );
    }
    const employee = await this.service.updateEmployee(
      id,
      {
        name: input.name,
        email: input.email,
        branchId: input.branchId,
        position: input.position,
        department: input.department,
        status: input.status,
        manager: input.manager,
        managerEmployeeId: input.managerEmployeeId,
        phone: input.phone,
        employment:
          input.workBranchIds !== undefined || input.allWorkBranches !== undefined ||
          input.employmentType !== undefined ||
          input.startDate !== undefined ||
          input.probationEndDate !== undefined ||
          input.evaluationDueDate !== undefined
            ? {
                ...(input.workBranchIds !== undefined ? { workBranchIds: input.workBranchIds } : {}),
                ...(input.allWorkBranches !== undefined ? { allWorkBranches: input.allWorkBranches } : {}),
                employeeType:
                  input.employmentType ?? current.employment.employeeType,
                startDate: input.startDate ?? current.employment.startDate,
                ...(input.probationEndDate !== undefined
                  ? { probationEndDate: input.probationEndDate }
                  : {}),
                ...(input.evaluationDueDate !== undefined
                  ? { evaluationDueDate: input.evaluationDueDate }
                  : {}),
              }
            : undefined,
      },
      {
        userId: request.user?.userId,
        role: request.user?.role,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        effectiveDate: input.effectiveDate,
      },
    );
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  @Patch(':id/emergency-contact')
  async updateEmergencyContact(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: UpdateEmergencyContactDto,
  ): Promise<EmployeeRecord> {
    await this.requireUpdateAccess(
      id,
      request,
      ['name', 'relationship', 'phone', 'employeePhone'],
      input,
    );
    const employee = await this.service.updateEmployee(
      id,
      {
        emergencyContact: {
          name: input.name,
          relationship: input.relationship,
          phone: input.phone,
        },
        ...(input.employeePhone !== undefined
          ? { phone: input.employeePhone || null }
          : {}),
      },
      {
        userId: request.user?.userId,
        role: request.user?.role,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
    );
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  @Delete(':id')
  @RequirePermission('employees', 'DELETE', 'ALL')
  async deleteEmployee(
    @Param('id') id: string,
  ): Promise<{ success: true; message: string }> {
    try {
      await this.service.deleteEmployee(id);
      return { success: true, message: 'Employee deleted successfully' };
    } catch (error) {
      throw new ConflictException(
        error instanceof Error ? error.message : 'Employee cannot be deleted.',
      );
    }
  }

  @Delete(':id/documents/:documentIndex')
  async removeLegacyDocument(
    @Param('id') id: string,
    @Param('documentIndex') documentIndex: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmployeeRecord> {
    await this.requireDocumentManageAccess(id, request);
    const index = Number(documentIndex);
    if (!Number.isInteger(index) || index < 0) {
      throw new BadRequestException('Invalid employee document reference.');
    }
    const updated = await this.service.removeLegacyDocument(id, index, {
      userId: request.user?.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    if (!updated) throw new NotFoundException('Employee not found.');
    return updated;
  }

  @Post(':id/documents')
  async addDocument(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: AddEmployeeDocumentDto,
  ): Promise<EmployeeRecord> {
    await this.requireUpdateAccess(id, request, [], input);
    const employee = await this.service.addDocument(id, input, {
      userId: request.user?.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ): Promise<EmployeeRecord[]> {
    const role = request.user?.role;
    if (
      role !== 'SUPER_ADMIN' &&
      role !== 'HR_ADMIN' &&
      role !== 'BRANCH_MANAGER'
    ) {
      throw new ForbiddenException('Employee directory access denied.');
    }
    if (
      role === 'BRANCH_MANAGER' &&
      !request.user?.branchId &&
      !request.user?.branchIds?.length
    )
      throw new ForbiddenException(
        'Branch manager must be assigned to a branch.',
      );
    const scope = selectedBranchScope(request.user!);
    if (branchId && scope && !scope.includes(branchId))
      throw new ForbiddenException('Branch access denied.');
    const employees =
      scope === undefined
        ? await this.service.list(branchId)
        : (
            await Promise.all(
              (branchId ? [branchId] : scope).map((id) =>
                this.service.list(id),
              ),
            )
          ).flat();
    return employees.map((employee) =>
      this.limitSensitiveFields(employee, role),
    );
  }

  @Get('me')
  async me(@Req() request: AuthenticatedRequest): Promise<EmployeeRecord> {
    const account = request.user
      ? await this.users.findById(request.user.userId)
      : undefined;
    const linkedEmployee = account?.employeeId
      ? await this.service.findById(account.employeeId)
      : undefined;
    const employee =
      linkedEmployee ??
      (request.user?.role === 'SUPER_ADMIN'
        ? undefined
        : await this.service.findByEmail(request.user?.email ?? ''));
    if (!employee)
      throw new NotFoundException(
        'No employee record is linked to this account.',
      );
    return this.limitSensitiveFields(employee, request.user?.role);
  }

  @Get('account-options')
  async accountOptions(
    @Req() request: AuthenticatedRequest,
  ): Promise<
    Array<
      Pick<
        EmployeeRecord,
        'id' | 'employeeNumber' | 'name' | 'email' | 'branchId' | 'branchName' | 'employment' | 'workBranches'
      >
    >
  > {
    if (
      request.user?.role !== 'SUPER_ADMIN' &&
      request.user?.role !== 'IT_ADMIN'
    ) {
      throw new ForbiddenException('User account setup access denied.');
    }

    const employees = await this.service.list();
    const accountEmails = new Set(await this.users.listAccountEmails());
    const linkedEmployeeIds = new Set(await this.users.listLinkedEmployeeIds());
    return employees.map(({ id, employeeNumber, name, email, branchId, branchName, employment, workBranches }) => ({
      id,
      employeeNumber,
      name,
      email,
      branchId,
      branchName,
      employment,
      workBranches,
      hasUserAccount:
        linkedEmployeeIds.has(id) || accountEmails.has(email.toLowerCase()),
    }));
  }

  @Get(':id/assignment-history')
  async assignmentHistory(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.service.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');
    const user = request.user;
    const canView =
      user?.role === 'SUPER_ADMIN' ||
      (user?.role === 'HR_ADMIN' && includesBranch(user, employee.branchId)) ||
      (user?.role === 'BRANCH_MANAGER' &&
        Boolean(user.branchId) &&
        includesBranch(user, employee.branchId)) ||
      ((user?.role === 'IT_ADMIN' ||
        user?.role === 'STAFF' ||
        user?.role === 'EMPLOYEE') &&
        user.email.toLowerCase() === employee.email.toLowerCase());
    if (!canView) throw new ForbiddenException('Employee access denied.');
    return this.service.listAssignmentHistory(id);
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmployeeRecord> {
    const employee = await this.service.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');
    const user = request.user;
    const canView =
      user?.role === 'SUPER_ADMIN' ||
      (user?.role === 'HR_ADMIN' && includesBranch(user, employee.branchId)) ||
      (user?.role === 'BRANCH_MANAGER' &&
        Boolean(user.branchId) &&
        includesBranch(user, employee.branchId)) ||
      ((user?.role === 'IT_ADMIN' ||
        user?.role === 'STAFF' ||
        user?.role === 'EMPLOYEE') &&
        user.email.toLowerCase() === employee.email.toLowerCase());
    if (!canView) throw new ForbiddenException('Employee access denied.');
    const hasUserAccount =
      user?.role === 'SUPER_ADMIN' || user?.role === 'IT_ADMIN'
        ? await this.users.hasAccountForEmployee(employee.id, employee.email)
        : undefined;
    return this.limitSensitiveFields(
      {
        ...employee,
        ...(hasUserAccount !== undefined ? { hasUserAccount } : {}),
      },
      user?.role,
    );
  }

  private requireWorkBranchScope(request: AuthenticatedRequest, input: { workBranchIds?: string[]; allWorkBranches?: boolean }) {
    if (input.allWorkBranches && request.user?.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Only a Super Admin can assign all current and future work branches.');
    if (input.workBranchIds?.some(id => !request.user || !includesBranch(request.user, id)))
      throw new ForbiddenException('Work branch assignment access denied.');
  }

  private limitSensitiveFields(
    employee: EmployeeRecord,
    role: string | undefined,
  ): EmployeeRecord {
    const safeEmployee = { ...employee };
    if (role === 'BRANCH_MANAGER') {
      delete safeEmployee.salary;
      return safeEmployee;
    }
    if (role !== 'IT_ADMIN') return employee;
    delete safeEmployee.salary;
    delete safeEmployee.phone;
    delete safeEmployee.emergencyContact;
    delete safeEmployee.governmentIds;
    delete safeEmployee.documents;
    delete safeEmployee.attendance;
    return safeEmployee;
  }

  private async requireUpdateAccess(
    id: string,
    request: AuthenticatedRequest,
    ownerFields: readonly string[],
    input: object,
  ): Promise<EmployeeRecord> {
    const employee = await this.service.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');
    const user = request.user;
    const canManageBranch =
      (user?.role === 'HR_ADMIN' && includesBranch(user, employee.branchId)) ||
      (user?.role === 'BRANCH_MANAGER' &&
        Boolean(user.branchId) &&
        includesBranch(user, employee.branchId));
    const isSelf = user?.email.toLowerCase() === employee.email.toLowerCase();
    const submittedFields = Object.entries(input).filter(
      ([, value]) => value !== undefined,
    );
    const ownerFieldsOnly = submittedFields.every(([field]) =>
      ownerFields.includes(field),
    );
    const canUpdate =
      user?.role === 'SUPER_ADMIN' ||
      canManageBranch ||
      (user?.role !== 'IT_ADMIN' && isSelf && ownerFieldsOnly);
    if (!canUpdate)
      throw new ForbiddenException('Employee update access denied.');
    return employee;
  }

  private async requireDocumentManageAccess(
    id: string,
    request: AuthenticatedRequest,
  ): Promise<EmployeeRecord> {
    const employee = await this.service.findById(id);
    if (!employee) throw new NotFoundException('Employee not found.');
    const user = request.user;
    const canManage =
      user?.role === 'SUPER_ADMIN' ||
      (user?.role === 'HR_ADMIN' && includesBranch(user, employee.branchId)) ||
      (user?.role === 'BRANCH_MANAGER' &&
        Boolean(user.branchId) &&
        includesBranch(user, employee.branchId));
    if (!canManage) {
      throw new ForbiddenException(
        'Employee document management access denied.',
      );
    }
    return employee;
  }
}
