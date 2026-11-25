import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ReportController } from './reports/report.controller.js';
import { ReportService } from './reports/report.service.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  controllers: [ReportController, AnalyticsController],
  providers: [
    { provide: AnalyticsService, useFactory: (db: DataSource) => new AnalyticsService(db), inject: [getDataSourceToken()] },
    { provide: ReportService, useFactory: (db: DataSource) => new ReportService(db), inject: [getDataSourceToken()] },
  ],
  exports: [ReportService],
})
export class ReportingModule {}
