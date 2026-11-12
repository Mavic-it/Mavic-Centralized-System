import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Query,
  ValidationPipe,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { RequirePermission } from '../auth/auth.decorators.js';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { BranchService } from '../branches/branches.service.js';
import { DepartmentService } from '../branches/departments.service.js';
import { CreateUserDto } from './user.dto.js';
import {
  ResetUserPasswordDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
  UpdateUserBranchDto,
  AdminBranchAccessDto,
} from './user-action.dto.js';
import { UserService, type UserRecord } from './user.service.js';
import { AccountProvisioningService } from './account-provisioning.service.js';

@Controller('users')
export class UserController {
  constructor(
    private readonly service: UserService,
    private readonly branches: BranchService,
    private readonly auth: AuthService = new AuthService(),
    @Optional() private readonly departments?: DepartmentService,
    @Optional() private readonly provisioning?: AccountProvisioningService,
  ) {}

  create(input: UserRecord): UserRecord {
    return this.service.create(input);
  }

  @Get()
  async list(@Req() request: AuthenticatedRequest, @Query('branchId') branchId?: string): Promise<UserRecord[]> {
    const scope = await this.accountBranchScope(request);
    if (!scope) {
      const accounts = await this.service.list(branchId);
      return request.user?.role === 'HR_ADMIN'
        ? accounts.filter((account) => ['EMPLOYEE', 'STAFF'].includes(account.role))
        : accounts;
    }
    if (branchId && !scope.includes(branchId)) throw new ForbiddenException('Account branch access denied.');
    const accounts = (await Promise.all((branchId ? [branchId] : scope).map((id) => this.service.list(id)))).flat();
    return accounts.filter((account) => ['EMPLOYEE', 'STAFF'].includes(account.role));
  }

  private async accountBranchScope(request: AuthenticatedRequest): Promise<string[] | undefined> {
    const actor = request.user;
    if (!actor || !['SUPER_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'].includes(actor.role)) {
      throw new ForbiddenException('User access denied.');
    }
    if (['HR_ADMIN','BRANCH_MANAGER'].includes(actor.role) && actor.branchIds !== undefined) return actor.branchIds;
    if (actor.role === 'SUPER_ADMIN' || actor.role === 'IT_ADMIN' ||
      (actor.role === 'HR_ADMIN' && !actor.branchId)) return undefined;
    if (!actor.branchId) throw new ForbiddenException('Branch assignment required.');
    const access = await this.auth.getBranchAccess(actor.userId);
    return access.branches.map((branch) => branch.id);
  }

  @Get('branch-options')
  async branchOptions(@Req() request: AuthenticatedRequest) {
    const scope = await this.accountBranchScope(request);
    if (scope) {
      const branches = await Promise.all(scope.map((id) => this.branches.findById(id)));
      return branches.filter((branch) => branch?.isActive).map((branch) => ({ id: branch!.id, name: branch!.name }));
    }
    const options: Array<{ id: string; name: string }> = [];
    let page = 1;
    while (true) {
      const result = await this.branches.list({ status: 'ACTIVE', pageSize: 100, page });
      options.push(...result.items.map((branch) => ({ id: branch.id, name: branch.name })));
      if (page * result.pageSize >= result.total) return options;
      page += 1;
    }
  }

