"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardList,
  Download,
  LayoutDashboard,
  Plus,
  Settings2,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { RealtimeQueryProvider } from "../components/realtime-query-provider";
import { PageHeading, PageHeader } from "../components/page-heading";
import { notifySuccess } from "../lib/notifications";
import {
  inquiryApi,
  label,
  statuses,
  type Analytics,
  type Collection,
  type Inquiry,
  type InquiryTask,
  type Metadata,
} from "./types";
import { InquiryList } from "./inquiry-list";
import { InquiryForm } from "./inquiry-form";
import { InquiryDetail } from "./inquiry-detail";
import { InquiryAnalytics } from "./inquiry-analytics";
import { InquiryFollowUps } from "./inquiry-followups";
import { InquirySettings } from "./inquiry-settings";
import { InquiryImport } from "./inquiry-import";
import InquiryLoading from "./inquiry-loading";
import { Modal } from "../components/ui/modal";
import css from "./workspace.module.css";
export type InquirySection =
  "dashboard" | "list" | "followups" | "reports" | "settings";
export const inquiryPages = [
  {
    key: "dashboard",
    label: "Inquiry Dashboard",
    tabLabel: "Dashboard",
    href: "/inquiries",
    icon: LayoutDashboard,
  },
  {
    key: "list",
    label: "All Inquiries",
    tabLabel: "All inquiries",
    href: "/inquiries/list",
    icon: ClipboardList,
  },
  {
    key: "followups",
    label: "Follow-ups",
    tabLabel: "Follow-ups",
    href: "/inquiries/followups",
    icon: CalendarClock,
  },
  {
    key: "reports",
    label: "Inquiry Reports",
    tabLabel: "Reports",
    href: "/inquiries/reports",
    icon: ChartNoAxesCombined,
  },
  {
    key: "settings",
    label: "Inquiry Settings",
    tabLabel: "Settings",
    href: "/inquiries/settings",
    icon: Settings2,
  },
];
const primaryFilterKeys: Record<InquirySection, string[]> = {
  dashboard: ["branchId", "from", "to"],
  list: ["search", "branchId", "status"],
  followups: ["branchId", "followUpFrom", "followUpTo"],
  reports: ["branchId", "from", "to"],
  settings: [],
};
const availableFilterKeys: Record<InquirySection, string[]> = {
  dashboard: [
    "search",
    "branchId",
    "status",
    "serviceId",
    "from",
    "to",
    "assignedStaffId",
    "sourceId",
    "channelId",
    "grouping",
    "archived",
  ],
  list: [
    "search",
    "branchId",
    "status",
    "serviceId",
    "from",
    "to",
    "assignedStaffId",
    "sourceId",
    "channelId",
    "archived",
    "sort",
    "direction",
  ],
  followups: ["branchId", "followUpFrom", "followUpTo", "assignedStaffId"],
  reports: [
    "search",
    "branchId",
    "status",
    "serviceId",
    "from",
    "to",
    "assignedStaffId",
    "sourceId",
    "channelId",
    "grouping",
    "archived",
    "reportSort",
    "direction",
  ],
  settings: [],
};
function Content({ section }: { section: InquirySection }) {
  const initial = useSearchParams();
  const [filters, setFilters] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        "search",
        "branchId",
        "status",
        "serviceId",
        "sourceId",
        "channelId",
        "assignedStaffId",
        "from",
        "to",
        "archived",
        "metric",
        "grouping",
        "sort",
        "direction",
        "reportSort",
        "followUpQueue",
        "followUpFrom",
        "followUpTo",
        "lostReason",
      ].map((k) => [k, initial.get(k) ?? ""]),
    ),
  );
  const [filtersExpanded, setFiltersExpanded] = useState(() =>
    availableFilterKeys[section].some(
      (key) =>
        !primaryFilterKeys[section].includes(key) && Boolean(initial.get(key)),
    ),
  );
  const [page, setPage] = useState(1),
    [view, setView] = useState("table"),
    [selected, setSelected] = useState<string[]>([]),
    [opened, setOpened] = useState<string | null>(null),
    [editing, setEditing] = useState<Inquiry | true | null>(null),
    [importing, setImporting] = useState(false),
    [bulk, setBulk] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const meta = useQuery({
    queryKey: ["inquiries", "metadata"],
    queryFn: () => inquiryApi<Metadata>("/metadata"),
  });
  const q = new URLSearchParams({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    page: String(page),
    pageSize: "20",
  }).toString();
  const endpoint =
    section === "dashboard" || section === "reports"
      ? `/${section}`
      : section === "followups"
        ? "/followups"
        : "";
  const data = useQuery({
    queryKey: ["inquiries", section, q],
    queryFn: () =>
      inquiryApi<Collection | Analytics | { items: InquiryTask[] }>(
        `${endpoint}?${q}`,
      ),
    enabled: !!meta.data && section !== "settings",
  });
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["inquiries"] });
  };
  function filter(key: string, value: string) {
    const next = { ...filters, [key]: value };
    if (key === "status") next.metric = "";
    if (
      availableFilterKeys[section].includes(key) &&
      !primaryFilterKeys[section].includes(key)
    ) {
      setFiltersExpanded(true);
    }
    setFilters(next);
    const url = new URL(window.location.href);
    url.search = new URLSearchParams(
      Object.entries(next).filter(([, v]) => v),
    ).toString();
    window.history.replaceState(null, "", url);
    setPage(1);
    setSelected([]);
  }
  if (meta.isPending) return <InquiryLoading section={section} />;
  if (meta.isError)
    return (
      <div className={css.error} role="alert">
        {meta.error.message}
        <button onClick={() => meta.refetch()}>Retry</button>
      </div>
    );
  const m = meta.data;
  const filterSelect = (
    key: string,
    title: string,
    choices: { id: string; name: string }[],
  ) => (
    <label className={css.filterField} key={title}>
      {title}
      <select
        value={filters[key] ?? ""}
        onChange={(e) => filter(key, e.target.value)}
      >
        <option value="">
          {{
            Branch: "All branches",
            Status: "All statuses",
            Service: "All services",
            "Assigned staff": "All staff",
            "Inquiry source": "All sources",
            Channel: "All channels",
          }[title] ?? "All"}
        </option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
  const controlFor = (key: string) => {
    switch (key) {
      case "search":
        return (
          <label className={css.filterField} key={key}>
            Search inquiries
            <input
              type="search"
              maxLength={120}
              value={filters.search}
              onChange={(e) => filter("search", e.target.value)}
              placeholder="Client name or reference"
            />
          </label>
        );
      case "branchId":
        return filterSelect("branchId", "Branch", m.branches);
      case "status":
        return filterSelect(
          "status",
          "Status",
          statuses.map((s) => ({ id: s, name: label(s) })),
        );
      case "serviceId":
        return filterSelect(
          "serviceId",
          "Service",
          m.lookups
            .filter((l) => l.kind === "SERVICE")
            .map((l) => ({ id: l.id, name: l.label })),
        );
      case "assignedStaffId":
        return filterSelect("assignedStaffId", "Assigned staff", m.staff);
      case "sourceId":
        return filterSelect(
          "sourceId",
          "Inquiry source",
          m.lookups
            .filter((l) => l.kind === "SOURCE")
            .map((l) => ({ id: l.id, name: l.label })),
        );
      case "channelId":
        return filterSelect(
          "channelId",
          "Channel",
          m.lookups
            .filter((l) => l.kind === "CHANNEL")
            .map((l) => ({ id: l.id, name: l.label })),
        );
      case "from":
      case "to":
        return (
          <label className={css.filterField} key={key}>
            Inquiry date {key === "from" ? "from" : "to"}
            <input
              type="date"
              value={filters[key]}
              onChange={(e) => filter(key, e.target.value)}
            />
          </label>
        );
      case "followUpFrom":
      case "followUpTo":
        return (
          <label className={css.filterField} key={key}>
            Due date {key === "followUpFrom" ? "from" : "to"}
            <input
              type="date"
              value={filters[key]}
              onChange={(e) => filter(key, e.target.value)}
            />
          </label>
        );
      case "grouping":
        return (
          <label className={css.filterField} key={key}>
            Group dates by
            <select
              value={filters.grouping || "month"}
              onChange={(e) => filter("grouping", e.target.value)}
            >
              {["day", "week", "month", "quarter", "year"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        );
      case "archived":
        return (
          <label className={css.filterField} key={key}>
            Records
            <select
              value={filters.archived || "false"}
              onChange={(e) => filter("archived", e.target.value)}
            >
              <option value="false">Active records</option>
              <option value="true">Archived records</option>
            </select>
          </label>
        );
      case "sort":
        return (
          <label className={css.filterField} key={key}>
            Sort inquiries by
            <select
              value={filters.sort || "date"}
              onChange={(e) => filter("sort", e.target.value)}
            >
              {["date", "client", "updated", "reference"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        );
      case "reportSort":
        return (
          <label className={css.filterField} key={key}>
            Sort report by
            <select
              value={filters.reportSort || "label"}
              onChange={(e) => filter("reportSort", e.target.value)}
            >
              {["label", "count", "converted"].map((v) => (
                <option key={v} value={v}>
                  {label(v)}
                </option>
              ))}
            </select>
          </label>
        );
      case "direction":
        return (
          <label className={css.filterField} key={key}>
            Order
            <select
              value={filters.direction || "DESC"}
              onChange={(e) => filter("direction", e.target.value)}
            >
              <option value="DESC">Descending</option>
              <option value="ASC">Ascending</option>
            </select>
          </label>
        );
      default:
        return null;
    }
  };
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) =>
      value &&
      !(
        (key === "archived" && value === "false") ||
        (key === "grouping" && value === "month") ||
        (key === "sort" && value === "date") ||
        (key === "reportSort" && value === "label") ||
        (key === "direction" && value === "DESC")
      ),
  ).length;
  const additionalFilterCount = availableFilterKeys[section]
    .filter((key) => !primaryFilterKeys[section].includes(key))
    .filter((key) => Boolean(filters[key])).length;
  const clearFilters = () => {
    setFilters({});
    setPage(1);
    setSelected([]);
    const url = new URL(window.location.href);
    url.search = "";
    window.history.replaceState(null, "", url);
    setFiltersExpanded(false);
  };
  return (
    <div className={css.workspace}>
      <PageHeader className={css.top}>
        <div className={css.heroCopy}>
          <p className={css.eyebrow}>BUSINESS / INQUIRIES</p>
          <PageHeading>
            {inquiryPages.find((p) => p.key === section)?.label}
          </PageHeading>
          <p>
            Keep client requests, next steps and outcomes moving across your
            branches.
          </p>
        </div>
        <div className={css.headerActions}>
          <span className={css.branchContext}>
            {filters.branchId
              ? m.branches.find((branch) => branch.id === filters.branchId)
                  ?.name ?? "Selected branch"
              : "All authorized branches"}
          </span>
          {m.permissions.import && m.permissions.create && (
            <button
              type="button"
              className={css.secondary}
              disabled={!m.branches.length}
              onClick={() => setImporting(true)}
              aria-haspopup="dialog"
            >
              <Upload size={17} aria-hidden="true" /> Import records
            </button>
          )}
          {m.permissions.create && (
            <button
              type="button"
              className={css.primary}
              onClick={() => setEditing(true)}
              aria-haspopup="dialog"
            >
              <Plus size={18} aria-hidden="true" /> Create inquiry
            </button>
          )}
        </div>
      </PageHeader>
      <nav className={css.nav} aria-label="Inquiry sections">
        {inquiryPages
          .filter((p) => m.permissions[p.key])
          .map((p) => (
            <Link
              key={p.key}
              href={p.href}
              aria-current={p.key === section ? "page" : undefined}
              className={p.key === section ? css.activeTab : undefined}
            >
              <p.icon size={17} aria-hidden="true" />
              <span>{p.tabLabel}</span>
            </Link>
          ))}
      </nav>
      {section !== "settings" && (
        <section className={`${css.panel} ${css.filterPanel}`} aria-label="Inquiry filters">
          <div className={css.filterHeader}>
            <div>
              <h2>Refine this view</h2>
              <p>
                {activeFilterCount
                  ? `${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"} applied`
                  : "Choose a few filters to focus the results."}
              </p>
            </div>
            <div className={css.filterActions}>
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  className={css.clearFilters}
                  onClick={clearFilters}
                >
                  Clear filters
                </button>
              )}
              {availableFilterKeys[section].some(
                (key) => !primaryFilterKeys[section].includes(key),
              ) && (
                <button
                  type="button"
                  className={css.filterToggle}
                  aria-expanded={filtersExpanded}
                  aria-controls="inquiry-more-filters"
                  onClick={() => setFiltersExpanded((expanded) => !expanded)}
                >
                  <SlidersHorizontal size={16} aria-hidden="true" />
                  {filtersExpanded ? "Fewer filters" : "More filters"}
                  {additionalFilterCount > 0 && (
                    <span className={css.filterCount}>
                      {additionalFilterCount}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className={css.primaryFilters}>
            {primaryFilterKeys[section].map(controlFor)}
          </div>
          {availableFilterKeys[section].some(
            (key) => !primaryFilterKeys[section].includes(key),
          ) && (
            <div
              id="inquiry-more-filters"
              className={css.advancedFilters}
              hidden={!filtersExpanded}
            >
              {availableFilterKeys[section]
                .filter((key) => !primaryFilterKeys[section].includes(key))
                .map(controlFor)}
            </div>
          )}
        </section>
      )}
      {error && (
        <div role="alert" className={css.error}>
          {error}
        </div>
      )}
      {filters.metric && (
        <div className={css.toolbar}>
          <p>Drill-down: {label(filters.metric)}</p>
          <button onClick={() => filter("metric", "")}>Clear drill-down</button>
        </div>
      )}
      {section === "settings" ? (
        <section className={css.panel}>
          <InquirySettings meta={m} onSaved={refresh} />
        </section>
      ) : data.isPending ? (
        <InquiryLoading section={section} contentOnly />
      ) : data.isError ? (
        <div role="alert" className={css.error}>
          {data.error.message}
          <button onClick={() => data.refetch()}>Retry</button>
        </div>
      ) : (
        data.data && (
          <>
            <div className={css.toolbar}>
              {section === "list" ? (
                <div className={css.actions}>
                  <button
                    aria-pressed={view === "table"}
                    onClick={() => setView("table")}
                  >
                    Table
                  </button>
                  <button
                    aria-pressed={view === "kanban"}
                    onClick={() => setView("kanban")}
                  >
                    Kanban
                  </button>
                  {selected.length > 0 && m.permissions.archive && (
                    <button onClick={() => setBulk(true)}>
                      {filters.archived === "true" ? "Restore" : "Archive"}{" "}
                      {selected.length} selected
                    </button>
                  )}
                </div>
              ) : (
                <span />
              )}
              {m.permissions.export && (
                <details className={css.exportMenu}>
                  <summary className={css.button}>
                    <Download size={16} aria-hidden="true" /> Export
                  </summary>
                  <div className={css.exportOptions}>
                    {["csv", "xlsx", "pdf"].map((format) => (
                      <a
                        key={format}
                        href={`/api/inquiries/export?${q}&format=${format}${section === "reports" ? "&summary=true" : ""}`}
                      >
                        {format.toUpperCase()}
                      </a>
                    ))}
                  </div>
                </details>
              )}
            </div>
            {section === "list" ? (
              <section className={css.panel}>
                <InquiryList
                  data={data.data as Collection}
                  meta={m}
                  view={view}
                  onOpen={setOpened}
                  selected={selected}
                  onSelect={setSelected}
                  page={page}
                  onPage={setPage}
                />
              </section>
            ) : section === "followups" ? (
              <section className={css.panel}>
                <InquiryFollowUps
                  tasks={(data.data as { items: InquiryTask[] }).items}
                  userId={m.userId}
                  onOpen={setOpened}
                  queue={filters.followUpQueue || "mine"}
                  onQueue={(queue) => filter('followUpQueue',queue)}
                  total={(data.data as { total: number }).total}
                  page={page}
                  onPage={setPage}
                />
              </section>
            ) : (
              <InquiryAnalytics
                data={data.data as Analytics}
                report={section === "reports"}
                search={q}
                meta={m}
              />
            )}
          </>
        )
      )}
      {opened && (
        <InquiryDetail
          id={opened}
          meta={m}
          onClose={() => setOpened(null)}
          onChanged={refresh}
          onEdit={(r) => {
            setOpened(null);
            setEditing(r);
          }}
        />
      )}
      {editing && (
        <InquiryForm
          meta={m}
          record={editing === true ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            setOpened(id);
            refresh();
            notifySuccess("Inquiry saved.");
          }}
        />
      )}
      {importing && (
        <InquiryImport
          meta={m}
          onClose={() => setImporting(false)}
          onSaved={refresh}
        />
      )}
      {bulk && (
        <Modal
          className={css.dialog}
          aria-labelledby="bulk-title"
          busy={busy}
          onClose={() => setBulk(false)}
        >
          <FormLayout
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              setBusy(true);
              try {
                await inquiryApi("/bulk", {
                  ids: selected,
                  archived: filters.archived !== "true",
                  reason: f.get("reason"),
                });
                setBulk(false);
                setSelected([]);
                refresh();
                notifySuccess("Selected inquiries updated.");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <h2 id="bulk-title">
              Confirm bulk {filters.archived === "true" ? "restore" : "archive"}
            </h2>
            <p>
              This affects {selected.length} records and retains their history.
            </p>
            <label>
              Reason
              <input required name="reason" maxLength={1000} />
            </label>
            <div className={css.actions}>
              <button
                type="button"
                disabled={busy}
                onClick={() => setBulk(false)}
              >
                Cancel
              </button>
              <button disabled={busy}>Confirm</button>
            </div>
          </FormLayout>
        </Modal>
      )}
    </div>
  );
}
export default function InquiryWorkspace({
  section,
}: {
  section: InquirySection;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
      }),
  );
  return (
    <RealtimeQueryProvider client={client}>
      <Content section={section} />
    </RealtimeQueryProvider>
  );
}
