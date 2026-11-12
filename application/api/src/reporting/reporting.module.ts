import { Module } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { ReportController } from './reports/report.controller.js';
import { ReportService } from './reports/report.service.js';

@Module({
  controllers: [ReportController],
  providers: [
    { provide: ReportService, useFactory: (db: DataSource) => new ReportService(db), inject: [getDataSourceToken()] },
  ],
  exports: [ReportService],
})
export class ReportingModule {}
