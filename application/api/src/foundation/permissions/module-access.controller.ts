import { Body, Controller, Get, Param, Patch, Post, Query, Req, ValidationPipe, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.context.js';
import { RequirePermission } from '../auth/auth.decorators.js';
import { ModuleAccessService } from './module-access.service.js';
import { BulkModuleAccessDto, UpdateModuleAccessDto } from './module-access.dto.js';
import { MODULE_PERMISSION_REGISTRY } from './module-registry.js';

@Controller('users/module-access')
export class ModuleAccessController {
  constructor(private readonly service: ModuleAccessService) {}
  @Get('catalog') @RequirePermission('users','VIEW','ALL') catalog() { return MODULE_PERMISSION_REGISTRY; }
  @Get('accounts') @RequirePermission('users','VIEW','ALL') accounts(@Req() req: AuthenticatedRequest,@Query('branchId') branchId?:string,@Query('search') search?:string) { return this.service.listAccounts(req.user!,branchId,search); }
  @Get(':userId') @RequirePermission('users','VIEW','ALL') get(@Req() req:AuthenticatedRequest,@Param('userId') userId:string) { return this.service.effective(userId,req.user!); }
  @Post('bulk') @RequirePermission('users','UPDATE','ALL') bulk(@Req() req:AuthenticatedRequest,@Body(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true})) body:BulkModuleAccessDto){return this.service.bulk(body.userIds,body.permissionKey,body.effect,req.user!);}
  @Patch(':userId') @RequirePermission('users','UPDATE','ALL') update(@Req() req:AuthenticatedRequest,@Param('userId') userId:string,@Body(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true})) body:UpdateModuleAccessDto) { const changes=body.changes??body.permissionKeys?.map(permissionKey=>({permissionKey,effect:body.effect!})); if (!changes?.length) throw new ForbiddenException('Choose permission changes.'); if (changes.some(change=>change.effect!=='INHERIT')&&!body.confirmation) throw new ForbiddenException('Confirm this permission change before saving.'); return this.service.updateBatch(userId,changes,req.user!); }
}
