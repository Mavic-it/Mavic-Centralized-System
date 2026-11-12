import { includesBranch, selectedBranchScope } from '../auth/branch-scope.js';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  UnauthorizedException,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { AuthService } from '../auth/auth.service.js';
import { UserService } from '../users/user.service.js';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
} from './department.dto.js';
import { DepartmentService } from './departments.service.js';
import {
  BranchService,
  type BranchListFilter,
  type BranchStatus,
  type CreateBranchInput,
  type UpdateBranchInput,
} from './branches.service.js';
import {
  BranchStatusDto,
  CreateBranchDto,
  DeleteBranchDto,
  UpdateBranchDto,
} from './branch.dto.js';

@Controller('branches')
export class BranchesController {
  private readonly users: UserService;
  private readonly auth: AuthService;

  constructor(
    private readonly service: BranchService,
    private readonly authorization: AuthorizationService,
    users: UserService = new UserService(),
    auth?: AuthService,
    @Optional() private readonly departments?: DepartmentService,
  ) {
    this.users = users;
    this.auth = auth ?? new AuthService(users);
  }

  @Get('manager-options')
  async managerOptions(
    @Req() request: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ) {
    const user = request.user;
    if (
      !user ||
      !['SUPER_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(user.role)
    ) {
      throw new ForbiddenException('Manager list access denied');
    }
    if (user.role === 'BRANCH_MANAGER' && !user.branchId) {
      throw new ForbiddenException('Branch assignment required');
    }
    const scope = this.authorize(request, 'VIEW');
    const selectedBranchId = branchId ||
      (scope === 'BRANCH' ? user.branchId! : undefined);
    if (selectedBranchId) {
      await this.authorizeBranchRecord(request, selectedBranchId, 'VIEW');
    }
    const managers = await this.users.listBranchManagerOptions(selectedBranchId);
    const currentManagerId = scope === 'BRANCH' && user.role === 'BRANCH_MANAGER'
      ? (await this.service.findById(selectedBranchId!))?.managerUserId
      : undefined;
    return {
      success: true,
      data: scope === 'BRANCH' && user.role === 'BRANCH_MANAGER'
        ? managers.filter((manager) =>
            manager.branchId === selectedBranchId || manager.id === currentManagerId)
        : managers,
      message: 'Branch manager accounts retrieved successfully',
    };
  }

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: Record<string, string | undefined>,
  ) {
    this.authorize(request, 'VIEW');
    const filter = this.parseListFilter(query);
    const selected = selectedBranchScope(request.user!);
    if (selected !== undefined) {
      if (filter.branchId && !selected.includes(filter.branchId)) throw new ForbiddenException('Branch access denied');
      filter.branchIds = selected;
    }
    const result = await this.service.list(filter);
    return {
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        permissions: {
          canDelete:
            request.user?.role === 'SUPER_ADMIN' &&
            this.authorization.authorize({
              userId: request.user.userId,
              role: request.user.role,
              branchId: 'ALL',
              module: 'branches',
              action: 'DELETE',
              scope: 'ALL',
            }).allowed,
        },
      },
      message: 'Branches retrieved successfully',
    };
  }

  @Get(':id')
  async get(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    this.authorize(request, 'VIEW');
    const branch = await this.service.findById(id);
    if (!branch) throw new NotFoundException('Branch not found');
    if (!includesBranch(request.user!, branch.id)) {
      throw new ForbiddenException('Branch access denied');
    }
    return {
      success: true,
      data: branch,
      message: 'Branch retrieved successfully',
    };
  }

  @Get(':id/departments')
  async listDepartments(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.authorizeBranchRecord(request, id, 'VIEW');
    if (!this.departments) throw new NotFoundException('Departments unavailable');
    const departments = await this.departments.list(id);
    return {
      success: true,
      data: departments,
      message: 'Branch departments retrieved successfully',
    };
  }

  @Post(':id/departments')
  async createDepartment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: CreateDepartmentDto,
  ) {
    await this.authorizeBranchRecord(request, id, 'UPDATE');
    if (!this.departments) throw new NotFoundException('Departments unavailable');
    const department = await this.departments.create(
      id,
      input.name,
      request.user!.userId,
    );
    return {
      success: true,
      data: department,
      message: 'Department created successfully',
    };
  }

  @Patch(':id/departments/:departmentId')
  async updateDepartment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('departmentId') departmentId: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: UpdateDepartmentDto,
  ) {
    await this.authorizeBranchRecord(request, id, 'UPDATE');
    if (!this.departments) throw new NotFoundException('Departments unavailable');
    const department = await this.departments.update(
      id,
      departmentId,
      input.name,
      request.user!.userId,
    );
    return {
      success: true,
      data: department,
      message: 'Department updated successfully',
    };
  }

  @Delete(':id/departments/:departmentId')
  async deleteDepartment(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('departmentId') departmentId: string,
  ) {
    await this.authorizeBranchRecord(request, id, 'UPDATE');
    if (!this.departments) throw new NotFoundException('Departments unavailable');
    const department = await this.departments.delete(
      id,
      departmentId,
      request.user!.userId,
    );
    return {
      success: true,
      data: department,
      message: 'Department deleted successfully',
    };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: CreateBranchDto,
  ) {
    this.authorize(request, 'CREATE');
    if (input.managerUserId) this.authorizeManagerAssignment(request);
    const branch = await this.service.create(
      input as CreateBranchInput,
      request.user?.userId,
    );
    if (input.managerUserId) {
      this.auth.revokeSessionsForUser(input.managerUserId);
    }
    return {
      success: true,
      data: branch,
      message: 'Branch created successfully',
    };
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: UpdateBranchDto,
  ) {
    await this.authorizeBranchRecord(request, id);
    const previous = await this.service.findById(id);
    if (
      input.managerUserId !== undefined &&
      input.managerUserId !== previous?.managerUserId
    ) {
      this.authorizeManagerAssignment(request);
    }
    const branch = await this.service.update(
      id,
      input as UpdateBranchInput,
      request.user?.userId,
    );
    if (
      input.managerUserId !== undefined &&
      input.managerUserId !== previous?.managerUserId
    ) {
      if (input.managerUserId) this.auth.revokeSessionsForUser(input.managerUserId);
      if (previous?.managerUserId) this.auth.revokeSessionsForUser(previous.managerUserId);
    }
    return {
      success: true,
      data: branch,
      message: 'Branch updated successfully',
    };
  }

  @Patch(':id/status')
  async setStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: BranchStatusDto,
  ) {
    await this.authorizeBranchRecord(request, id);
    const branch = await this.service.setStatus(
      id,
      input.status as BranchStatus,
      request.user?.userId,
    );
    return {
      success: true,
      data: branch,
      message:
        input.status === 'ACTIVE'
          ? 'Branch activated successfully'
          : 'Branch deactivated successfully',
    };
  }

  @Delete(':id')
  async delete(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: DeleteBranchDto,
  ) {
    this.authorize(request, 'DELETE');
    const actor = request.user!;
    const currentUser = await this.users.findByEmail(actor.email);
    if (
      !currentUser ||
      currentUser.id !== actor.userId ||
      currentUser.role !== 'SUPER_ADMIN' ||
      currentUser.status !== 'ACTIVE' ||
      !currentUser.passwordHash ||
      !(await this.auth.verifyPassword(
        input.currentPassword,
        currentUser.passwordHash,
      ))
    ) {
      throw new UnauthorizedException('Password confirmation failed');
    }

    const branch = await this.service.delete(id, currentUser.id);
    return {
      success: true,
      data: { id: branch.id, code: branch.code, name: branch.name },
      message: 'Branch deleted successfully',
    };
  }

  private authorize(
    request: AuthenticatedRequest,
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE',
  ): 'ALL' | 'BRANCH' {
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');
    const scope =
      user.role === 'SUPER_ADMIN' ||
      user.role === 'IT_ADMIN' ||
      ((user.role === 'HR_ADMIN' || user.role === 'BRANCH_MANAGER') &&
        !user.branchId)
        ? 'ALL'
        : 'BRANCH';
    if (scope === 'BRANCH' && !user.branchId) {
      throw new ForbiddenException('Branch access denied');
    }
    const decision = this.authorization.authorize({
      userId: user.userId,
      role: user.role,
      branchId: scope === 'ALL' ? 'ALL' : user.branchId!,
      module: 'branches',
      action,
      scope,
    });
    if (!decision.allowed) {
      throw new ForbiddenException('Insufficient permission');
    }
    return scope;
  }

  private authorizeManagerAssignment(request: AuthenticatedRequest): void {
    if (
      request.user?.role !== 'SUPER_ADMIN' &&
      request.user?.role !== 'HR_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only Super Admin or HR Admin can assign a branch manager.',
      );
    }
  }

  private async authorizeBranchRecord(
    request: AuthenticatedRequest,
    branchId: string,
    action: 'VIEW' | 'UPDATE' = 'UPDATE',
  ): Promise<void> {
    this.authorize(request, action);
    const branch = await this.service.findById(branchId);
    if (!branch || !includesBranch(request.user!, branch.id)) {
      throw new ForbiddenException('Branch access denied');
    }
  }

  private parseListFilter(
    query: Record<string, string | undefined>,
  ): BranchListFilter {
    const status = query.status ?? 'ALL';
    if (!['ALL', 'ACTIVE', 'INACTIVE'].includes(status)) {
      throw new BadRequestException('status must be ALL, ACTIVE, or INACTIVE');
    }
    const page = this.parsePositiveInteger(query.page, 1, 'page');
    const pageSize = this.parsePositiveInteger(query.pageSize, 20, 'pageSize');
    if (pageSize > 100) {
      throw new BadRequestException('pageSize cannot exceed 100');
    }
    if (query.search && query.search.length > 200) {
      throw new BadRequestException('search cannot exceed 200 characters');
    }
    return {
      status: status as BranchStatus | 'ALL',
      search: query.search?.trim(),
      branchId: query.branchId,
      page,
      pageSize,
    };
  }

  private parsePositiveInteger(
    value: string | undefined,
    fallback: number,
    name: string,
  ): number {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new BadRequestException(`${name} must be a positive integer`);
    }
    return parsed;
  }
}
