import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../foundation/auth/auth.context.js';
import { includesBranch } from '../../foundation/auth/branch-scope.js';
import { SettingsService, type SettingValue, type BranchSettings } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  private authorize(request: AuthenticatedRequest, branchId: string, write: boolean): void {
    const user = request.user;
    if (!user) throw new UnauthorizedException('Authentication required.');
    if (typeof branchId !== 'string' || !branchId.trim() ||
        branchId.length > 128 || branchId.trim() !== branchId) {
      throw new BadRequestException('Select a valid branch.');
    }

    const readers = ['SUPER_ADMIN', 'IT_ADMIN', 'HR_ADMIN', 'BRANCH_MANAGER'];
    const writers = ['SUPER_ADMIN', 'IT_ADMIN'];
    if (!(write ? writers : readers).includes(user.role)) {
      throw new ForbiddenException('Branch settings access denied.');
    }
    if (!includesBranch(user, branchId)) {
      throw new ForbiddenException('Branch settings access denied.');
    }
  }

  private validateKey(key: string): void {
    if (typeof key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/.test(key)) {
      throw new BadRequestException('Invalid setting key.');
    }
  }

  @Get(':branchId/:key')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() request: AuthenticatedRequest,
    @Param('branchId') branchId: string,
    @Param('key') key: string,
  ): Promise<SettingValue | undefined> {
    this.authorize(request, branchId, false);
    this.validateKey(key);
    return this.service.get(branchId, key);
  }

  @Put(':branchId/:key')
  @Header('Cache-Control', 'private, no-store')
  set(
    @Req() request: AuthenticatedRequest,
    @Param('branchId') branchId: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ): Promise<BranchSettings> {
    this.authorize(request, branchId, true);
    this.validateKey(key);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).length !== 1 ||
        !Object.prototype.hasOwnProperty.call(body, 'value')) {
      throw new BadRequestException('Provide a setting value.');
    }
    const value = (body as { value: unknown }).value;
    if (value !== null &&
        !(typeof value === 'string' && value.length <= 4096) &&
        !(typeof value === 'number' && Number.isFinite(value)) &&
        typeof value !== 'boolean') {
      throw new BadRequestException('Setting value must be a string, number, boolean, or null.');
    }
    return this.service.set(branchId, key, value as SettingValue);
  }
}