  private async requireBranchAccessEditor(request: AuthenticatedRequest, id: string) {
    if (!request.user || !['SUPER_ADMIN','IT_ADMIN'].includes(request.user.role)) throw new ForbiddenException('Administrator account access management required.');
    const target = await this.service.findById(id);
    if (!target || !['HR_ADMIN','BRANCH_MANAGER'].includes(target.role)) throw new BadRequestException('Select an HR administrator or branch manager account.');
    return target;
  }
  @Get(':id/branch-access')
  async adminBranchAccess(@Req() request: AuthenticatedRequest, @Param('id') id: string) {
    await this.requireBranchAccessEditor(request, id);
    return this.branches.getAdminBranchAccess(id);
  }
  @Patch(':id/branch-access')
  async saveAdminBranchAccess(@Req() request: AuthenticatedRequest, @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: AdminBranchAccessDto) {
    const target = await this.requireBranchAccessEditor(request, id);
    if (target.role === 'BRANCH_MANAGER' && request.user?.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Only a Super Admin can grant Branch Manager access to multiple branches.');
    await this.branches.saveAdminBranchAccess(id, input, request.user!.userId);
    await this.auth.revokeSessionsForUser(id);
    return { success: true };
  }

  @Patch(':id/branch')
  async updateBranch(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })) input: UpdateUserBranchDto,
  ) {
    const scope = await this.accountBranchScope(request);
    try {
      const account = await this.service.updateAccessBranch(id, input.branchId, {
        userId: request.user!.userId, allowedBranchIds: scope,
      }, input.department);
      await this.auth.revokeSessionsForUser(id);
      return { success: true, data: account, message: 'Employee and account branch updated.' };
    } catch (error) {
      if (error instanceof Error && error.message === 'Account branch access denied.') throw new ForbiddenException(error.message);
      throw new BadRequestException(error instanceof Error ? error.message : 'Unable to update access branch.');
    }
  }

  @Get('branch-options/:branchId/departments')
  async transferDepartments(@Req() request: AuthenticatedRequest, @Param('branchId') branchId: string) {
    const scope = await this.accountBranchScope(request);
    if (scope && !scope.includes(branchId)) throw new ForbiddenException('Account branch access denied.');
    const branch = await this.branches.findById(branchId);
    if (!branch?.isActive) throw new BadRequestException('Select an active branch.');
    if (!this.departments) throw new BadRequestException('Departments unavailable.');
    return this.departments.list(branchId);
  }

  @Post()
  @RequirePermission('users', 'CREATE', 'ALL')
  async createAccount(
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    input: CreateUserDto,
    @Req() request: AuthenticatedRequest,
  ) {
    if (input.role === 'SUPER_ADMIN' && request.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only a Super Admin can create another Super Admin account.',
      );
    }
    try {
      if (!this.provisioning) throw new ServiceUnavailableException('Account credential delivery is unavailable.');
      return await this.provisioning.create({
        name: input.name,
        email: input.email,
        role: input.role,
        branchId: input.branchId ?? null,
        employeeId: input.employeeId ?? null,
      }, request.user!);
    } catch (error) {
      if (error instanceof ForbiddenException || error instanceof ConflictException || error instanceof ServiceUnavailableException) throw error;
      if (error instanceof Error && error.message.includes('already exists')) {
        throw new ConflictException(error.message);
      }
      if (error instanceof Error && /required|Select |must match|cannot have/.test(error.message)) throw new BadRequestException(error.message);
      throw new ServiceUnavailableException('Account creation could not be confirmed. Refresh the account list before retrying.');
    }
  }

  @Post(':id/regenerate-credentials')
  @RequirePermission('users', 'UPDATE', 'ALL')
  async regenerateCredentials(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw new BadRequestException('Invalid account identifier.');
    if (!this.provisioning) throw new ServiceUnavailableException('Account credential delivery is unavailable.');
    return this.provisioning.regenerate(id, request.user!);
  }

  @Patch(':id/status')
  @RequirePermission('users', 'UPDATE', 'ALL')
  async updateStatus(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: UpdateUserStatusDto,
  ): Promise<{ success: true; data: UserRecord; message: string }> {
    const target = await this.service.findById(id);
    if (!target) throw new BadRequestException('User account not found.');
    if (target.role === 'SUPER_ADMIN' && request.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only a Super Admin can change a Super Admin account.',
      );
    }
    if (input.status !== 'ACTIVE' && request.user?.userId === id) {
      throw new BadRequestException('You cannot deactivate your own account.');
    }
    const account = await this.service.updateStatus(id, input.status);
    if (!account) throw new BadRequestException('User account not found.');
    if (input.status === 'INACTIVE') await this.auth.revokeSessionsForUser(id);
    return {
      success: true,
      data: account,
      message:
        input.status === 'ACTIVE'
          ? 'Account activated successfully'
          : input.status === 'ARCHIVED'
            ? 'Account archived successfully'
            : 'Account deactivated successfully',
    };
  }

  @Patch(':id/role')
  @RequirePermission('users', 'UPDATE', 'ALL')
  async updateRole(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: UpdateUserRoleDto,
  ): Promise<{ success: true; data: UserRecord; message: string }> {
    const actor = request.user;
    if (actor?.userId === id) {
      throw new BadRequestException('You cannot change your own role.');
    }

    const target = await this.service.findById(id);
    if (!target) throw new BadRequestException('User account not found.');
    if (
      (target.role === 'SUPER_ADMIN' || input.role === 'SUPER_ADMIN') &&
      actor?.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only a Super Admin can assign or change a Super Admin role.',
      );
    }
    if ((target.role === 'BRANCH_MANAGER' || input.role === 'BRANCH_MANAGER') && actor?.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('Only a Super Admin can change a Branch Manager role or primary branch.');

    try {
      const account = await this.service.updateRole(
        id,
        input.role,
        input.employeeId,
        input.branchId,
        actor?.userId,
      );
      if (!account) throw new BadRequestException('User account not found.');
      await this.auth.revokeSessionsForUser(id);
      return {
        success: true,
        data: account,
        message: 'Account role updated successfully',
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof Error) throw new BadRequestException(error.message);
      throw error;
    }
  }

  @Delete(':id')
  @RequirePermission('users', 'DELETE', 'ALL')
  async deleteAccount(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ success: true; message: string }> {
    const target = await this.service.findById(id);
    if (
      target?.role === 'SUPER_ADMIN' &&
      request.user?.role !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'Only a Super Admin can delete a Super Admin account.',
      );
    }
    try {
      await this.service.deleteAccount(id);
      return { success: true, message: 'Account deleted successfully' };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'User account not found.'
      ) {
        throw new BadRequestException(error.message);
      }
      throw new ConflictException(
        error instanceof Error ? error.message : 'Account cannot be deleted.',
      );
    }
  }

  @Patch(':id/password')
  @RequirePermission('users', 'UPDATE', 'ALL')
  async resetPassword(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
    input: ResetUserPasswordDto,
  ): Promise<{ success: true; data: UserRecord; message: string }> {
    const target = await this.service.findById(id);
    if (!target) throw new BadRequestException('User account not found.');
    if (target.role === 'SUPER_ADMIN' && request.user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException(
        'Only a Super Admin can reset a Super Admin password.',
      );
    }
    if (target.mustChangePassword && target.credentialEmailStatus && target.credentialEmailStatus !== 'NOT_REQUIRED') throw new BadRequestException('Use Regenerate & email for an account awaiting its initial password change.');
    const account = await this.service.resetPassword(
      id,
      this.auth.hashPassword(input.password),
    );
    if (!account) throw new BadRequestException('User account not found.');
    return {
      success: true,
      data: account,
      message: 'Password reset successfully',
    };
  }

  async get(id: string): Promise<UserRecord | undefined> {
    return this.service.findById(id);
  }

  async branchScope(user: UserRecord): Promise<string> {
    if (!user.branchId) {
      return 'ALL';
    }

    return (await this.branches.findById(user.branchId)) ? 'BRANCH' : 'ALL';
  }
}
