"use client";
import { PageHeading, PageHeader } from "../components/page-heading";
import { FieldLabel } from "../components/field-label";
import { Suspense, useState, type FormEvent } from "react";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { RealtimeQueryProvider } from "../components/realtime-query-provider";
import { Modal } from "../components/ui/modal";
import { notifySuccess } from "../lib/notifications";
import { randomUuid } from "../lib/random-uuid";
import { useConfirmation } from "../components/ui/confirmation-provider";
import {
  actions,
  actionLabels,
  incidentStatuses,
  incidentCategories,
  request,
  taskStatuses,
  type Context,
  type Detail,
  type Kind,
  type RecordItem,
  type IncidentSummary,
  type TaskTemplate,
} from "./types";
import {
  CalendarDays,
  ClipboardList,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import {
  IncidentControls,
  IncidentFilters,
  IncidentQueueNavigation,
} from "./incident-controls";
import { TaskOverview, type TaskUpdate } from "./task-overview";
import { TaskAssigneePicker } from "./task-assignee-picker";
import { AttachmentPicker } from "./attachment-picker";
import { CollectionSkeleton, RecordCollection } from "./record-collection";
import { IncidentWorkspace } from "./incident-workspace";
import { TaskAutomationOptions } from "./task-automation-options";
import { TaskExportMenu } from "./task-export-menu";
import { IncidentAuthority } from "./incident-authority";
import { IncidentExport } from "./incident-export";
import { RequiredMark } from "../components/required-mark";
import { nextAction } from "./presentation";
import css from "./workspace.module.css";

export default function WorkWorkspace({ kind }: { kind: Kind }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, staleTime: 15000 } },
      }),
  );
  return (
    <RealtimeQueryProvider client={client}>
      <Suspense fallback={<WorkLoading kind={kind} />}>
        <Content kind={kind} />
      </Suspense>
    </RealtimeQueryProvider>
  );
}
export function WorkLoading({ kind }: { kind: Kind }) {
  return (
    <section
      className={css.page}
      aria-busy="true"
      aria-label={`Loading ${kind}`}
    >
      <PageHeader className={css.pageHeading}>
        <div>
          <p className={css.eyebrow}>
            {kind === "tasks" ? "WORK MANAGEMENT" : "CONFIDENTIAL HR RECORDS"}
          </p>
          <PageHeading>{kind === "tasks" ? "Tasks" : "Incidents & Discipline"}</PageHeading>
        </div>
      </PageHeader>
      <span className={css.srOnly} role="status">
        Loading your authorized workspace...
      </span>
      <section className={css.panel}>
        {kind === "incidents" && (
          <div className={css.incidentSummary} aria-hidden="true">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={css.skeletonCard}>
                <div className={css.skeletonLine} />
                <div className={css.skeletonTitle} />
              </div>
            ))}
          </div>
        )}
        <div className={css.skeletonToolbar} aria-hidden="true" />
        <CollectionSkeleton />
      </section>
    </section>
  );
}
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className={css.error} role="alert">
      <p>
        {error instanceof Error
          ? error.message
          : "Unable to load this workspace."}
      </p>
      <button onClick={retry}>Try again</button>
    </div>
  );
}
function Content({ kind }: { kind: Kind }) {
  const search = useSearchParams(),
    recordLink = search.get("record");
  const [seenRecordLink, setSeenRecordLink] = useState(recordLink),
    [selected, setSelected] = useState(recordLink);
  if (seenRecordLink !== recordLink) {
    setSeenRecordLink(recordLink);
    setSelected(recordLink);
  }
  const queueLink = search.get("queue") ?? "reports";
  const [queue, setQueue] = useState(queueLink);
  const [seenQueue, setSeenQueue] = useState(queueLink);
  const [filterSearch, setFilterSearch] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [category, setCategory] = useState("");
  const [taskBranchId, setTaskBranchId] = useState("");
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [creating, setCreating] = useState(search.get("create") === "1"),
    [status, setStatus] = useState(search.get("status") ?? ""),
    [view, setView] = useState(search.get("view") ?? "team"),
    [page, setPage] = useState(1);
  if (seenQueue !== queueLink) {
    setSeenQueue(queueLink);
    setQueue(queueLink);
    setStatus("");
    setPage(1);
  }
  const statusLink = search.get("status") ?? "";
  const [seenStatusLink, setSeenStatusLink] = useState(statusLink);
  if (seenStatusLink !== statusLink) {
    setSeenStatusLink(statusLink);
    setStatus(statusLink);
    setPage(1);
  }
  const context = useQuery({
    queryKey: ["work", kind, "context"],
    queryFn: () => request<Context>(kind, "/context"),
  });
  const allowedTaskBranchId = context.data?.branches.some(
    (item) => item.id === taskBranchId,
  )
    ? taskBranchId
    : "";
  const effectivePage = taskBranchId && !allowedTaskBranchId ? 1 : page;
  const rows = useQuery({
    queryKey: [
      "work",
      kind,
      "list",
      status,
      view,
      effectivePage,
      filterSearch,
      assigneeId,
      allowedTaskBranchId,
      from,
      to,
      queue,
      category,
    ],
    queryFn: () =>
      request<{
        items: RecordItem[];
        hasNext: boolean;
        summary?: IncidentSummary;
      }>(
        kind,
        `?${new URLSearchParams({ ...(status ? { status } : {}), view, page: String(effectivePage), ...(filterSearch ? { search: filterSearch } : {}), ...(allowedTaskBranchId ? { branchId: allowedTaskBranchId } : {}), ...(context.data?.canManage && assigneeId ? (kind === "tasks" ? { assigneeId } : { employeeId: assigneeId }) : {}), ...(kind === "incidents" ? { ...(category ? { category } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}), queue } : {}) })}`,
      ),
    enabled: !!context.data,
  });
  const c = context.data;
  return (
    <div className={css.page} data-module={kind}>
      <PageHeader className={css.pageHeading}>
        <div className={css.headingIdentity}>
          <div>
            <p className={css.eyebrow}>
              {kind === "tasks" ? "WORK MANAGEMENT" : "CONFIDENTIAL HR RECORDS"}
            </p>
            <PageHeading>
              {kind === "tasks"
                ? "Tasks"
                : c && !c.canManage
                  ? "My Incidents"
                  : "Incident Management"}
            </PageHeading>
            <p className={css.pageDescription}>
              {kind === "tasks"
                ? "Clear priorities. Shared progress. Work that moves forward."
                : "A private space to report, review, and resolve workplace concerns."}
            </p>
          </div>
        </div>
        {c && (
          <div className={css.pageActions}>
            {kind === "incidents" && c.canManage && (
              <IncidentExport
                filters={{
                  status,
                  view,
                  search: filterSearch,
                  branchId: allowedTaskBranchId,
                  employeeId: assigneeId,
                  category,
                  from,
                  to,
                  queue,
                }}
              />
            )}
            {kind === "tasks" && (
              <TaskExportMenu
                filters={{
                  status,
                  view,
                  search: filterSearch,
                  branchId: allowedTaskBranchId,
                  assigneeId: c.canManage ? assigneeId : "",
                }}
              />
            )}
            {(kind === "incidents" || c.canManage) && (
              <button className={css.primary} onClick={() => setCreating(true)}>
                <Plus size={18} />
                {kind === "tasks" ? "Create task" : "Report an incident"}
              </button>
            )}
          </div>
        )}
      </PageHeader>
      {context.isError ? (
        <Failure error={context.error} retry={() => void context.refetch()} />
      ) : (
        <section
          className={css.panel}
          aria-busy={context.isPending || rows.isFetching}
        >
          {kind === "incidents" && (
            <IncidentControls
              summary={rows.data?.summary}
              status={status}
              onStatus={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
          )}
          <RecordCollection
            extraFilterCount={
              kind === "incidents"
                ? Number(!!category) +
                  Number(!!from) +
                  Number(!!to) +
                  Number(view === "mine")
                : 0
            }
            extraFilters={
              kind === "incidents" ? (
                <>
                  {c?.canManage && (
                    <label className={css.compactField}>
                      <span>Show records</span>
                      <select
                        value={view}
                        onChange={(e) => {
                          setView(e.target.value);
                          setPage(1);
                        }}
                      >
                        <option value="team">Review inbox</option>
                        <option value="mine">My reports &amp; cases</option>
                      </select>
                    </label>
                  )}
                  <IncidentFilters
                    category={category}
                    onCategory={(value) => {
                      setCategory(value);
                      setPage(1);
                    }}
                    from={from}
                    to={to}
                    onDates={(a, b) => {
                      setFrom(a);
                      setTo(b);
                      setPage(1);
                    }}
                  />
                </>
              ) : undefined
            }
            kind={kind}
            items={rows.data?.items ?? []}
            status={status}
            statuses={
              kind === "tasks"
                ? taskStatuses
                : [...incidentStatuses, "finished"]
            }
            serverSearch={{
              value: filterSearch,
              onChange: (value) => {
                setFilterSearch(value);
                setPage(1);
              },
            }}
            branchFilter={
              c?.canManage
                ? {
                    branches: c.branches,
                    value: allowedTaskBranchId,
                    onChange: (value) => {
                      setTaskBranchId(value);
                      setPage(1);
                    },
                  }
                : undefined
            }
            userFilter={
              c?.canManage
                ? {
                    users: c.employees,
                    value: assigneeId,
                    onChange: (value) => {
                      setAssigneeId(value);
                      setPage(1);
                    },
                  }
                : undefined
            }
            onStatus={(value) => {
              setStatus(value);
              setPage(1);
            }}
            loading={context.isPending || rows.isPending}
            busy={rows.isFetching}
            onRefresh={() => void rows.refetch()}
            onOpen={setSelected}
            error={
              rows.isError ? (
                <Failure error={rows.error} retry={() => void rows.refetch()} />
              ) : undefined
            }
            scopeControls={
              kind === "incidents" ? (
                <IncidentQueueNavigation
                  queue={queue}
                  onQueue={(value) => {
                    setQueue(value);
                    setStatus("");
                    setPage(1);
                  }}
                />
              ) : c?.canManage ? (
                <div
                  className={css.scopeTabs}
                  role="group"
                  aria-label="Record view"
                >
                  {["team", "mine"].map((v) => (
                    <button
                      key={v}
                      aria-pressed={view === v}
                      onClick={() => {
                        setView(v);
                        setPage(1);
                      }}
                    >
                      {v === "team"
                        ? kind === "tasks"
                          ? "Team tasks"
                          : "Review inbox"
                        : kind === "tasks"
                          ? "My tasks"
                          : "My reports & cases"}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={css.collectionTitle}>
                  {kind === "tasks" ? (
                    <ClipboardList size={17} />
                  ) : (
                    <ShieldCheck size={17} />
                  )}
                  <h2>
                    {kind === "tasks" ? "My tasks" : "My reports & cases"}
                  </h2>
                </div>
              )
            }
          />
          <nav className={css.pagination} aria-label="Record pages">
            <span>Page {page}</span>
            <div>
              <button
                disabled={page === 1 || rows.isFetching}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                disabled={!rows.data?.hasNext || rows.isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </nav>
        </section>
      )}
      {creating && c && (
        <Create
          kind={kind}
          context={c}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelected(id);
          }}
        />
      )}
      {kind === "incidents" && c?.canManageAuthority && <IncidentAuthority />}
      {selected && c && (
        <RecordDetail
          key={selected}
          kind={kind}
          id={selected}
          context={c}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
function Create({
  kind,
  context: c,
  onClose,
  onCreated,
}: {
  kind: Kind;
  context: Context;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const cache = useQueryClient();
  const confirm = useConfirmation();
  const [submissionKey] = useState(() => randomUuid());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [branch, setBranch] = useState(
    c.ownEmployee?.branchId ?? c.branches[0]?.id ?? "",
  );
  const [reportScope, setReportScope] = useState("BRANCH");
  const [taskAssignees, setTaskAssignees] = useState<string[]>([]),
    [startDate, setStartDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [templateId, setTemplateId] = useState("");
  const [templateBusy, setTemplateBusy] = useState(false);
  const [recurrence, setRecurrence] = useState<
    "" | "DAILY" | "WEEKLY" | "MONTHLY"
  >("");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const templateBranchId =
    c.employees.find((employee) => employee.id === taskAssignees[0])
      ?.branchId ?? branch;
  const templateBranchName =
    c.branches.find((item) => item.id === templateBranchId)?.name ?? "";
  const templatesQuery = useQuery({
    queryKey: ["work", "tasks", "templates", templateBranchId],
    queryFn: () =>
      request<TaskTemplate[]>(
        "tasks",
        `/templates?${new URLSearchParams({ branchId: templateBranchId })}`,
      ),
    enabled: kind === "tasks" && c.canManage && !!templateBranchId,
  });
  const repeatBlocked =
    new Set(
      taskAssignees
        .map(
          (id) => c.employees.find((employee) => employee.id === id)?.branchId,
        )
        .filter(Boolean),
    ).size > 1;

  function changeTaskAssignees(ids: string[]) {
    const previousBranch = templateBranchId;
    const nextBranch =
      c.employees.find((employee) => employee.id === ids[0])?.branchId ??
      branch;
    setTaskAssignees(ids);
    if (previousBranch !== nextBranch) setTemplateId("");
    const branches = new Set(
      ids
        .map(
          (id) => c.employees.find((employee) => employee.id === id)?.branchId,
        )
        .filter(Boolean),
    );
    if (branches.size > 1) setRecurrence("");
  }

  function useTemplate(id: string) {
    setTemplateId(id);
    const selectedTemplate = templatesQuery.data?.find(
      (item) => item.id === id,
    );
    if (selectedTemplate) {
      setTitle(selectedTemplate.title);
      setDescription(selectedTemplate.description);
      setPriority(selectedTemplate.priority);
    }
  }

  async function saveTemplate(name: string) {
    if (
      kind !== "tasks" ||
      !c.canManage ||
      !templateBranchId ||
      !title.trim() ||
      !description.trim()
    ) {
      setError(
        "Enter a task title and description before saving this template.",
      );
      return false;
    }
    setTemplateBusy(true);
    setError("");
    try {
      const result = await request<{ id: string }>("tasks", "/templates", {
        method: "POST",
        body: JSON.stringify({
          branchId: templateBranchId,
          name,
          title,
          description,
          priority,
        }),
      });
      await cache.invalidateQueries({
        queryKey: ["work", "tasks", "templates", templateBranchId],
      });
      setTemplateId(result.id);
      notifySuccess("Task template saved for this branch.");
      return true;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save template.",
      );
      return false;
    } finally {
      setTemplateBusy(false);
    }
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError("");
    const file = f.get("file");
    const attachment = file instanceof File && file.name ? file : null;
    if (
      attachment &&
      (!attachment.size ||
        attachment.size > 5 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg"].includes(
          attachment.type,
        ))
    ) {
      setError("Choose a PDF, PNG or JPEG up to 5 MB.");
      return;
    }
    if (kind === "tasks" && recurrence) {
      const endDate = String(f.get("recurrenceEndDate") ?? recurrenceEndDate);
      if (
        !(await confirm({
          title: "Create a recurring task series?",
          description: `The first task will be assigned now. The system will create another ${recurrence.toLowerCase()} task through ${endDate}, using the same assignees and branch. The series will pause if the creator loses branch access or an assignee leaves the branch.`,
          confirmLabel: "Create recurring tasks",
        }))
      )
        return;
    }
    setBusy(true);
    const payload = {
      submissionKey,
      title: String(f.get("title")),
      description: String(f.get("description")),
      ...(kind === "tasks"
        ? {
            employeeIds: taskAssignees,
            startDate: String(f.get("startDate")),
            priority: String(f.get("priority")),
            dueDate: String(f.get("dueDate")),
            ...(recurrence
              ? {
                  recurrence,
                  recurrenceEndDate,
                  ...(templateId ? { templateId } : {}),
                }
              : templateId
                ? { templateId }
                : {}),
          }
        : {
            branchId: branch,
            reportScope,
            ...(reportScope === "BRANCH" && f.get("employeeId")
              ? { employeeId: String(f.get("employeeId")) }
              : {}),
            category: String(f.get("category")),
            incidentDate: String(f.get("incidentDate")),
            ...(f.get("incidentTime")
              ? { incidentTime: String(f.get("incidentTime")) }
              : {}),
            ...(!c.canManage ? { reportMode: "SELF" } : {}),
          }),
    };
    let body: FormData | string = JSON.stringify(payload);
    if (attachment) {
      const multipart = new FormData();
      for (const [key, value] of Object.entries(payload))
        multipart.set(
          key,
          Array.isArray(value) ? JSON.stringify(value) : String(value),
        );
      multipart.set("file", attachment);
      body = multipart;
    }
    try {
      const result = await request<{ id: string }>(
        kind,
        kind === "tasks" ? "/task" : "/report",
        { method: "POST", body },
      );
      await cache.invalidateQueries({ queryKey: ["work", kind] });
      notifySuccess(
        kind === "tasks"
          ? recurrence
            ? "Task assigned. Future tasks will be created automatically."
            : "Task assigned."
          : "Incident submitted. Reference: INC-" + result.id.toUpperCase(),
      );
      onCreated(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className={css.workDialog}
      onClose={onClose}
      busy={busy}
      aria-labelledby="create-work-title"
    >
      <div className={css.drawer}>
        <div className={css.drawerChrome}>
          <header className={css.drawerHeader}>
            <div className={css.drawerIdentity}>
              <span className={css.moduleIcon}>
                {kind === "tasks" ? (
                  <ClipboardList size={21} />
                ) : (
                  <ShieldCheck size={21} />
                )}
              </span>
              <div>
                <p className={css.eyebrow}>
                  {kind === "tasks" ? "NEW WORK" : "PRIVATE REPORT"}
                </p>
                <h2 id="create-work-title">
                  {kind === "tasks" ? "Create task" : "Report an incident"}
                </h2>
              </div>
            </div>
            <button
              className={css.closeButton}
              aria-label="Close creation form"
              onClick={onClose}
              disabled={busy}
            >
              <X size={20} />
            </button>
          </header>
        </div>
        <p className={css.formIntro}>
          {kind === "tasks"
            ? "Set a clear outcome, choose one or more assignees, and set the start and due dates."
            : c.canManage
              ? "The concerned employee can see this report and its initial supporting file. Internal reviewer notes stay private."
              : "Describe what happened. Your report will be available to authorized reviewers."}
        </p>
        <form className={`${css.form} ${css.createForm}`} onSubmit={submit}>
          <fieldset className={css.createFields} disabled={busy}>
            {kind === "tasks" ? (
              <>
                <label>
                  <FieldLabel required={true}>Title</FieldLabel>
                  <input
                    name="title"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setTemplateId("");
                    }}
                    required
                    maxLength={160}
                  />
                </label>
                <TaskAssigneePicker
                  employees={c.employees}
                  branches={c.branches}
                  selected={taskAssignees}
                  onChange={changeTaskAssignees}
                />
                <section className={css.taskSchedule}>
                  <div className={css.taskSectionHeading}>
                    <CalendarDays size={18} aria-hidden="true" />
                    <div>
                      <h3>Schedule & priority</h3>
                      <p>Set the dates and urgency for this task.</p>
                    </div>
                  </div>
                  <fieldset className={css.priorityGroup}>
                    <legend>
                      Priority
                      <RequiredMark />
                    </legend>
                    <div className={css.priorityOptions}>
                      {[
                        ["LOW", "Low", "Can wait"],
                        ["NORMAL", "Normal", "Regular work"],
                        ["HIGH", "High", "Needs attention"],
                        ["URGENT", "Urgent", "Act as soon as possible"],
                      ].map(([value, title, description]) => (
                        <label
                          key={value}
                          className={css.priorityChoice}
                          data-priority={value}
                        >
                          <input
                            type="radio"
                            name="priority"
                            value={value}
                            checked={priority === value}
                            onChange={() => {
                              setPriority(value);
                              setTemplateId("");
                            }}
                          />
                          <span>
                            <strong>{title}</strong>
                            <small>{description}</small>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className={css.scheduleDates}>
                    <label>
                      <FieldLabel required={true}>Start date</FieldLabel>
                      <input
                        type="date"
                        name="startDate"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      <FieldLabel required={true}>Due date</FieldLabel>
                      <input
                        type="date"
                        name="dueDate"
                        min={startDate || undefined}
                        required
                      />
                    </label>
                  </div>
                </section>
                <TaskAutomationOptions
                  templates={templatesQuery.data ?? []}
                  loading={templatesQuery.isPending}
                  error={
                    templatesQuery.isError ? templatesQuery.error.message : ""
                  }
                  branchName={templateBranchName}
                  selectedTemplateId={templateId}
                  onTemplateChange={useTemplate}
                  onRetry={() => void templatesQuery.refetch()}
                  onSaveTemplate={saveTemplate}
                  savingTemplate={templateBusy}
                  disabled={busy}
                  recurrence={recurrence}
                  recurrenceEndDate={recurrenceEndDate}
                  startDate={startDate}
                  repeatBlocked={repeatBlocked}
                  onRecurrenceChange={(value) => {
                    setRecurrence(value);
                    if (!value) setRecurrenceEndDate("");
                  }}
                  onEndDateChange={setRecurrenceEndDate}
                />
                <label>
                  <FieldLabel required={true}>
                    Description and expected result
                  </FieldLabel>
                  <textarea
                    name="description"
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      setTemplateId("");
                    }}
                    required
                    maxLength={8000}
                    rows={6}
                  />
                </label>
                <AttachmentPicker
                  disabled={busy}
                  onChange={() => setError("")}
                />
              </>
            ) : (
              <>
                <section className={css.incidentFormSection}>
                  <div className={css.incidentFormHeading}>
                    <span>01</span>
                    <div>
                      <h3>Report details</h3>
                      <p>
                        Give the report a clear title and identify its context.
                      </p>
                    </div>
                  </div>
                  <label>
                    <FieldLabel required={true}>Report title</FieldLabel>
                    <input name="title" required maxLength={160} />
                  </label>
                  <div className={css.incidentFactGrid}>
                    <label>
                      <FieldLabel required={true}>
                        Where did it happen?
                      </FieldLabel>
                      <select
                        required
                        name="reportScope"
                        value={reportScope}
                        onChange={(event) => setReportScope(event.target.value)}
                      >
                        <option value="BRANCH">Branch</option>
                        <option value="GENERAL">General workplace</option>
                      </select>
                    </label>
                    <label>
                      <FieldLabel required={true}>
                        {reportScope === "GENERAL" ? "Review branch" : "Branch"}
                      </FieldLabel>
                      <select
                        required
                        value={branch}
                        onChange={(event) => setBranch(event.target.value)}
                      >
                        {c.branches.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {c.canManage && reportScope === "BRANCH" ? (
                      <label>
                        Concerned employee
                        <select name="employeeId" key={branch}>
                          <option value="">General workplace report</option>
                          {c.employees
                            .filter((employee) => employee.branchId === branch)
                            .map((employee) => (
                              <option key={employee.id} value={employee.id}>
                                {employee.name}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <div className={css.incidentIdentityCard}>
                        <strong>
                          {reportScope === "GENERAL"
                            ? "General workplace report"
                            : (c.ownEmployee?.name ??
                              "Employee account not linked")}
                        </strong>
                        <span>
                          {c.branches.find((item) => item.id === branch)
                            ?.name ?? ""}
                        </span>
                        <small>
                          {c.canManage
                            ? "The report will not be linked to a specific employee."
                            : "Your identity is recorded as the reporter. This report is not linked to a specific employee."}
                        </small>
                      </div>
                    )}
                    <label className={css.incidentCategoryField}>
                      <FieldLabel required={true}>Category</FieldLabel>
                      <select name="category" defaultValue="" required>
                        <option value="" disabled>
                          Select a violation category
                        </option>
                        {incidentCategories.map(({ value, title, example }) => (
                          <option key={value} value={value} title={example}>
                            {title} — {example}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <FieldLabel required={true}>Incident date</FieldLabel>
                      <input type="date" name="incidentDate" required />
                    </label>
                    <label>
                      Incident time <input type="time" name="incidentTime" />
                    </label>
                  </div>
                </section>
                <section className={css.incidentFormSection}>
                  <div className={css.incidentFormHeading}>
                    <span>02</span>
                    <div>
                      <h3>What happened?</h3>
                      <p>Describe what happened as clearly as possible.</p>
                    </div>
                  </div>
                  <label>
                    <FieldLabel required={true}>Factual description</FieldLabel>
                    <textarea
                      name="description"
                      required
                      maxLength={8000}
                      rows={6}
                      placeholder="Describe what happened, including relevant details and people involved."
                    />
                  </label>
                </section>
                <section className={css.incidentFormSection}>
                  <div className={css.incidentFormHeading}>
                    <span>03</span>
                    <div>
                      <h3>Supporting evidence</h3>
                      <p>Attach relevant files to the private report.</p>
                    </div>
                  </div>
                  <AttachmentPicker
                    disabled={busy}
                    onChange={() => setError("")}
                  />
                </section>
              </>
            )}
            {error && (
              <p className={css.error} role="alert">
                {error}
              </p>
            )}
            <button
              className={css.primary}
              disabled={
                busy ||
                !c.branches.length ||
                (kind === "tasks" &&
                  (!taskAssignees.length || taskAssignees.length > 50))
              }
            >
              {busy
                ? "Saving..."
                : kind === "tasks"
                  ? "Assign task"
                  : "Submit report"}
            </button>
          </fieldset>
        </form>
      </div>
    </Modal>
  );
}
function RecordDetail({
  kind,
  id,
  context: c,
  onClose,
}: {
  kind: Kind;
  id: string;
  context: Context;
  onClose: () => void;
}) {
  const confirm = useConfirmation();
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["work", kind, id],
    queryFn: () => request<Detail>(kind, `/${id}`),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [action, setAction] = useState(""),
    [audience, setAudience] = useState("INTERNAL");
  const [progressValue, setProgressValue] = useState<string | null>(null);
  const d = query.data;
  const available = d ? actions(kind, d) : [];
  const currentAction = available.includes(action)
    ? action
    : ((d ? nextAction(kind, d) : undefined) ?? available[0] ?? "");
  async function refresh() {
    await cache.invalidateQueries({ queryKey: ["work", kind] });
  }
  async function deleteTask() {
    if (kind !== "tasks" || !d?.canDelete) return;
    if (
      !(await confirm({
        title: "Delete this task?",
        description:
          "The task will be removed from active lists. Its audit and activity history will be retained.",
        confirmLabel: "Delete task",
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(kind, `/${id}`, { method: "DELETE" });
      await refresh();
      notifySuccess("Task deleted.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to delete this task.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!d) return;
    const form = e.currentTarget;
    const f = new FormData(form);
    const selectedFile = f.get("file");
    const file =
      selectedFile instanceof File && selectedFile.name
        ? selectedFile
        : undefined;
    if (
      file &&
      (!file.size ||
        file.size > 5 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg"].includes(file.type))
    ) {
      setError("Choose a PDF, PNG or JPEG up to 5 MB.");
      return;
    }
    if (
      [
        "CANCEL",
        "CLOSE",
        "RESOLVE",
        "ESCALATE",
        "DECIDE",
        "NOTICE",
        "WITHDRAW",
        "DISMISS",
      ].includes(currentAction) &&
      !(await confirm({
        title: actionLabels[currentAction],
        description:
          currentAction === "NOTICE"
            ? "The notice will be shared privately with the concerned employee. Verify its content before issuing it."
            : "This action is recorded in permanent history. Closed records cannot be edited or reopened in this version.",
        confirmLabel: actionLabels[currentAction],
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const payload = {
        version: d.version,
        action: currentAction,
        message: String(f.get("message")),
        ...(["RESOLVE", "DECIDE"].includes(currentAction)
          ? {
              findings: String(f.get("findings")),
              outcome: String(f.get("outcome")),
              disciplinaryAction: String(f.get("disciplinaryAction")),
              ...(f.get("actionDetails")
                ? { actionDetails: String(f.get("actionDetails")) }
                : {}),
            }
          : {}),
        ...(currentAction === "PROGRESS"
          ? { progress: Number(f.get("progress")) }
          : {}),
        ...(["ASSIGN_REVIEWER", "HR_ESCALATE"].includes(currentAction)
          ? { reviewerId: String(f.get("reviewerId")) }
          : {}),
        ...(currentAction === "SET_SUBJECT"
          ? { employeeId: String(f.get("employeeId")) }
          : {}),
        ...(d.canManage && currentAction === "COMMENT" ? { audience } : {}),
      };
      let body: FormData | string = JSON.stringify(payload);
      if (file) {
        const multipart = new FormData();
        for (const [key, value] of Object.entries(payload))
          multipart.set(key, String(value));
        multipart.set("file", file);
        body = multipart;
      }
      await request(kind, `/${id}/actions`, { method: "POST", body });
      form.reset();
      setProgressValue(null);
      await refresh();
      requestAnimationFrame(() => {
        const history = document.getElementById("incident-history-title");
        const disclosure = history?.closest("details");
        if (disclosure) disclosure.open = true;
        history?.scrollIntoView({ behavior: "auto", block: "center" });
      });
      notifySuccess("Update saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function saveTask(update: TaskUpdate, file?: File): Promise<boolean> {
    if (!d) return false;
    if (
      file &&
      (!file.size ||
        file.size > 5 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg"].includes(file.type))
    ) {
      setError("Choose a PDF, PNG or JPEG up to 5 MB.");
      return false;
    }
    if (
      ["ACCEPT", "CHANGES", "CANCEL"].includes(update.action) &&
      !(await confirm({
        title: actionLabels[update.action],
        description: "This review is recorded in task history.",
        confirmLabel: actionLabels[update.action],
        tone: update.action === "CANCEL" ? "danger" : "default",
      }))
    )
      return false;
    setBusy(true);
    setError("");
    try {
      const payload = { version: d.version, ...update };
      let body: FormData | string = JSON.stringify(payload);
      if (file) {
        const form = new FormData();
        for (const [key, value] of Object.entries(payload))
          form.set(key, String(value));
        form.set("file", file);
        body = form;
      }
      await request(kind, `/${id}/actions`, { method: "POST", body });
      await refresh();
      notifySuccess("Task update saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save task update.");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reassignTask(employeeIds: string[]): Promise<boolean> {
    if (kind !== "tasks" || !d?.canReassign || !employeeIds.length)
      return false;
    const previousIds = d.assignees?.length
      ? d.assignees.map((assignee) => assignee.id)
      : d.employeeId
        ? [d.employeeId]
        : [];
    const added = employeeIds.filter(
      (employeeId) => !previousIds.includes(employeeId),
    );
    const removed = previousIds.filter(
      (employeeId) => !employeeIds.includes(employeeId),
    );
    const employeeName = (employeeId: string) =>
      c.employees.find((employee) => employee.id === employeeId)?.name ??
      "an unavailable employee";
    if (
      !(await confirm({
        title: "Reassign this task?",
        description: `${added.length ? `New assignees: ${added.map(employeeName).join(", ")}. ` : "No new assignees. "}${removed.length ? `Removed: ${removed.map(employeeName).join(", ")}. ` : ""}New employees become task participants. Their linked active accounts gain task and history access and receive an in-app update; eligible email accounts also receive an assignment email. Removed assignees lose access. Status and progress stay unchanged.`,
        confirmLabel: "Save assignees",
      }))
    )
      return false;
    setBusy(true);
    setError("");
    try {
      await request(kind, `/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          version: d.version,
          action: "REASSIGN",
          employeeIds,
        }),
      });
      await refresh();
      notifySuccess("Task assignees updated.");
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to reassign this task.",
      );
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function stopRecurrence() {
    if (kind !== "tasks" || !d?.canStopRecurrence || busy) return;
    if (
      !(await confirm({
        title: "Stop future tasks?",
        description:
          "The current task and its history will remain. The system will not create any more tasks in this recurring series.",
        confirmLabel: "Stop future tasks",
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      await request(kind, `/${id}/stop-series`, {
        method: "POST",
        body: JSON.stringify({ version: d.version }),
      });
      await refresh();
      notifySuccess("Future recurring tasks stopped.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to stop this series.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      className={css.workDialog}
      onClose={onClose}
      busy={busy}
      aria-labelledby="record-work-title"
    >
      <div className={css.drawer}>
        <div className={css.drawerChrome}>
          <header className={css.drawerHeader}>
            <div className={css.drawerIdentity}>
              <span className={css.moduleIcon}>
                {kind === "tasks" ? (
                  <ClipboardList size={21} />
                ) : (
                  <ShieldCheck size={21} />
                )}
              </span>
              <div>
                <p className={css.eyebrow}>
                  {kind === "tasks" ? "TASK DETAILS" : "INCIDENT DETAILS"}
                </p>
                <h2 id="record-work-title">{d?.title ?? "Record details"}</h2>
              </div>
            </div>
            <div className={css.drawerHeaderActions}>
              {kind === "tasks" && d?.canDelete && (
                <button
                  className={css.deleteButton}
                  aria-label="Delete task"
                  disabled={busy}
                  onClick={() => void deleteTask()}
                >
                  <Trash2 size={17} />
                  <span>Delete</span>
                </button>
              )}
              <button
                className={css.closeButton}
                aria-label="Close record details"
                disabled={busy}
                onClick={onClose}
              >
                <X size={20} />
              </button>
            </div>
          </header>
        </div>
        <div className={css.drawerBody}>
          {query.isPending ? (
            <div aria-busy="true">
              <p role="status">Loading private record...</p>
              <div className={css.skeletonCard} />
            </div>
          ) : query.isError ? (
            <Failure error={query.error} retry={() => void query.refetch()} />
          ) : (
            d && (
              <>
                {error && (
                  <p role="alert" className={css.error}>
                    {error}
                  </p>
                )}
                {kind === "tasks" ? (
                  <TaskOverview
                    detail={d}
                    busy={busy}
                    onSave={saveTask}
                    employees={c.employees}
                    branches={c.branches}
                    onReassign={reassignTask}
                    onStopRecurrence={stopRecurrence}
                  />
                ) : (
                  <IncidentWorkspace
                    detail={d}
                    available={available}
                    currentAction={currentAction}
                    employees={c.employees}
                    branches={c.branches}
                    reviewers={c.reviewers}
                    audience={audience}
                    busy={busy}
                    progress={progressValue}
                    onAction={setAction}
                    onAudience={setAudience}
                    onProgress={setProgressValue}
                    onSubmit={submit}
                  />
                )}
              </>
            )
          )}
        </div>
      </div>
    </Modal>
  );
}
