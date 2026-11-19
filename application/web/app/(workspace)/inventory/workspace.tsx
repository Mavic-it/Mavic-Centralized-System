"use client";
import { InventoryOverviewLoading, InventoryItemsLoading } from "./inventory-loading";

import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronDown,
  ClipboardList,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Warehouse,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { FieldLabel } from "../../components/field-label";
import { PageHeader, PageHeading } from "../../components/page-heading";
import { Modal } from "../../components/ui/modal";
import { handleApiUnauthorized } from "../../lib/handle-api-unauthorized";
import { notifyError, notifySuccess } from "../../lib/notifications";
import styles from "./inventory.module.css";

type Branch = { id: string; name: string };
type Category = { id: string; name: string; description: string | null; isActive: boolean; itemCount: number };
type Item = {
  id: string; name: string; sku: string; description: string | null; categoryId: string; category: string;
  itemType: string; trackingMethod: string; unit: string; reorderThreshold: number;
  maximumStockThreshold: number | null; purchasePrice: number | string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED"; onHand: number; reserved: number;
  quarantined: number; available: number; inTransit: number; registered: boolean;
};
type Movement = {
  id: string; itemId: string; itemName: string; sku: string; branchId: string; branchName: string;
  movementType: string; quantity: number; quantityDelta: number; onHandBefore: number;
  onHandAfter: number; reason: string; performedByName: string | null; createdAt: string;
};
type Overview = {
  stats: { catalogItems: number; onHandQuantity: number; availableQuantity: number; lowStockItems: number; outOfStockItems: number; registeredAssets: number };
  canViewInventoryValue?: boolean;
  inventoryValue?: number;
  branchDistribution: { id: string; name: string; itemCount: number; onHand: number }[];
  categoryDistribution: { category: string; quantity: number }[];
  recentMovements: Movement[];
  lowStockItems: { id: string; name: string; sku: string; branchId: string; branchName: string; available: number; reorderThreshold: number }[];
};
type BranchAccess = { branches: Branch[]; activeBranchId?: string; selectedBranchIds?: string[]; allBranches?: boolean; companyWide?: boolean };
type Page<T> = { items: T[]; total: number; page: number; pageSize: number };
type Tab = "overview" | "catalog" | "stock";
const inventoryTabs: { id: Tab; label: string; description: string; icon: typeof Boxes }[] = [
  { id: "overview", label: "Overview", description: "Stock health and activity", icon: Warehouse },
  { id: "catalog", label: "Item catalog", description: "Search and maintain items", icon: Package },
  { id: "stock", label: "Stock management", description: "Balances and movements", icon: Boxes },
];
type ItemDraft = {
  name: string; sku: string; description: string; categoryId: string; itemType: string;
  trackingMethod: string; unit: string; reorderThreshold: number; maximumStockThreshold: string;
  purchasePrice: string; branchId: string; openingStock: number;
};
type DialogState =
  | { type: "create" }
  | { type: "edit"; item: Item }
  | { type: "archive"; item: Item }
  | { type: "category"; mode: "list" | "create" | "edit"; category?: Category }
  | { type: "categoryDelete"; category: Category }
  | { type: "movement"; item: Item; movementType: "RECEIPT" | "ISSUE" }
  | { type: "register"; item: Item }
  | null;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  handleApiUnauthorized(response.status);
  const payload = await response.json().catch(() => ({})) as T & { message?: string | string[] };
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(". ") : payload.message;
    throw new Error(message ?? "The inventory request could not be completed.");
  }
  return payload;
}

