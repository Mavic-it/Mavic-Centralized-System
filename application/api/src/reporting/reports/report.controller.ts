import { Controller } from '@nestjs/common';
import {
  BranchSummary,
  ReportMetric,
  ReportService,
} from './report.service.js';

@Controller('reports')
export class ReportController {
  constructor(private readonly service: ReportService) {}

  record(module: string, metric: ReportMetric): Promise<void> {
    return this.service.record(module, metric);
  }

  summary(branchId: string): Promise<BranchSummary> {
    return this.service.summary(branchId);
  }
}
