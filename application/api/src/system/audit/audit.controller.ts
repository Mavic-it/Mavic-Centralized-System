import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { includesBranch } from '../../foundation/auth/branch-scope.js';
import { AuditService, type AuditLog } from './audit.service.js';

@Controller('audit')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  // Audit events are written by trusted backend services, never by HTTP clients.
  // There is intentionally no POST /audit route: it allowed forged actors/events.
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: AuthenticatedRequest,
    @Query('branchId') branchId?: string,
  ): Promise<AuditLog[]> {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required.');

    if (branchId !== undefined &&
        (typeof branchId !== 'string' || !branchId.trim() ||
         branchId.length > 128 || branchId.trim() !== branchId)) {
      throw new BadRequestException('Select a valid branch.');
    }

    // Security administrators may review the whole audit trail.
    // HR administrators may review only explicitly requested assigned branches.
    if (!['SUPER_ADMIN', 'IT_ADMIN', 'HR_ADMIN'].includes(user.role)) {
      throw new ForbiddenException('Audit log access denied.');
    }
    if (user.role === 'HR_ADMIN' && !branchId) {
      throw new ForbiddenException('Select an assigned branch to view audit logs.');
    }
    if (branchId && !includesBranch(user, branchId)) {
      throw new ForbiddenException('Branch audit log access denied.');
    }
    return this.service.list(branchId);
  }
}
