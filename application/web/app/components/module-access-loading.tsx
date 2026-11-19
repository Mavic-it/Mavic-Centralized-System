import { LoadingLines, LoadingRegion } from "./content-loading";
import { Skeleton } from "./loading-ui";

export function AccountOptionsLoading() {
  return <LoadingRegion label="Loading accounts">{[0,1,2,3,4].map(i => <div className="module-access-account" aria-hidden="true" key={i}><Skeleton className="module-access-avatar" /><LoadingLines /></div>)}</LoadingRegion>;
}
export function PermissionRowsLoading() {
  return <LoadingRegion label="Loading permissions"><div className="module-access-permission-list" aria-hidden="true">{[0,1,2,3,4,5].map(i => <div className="module-access-row" key={i}><div className="module-access-row-main"><Skeleton className="module-access-row-icon" /><div className="module-access-row-label"><LoadingLines /></div><Skeleton className="loading-pill" /><Skeleton className="loading-action" /></div></div>)}</div></LoadingRegion>;
}
export function ModuleAccessLoading() {
  return <main className="module-access-page"><header className="module-access-heading"><div><span className="module-access-eyebrow">ADMINISTRATION / USER ACCESS</span><h1>Module access</h1><p>Review effective access for each account, then apply role-based overrides.</p></div></header><div className="module-access-layout"><aside className="module-access-panel account-panel"><div className="module-access-panel-heading"><h2>Accounts</h2></div><Skeleton className="loading-search" /><div className="module-access-filters"><Skeleton className="loading-filter" /><Skeleton className="loading-filter" /></div><AccountOptionsLoading /></aside><section className="module-access-panel permission-panel"><div className="module-access-panel-heading"><h2>Effective permissions</h2></div><div className="module-access-toolbar"><Skeleton className="loading-search" /></div><PermissionRowsLoading /><div className="module-access-footer" aria-hidden="true"><Skeleton className="loading-description" /><Skeleton className="loading-action" /></div></section></div></main>;
}
