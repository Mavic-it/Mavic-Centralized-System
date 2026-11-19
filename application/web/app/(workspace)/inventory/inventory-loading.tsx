import { Skeleton } from "../../components/loading-ui";
import { LoadingLines, LoadingList, LoadingRegion, LoadingTable } from "../../components/content-loading";
import css from "./inventory.module.css";

export function InventoryOverviewLoading() {
  return <LoadingRegion label="Loading inventory overview"><div className={css.metrics} aria-hidden="true">{["Catalog items", "On-hand units", "Available units", "Low stock", "Out of stock", "Registered assets"].map(label => <article className={css.metric} key={label}><Skeleton className="loading-icon" /><span className={css.metricLabel}>{label}</span><Skeleton className="loading-card-value" /><LoadingLines lines={1} /></article>)}</div><div className={css.overviewGrid}>{["Stock by branch", "Stock by category", "Low-stock alerts", "Recent movements"].map((title, i) => <section className={css.panel} key={title}><div className={css.panelHeader}><h3>{title}</h3></div><LoadingList label={`Loading ${title.toLowerCase()}`} items={3} avatar={i === 2} /></section>)}</div></LoadingRegion>;
}
export function InventoryItemsLoading() {
  return <LoadingTable label="Loading inventory items" headers={["Item", "Category", "Type", "Branch stock", "Available", "Reorder at", "Status", "Actions"]} className={css.table} wrapClassName={css.tableScroll} />;
}
