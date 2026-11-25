import { Skeleton } from '../components/ui/skeleton';
import css from './analytics.module.css';
export function AnalyticsLoading({ contentOnly = false }: { contentOnly?: boolean }) {
  return <div className={css.workspace} role="status" aria-label="Loading analytics" aria-busy="true">{!contentOnly && <><Skeleton className={css.headingSkeleton} /><div className={css.filters}>{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className={css.filterSkeleton} />)}</div></>}<div className={css.metrics}>{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className={css.metricSkeleton} />)}</div><div className={css.charts}><Skeleton className={css.chartSkeleton} /><Skeleton className={css.chartSkeleton} /></div><Skeleton className={css.tableSkeleton} /><span className={css.srOnly}>Loading authorized report data</span></div>;
}
