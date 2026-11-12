import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { AuditController } from './audit/audit.controller.js';
import { AuditService } from './audit/audit.service.js';
import { SettingsController } from './settings/settings.controller.js';
import { SettingsService } from './settings/settings.service.js';

@Module({
  controllers: [AuditController, SettingsController],
  providers: [
    {
      provide: AuditService,
      useFactory: (dataSource: DataSource) => new AuditService(dataSource),
      inject: [getDataSourceToken()],
    },
    {
      provide: SettingsService,
      useFactory: (dataSource: DataSource) => new SettingsService(dataSource),
      inject: [getDataSourceToken()],
    },
  ],
  exports: [AuditService, SettingsService],
})
export class SystemModule {}
