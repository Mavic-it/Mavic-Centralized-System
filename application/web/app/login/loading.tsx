import { Skeleton } from "../components/loading-ui";

export default function Loading() {
  return (
    <main aria-busy="true" aria-label="Loading sign in" className="route-loading" role="status">
      <span className="visually-hidden">Loading sign in</span>
      <div className="route-loading-panel">
        <Skeleton className="loading-heading" />
        <Skeleton className="loading-cell loading-cell-wide" />
        <Skeleton className="loading-action" />
      </div>
    </main>
  );
}