function freshKey() {
  return globalThis.crypto?.randomUUID?.() ?? `inventory-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function queryString(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
  return params.size ? `?${params.toString()}` : "";
}

function quantity(value: number) {
  return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 0 }).format(value);
}

function itemDraft(item?: Item, branchId = ""): ItemDraft {
  return {
    name: item?.name ?? "", sku: item?.sku ?? "", description: item?.description ?? "",
    categoryId: item?.categoryId ?? "", itemType: item?.itemType ?? "CONSUMABLE",
    trackingMethod: item?.trackingMethod ?? "QUANTITY", unit: item?.unit ?? "PCS",
    reorderThreshold: item?.reorderThreshold ?? 0,
    maximumStockThreshold: item?.maximumStockThreshold == null ? "" : String(item.maximumStockThreshold),
    purchasePrice: item?.purchasePrice == null ? "" : String(item.purchasePrice),
    branchId, openingStock: 0,
  };
}

export default function InventoryWorkspace() {
  const [tab, setTab] = useState<Tab>("overview");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchAccess, setBranchAccess] = useState<BranchAccess | null>(null);
  const [branchFilter, setBranchFilter] = useState("ALL");
  const [categories, setCategories] = useState<Category[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("ACTIVE");
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [permissions, setPermissions] = useState({ granted: [] as string[], editable: [] as string[] });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [saving, setSaving] = useState(false);
  const [movementKey, setMovementKey] = useState("");
  const [loadedBranchFilter, setLoadedBranchFilter] = useState("");
  const [draft, setDraft] = useState<ItemDraft>(() => itemDraft());

  const canManageCatalog = Boolean(
    branchAccess?.companyWide &&
    permissions.editable.includes("inventory.catalog")
  );
  const canManageStock = permissions.editable.includes("inventory.stock");
  const activeBranchId = branchAccess?.activeBranchId ?? branchAccess?.selectedBranchIds?.[0] ?? branches[0]?.id ?? "";
  const scopedBranchId = branchFilter === "ALL" ? undefined : branchFilter;
  const stockBranchId = scopedBranchId ?? activeBranchId;
  const branchLabel = scopedBranchId ? branches.find(branch => branch.id === scopedBranchId)?.name ?? "Selected branch" : "All assigned branches";

  const loadBranchContext = useCallback(async () => {
    const [access, me, categoryResult, branchResult] = await Promise.all([
      api<BranchAccess>("/api/auth/branches"),
      api<{ grantedPermissionKeys?: string[]; editPermissionKeys?: string[] }>("/api/auth/me"),
      api<{ data: Category[] }>("/api/inventory/categories"),
      api<{ data: Branch[] }>("/api/inventory/branches"),
    ]);
    setBranchAccess(access);
    setBranches(branchResult.data ?? []);
    setPermissions({ granted: me.grantedPermissionKeys ?? [], editable: me.editPermissionKeys ?? [] });
    setCategories(categoryResult.data ?? []);
    const authorized = branchResult.data ?? [];
    setBranchFilter(current => {
      if (authorized.length === 1) return authorized[0].id;
      if (current === "ALL" && authorized.length > 1) return "ALL";
      if (authorized.some(branch => branch.id === current)) return current;
      return authorized.find(branch => branch.id === access.activeBranchId)?.id ?? authorized[0]?.id ?? "";
    });
  }, []);

  const dataKey = JSON.stringify([branchFilter, categoryFilter, search, statusFilter, tab]);
  const [loadedDataKey, setLoadedDataKey] = useState("");
  const dataGeneration = useRef(0);
  const contentLoading = !error && (initialLoading || loadedDataKey !== dataKey);
  const loadData = useCallback(async (quiet = false) => {
    const generation = ++dataGeneration.current;
    if (quiet) setRefreshing(true);
    else setInitialLoading(true);
    setError("");
    try {
      const branch = branchFilter === "ALL" ? undefined : branchFilter;
      const scope = queryString({ branchId: branch });
      const catalogQuery = queryString({
        branchId: branch,
        search: search.trim() || undefined,
        categoryId: categoryFilter || undefined,
        status: statusFilter,
        pageSize: "100",
      });
      const [overviewResult, itemResult, movementResult] = await Promise.all([
        api<{ data: Overview }>(`/api/inventory/overview${scope}`),
        api<Page<Item>>(`/api/inventory/${tab === "stock" ? "stock" : "items"}${catalogQuery}`),
        api<Page<Movement>>(`/api/inventory/movements${queryString({ branchId: branch, pageSize: "8" })}`),
      ]);
      if (generation !== dataGeneration.current) return;
      setLoadedDataKey(dataKey);
      setOverview(overviewResult.data);
      setItems(itemResult.items ?? []);
      setLoadedBranchFilter(branchFilter);
      setTotalItems(itemResult.total ?? 0);
      setMovements(movementResult.items ?? []);
    } catch (cause) {
      if (generation === dataGeneration.current) setError(cause instanceof Error ? cause.message : "Inventory could not be loaded.");
    } finally {
      if (generation === dataGeneration.current) { setInitialLoading(false); setRefreshing(false); }
    }
  }, [branchFilter, categoryFilter, search, statusFilter, tab, dataKey]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadBranchContext().catch(cause => {
        if (active) setError(cause instanceof Error ? cause.message : "Inventory access could not be loaded.");
      }).finally(() => { if (active) setInitialLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [loadBranchContext]);

  useEffect(() => {
    if (!branchAccess) return;
    const timer = window.setTimeout(() => { void loadData(true); }, 160);
    const generationRef = dataGeneration;
    return () => { window.clearTimeout(timer); generationRef.current++; };
  }, [branchAccess, loadData]);

  const categoryOptions = useMemo(() => [...categories].sort((a,b) => a.name.localeCompare(b.name)), [categories]);

  async function refreshAfterWrite(message: string, toast = false) {
    setDialog(null);
    if (toast) notifySuccess(message);
    else setNotice(message);
    await Promise.all([loadBranchContext(), loadData(true)]);
  }

  function beginCreate() {
    setDraft(itemDraft(undefined, stockBranchId));
    setDialog({ type: "create" });
  }

  function beginEdit(item: Item) {
    setDraft(itemDraft(item, stockBranchId));
    setDialog({ type: "edit", item });
  }

  async function saveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || (dialog.type !== "create" && dialog.type !== "edit")) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      if (dialog.type === "create") {
        await api("/api/inventory/items", {
          method: "POST",
          body: JSON.stringify({
            name: String(form.get("name")), sku: String(form.get("sku")),
            description: String(form.get("description") ?? "").trim() || undefined,
            categoryId: String(form.get("categoryId")), itemType: String(form.get("itemType")),
            trackingMethod: String(form.get("trackingMethod")), unit: String(form.get("unit")),
            reorderThreshold: Number(form.get("reorderThreshold")),
            maximumStockThreshold: form.get("maximumStockThreshold") ? Number(form.get("maximumStockThreshold")) : null,
            purchasePrice: form.get("purchasePrice") ? Number(form.get("purchasePrice")) : null,
            branchId: String(form.get("branchId")), openingStock: Number(form.get("openingStock")),
            ...(overview?.canViewInventoryValue ? {} : { purchasePrice: undefined }),
          }),
        });
        await refreshAfterWrite("Inventory item created.");
      } else {
        await api(`/api/inventory/items/${encodeURIComponent(dialog.item.id)}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: String(form.get("name")), sku: String(form.get("sku")),
            description: String(form.get("description") ?? "").trim() || null,
            categoryId: String(form.get("categoryId")), itemType: String(form.get("itemType")),
            trackingMethod: String(form.get("trackingMethod")), unit: String(form.get("unit")),
            reorderThreshold: Number(form.get("reorderThreshold")),
            maximumStockThreshold: form.get("maximumStockThreshold") ? Number(form.get("maximumStockThreshold")) : null,
            ...(overview?.canViewInventoryValue ? { purchasePrice: form.get("purchasePrice") ? Number(form.get("purchasePrice")) : null } : {}),
          }),
        });
        await refreshAfterWrite("Inventory item updated.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The inventory item could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveItem(item: Item) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/inventory/items/${encodeURIComponent(item.id)}`, {
        method: "PATCH", body: JSON.stringify({ status: "ARCHIVED" }),
      });
      await refreshAfterWrite("Inventory item archived.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The item could not be archived.");
      setDialog(null);
    } finally {
      setSaving(false);
    }
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== "category" || dialog.mode === "list") return;
    const editingCategory = dialog.mode === "edit" ? dialog.category : undefined;
    if (dialog.mode === "edit" && !editingCategory) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(editingCategory
        ? `/api/inventory/categories/${encodeURIComponent(editingCategory.id)}`
        : "/api/inventory/categories", {
        method: editingCategory ? "PATCH" : "POST",
        body: JSON.stringify({ name: String(form.get("name")), description: String(form.get("description") ?? "") }),
      });
      await refreshAfterWrite(editingCategory ? "Inventory category updated." : "Inventory category created.", true);
    } catch (cause) {
      notifyError(cause instanceof Error ? cause.message : "The category could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeCategory(category: Category) {
    setSaving(true);
    setError("");
    try {
      await api(`/api/inventory/categories/${encodeURIComponent(category.id)}`, { method: "DELETE" });
      await refreshAfterWrite(`Category "${category.name}" deleted.`, true);
    } catch (cause) {
      notifyError(cause instanceof Error ? cause.message : "The category could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  async function postMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || dialog?.type !== "movement") return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(`/api/inventory/stock/${encodeURIComponent(dialog.item.id)}/${dialog.movementType === "RECEIPT" ? "receive" : "issue"}`, {
        method: "POST",
        headers: { "Idempotency-Key": movementKey },
        body: JSON.stringify({
          branchId: String(form.get("branchId")), quantity: Number(form.get("quantity")),
          reason: String(form.get("reason") ?? "").trim() || (dialog.movementType === "RECEIPT" ? "Stock received through inventory quick action" : "Stock issued through inventory quick action"), storageLocation: String(form.get("storageLocation") ?? "").trim() || undefined,
        }),
      });
      setMovementKey("");
      await refreshAfterWrite(dialog.movementType === "RECEIPT" ? "Stock received. Balances updated." : "Stock issued. Balances updated.", true);
    } catch (cause) {
      notifyError(cause instanceof Error ? cause.message : "The stock movement could not be posted.");
    } finally {
      setSaving(false);
    }
  }

  async function registerAtBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dialog?.type !== "register") return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      await api(`/api/inventory/items/${encodeURIComponent(dialog.item.id)}/branches`, {
        method: "POST",
        body: JSON.stringify({
          branchId: String(form.get("branchId")), storageLocation: String(form.get("storageLocation") ?? "").trim() || undefined,
          openingStock: Number(form.get("openingStock")),
        }),
      });
      await refreshAfterWrite("Item registered at the branch.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The item could not be registered at this branch.");
    } finally {
      setSaving(false);
    }
  }

  function startMovement(item: Item, movementType: "RECEIPT" | "ISSUE") {
    if (!scopedBranchId) return;
    if (loadedBranchFilter !== branchFilter) {
      notifyError("Please wait for this branch's stock to finish loading.");
      return;
    }
    if (item.status !== "ACTIVE") {
      notifyError("Only active items can receive or issue stock.");
      return;
    }
    setError("");
    setMovementKey(freshKey());
    setDialog({ type: "movement", item, movementType });
  }

  return (
    <main className={styles.page}>
      <PageHeader className={`page-heading ${styles.pageHeader}`} aria-labelledby="inventory-title">
        <div>
          <p className="eyebrow">OPERATIONS / INVENTORY</p>
          <PageHeading id="inventory-title">Inventory</PageHeading>
          <p className="page-description">Shared catalog and branch stock, backed by recorded inventory movements.</p>
        </div>
        <div className={styles.headerActions}>
          <label className={styles.filterLabel}>
            <FieldLabel>Branch</FieldLabel>
            <span className={styles.selectWrap}>
              <select value={branchFilter} disabled={branches.length <= 1} onChange={event => { setDialog(null); setItems([]); setBranchFilter(event.target.value); }} aria-label="Filter inventory by branch">
                {branches.length > 1 && <option value="ALL">All assigned branches</option>}
                {branches.map(branch => <option value={branch.id} key={branch.id}>{branch.name}</option>)}
              </select>
              <ChevronDown size={15} aria-hidden="true" />
            </span>
          </label>
          <button className={styles.refreshButton} type="button" onClick={() => void loadData(true)} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? styles.spinning : ""} aria-hidden="true" />
            Refresh
          </button>
        </div>
      </PageHeader>

      <nav className={styles.tabs} aria-label="Inventory pages">
        {inventoryTabs.map(({ id, label, description, icon: Icon }) => (
          <button key={id} type="button" className={tab === id ? styles.activeTab : styles.tab} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}>
            <span className={styles.tabIcon}><Icon size={18} aria-hidden="true" /></span>
            <span className={styles.tabCopy}><strong>{label}</strong><small>{description}</small></span>
          </button>
        ))}
      </nav>

      {notice && <div className={styles.notice} role="status">{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss confirmation">×</button></div>}
      {error && <div className={styles.errorBanner} role="alert"><AlertTriangle size={17} />{error}<button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}

      {tab === "overview" ? (
        <section aria-labelledby="overview-title">
          <div className={styles.sectionHeading}>
            <div><h2 id="overview-title">Inventory overview</h2><p>{branchLabel} · Live stock summary</p></div>
          </div>
          {contentLoading ? <InventoryOverviewLoading /> : !overview ? <Empty title="Inventory overview unavailable" detail="Refresh the page or check your inventory access." /> : (
            <>
              <div className={styles.metrics}>
                <Metric icon={Package} label="Catalog items" value={overview.stats.catalogItems} detail="Active shared items" />
                <Metric icon={Boxes} label="On-hand units" value={overview.stats.onHandQuantity} detail="Recorded stock" />
                <Metric icon={Warehouse} label="Available units" value={overview.stats.availableQuantity} detail="Excludes reserved and quarantined" />
                <Metric icon={AlertTriangle} label="Low stock" value={overview.stats.lowStockItems} detail="At or below reorder threshold" tone="warning" />
                <Metric icon={Package} label="Out of stock" value={overview.stats.outOfStockItems} detail="Registered with no available units" tone="danger" />
                <Metric icon={ClipboardList} label="Registered assets" value={overview.stats.registeredAssets} detail="Existing equipment records" />
                {overview.canViewInventoryValue && <article className={styles.metric}><span className={styles.metricIcon}><Package size={18} aria-hidden="true" /></span><span className={styles.metricLabel}>Inventory value</span><strong className={styles.metricValue}>{new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(overview.inventoryValue ?? 0)}</strong><small>Based on recorded on-hand stock and purchase prices</small></article>}
              </div>
              <div className={styles.overviewGrid}>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h3>Stock by branch</h3><p>Select a branch to view its stock.</p></div></div>
                  {overview.branchDistribution.length ? <div className={styles.distribution}>
                    {overview.branchDistribution.map(row => {
                      const maximum = Math.max(1, ...overview.branchDistribution.map(item => item.onHand));
                      return <button className={styles.distributionRow} type="button" key={row.id} onClick={() => setBranchFilter(row.id)} aria-pressed={branchFilter === row.id} aria-label={`View inventory for ${row.name}`}>
                        <div className={styles.distributionMeta}><span>{row.name}</span><strong>{quantity(row.onHand)}</strong></div>
                        <div className={styles.barTrack}><span className={styles.barFill} style={{ width: `${Math.max(3, row.onHand / maximum * 100)}%` }} /></div>
                        <small>{quantity(row.itemCount)} registered items</small>
                      </button>;
                    })}
                  </div> : <Empty title="No branch stock yet" detail="Register an item at a branch to begin tracking stock." />}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h3>Stock by category</h3><p>Select a category to browse its items.</p></div></div>
                  {overview.categoryDistribution.length ? <div className={styles.categoryList}>
                    {overview.categoryDistribution.map(row => {
                      const categoryId = categories.find(category => category.name.toLocaleLowerCase() === row.category.toLocaleLowerCase())?.id;
                      return <button className={styles.categoryRow} type="button" key={row.category} disabled={!categoryId} onClick={() => {
                        if (!categoryId) return;
                        setSearch("");
                        setStatusFilter("ALL");
                        setCategoryFilter(categoryId);
                        setTab("catalog");
                      }} aria-label={`Browse ${row.category} items`}>
                        <span>{row.category}</span><strong>{quantity(row.quantity)}</strong>
                      </button>;
                    })}
                  </div> : <Empty title="No categorized stock" detail="Category totals will appear when stock is registered." />}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h3>Low-stock alerts</h3><p>Select an item to view its branch stock.</p></div><button className={styles.textAction} type="button" onClick={() => setTab("stock")}>Manage stock</button></div>
                  {overview.lowStockItems.length ? <div className={styles.alertList}>
                    {overview.lowStockItems.map(row => <button className={styles.alertRow} type="button" key={`${row.id}-${row.branchId}`} onClick={() => {
                      setBranchFilter(row.branchId);
                      setSearch(row.sku);
                      setStatusFilter("ALL");
                      setTab("stock");
                    }} aria-label={`Open ${row.name} stock at ${row.branchName}`}>
                      <span className={styles.alertIcon}><AlertTriangle size={16} /></span>
                      <span className={styles.alertDetails}><strong>{row.name}</strong><small>{row.sku} · {row.branchName}</small></span>
                      <span className={styles.alertAmount}>{quantity(row.available)}<small>available</small></span>
                    </button>)}
                  </div> : <Empty title="No low-stock alerts" detail="Items are compared with their configured reorder threshold." />}
                </section>
                <section className={styles.panel}>
                  <div className={styles.panelHeader}><div><h3>Recent movements</h3><p>Latest recorded stock changes</p></div><button className={styles.textAction} type="button" onClick={() => setTab("stock")}>Open stock</button></div>
                  {overview.recentMovements.length ? <MovementList movements={overview.recentMovements} /> : <Empty title="No inventory movements" detail="Receipts and issues appear here after stock activity is recorded." />}
                </section>
              </div>
            </>
          )}
        </section>
      ) : (
        <section aria-labelledby="items-title">
          <div className={styles.sectionHeading}>
            <div><h2 id="items-title">{tab === "catalog" ? "Item catalog" : "Stock management"}</h2><p>{tab === "catalog" ? "One master item can be registered across multiple branches." : `Balances and movements for ${branchLabel.toLowerCase()}.`}</p></div>
            <div className={styles.sectionActions}>
              {canManageCatalog && <button className={styles.secondaryButton} type="button" onClick={() => { setError(""); setDialog({ type: "category", mode: "list" }); }}><ClipboardList size={16} />Categories</button>}
              {canManageCatalog && tab === "catalog" && <button className={styles.primaryButton} type="button" onClick={beginCreate}><Plus size={17} />New item</button>}
            </div>
          </div>
          <div className={styles.filters}>
            <label className={styles.searchBox}><Search size={17} aria-hidden="true" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item, SKU, or category" aria-label="Search inventory items" /></label>
            <label className={styles.filterLabel}><FieldLabel>Category</FieldLabel><span className={styles.selectWrap}><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categoryOptions.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select><ChevronDown size={15} /></span></label>
            <label className={styles.filterLabel}><FieldLabel>Status</FieldLabel><span className={styles.selectWrap}><select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="ARCHIVED">Archived</option><option value="ALL">All statuses</option></select><ChevronDown size={15} /></span></label>
            <span className={styles.resultCount}>{quantity(totalItems)} items</span>
          </div>
          <div className={styles.tablePanel}>
            {contentLoading ? <InventoryItemsLoading /> : items.length === 0 ? <Empty title="No inventory items found" detail={search || categoryFilter ? "Try changing your search or filters." : "Create a catalog item to begin, or wait for an authorized user to add one."} /> : (
              <div className={styles.tableScroll}>
                <table className={styles.table}>
                  <thead><tr><th>Item</th><th>Category</th><th>Type</th><th>Branch stock</th><th>Available</th><th>Reorder at</th><th>Status</th><th><span className={styles.srOnly}>Actions</span></th></tr></thead>
                  <tbody>{items.map(item => <tr key={item.id}>
                    <td data-label="Item"><span className={styles.itemName}>{item.name}</span><small className={styles.itemSku}>{item.sku} · {item.unit}</small></td>
                    <td data-label="Category">{item.category}</td><td data-label="Type"><span className={styles.typePill}>{formatLabel(item.itemType)}</span></td>
                    <td data-label="Branch stock">{quantity(item.onHand)}</td><td data-label="Available"><strong>{quantity(item.available)}</strong><small className={styles.stockBreakdown}>{item.reserved ? `${quantity(item.reserved)} reserved` : item.quarantined ? `${quantity(item.quarantined)} quarantined` : item.registered ? "Available" : "Not registered"}</small></td>
                    <td data-label="Reorder at">{quantity(item.reorderThreshold)}</td><td data-label="Status"><StatusBadge status={item.status} /></td>
                    <td data-label="Actions"><div className={styles.rowActions}>
                      {tab === "stock" && canManageStock && (!scopedBranchId
                        ? <span className={styles.categoryManagerHint}>Choose a branch above to change stock</span>
                        : item.registered && stockBranchId
                        ? <><button type="button" className={styles.smallAction} onClick={() => startMovement(item,"RECEIPT")} aria-label={`Receive stock for ${item.name}`}><Plus size={16} />Restock</button><button type="button" className={styles.smallActionMuted} onClick={() => startMovement(item,"ISSUE")} disabled={item.available <= 0 || item.status !== "ACTIVE"} aria-label={`Issue stock for ${item.name}`}><span aria-hidden="true">?</span>Issue</button></>
                        : <button type="button" className={styles.smallAction} onClick={() => setDialog({ type:"register",item })}>Register</button>)}
                      {tab === "catalog" && canManageCatalog && item.status !== "ARCHIVED" && <><button type="button" className={styles.smallAction} onClick={() => beginEdit(item)}>Edit</button><button type="button" className={styles.smallActionMuted} onClick={() => setDialog({ type:"archive",item })}>Archive</button></>}
                    </div></td>
                  </tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
          {tab === "stock" && <section className={styles.panel + " " + styles.movementPanel}><div className={styles.panelHeader}><div><h3>Movement history</h3><p>Posted changes are retained as an audit record.</p></div></div>{movements.length ? <MovementList movements={movements} /> : <Empty title="No stock history" detail="Stock receipts and issues will be listed here." />}</section>}
        </section>
      )}

      {dialog?.type === "create" && <ItemDialog title="Create catalog item" busy={saving} onClose={() => !saving && setDialog(null)} onSubmit={saveItem} categories={categoryOptions} branches={branches} initial={draft} create canViewValue={Boolean(overview?.canViewInventoryValue)} />}
      {dialog?.type === "edit" && <ItemDialog title="Edit catalog item" busy={saving} onClose={() => !saving && setDialog(null)} onSubmit={saveItem} categories={categoryOptions} branches={branches} initial={draft} canViewValue={Boolean(overview?.canViewInventoryValue)} />}
      {dialog?.type === "category" && <Modal onClose={() => !saving && setDialog(null)} busy={saving} aria-labelledby="category-dialog-title"><div className={styles.dialog}>
        <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>CATALOG SETTINGS</span><h2 id="category-dialog-title">{dialog.mode === "list" ? "Manage categories" : dialog.mode === "edit" ? "Edit category" : "Add category"}</h2><p>{dialog.mode === "list" ? "Organize shared catalog items into reusable categories." : "Category names are shared across authorized branches."}</p></div><button className={styles.closeButton} type="button" onClick={() => setDialog(null)} disabled={saving} aria-label="Close">×</button></div>
        {dialog.mode === "list" ? <>
          <div className={styles.categoryManagerToolbar}><span className={styles.categoryManagerHint}>{quantity(categoryOptions.length)} categories</span><button className={styles.primaryButton} type="button" onClick={() => { setError(""); setDialog({ type: "category", mode: "create" }); }}><Plus size={16} />Add category</button></div>
          {categoryOptions.length ? <div className={styles.categoryManagerList}>{categoryOptions.map(category => <div className={styles.categoryManagerRow} key={category.id}>
            <div className={styles.categoryInfo}><strong>{category.name}</strong><small>{category.description?.trim() || "No description"}</small></div>
            <span className={styles.categoryUsage}>{quantity(category.itemCount)} {category.itemCount === 1 ? "item" : "items"}</span>
            <div className={styles.categoryRowActions}>
              <button className={styles.iconButton} type="button" onClick={() => { setError(""); setDialog({ type: "category", mode: "edit", category }); }} disabled={saving} aria-label={`Edit ${category.name} category`} title="Edit category"><Pencil size={15} /></button>
              <button className={`${styles.iconButton} ${styles.categoryDeleteButton}`} type="button" onClick={() => { setError(""); setDialog({ type: "categoryDelete", category }); }} disabled={saving || category.itemCount > 0} aria-label={`Delete ${category.name} category`} title={category.itemCount > 0 ? "Reassign all items before deleting this category" : "Delete category"}><Trash2 size={15} /></button>
            </div>
          </div>)}</div> : <Empty title="No categories yet" detail="Add a category to organize the shared item catalog." />}
        </> : <form onSubmit={saveCategory} className={styles.form}>
          <label className={styles.formField}><FieldLabel required>Category name</FieldLabel><input name="name" defaultValue={dialog.category?.name ?? ""} required maxLength={120} placeholder="e.g. Office supplies" /></label>
          <label className={styles.formField}><FieldLabel>Description</FieldLabel><textarea name="description" defaultValue={dialog.category?.description ?? ""} rows={3} maxLength={2000} placeholder="Describe which items belong in this category" /></label>
          <DialogActions busy={saving} onCancel={() => { setError(""); setDialog({ type: "category", mode: "list" }); }} submit={dialog.mode === "edit" ? "Save changes" : "Add category"} />
        </form>}
      </div></Modal>}
      {dialog?.type === "categoryDelete" && <Modal onClose={() => !saving && setDialog({ type: "category", mode: "list" })} busy={saving} aria-labelledby="delete-category-title"><div className={styles.dialog}>
        <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>CATALOG SETTINGS</span><h2 id="delete-category-title">Delete category?</h2><p>This cannot be undone.</p></div><button className={styles.closeButton} type="button" onClick={() => setDialog({ type: "category", mode: "list" })} disabled={saving} aria-label="Close">×</button></div>
        <p className={styles.confirmText}>Delete <strong>{dialog.category.name}</strong>? Categories assigned to inventory items must be reassigned before they can be deleted.</p>
        <DialogActions busy={saving} busyLabel="Deleting…" onCancel={() => { setError(""); setDialog({ type: "category", mode: "list" }); }} submit="Delete category" onSubmit={() => void removeCategory(dialog.category)} />
      </div></Modal>}
      {dialog?.type === "movement" && <StockMovementDialog key={movementKey} item={dialog.item} movementType={dialog.movementType} branchId={stockBranchId} branchName={branches.find(branch => branch.id === stockBranchId)?.name ?? "Selected branch"} busy={saving} onClose={() => !saving && setDialog(null)} onSubmit={postMovement} />}
      {dialog?.type === "register" && <Modal onClose={() => !saving && setDialog(null)} busy={saving} aria-labelledby="register-dialog-title"><div className={styles.dialog}><div className={styles.dialogHeader}><div><span className={styles.eyebrow}>BRANCH STOCK</span><h2 id="register-dialog-title">Register item at branch</h2><p>{dialog.item.name} · {dialog.item.sku}</p></div><button className={styles.closeButton} type="button" onClick={() => setDialog(null)} disabled={saving} aria-label="Close">×</button></div><form onSubmit={registerAtBranch} className={styles.form}><label className={styles.formField}><FieldLabel required>Branch</FieldLabel><select name="branchId" defaultValue={stockBranchId} required>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label className={styles.formField}><FieldLabel>Storage location</FieldLabel><input name="storageLocation" maxLength={200} placeholder="Main storage" /></label><label className={styles.formField}><FieldLabel required>Opening stock</FieldLabel><input name="openingStock" type="number" min="0" step="1" defaultValue="0" required /></label><p className={styles.formHint}>Opening stock is recorded as a movement with its own history entry.</p><DialogActions busy={saving} onCancel={() => setDialog(null)} submit="Register item" /></form></div></Modal>}
      {dialog?.type === "archive" && <Modal onClose={() => !saving && setDialog(null)} busy={saving} aria-labelledby="archive-dialog-title"><div className={styles.dialog}><div className={styles.dialogHeader}><div><span className={styles.eyebrow}>CATALOG LIFECYCLE</span><h2 id="archive-dialog-title">Archive item?</h2></div><button className={styles.closeButton} type="button" onClick={() => setDialog(null)} disabled={saving} aria-label="Close">×</button></div><p className={styles.confirmText}>Archive <strong>{dialog.item.name}</strong> ({dialog.item.sku})? Its stock and movement history will remain available.</p><DialogActions busy={saving} onCancel={() => setDialog(null)} submit="Archive item" onSubmit={() => void archiveItem(dialog.item)} /></div></Modal>}
    </main>
  );
}

function formatLabel(value: string) {
  return value.toLowerCase().replaceAll("_"," ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function Metric({ icon: Icon, label, value, detail, tone }: { icon: typeof Package; label: string; value: number; detail: string; tone?: "warning" | "danger" }) {
  return <article className={styles.metric}>
    <span className={tone === "warning" ? styles.metricIconWarning : tone === "danger" ? styles.metricIconDanger : styles.metricIcon}><Icon size={18} aria-hidden="true" /></span>
    <span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{quantity(value)}</strong><small>{detail}</small>
  </article>;
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className={styles.empty}><span className={styles.emptyIcon}><Boxes size={19} /></span><strong>{title}</strong><p>{detail}</p></div>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={status === "ACTIVE" ? styles.statusActive : status === "ARCHIVED" ? styles.statusArchived : styles.statusInactive}>{formatLabel(status)}</span>;
}

function MovementList({ movements }: { movements: Movement[] }) {
  return <div className={styles.movementList}>{movements.map(movement => {
    const receipt = movement.quantityDelta > 0;
    return <div className={styles.movementRow} key={movement.id}>
      <span className={receipt ? styles.movementIn : styles.movementOut}>{receipt ? <ArrowDownToLine size={16} /> : <ArrowUpFromLine size={16} />}</span>
      <span className={styles.movementDetails}><strong>{movement.itemName}</strong><small>{movement.sku} · {movement.branchName} · {movement.reason}</small></span>
      <span className={receipt ? styles.positiveQuantity : styles.negativeQuantity}>{receipt ? "+" : "−"}{quantity(movement.quantity)}<small>{formatLabel(movement.movementType)}</small></span>
    </div>;
  })}</div>;
}

function ItemDialog({ title, busy, onClose, onSubmit, categories, branches, initial, create = false, canViewValue }: {
  title: string; busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  categories: Category[]; branches: Branch[]; initial: ItemDraft; create?: boolean; canViewValue: boolean;
}) {
  return <Modal onClose={onClose} busy={busy} aria-labelledby="item-dialog-title"><div className={styles.dialog}>
    <div className={styles.dialogHeader}><div><span className={styles.eyebrow}>MASTER ITEM</span><h2 id="item-dialog-title">{title}</h2></div><button className={styles.closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button></div>
    <form onSubmit={onSubmit} className={styles.form}>
      <div className={styles.formGrid}>
        <label className={styles.formField}><FieldLabel required>Item name</FieldLabel><input name="name" defaultValue={initial.name} required maxLength={200} placeholder="e.g. Bond paper A4" /></label>
        <label className={styles.formField}><FieldLabel required>SKU</FieldLabel><input name="sku" defaultValue={initial.sku} required maxLength={100} placeholder="e.g. PAPER-A4-001" /></label>
        <label className={styles.formField}><FieldLabel required>Category</FieldLabel><select name="categoryId" defaultValue={initial.categoryId} required><option value="" disabled>Select a category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        <label className={styles.formField}><FieldLabel required>Unit</FieldLabel><input name="unit" defaultValue={initial.unit} required maxLength={50} placeholder="PCS, BOX, REAM" /></label>
        <label className={styles.formField}><FieldLabel required>Item type</FieldLabel><select name="itemType" defaultValue={initial.itemType} required><option value="CONSUMABLE">Consumable</option><option value="EQUIPMENT">Equipment</option><option value="FURNITURE">Furniture</option><option value="TOOL">Tool</option><option value="ASSET">Fixed asset</option><option value="SPARE_PART">Spare part</option><option value="OTHER">Other</option></select></label>
        <label className={styles.formField}><FieldLabel required>Tracking method</FieldLabel><select name="trackingMethod" defaultValue={initial.trackingMethod} required><option value="QUANTITY">Quantity tracked</option><option value="SERIALIZED">Serialized</option><option value="BATCH">Batch or lot</option><option value="EXPIRATION">Expiration tracked</option><option value="REUSABLE">Reusable</option><option value="RESERVABLE">Reservable</option></select></label>
        <label className={styles.formField}><FieldLabel required>Reorder threshold</FieldLabel><input name="reorderThreshold" type="number" min="0" step="1" defaultValue={initial.reorderThreshold} required /></label>
        <label className={styles.formField}><FieldLabel>Maximum stock</FieldLabel><input name="maximumStockThreshold" type="number" min="0" step="1" defaultValue={initial.maximumStockThreshold} placeholder="Set a maximum level" /></label>
        {canViewValue && <label className={styles.formField}><FieldLabel>Purchase price</FieldLabel><input name="purchasePrice" type="number" min="0" step="0.01" defaultValue={initial.purchasePrice} placeholder="0.00" /></label>}
        {create && <label className={styles.formField}><FieldLabel required>Register at branch</FieldLabel><select name="branchId" defaultValue={initial.branchId} required><option value="" disabled>Select a branch</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
        {create && <label className={styles.formField}><FieldLabel required>Opening stock</FieldLabel><input name="openingStock" type="number" min="0" step="1" defaultValue="0" required /></label>}
        <label className={styles.formField + " " + styles.fullField}><FieldLabel>Description</FieldLabel><textarea name="description" defaultValue={initial.description} rows={3} maxLength={5000} placeholder="Specifications or identifying details" /></label>
      </div>
      {create && <p className={styles.formHint}>Opening stock, when entered, is saved as a permanent movement record.</p>}
      <DialogActions busy={busy} onCancel={onClose} submit={create ? "Create item" : "Save changes"} />
    </form>
  </div></Modal>;
}

function StockMovementDialog({ item, movementType, branchId, branchName, busy, onClose, onSubmit }: {
  item: Item; movementType: "RECEIPT" | "ISSUE"; branchId: string; branchName: string;
  busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [amount, setAmount] = useState("1");
  const receiving = movementType === "RECEIPT";
  const units = Number(amount);
  const limit = receiving ? 2147483647 - item.onHand : item.available;
  const valid = amount !== "" && Number.isSafeInteger(units) && units > 0 && units <= limit;
  const after = valid ? item.available + (receiving ? units : -units) : null;
  return <Modal className={styles.stockModal} busy={busy} onClose={onClose} aria-labelledby="stock-action-title">
    <div className={styles.dialogHeader}>
      <div><span className={styles.eyebrow}>{branchName}</span><h2 id="stock-action-title">{receiving ? "Receive stock" : "Issue stock"}</h2><p>{item.name} · {item.sku}</p></div>
      <button className={styles.closeButton} type="button" onClick={onClose} disabled={busy} aria-label="Close">×</button>
    </div>
    <form className={styles.form} onSubmit={onSubmit}>
      <input type="hidden" name="branchId" value={branchId} />
      <fieldset className={styles.movementFields} disabled={busy}>
        <label className={styles.formField} htmlFor="stock-quantity"><FieldLabel required>Quantity ({item.unit})</FieldLabel></label>
        <div className={styles.quantityControls}>
          <button type="button" className={styles.secondaryButton} aria-label="Decrease quantity by one" disabled={busy || units <= 1 || !Number.isSafeInteger(units)} onClick={() => setAmount(String(units - 1))}>−</button>
          <input id="stock-quantity" name="quantity" type="number" inputMode="numeric" min="1" max={Math.max(0, limit)} step="1" required value={amount} onChange={event => setAmount(event.target.value)} aria-invalid={!valid} aria-describedby="stock-quantity-feedback" />
          <button type="button" className={styles.secondaryButton} aria-label="Increase quantity by one" disabled={busy || units >= limit || !Number.isSafeInteger(units)} onClick={() => setAmount(String(units + 1))}>+</button>
        </div>
        <div className={styles.quantityShortcuts} aria-label="Add units">{[1, 5, 10].map(increment => <button key={increment} type="button" className={styles.secondaryButton} disabled={busy || !Number.isSafeInteger(units) || units + increment > limit} onClick={() => setAmount(String(units + increment))}>+{increment}</button>)}</div>
        <p id="stock-quantity-feedback" className={styles.quantityFeedback}>{valid ? "Enter a quantity or use the shortcuts." : `Enter a whole quantity between 1 and ${quantity(Math.max(0, limit))}.`}</p>
        <div className={styles.balancePreview} role="status" aria-live="polite" aria-atomic="true"><span>Branch available stock</span><strong>{quantity(item.available)} → {after === null ? "—" : quantity(after)} {item.unit}</strong><small>Preview based on the loaded branch balance. Location availability is checked when posted.</small></div>
        <details className={styles.quickDetails}><summary>Add notes or choose a storage location</summary><div className={styles.form}>
          <label className={styles.formField}><FieldLabel>Storage location</FieldLabel><input name="storageLocation" maxLength={200} placeholder="Default location" /><small>Leave blank for the default location, or enter the registered location name.</small></label>
          <label className={styles.formField}><FieldLabel>{receiving ? "Delivery reference or reason" : "Recipient and purpose"}</FieldLabel><textarea name="reason" rows={2} maxLength={1000} placeholder={receiving ? "e.g. Supplier delivery, reference DR-123" : "e.g. Issued to Maria for office supplies"} /></label>
        </div></details>
      </fieldset>
      <div className={styles.stockSubmit}><button type="button" className={styles.secondaryButton} disabled={busy} onClick={onClose}>Cancel</button><button type="submit" className={styles.primaryButton} disabled={busy || !valid}>{busy ? "Posting…" : `${receiving ? "Receive" : "Issue"} ${valid ? quantity(units) : ""} ${item.unit}`}</button></div>
    </form>
  </Modal>;
}

function DialogActions({ busy, onCancel, submit, onSubmit, busyLabel = "Saving…" }: { busy: boolean; onCancel: () => void; submit: string; onSubmit?: () => void; busyLabel?: string }) {
  return <div className={styles.dialogActions}><button className={styles.secondaryButton} type="button" onClick={onCancel} disabled={busy}>Cancel</button><button className={styles.primaryButton} type={onSubmit ? "button" : "submit"} onClick={onSubmit} disabled={busy}>{busy ? busyLabel : submit}</button></div>;
}
