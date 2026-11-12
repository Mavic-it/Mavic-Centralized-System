import { includesBranch, selectedBranchScope } from '../../foundation/auth/branch-scope.js';
import {
  BadRequestException,
  Body,
  Controller,
  ConflictException,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { EmployeeService } from '../employees/employee.service.js';
import {
  BranchAttendanceScheduleDto,
  AttendanceCorrectionDto,
  AttendanceOvertimeDecisionDto,
  AttendanceQueryDto,
  AttendanceWorkRosterQueryDto,
  AttendanceWorkRosterSaveDto,
} from './attendance.dto.js';
import {
  AttendanceService,
  type AttendanceWorkRosterInput,
} from './attendance.service.js';
const managerRoles = ['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'] as const;
const ownRecordRoles = ['STAFF', 'EMPLOYEE'] as const;
@Controller('attendance')
export class AttendanceController {
  constructor(
    private readonly service: AttendanceService,
    private readonly employees: EmployeeService,
  ) {}

  @Get('me')
  async mine(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    query: AttendanceQueryDto,
  ) {
    this.requireClockAccess(request);
    const employee = await this.ownEmployee(request);
    return this.service.list({
      employeeId: employee.id,
      branchId: employee.branchId,
      approvedDtrOnly: true,
      ...this.dateRange(query),
    });
  }

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    query: AttendanceQueryDto,
  ) {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if ((ownRecordRoles as readonly string[]).includes(user.role)) {
      const employee = await this.employees.findByEmail(user.email);
      return employee
        ? this.service.list({
            employeeId: employee.id,
            branchId: employee.branchId,
            approvedDtrOnly: true,
            ...this.dateRange(query),
          })
        : [];
    }
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Attendance access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId && !user.branchIds?.length) throw new ForbiddenException('Branch assignment required.');
    const scope = selectedBranchScope(user);
    if (query.branchId && scope && !scope.includes(query.branchId)) throw new ForbiddenException('Branch access denied.');
    const filters = { employeeId: query.employeeId, ...this.dateRange(query) };
    return scope === undefined ? this.service.list({ ...filters, branchId: query.branchId })
      : (await Promise.all((query.branchId ? [query.branchId] : scope).map(branchId => this.service.list({ ...filters, branchId })))).flat();
  }

  @Post('clock-in')
  async clockIn(@Req() request: AuthenticatedRequest) {
    this.requireClockAccess(request);
    const employee = await this.ownEmployee(request);
    return this.service.clockIn(employee);
  }

  @Post('clock-out')
  async clockOut(@Req() request: AuthenticatedRequest) {
    this.requireClockAccess(request);
    const employee = await this.ownEmployee(request);
    return this.service.clockOut(employee, new Date(), {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('schedules/:branchId')
  async getSchedule(
    @Param('branchId') branchId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    await this.requireScheduleRead(request, branchId);
    return (await this.service.getSchedule(branchId)) ?? null;
  }

  @Put('schedules/:branchId')
  async saveSchedule(
    @Param('branchId') branchId: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    input: BranchAttendanceScheduleDto,
  ) {
    this.requireScheduleWrite(request, branchId);
    return this.service.saveSchedule(branchId, input, {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Get('work-roster')
  async getWorkRoster(
    @Req() request: AuthenticatedRequest,
    @Query(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    query: AttendanceWorkRosterQueryDto,
  ) {
    const user = this.requireManager(request);
    const branchId = this.managerBranchFilter(user, query.branchId);
    if (!branchId) throw new BadRequestException('Select a branch to load its weekly roster.');
    return this.service.getWorkRoster(branchId, query.weekStart);
  }

  @Put('work-roster')
  async saveWorkRoster(
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    input: AttendanceWorkRosterSaveDto,
  ) {
    const user = this.requireManager(request);
    this.requireBranchAccess(user, input.branchId);
    return this.service.saveWorkRoster(input as AttendanceWorkRosterInput, {
      userId: user.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Patch(':id')
  async correct(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
    input: AttendanceCorrectionDto,
  ) {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Attendance correction access denied.');
    }
    const existing = await this.service.findById(id);
    if (!existing) throw new NotFoundException('Attendance record not found.');
    if(existing.dtrCalculation)throw new ConflictException('Use Attendance & DTR review for imported records so corrections, approval and period locks remain consistent.');
    if (
      user.role !== 'SUPER_ADMIN' &&
      !includesBranch(user, existing.branchId)
    ) {
      throw new ForbiddenException('Branch access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required.');
    }
    const corrected = await this.service.correct(id, input, {
      userId: user.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
    if (!corrected) throw new NotFoundException('Attendance record not found.');
    return corrected;
  }

  @Get(':id/corrections')
  async correctionHistory(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const user = this.requireManager(request);
    const record = await this.service.findById(id);
    if (!record) throw new NotFoundException('Attendance record not found.');
    this.requireBranchAccess(user, record.branchId);
    return this.service.listCorrections(id);
  }

  @Post(':id/overtime-approval')
  async decideOvertime(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: AttendanceOvertimeDecisionDto,
  ) {
    const user = this.requireManager(request);
    const record = await this.service.findById(id);
    if (!record) throw new NotFoundException('Attendance record not found.');
    this.requireBranchAccess(user, record.branchId);
    return this.service.decideOvertimeApproval(id, input, {
      userId: user.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  private async ownEmployee(request: AuthenticatedRequest) {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    const employee = await this.employees.findByEmail(user.email);
    if (!employee) throw new NotFoundException('No employee record is linked to this account.');
    return { id: employee.id, branchId: employee.branchId };
  }

  private requireClockAccess(request: AuthenticatedRequest): void {
    const role = request.user?.role;
    if (
      !role ||
      (!(managerRoles as readonly string[]).includes(role) &&
        !(ownRecordRoles as readonly string[]).includes(role))
    ) {
      throw new ForbiddenException('Attendance clock access denied.');
    }
  }

  private requireManager(request: AuthenticatedRequest) {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (!(managerRoles as readonly string[]).includes(user.role)) {
      throw new ForbiddenException('Attendance management access denied.');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required.');
    }
    return user;
  }

  private managerBranchFilter(
    user: NonNullable<AuthenticatedRequest['user']>,
    requestedBranchId?: string,
  ): string | undefined {
    if (user.branchIds !== undefined) {
      if (requestedBranchId && !includesBranch(user, requestedBranchId)) throw new ForbiddenException('Branch access denied.');
      return requestedBranchId ?? user.branchId ?? user.branchIds[0];
    }
    if (user.role === 'SUPER_ADMIN' || (user.role === 'HR_ADMIN' && !user.branchId)) {
      if (requestedBranchId) this.requireBranchAccess(user, requestedBranchId);
      return requestedBranchId;
    }
    if (user.branchId) {
      if (requestedBranchId && requestedBranchId !== user.branchId) {
        throw new ForbiddenException('Branch access denied.');
      }
      return user.branchId;
    }
    throw new ForbiddenException('Branch assignment required.');
  }

  private requireBranchAccess(
    user: NonNullable<AuthenticatedRequest['user']>,
    branchId: string,
  ): void {
    if (user.role === 'SUPER_ADMIN') return;
    if (user.role === 'HR_ADMIN' && includesBranch(user, branchId)) return;
    if (user.role === 'BRANCH_MANAGER' && includesBranch(user, branchId)) return;
    throw new ForbiddenException('Branch access denied.');
  }

  private isIsoDate(value?: string): boolean {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private dateRange(query: AttendanceQueryDto): {
    from: string;
    to: string;
  } {
    const today = new Date().toISOString().slice(0, 10);
    const fromDefault = new Date(`${today}T00:00:00.000Z`);
    fromDefault.setUTCDate(fromDefault.getUTCDate() - 30);
    return {
      from: query.from ?? fromDefault.toISOString().slice(0, 10),
      to: query.to ?? today,
    };
  }

  private async requireScheduleRead(
    request: AuthenticatedRequest,
    branchId: string,
  ): Promise<void> {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (user.role === 'SUPER_ADMIN') return;
    if (
      user.role === 'HR_ADMIN' &&
      includesBranch(user, branchId)
    ) {
      return;
    }
    if (
      user.role === 'BRANCH_MANAGER' &&
      user.branchId &&
      includesBranch(user, branchId)
    ) return;
    if ((ownRecordRoles as readonly string[]).includes(user.role)) {
      const employee = await this.employees.findByEmail(user.email);
      if (!employee || employee.branchId !== branchId) {
        throw new ForbiddenException('Attendance schedule access denied.');
      }
      return;
    }
    throw new ForbiddenException('Attendance schedule access denied.');
  }

  private requireScheduleWrite(
    request: AuthenticatedRequest,
    branchId: string,
  ): void {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required.');
    if (
      user.role === 'SUPER_ADMIN' ||
      (user.role === 'HR_ADMIN' &&
        includesBranch(user, branchId)) ||
      (user.role === 'BRANCH_MANAGER' &&
        Boolean(user.branchId) &&
        includesBranch(user, branchId))
    ) {
      return;
    }
    throw new ForbiddenException('Attendance schedule management denied.');
  }
}
