import { Module } from '@nestjs/common';
import { ReportController } from './reports/report.controller.js';
import { ReportService } from './reports/report.service.js';

@Module({
  controllers: [ReportController],
  providers: [ReportService],
  exports: [ReportService],
})
export class ReportingModule {}
