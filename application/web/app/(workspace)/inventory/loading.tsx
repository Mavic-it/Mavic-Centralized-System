import { InventoryOverviewLoading } from "./inventory-loading";
import { Skeleton } from "../../components/loading-ui";
import styles from "./inventory.module.css";
export default function InventoryLoading() {
  return <main className={styles.page}><header className={styles.pageHeader}><h1>Inventory</h1><Skeleton className="loading-action" /></header><div className={styles.tabs} aria-hidden="true"><Skeleton className="loading-action" /><Skeleton className="loading-action" /><Skeleton className="loading-action" /></div><InventoryOverviewLoading /></main>;
}
