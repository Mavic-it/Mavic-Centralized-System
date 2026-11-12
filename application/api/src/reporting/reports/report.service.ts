import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';

export type ReportMetric = { branchId: string; amount: number; label: string };
export type BranchSummary = { branchId: string; total: number; modules: string[]; metrics: ReportMetric[] };
type MetricRow = { module: string; label: string; amount: number | string };
export class ReportService {
  private readonly testMetrics?: Map<string, ReportMetric[]>;
  constructor(private readonly db?: Pick<DataSource, 'query'>) {
    if (!db) {
      if (process.env.NODE_ENV === 'production') throw new Error('Reporting requires PostgreSQL in production');
      this.testMetrics = new Map();
    }
  }
  async record(module: string, metric: ReportMetric): Promise<void> {
    if (!/^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(module) || !Number.isFinite(metric.amount) ||
        metric.label.length > 500 || !metric.label.trim()) throw new BadRequestException('Invalid report metric');
    if (!this.db) {
      const previous = this.testMetrics!.get(metric.branchId) ?? [];
      this.testMetrics!.set(metric.branchId,[...previous,{...metric,label:`${module}:${metric.label}`}]);
      return;
    }
    await this.db.query(
      `INSERT INTO report_metrics(branch_id,module,label,amount) VALUES($1,$2,$3,$4)`,
      [metric.branchId,module,metric.label,metric.amount],
    );
  }
  async summary(branchId: string): Promise<BranchSummary> {
    if (!this.db) {
      const records = this.testMetrics!.get(branchId) ?? [];
      return { branchId, total: records.reduce((n,r)=>n+r.amount,0),
        modules:[...new Set(records.map(r=>r.label.split(':')[0]))], metrics:records.map(r=>({...r})) };
    }
    const rows = await this.db.query<MetricRow[]>(
      `SELECT module,label,amount FROM report_metrics WHERE branch_id=$1 ORDER BY id`,
      [branchId],
    );
    const metrics = rows.map(row=>({ branchId,amount:Number(row.amount),label:`${row.module}:${row.label}` }));
    return { branchId, total: metrics.reduce((sum,row)=>sum+row.amount,0),
      modules:[...new Set(rows.map(row=>row.module))], metrics };
  }
}
