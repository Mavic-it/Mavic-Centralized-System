import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { SettingsService, type SettingValue } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get(':branchId/:key')
  get(
    @Param('branchId') branchId: string,
    @Param('key') key: string,
  ): Promise<SettingValue | undefined> {
    return this.service.get(branchId, key);
  }

  @Put(':branchId/:key')
  set(
    @Param('branchId') branchId: string,
    @Param('key') key: string,
    @Body('value') value: SettingValue,
  ): Promise<Record<string, SettingValue>> {
    return this.service.set(branchId, key, value);
  }
}
