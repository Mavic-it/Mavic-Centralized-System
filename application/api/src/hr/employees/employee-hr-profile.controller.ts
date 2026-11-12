import { includesBranch } from '../../foundation/auth/branch-scope.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from './employee.service.js';
import { UpdateEmployeeHrProfileDto } from './employee-hr-profile.dto.js';
import {
  EmployeeHrProfileService,
  type EmployeeHrProfile,
} from './employee-hr-profile.service.js';

const selfRoles = ['IT_ADMIN', 'STAFF', 'EMPLOYEE'] as const;
const selfEditableFields = new Set([
  'firstName',
  'middleName',
  'lastName',
  'suffix',
  'preferredName',
  'dateOfBirth',
  'gender',
  'civilStatus',
  'nationality',
  'personalEmail',
  'currentAddress',
  'permanentAddress',
]);

@Controller('employees/:employeeId/hr-profile')
export class EmployeeHrProfileController {
  constructor(
    private readonly profiles: EmployeeHrProfileService,
    private readonly employees: EmployeeService,
  ) {}

  @Get()
  async get(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmployeeHrProfile | null> {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, user);
    const profile = await this.profiles.findByEmployeeId(employeeId);
    if (!profile) return null;
    if (user.role === 'BRANCH_MANAGER' || user.role === 'IT_ADMIN') {
      return this.hideSalary(profile);
    }
    return profile;
  }

  @Patch()
  async update(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    input: UpdateEmployeeHrProfileDto,
  ): Promise<EmployeeHrProfile> {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (user.role === 'IT_ADMIN') {
      throw new ForbiddenException('HR profile update denied.');
    }
    const employee = await this.requireEmployee(employeeId);
    const isManager = this.canManageBranch(employee.branchId, user);
    const isSelf =
      (selfRoles as readonly string[]).includes(user.role) &&
      user.email.toLowerCase() === employee.email.toLowerCase();
    if (!isManager && !isSelf) {
      throw new ForbiddenException('Employee HR profile update denied.');
    }
    const changedFields = Object.keys(input).filter(
      (key) => input[key as keyof UpdateEmployeeHrProfileDto] !== undefined,
    );
    if (isSelf && changedFields.some((field) => !selfEditableFields.has(field))) {
      throw new ForbiddenException(
        'Employees may only update their personal profile fields.',
      );
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      changedFields.some((field) => field === 'salaryGrade' || field === 'basicSalary')
    ) {
      throw new ForbiddenException('Compensation profile access denied.');
    }
    const profile = await this.profiles.update(
      employeeId,
      input,
      employee.branchId,
      {
        userId: user.userId,
        ip: request.ip,
        userAgent: request.get('user-agent'),
      },
    );
    return user.role === 'BRANCH_MANAGER' ? this.hideSalary(profile) : profile;
  }

  private async requireEmployee(employeeId: string) {
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  private requireReadAccess(
    employee: { branchId: string; email: string },
    user: NonNullable<AuthenticatedRequest['user']>,
  ): void {
    const isSelf =
      (selfRoles as readonly string[]).includes(user.role) &&
      user.email.toLowerCase() === employee.email.toLowerCase();
    if (isSelf) return;
    if (!this.canManageBranch(employee.branchId, user)) {
      throw new ForbiddenException('Employee HR profile access denied.');
    }
  }

  private canManageBranch(
    employeeBranchId: string,
    user: NonNullable<AuthenticatedRequest['user']>,
  ): boolean {
    if (user.role === 'SUPER_ADMIN') return true;
    if (user.role === 'HR_ADMIN') {
      return includesBranch(user, employeeBranchId);
    }
    return (
      user.role === 'BRANCH_MANAGER' &&
      Boolean(user.branchId) &&
      includesBranch(user, employeeBranchId)
    );
  }

  private hideSalary(profile: EmployeeHrProfile): EmployeeHrProfile {
    return { ...profile, basicSalary: null, salaryGrade: null };
  }
}
