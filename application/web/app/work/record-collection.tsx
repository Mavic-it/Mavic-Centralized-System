import { useState, type ReactNode } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpRight,
  Building2,
  CalendarDays,
  CheckCheck,
  ClipboardList,
  LayoutGrid,
  List,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  X,
} from "lucide-react";
import { label, type Kind, type RecordItem } from "./types";
import {
  isClosed,
  isOverdue,
  statusTone,
  visibleRecords,
  workDate,
  workTimestamp,
  type RecordSort,
} from "./presentation";
import css from "./workspace.module.css";
import {
  CARD_TABLE_VIEWS,
  useRememberedView,
} from "../lib/use-remembered-view";
import { PersonAvatar } from "../components/person-avatar";
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={css.badge} data-tone={statusTone(status)}>
      <i aria-hidden="true" />
      {label(status)}
    </span>
  );
}
export function ProgressBar({
  value,
  status,
}: {
  value: number;
  status?: string;
}) {
  return (
    <div className={css.progressBlock} data-task-status={status}>
      <progress aria-label="Task completion" max={100} value={value} />
      <span>{value}%</span>
    </div>
  );
}
export function CollectionSkeleton() {
  return (
    <div className={css.cards} aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={css.skeletonCard}>
          <div className={css.skeletonLine} />
          <div className={css.skeletonTitle} />
          <div className={css.skeletonLine} />
          <div className={css.skeletonLine} />
        </div>
      ))}
    </div>
  );
}
export function RecordCollection({
  kind,
  items,
  status,
  statuses,
  onStatus,
  loading,
  busy,
  onRefresh,
  onOpen,
  scopeControls,
  serverSearch,
  branchFilter,
  userFilter,
  error,
  extraFilters,
  extraFilterCount = 0,
}: {
  kind: Kind;
  items: RecordItem[];
  status: string;
  statuses: string[];
  onStatus: (s: string) => void;
  loading: boolean;
  busy: boolean;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  scopeControls?: ReactNode;
  serverSearch?: { value: string; onChange: (value: string) => void };
  branchFilter?: {
    branches: { id: string; name: string }[];
    value: string;
    onChange: (value: string) => void;
  };
  userFilter?: {
    users: { id: string; name: string }[];
    value: string;
    onChange: (value: string) => void;
  };
  error?: ReactNode;
  extraFilters?: ReactNode;
  extraFilterCount?: number;
}) {
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<RecordSort>("newest"),
    [group, setGroup] = useState<"all" | "active" | "closed">("all");
  const [layout, setLayout] = useRememberedView(
    `work-${kind}`,
    "cards",
    CARD_TABLE_VIEWS,
  );
  const visible = visibleRecords(items, serverSearch ? "" : query, sort, group);
  const countActive = items.filter((r) => !isClosed(r.status)).length;
  const filtered =
    !!query || group !== "all" || !!userFilter?.value || !!branchFilter?.value;
  return (
    <>
      <div className={css.collectionHeading}>
        {scopeControls}
        <div className={css.viewToggle} aria-label="Display records">
          {(
            [
              { id: "cards", Icon: LayoutGrid, text: "Cards" },
              { id: "table", Icon: List, text: "Table" },
            ] as const
          ).map(({ id, Icon, text }) => (
            <button
              type="button"
              key={id}
              onClick={() => setLayout(id)}
              aria-pressed={layout === id}
            >
              <Icon size={16} />
              <span>{text}</span>
            </button>
          ))}
        </div>
      </div>
      <div
        className={`${css.toolbar} ${kind === "incidents" ? css.incidentToolbar : ""}`}
      >
        <div className={css.searchField}>
          <Search size={17} aria-hidden="true" />
          <input
            aria-label={
              serverSearch
                ? kind === "tasks"
                  ? "Search authorized tasks"
                  : "Search authorized reports"
                : "Search this page"
            }
            placeholder={
              kind === "tasks"
                ? serverSearch
                  ? "Search tasks, assignees or branches"
                  : "Search tasks on this page"
                : "Search reference, employee or report"
            }
            value={serverSearch?.value ?? query}
            maxLength={serverSearch ? 120 : undefined}
            onChange={(e) =>
              (serverSearch?.onChange ?? setQuery)(e.target.value)
            }
          />
          {(serverSearch?.value ?? query) && (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => (serverSearch?.onChange ?? setQuery)("")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        <FilterGroup
          compact={kind === "incidents"}
          count={
            extraFilterCount +
            Number(!!branchFilter?.value) +
            Number(!!userFilter?.value) +
            Number(!!status) +
            Number(sort !== "newest")
          }
        >
          {extraFilters}
          {branchFilter && (
            <label className={css.compactField}>
              <span>
                <Building2 size={13} />
                Branch
              </span>
              <select
                aria-label={
                  kind === "tasks"
                    ? "Filter tasks by branch"
                    : "Filter incidents by branch"
                }
                value={branchFilter.value}
                onChange={(event) => branchFilter.onChange(event.target.value)}
              >
                <option value="">All authorized branches</option>
                {branchFilter.branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {userFilter && (
            <label className={css.compactField}>
              <span>
                <UserRound size={13} />
                {kind === "tasks" ? "Assignee" : "Concerned employee"}
              </span>
              <select
                aria-label={
                  kind === "tasks"
                    ? "Filter tasks by assignee"
                    : "Filter incidents by employee"
                }
                value={userFilter.value}
                onChange={(event) => userFilter.onChange(event.target.value)}
              >
                <option value="">All users</option>
                {userFilter.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={css.compactField}>
            <span>
              <SlidersHorizontal size={13} />
              Status
            </span>
            <select
              value={status}
              onChange={(e) => {
                onStatus(e.target.value);
                setGroup("all");
              }}
            >
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {label(s)}
                </option>
              ))}
            </select>
          </label>
          <label className={css.compactField}>
            <span>
              <ArrowDownWideNarrow size={13} />
              Sort this page
            </span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as RecordSort)}
            >
              <option value="newest">Newest first</option>
              <option value="date">
                {kind === "tasks" ? "Due date" : "Incident date"}
              </option>
              <option value="title">Title A–Z</option>
              {kind === "tasks" && <option value="priority">Priority</option>}
            </select>
          </label>
        </FilterGroup>
        <button
          className={css.refreshButton}
          aria-label="Refresh records"
          onClick={onRefresh}
          disabled={busy}
        >
          <RefreshCw size={17} className={busy ? css.spinning : undefined} />
        </button>
      </div>
      <div className={css.collectionSubline}>
        {kind === "tasks" && (
          <div
            className={css.localFilters}
            aria-label="Filter records on this page"
          >
            {[
              { id: "all", label: "All", count: items.length },
              { id: "active", label: "Active", count: countActive },
              {
                id: "closed",
                label: "Closed",
                count: items.length - countActive,
              },
            ].map((g) => (
              <button
                type="button"
                key={g.id}
                aria-pressed={group === g.id}
                onClick={() => setGroup(g.id as "all" | "active" | "closed")}
              >
                {g.label}
                <span>{loading ? "—" : g.count}</span>
              </button>
            ))}
          </div>
        )}
        <span className={css.resultCount} role="status">
          {loading
            ? "Loading records…"
            : `${visible.length} of ${items.length} on this page`}
        </span>
      </div>
      {error ??
        (loading ? (
          <CollectionSkeleton />
        ) : !visible.length ? (
          <div className={css.empty}>
            <span className={css.emptyIcon}>
              {kind === "tasks" ? (
                <ClipboardList size={28} />
              ) : (
                <ShieldCheck size={28} />
              )}
            </span>
            <h2>
              {filtered
                ? "No matching records"
                : kind === "tasks"
                  ? "A clear space for your next task"
                  : "No reports or cases here yet"}
            </h2>
            <p>
              {filtered
                ? "Try a different search or page filter."
                : status
                  ? "Try another status to see more records."
                  : kind === "tasks"
                    ? "Tasks assigned to you or your team will appear here."
                    : "Reports and notices you are authorized to view will appear here."}
            </p>
            {filtered && (
              <button
                onClick={() => {
                  setQuery("");
                  setGroup("all");
                  userFilter?.onChange("");
                }}
              >
                Clear page filters
              </button>
            )}
          </div>
        ) : layout === "cards" ? (
          <div className={css.cards}>
            {visible.map((r) => (
              <article
                className={css.recordCard}
                key={r.id}
                data-overdue={isOverdue(r)}
              >
                <div className={css.cardTop}>
                  <StatusBadge
                    status={
                      kind === "incidents"
                        ? (r.workflowStatus ?? r.status)
                        : r.status
                    }
                  />
                  {r.priority && (
                    <span className={css.priority} data-priority={r.priority}>
                      <i aria-hidden="true" />
                      {label(r.priority)}
                    </span>
                  )}
                  {kind === "incidents" && (
                    <ShieldCheck
                      size={16}
                      className={css.privateIcon}
                      aria-label="Confidential"
                    />
                  )}
                </div>
                <h3>
                  <button
                    className={css.cardTitle}
                    aria-label={`Open ${r.title}`}
                    onClick={() => onOpen(r.id)}
                  >
                    {r.title}
                  </button>
                </h3>
                <p className={css.cardDescription}>{r.description}</p>
                {kind === "incidents" && (
                  <small className={css.reference}>
                    {r.referenceNumber}
                    <br />
                    {label(r.reportSource ?? "EMPLOYEE_REPORTED")}
                    {r.caseStatus && <> Case: {label(r.caseStatus)}</>}
                  </small>
                )}
                <div className={css.cardPerson}>
                  <PersonAvatar
                    className={css.avatar}
                    employeeId={
                      r.assignees && r.assignees.length > 1
                        ? null
                        : r.employeeId
                    }
                    name={r.employeeName ?? ""}
                    profilePictureUpdatedAt={r.profilePictureUpdatedAt}
                    size={30}
                    fallback={
                      !r.employeeName ? <Building2 size={15} /> : undefined
                    }
                  />
                  <span>
                    <strong>{r.employeeName ?? "Workplace report"}</strong>
                    <small>{r.branchName}</small>
                  </span>
                </div>
                {kind === "tasks" && (
                  <ProgressBar value={r.progress ?? 0} status={r.status} />
                )}
                <div className={css.cardFooter}>
                  <span data-overdue={isOverdue(r)}>
                    <CalendarDays size={14} />
                    {workDate(r.dueDate ?? r.incidentDate)}
                    {isOverdue(r) && <b>Overdue</b>}
                  </span>
                  <ArrowUpRight size={18} aria-hidden="true" />
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div
            className={css.tableScroll}
            role="region"
            aria-label="Work records table"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th>{kind === "tasks" ? "Task" : "Report / case"}</th>
                  <th>Employee / branch</th>
                  <th>{kind === "tasks" ? "Due date" : "Incident date"}</th>
                  <th>Status</th>
                  {kind === "incidents" && (
                    <>
                      <th>Submitted</th>
                      <th>Last updated</th>
                    </>
                  )}
                  {kind === "tasks" && <th>Progress</th>}
                  <th>
                    <span className={css.srOnly}>Open details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.title}</strong>
                      {kind === "incidents" && (
                        <small className={css.reference}>
                          {r.referenceNumber}
                          <br />
                          {label(r.category ?? "OTHER")}
                        </small>
                      )}
                      {r.priority && (
                        <small
                          className={css.priority}
                          data-priority={r.priority}
                        >
                          {label(r.priority)} priority
                        </small>
                      )}
                    </td>
                    <td>
                      <span className={css.inlineIcon}>
                        {r.employeeId &&
                        (!r.assignees || r.assignees.length <= 1) ? (
                          <PersonAvatar
                            className={css.inlineAvatar}
                            employeeId={r.employeeId}
                            name={r.employeeName ?? ""}
                            profilePictureUpdatedAt={r.profilePictureUpdatedAt}
                            size={24}
                          />
                        ) : (
                          <UserRound size={14} />
                        )}
                        {r.employeeName ?? "Workplace report"}
                      </span>
                      <small>{r.branchName}</small>
                    </td>
                    <td data-overdue={isOverdue(r)}>
                      {workDate(r.dueDate ?? r.incidentDate)}
                      {isOverdue(r) && <small>Overdue</small>}
                    </td>
                    <td>
                      <StatusBadge
                        status={
                          kind === "incidents"
                            ? (r.workflowStatus ?? r.status)
                            : r.status
                        }
                      />
                      {r.caseStatus && (
                        <small>Case: {label(r.caseStatus)}</small>
                      )}
                    </td>
                    {kind === "incidents" && (
                      <>
                        <td>{workTimestamp(r.createdAt)}</td>
                        <td>{workTimestamp(r.updatedAt)}</td>
                      </>
                    )}
                    {kind === "tasks" && (
                      <td>
                        <ProgressBar
                          value={r.progress ?? 0}
                          status={r.status}
                        />
                      </td>
                    )}
                    <td>
                      <button
                        aria-label={`Open ${r.title}`}
                        onClick={() => onOpen(r.id)}
                      >
                        Open
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      {kind === "tasks" && !loading && items.length > 0 && (
        <p className={css.pageHint}>
          <CheckCheck size={14} />
          {serverSearch
            ? "Search covers all authorized reports. Sorting and Active/Closed counts apply to this page."
            : "Search, sort, and Active/Closed counts apply to this page."}
        </p>
      )}
    </>
  );
}

function FilterGroup({
  compact,
  count,
  children,
}: {
  compact: boolean;
  count: number;
  children: ReactNode;
}) {
  if (!compact) return <>{children}</>;
  return (
    <details className={css.incidentFilterGroup}>
      <summary>
        <SlidersHorizontal size={15} aria-hidden="true" />
        Filters{count > 0 && <span>{count}</span>}
      </summary>
      <div className={css.incidentFilterFields}>{children}</div>
    </details>
  );
}
