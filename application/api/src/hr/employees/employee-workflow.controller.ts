import { includesBranch } from '../../foundation/auth/branch-scope.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { EmployeeDocumentService } from '../documents/employee-document.service.js';
import { EmployeeService } from './employee.service.js';
import {
  EmployeeWorkScheduleAssignmentDto,
  EmployeeWorkScheduleWeekQueryDto,
} from '../attendance/attendance.dto.js';

const managerRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const selfRoles = ['IT_ADMIN', 'STAFF', 'EMPLOYEE'] as const;

@Controller('employees/:employeeId/workflow')
export class EmployeeWorkflowController {
  constructor(
    private readonly employees: EmployeeService,
    private readonly attendance: AttendanceService,
    private readonly documents: EmployeeDocumentService,
  ) {}

  @Get('work-schedule')
  async getWorkSchedule(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    const user = request.user!;
    const showAllHistory =
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'HR_ADMIN' && (user.scope === 'ALL' || !user.branchId)) ||
      (selfRoles as readonly string[]).includes(user.role);
    return this.attendance.getEmployeeWorkSchedule(
      employee.id,
      employee.branchId,
      showAllHistory ? null : employee.branchId,
    );
  }

  @Get('work-schedule/week')
  async getWorkScheduleWeek(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @Query(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    query: EmployeeWorkScheduleWeekQueryDto,
  ) {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    return this.attendance.getWorkRoster(
      employee.branchId,
      query.weekStart,
      employee.id,
    );
  }

  @Post('work-schedule')
  async assignWorkSchedule(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: EmployeeWorkScheduleAssignmentDto,
  ) {
    const employee = await this.requireEmployee(employeeId);
    this.requireManagerAccess(employee.branchId, request);
    return this.attendance.assignEmployeeWorkSchedule(employeeId, input, {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('document-checklist')
  async getDocumentChecklist(
    @Param('employeeId') employeeId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const employee = await this.requireEmployee(employeeId);
    this.requireReadAccess(employee, request);
    return this.documents.getChecklist(employee.id, employee.branchId);
  }

  private async requireEmployee(employeeId: string) {
    const employee = await this.employees.findById(employeeId);
    if (!employee) throw new NotFoundException('Employee not found.');
    return employee;
  }

  private requireReadAccess(
    employee: { branchId: string; email: string },
    request: AuthenticatedRequest,
  ): void {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if ((selfRoles as readonly string[]).includes(user.role)) {
      if (user.email.toLowerCase() === employee.email.toLowerCase()) return;
      throw new ForbiddenException('You can only view your own employee file.');
    }
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Employee workflow access denied.');
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      (!user.branchId || !includesBranch(user, employee.branchId))
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (
      user.role === 'HR_ADMIN' &&
      user.branchId &&
      !includesBranch(user, employee.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
  }

  private requireManagerAccess(
    branchId: string,
    request: AuthenticatedRequest,
  ): void {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (user.role === 'SUPER_ADMIN') return;
    if (
      user.role === 'HR_ADMIN' &&
      includesBranch(user, branchId)
    ) {
      return;
    }
    if (user.role === 'BRANCH_MANAGER' && includesBranch(user, branchId)) return;
    throw new ForbiddenException('Employee schedule management denied.');
  }
}
