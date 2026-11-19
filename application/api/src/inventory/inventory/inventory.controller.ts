import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import type { AuthenticatedRequest, AuthUserContext } from '../../foundation/auth/auth.context.js';
import type { PermissionAction, PermissionScope } from '../../security/authorization/authorization.service.js';
import { AuthorizationService } from '../../security/authorization/authorization.service.js';
import {
  CreateInventoryCategoryDto,
  CreateInventoryItemDto,
  InventoryListQueryDto,
  InventoryMovementQueryDto,
  InventoryStockMovementDto,
  RegisterInventoryBranchDto,
  UpdateInventoryCategoryDto,
  UpdateInventoryItemDto,
} from './inventory.dto.js';
import { InventoryService } from './inventory.service.js';

const validation = new ValidationPipe({ whitelist:true,forbidNonWhitelisted:true,transform:true });

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly service: InventoryService,
    private readonly authorization: AuthorizationService,
  ) {}

  @Get('overview')
  async overview(@Req() req: AuthenticatedRequest,@Query('branchId') branchId?: string) {
    const user = this.assert(req,'VIEW',branchId);
    const allowedBranches = this.branchScope(user);
    const canViewInventoryValue = this.canViewInventoryValue(user,branchId);
    const data = await this.service.overview(branchId,allowedBranches,canViewInventoryValue);
    return { success:true,data:{...data,canViewInventoryValue},message:'Inventory overview retrieved.' };
  }

  @Get('categories')
  async categories(@Req() req: AuthenticatedRequest) {
    const user = this.assert(req,'VIEW');
    return { success:true,data:await this.service.listCategories(user.scope === 'ALL' ? undefined : this.branchScope(user)),message:'Inventory categories retrieved.' };
  }

  @Get('branches')
  async branches(@Req() req: AuthenticatedRequest) {
    const user = this.assert(req,'VIEW');
    return { success:true,data:await this.service.listAuthorizedBranches(this.branchScope(user)) };
  }

  @Post('categories')
  async createCategory(@Req() req: AuthenticatedRequest,@Body(validation) input: CreateInventoryCategoryDto) {
    const user = this.assert(req,'CREATE',undefined,true);
    return { success:true,data:await this.service.createCategory(input,user.userId),message:'Inventory category created.' };
  }

  @Patch('categories/:id')
  async updateCategory(@Req() req: AuthenticatedRequest,@Param('id') id: string,@Body(validation) input: UpdateInventoryCategoryDto) {
    const user = this.assert(req,'UPDATE',undefined,true);
    return { success:true,data:await this.service.updateCategory(id,input,user.userId),message:'Inventory category updated.' };
  }

  @Delete('categories/:id')
  async deleteCategory(@Req() req: AuthenticatedRequest,@Param('id') id: string) {
    const user = this.assert(req,'DELETE',undefined,true);
    await this.service.deleteCategory(id,user.userId);
    return { success:true,data:{ id },message:'Inventory category deleted.' };
  }

  @Get('items')
  async items(@Req() req: AuthenticatedRequest,@Query(validation) query: InventoryListQueryDto) {
    const user = this.assert(req,'VIEW',query.branchId);
    const result = await this.service.listItems(query,this.branchScope(user),user.scope !== 'ALL');
    const canViewValue = this.canViewInventoryValue(user,query.branchId);
    return { success:true,...result,items:result.items.map(item=>this.redactPurchasePrice(item,canViewValue)),message:'Inventory catalog retrieved.' };
  }

  @Post('items')
  async createItem(@Req() req: AuthenticatedRequest,@Body(validation) input: CreateInventoryItemDto) {
    const user = this.assert(req,'CREATE',input.branchId,true);
    const canViewValue = this.canViewInventoryValue(user,input.branchId);
    if (Object.prototype.hasOwnProperty.call(input,'purchasePrice') && !canViewValue)
      throw new ForbiddenException('You do not have permission to manage inventory purchase prices.');
    const item = await this.service.createItem(input,user.userId);
    return { success:true,data:this.redactPurchasePrice(item,canViewValue),message:'Inventory item created.' };
  }

  @Patch('items/:id')
  async updateItem(@Req() req: AuthenticatedRequest,@Param('id') id: string,@Body(validation) input: UpdateInventoryItemDto) {
    const user = this.assert(req,'UPDATE',undefined,true);
    const canViewValue = this.canViewInventoryValue(user);
    if (Object.prototype.hasOwnProperty.call(input,'purchasePrice') && !canViewValue)
      throw new ForbiddenException('You do not have permission to manage inventory purchase prices.');
    const item = await this.service.updateItem(id,input,user.userId);
    return { success:true,data:this.redactPurchasePrice(item,canViewValue),message:input.status==='ARCHIVED'?'Inventory item archived.':'Inventory item updated.' };
  }

  @Post('items/:id/branches')
  async registerBranch(@Req() req: AuthenticatedRequest,@Param('id') id: string,@Body(validation) input: RegisterInventoryBranchDto) {
    const user = this.assert(req,'CREATE',input.branchId);
    return { success:true,data:await this.service.registerBranch(id,input,user.userId),message:'Item registered at branch.' };
  }

  @Get('stock')
  async stock(@Req() req: AuthenticatedRequest,@Query(validation) query: InventoryListQueryDto) {
    const user = this.assert(req,'VIEW',query.branchId);
    const result = await this.service.listItems(query,this.branchScope(user),user.scope !== 'ALL');
    const canViewValue = this.canViewInventoryValue(user,query.branchId);
    return { success:true,...result,items:result.items.map(item=>this.redactPurchasePrice(item,canViewValue)),message:'Branch stock retrieved.' };
  }

  @Post('stock/:id/receive')
  async receive(
    @Req() req: AuthenticatedRequest,@Param('id') itemId: string,
    @Body(validation) input: InventoryStockMovementDto,@Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const user = this.assert(req,'UPDATE',input.branchId);
    const key = this.validKey(idempotencyKey);
    const result = await this.service.receive(itemId,{
      branchId:input.branchId,storageLocation:input.storageLocation,quantity:input.quantity,
      reason:input.reason,idempotencyKey:key,
    },user.userId);
    return { success:true,data:result,meta:{duplicate:result.duplicate},message:result.duplicate?'Stock receipt already posted.':'Stock received.' };
  }

  @Post('stock/:id/issue')
  async issue(
    @Req() req: AuthenticatedRequest,@Param('id') itemId: string,
    @Body(validation) input: InventoryStockMovementDto,@Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const user = this.assert(req,'UPDATE',input.branchId);
    const key = this.validKey(idempotencyKey);
    const result = await this.service.issue(itemId,{
      branchId:input.branchId,storageLocation:input.storageLocation,quantity:input.quantity,
      reason:input.reason,idempotencyKey:key,
    },user.userId);
    return { success:true,data:result,meta:{duplicate:result.duplicate},message:result.duplicate?'Stock issue already posted.':'Stock issued.' };
  }

  @Get('movements')
  async movements(@Req() req: AuthenticatedRequest,@Query(validation) query: InventoryMovementQueryDto) {
    const user = this.assert(req,'VIEW',query.branchId);
    return { success:true,...await this.service.listMovements(query,this.branchScope(user)),message:'Inventory movements retrieved.' };
  }

  private branchScope(user: AuthUserContext): string[] {
    return user.branchIds ?? (user.branchId ? [user.branchId] : []);
  }

  private assert(req: AuthenticatedRequest, action: PermissionAction, branchId?: string, companyWide = false): AuthUserContext {
    const user = req.user;
    if (!user) throw new UnauthorizedException('Authentication required.');
    const branchIds = this.branchScope(user);
    if (branchId && !branchIds.includes(branchId)) throw new ForbiddenException('Branch access denied.');
    if (branchIds.length === 0) throw new ForbiddenException('No active branch access is available.');
    if (companyWide && user.scope !== 'ALL') throw new ForbiddenException('Company-wide inventory catalog access is required.');

    const scopes: PermissionScope[] = ['BRANCH','ALL'];
    const roleAllowed = scopes.some(scope => this.authorization.authorize({
      userId:user.userId,role:user.role,branchId:branchId ?? user.branchId ?? 'ALL',
      module:'inventory',action,scope,
    }).allowed);
    const moduleEdit = user.moduleAccessKey?.startsWith('inventory') && user.moduleAccessMode === 'EDIT';
    if (!roleAllowed && !moduleEdit) throw new ForbiddenException('Insufficient inventory permission.');
    if (companyWide && !this.authorization.authorize({
      userId:user.userId,role:user.role,branchId:'ALL',module:'inventory',action,scope:'ALL',
    }).allowed && !moduleEdit) throw new ForbiddenException('Company-wide inventory catalog access is required.');
    return user;
  }

  private validKey(value?: string): string {
    const key = value?.trim();
    if (!key || key.length > 200) throw new BadRequestException('A valid Idempotency-Key header is required.');
    return key;
  }

  private canViewInventoryValue(user: AuthUserContext,branchId?: string): boolean {
    const scope: PermissionScope = branchId || user.scope === 'BRANCH' ? 'BRANCH' : 'ALL';
    if (branchId && !this.branchScope(user).includes(branchId)) return false;
    return this.authorization.authorize({
      userId:user.userId,role:user.role,branchId:branchId ?? user.branchId ?? 'ALL',
      module:'inventory_valuation',action:'VIEW',scope,
    }).allowed;
  }

  private redactPurchasePrice<T extends { purchasePrice?: unknown }>(item:T,allowed:boolean):T {
    if (allowed) return item;
    return Object.fromEntries(Object.entries(item).filter(([key]) => key !== 'purchasePrice')) as T;
  }
}
