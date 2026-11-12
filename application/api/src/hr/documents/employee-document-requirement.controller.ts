import { includesBranch } from '../../foundation/auth/branch-scope.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import {
  CreateEmployeeDocumentRequirementDto,
  UpdateEmployeeDocumentRequirementDto,
} from './employee-document.dto.js';
import { EmployeeDocumentService } from './employee-document.service.js';

@Controller('employees/document-requirements')
export class EmployeeDocumentRequirementController {
  constructor(private readonly documents: EmployeeDocumentService) {}

  @Get(':branchId')
  async list(
    @Param('branchId') branchId: string,
    @Query('includeInactive') includeInactive: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireAccess(branchId, request, false);
    return this.documents.listRequirements(
      branchId,
      includeInactive === 'true',
    );
  }

  @Post(':branchId')
  async create(
    @Param('branchId') branchId: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: CreateEmployeeDocumentRequirementDto,
  ) {
    this.requireAccess(branchId, request, true);
    return this.documents.createRequirement(branchId, input, {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  @Patch(':branchId/:requirementId')
  async update(
    @Param('branchId') branchId: string,
    @Param('requirementId') requirementId: string,
    @Req() request: AuthenticatedRequest,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    input: UpdateEmployeeDocumentRequirementDto,
  ) {
    this.requireAccess(branchId, request, true);
    return this.documents.updateRequirement(branchId, requirementId, input, {
      userId: request.user!.userId,
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });
  }

  private requireAccess(
    branchId: string,
    request: AuthenticatedRequest,
    write: boolean,
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
    if (
      !write &&
      user.role === 'BRANCH_MANAGER' &&
      includesBranch(user, branchId)
    ) {
      return;
    }
    throw new ForbiddenException('Document requirement management denied.');
  }
}
