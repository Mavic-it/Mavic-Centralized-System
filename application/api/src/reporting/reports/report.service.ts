export type ReportMetric = {
  branchId: string;
  amount: number;
  label: string;
};

export type BranchSummary = {
  branchId: string;
  total: number;
  modules: string[];
  metrics: ReportMetric[];
};

export class ReportService {
  private metrics = new Map<string, ReportMetric[]>();

  record(module: string, metric: ReportMetric): void {
    const existing = this.metrics.get(metric.branchId) ?? [];
    const next = [
      ...existing,
      { ...metric, label: `${module}:${metric.label}` },
    ];
    this.metrics.set(metric.branchId, next);
  }

  summary(branchId: string): BranchSummary {
    const records = this.metrics.get(branchId) ?? [];
    const modules = records.map((metric) => metric.label.split(':')[0]);

    return {
      branchId,
      total: records.reduce((sum, metric) => sum + metric.amount, 0),
      modules: Array.from(new Set(modules)),
      metrics: records,
    };
  }
}
