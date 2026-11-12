"use client";
import {
  loadWorkspaceBranchAccess,
} from "../lib/branch-access";
import { PageHeading, PageHeader } from "../components/page-heading";
import { FieldLabel } from "../components/field-label";
import { RealtimeQueryProvider } from "../components/realtime-query-provider";

import {
  QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { OfficialBusinessWorkspace } from "./official-business/workspace";
import {
  RefreshCw,
  CalendarClock,
  Clock3,
  CalendarDays,
  ListChecks,
  History,
  Building2,
} from "lucide-react";
import theme from "../components/ui/workspace-theme.module.css";
import {
  AttendanceSectionNav,
  type AttendanceNavItem,
} from "./attendance-section-nav";
import { AttendanceLoading } from "../components/page-loading";
import { IconActionButton } from "../components/icon-action-button";
import {
  paginateTableRows,
  TablePagination,
} from "../components/table-pagination";
import { notifyError, notifySuccess } from "../lib/notifications";
import { RequiredMark } from "../components/required-mark";
import styles from "./workspace.module.css";
import {
  parseAttendanceSchedule,
  type AttendanceSchedule,
} from "./attendance-schedule";
import { WeeklyWorkRoster } from "./weekly-work-roster";
import { MyWorkSchedule } from "./my-work-schedule";
import { DtrWorkspace } from "./dtr-workspace";

type Session = {
  userId: string;
  email: string;
  role:
    | "SUPER_ADMIN"
    | "HR_ADMIN"
    | "BRANCH_MANAGER"
    | "IT_ADMIN"
    | "STAFF"
    | "EMPLOYEE";
  branchId: string | null;
  branchIds?: string[];
  allBranches?: boolean;
};

type Branch = { id: string; name: string; status: "ACTIVE" | "INACTIVE" };
type AttendanceRecord = {
  dtrCalculation?: { version: string };
  id: string;
  employeeId: string;
  employeeName: string;
  branchId: string;
  branchName: string | null;
  workDate: string;
  timeIn: string | null;
  timeOut: string | null;
  source: "MANUAL" | "BIOMETRIC" | "IMPORT" | "API" | "LEAVE";
  status: string;
  totalMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  lateMinutes: number;
  undertimeMinutes: number;
  originalTimeIn: string | null;
  originalTimeOut: string | null;
  overtimeApprovalStatus: "PENDING" | "APPROVED" | "REJECTED" | null;
  overtimeApprovalMinutes: number | null;
};
type AttendanceSectionId =
  | "overview"
  | "my-work-schedule"
  | "official-business"
  | "branch-schedule"
  | "weekly-roster"
  | "dtr"
  | "history";
type AttendanceCorrection = {
  id: string;
  changeType: "CORRECTION" | "MANUAL_ADJUSTMENT";
  reason: string;
  timeInBefore: string | null;
  timeOutBefore: string | null;
  timeInAfter: string | null;
  timeOutAfter: string | null;
  createdAt: string;
  createdByName: string;
};

type ScheduleForm = {
  timeZone: string;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: string;
  graceMinutes: string;
  defaultLocation: string;
};

const DEFAULT_ATTENDANCE_TIME_ZONE = "Asia/Manila";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & T;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(". ")
      : payload.message;
    throw new Error(
      message ?? "The attendance request could not be completed.",
    );
  }
  return payload;
}

function currentLocalDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateOffset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatTime(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
}

function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function AttendanceContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [activeSection, setActiveSection] = useState<AttendanceSectionId>(
    () => {
      const section = searchParams.get("section");
      return [
        "overview",
        "official-business",
        "my-work-schedule",
        "dtr",
        "weekly-roster",
        "branch-schedule",
        "history",
      ].includes(section ?? "")
        ? (section as AttendanceSectionId)
        : "overview";
    },
  );
  const [from, setFrom] = useState(dateOffset(-30));
  const [to, setTo] = useState(currentLocalDate());
  const [attendancePageNumber, setAttendancePageNumber] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [correctionId, setCorrectionId] = useState<string | null>(null);
  const [overtimeApprovalId, setOvertimeApprovalId] = useState<string | null>(
    null,
  );
  const [overtimeReason, setOvertimeReason] = useState("");
  const [scheduleDrafts, setScheduleDrafts] = useState<
    Record<string, ScheduleForm>
  >({});
  const sessionQuery = useQuery({
    queryKey: ["attendance-session"],
    queryFn: () => request<Session>("/api/auth/me"),
  });
  const session = sessionQuery.data;
  const canManage =
    session?.role === "SUPER_ADMIN" ||
    session?.role === "HR_ADMIN" ||
    session?.role === "BRANCH_MANAGER";
  const isOwnClockRole =
    session?.role === "STAFF" ||
    session?.role === "EMPLOYEE" ||
    session?.role === "HR_ADMIN" ||
    session?.role === "BRANCH_MANAGER";
  // Available choices come from saved authorization, independently of the
  // current collection filter stored in the session.
  const branchesQuery = useQuery({
    queryKey: ["attendance-branch-access", session?.userId],
    queryFn: loadWorkspaceBranchAccess,
    enabled: Boolean(canManage),
  });
  const availableBranches = branchesQuery.data?.branches ?? [];
  const canChooseBranch = Boolean(
    canManage && branchesQuery.data?.canSwitch && availableBranches.length > 1,
  );
  const branchId =
    selectedBranch || session?.branchId || availableBranches[0]?.id || "";
  const assignedBranchId = session?.branchId;
  const assignedBranchQuery = useQuery({
    queryKey: ["attendance-assigned-branch", assignedBranchId],
    queryFn: async () => {
      if (!assignedBranchId) return null;
      const result = await request<{ data: Branch }>(
        `/api/branches/${encodeURIComponent(assignedBranchId)}`,
      );
      return result.data;
    },
    enabled: Boolean(canManage && assignedBranchId),
  });
  const selectedBranchDetails =
    availableBranches.find((branch) => branch.id === branchId) ??
    assignedBranchQuery.data;
  function changeAttendanceBranch(value: string) {
    if (value === branchId) return;
    setSelectedBranch(value);
    setEmployeeFilter("");
    setAttendancePageNumber(1);
  }
  const attendanceQuery = useQuery({
    queryKey: ["attendance-records", from, to, branchId],
    queryFn: async () => {
      const params = new URLSearchParams({ from, to });
      if (canManage && branchId) params.set("branchId", branchId);
      return request<AttendanceRecord[]>(`/api/attendance?${params}`);
    },
    enabled: Boolean(session),
  });
  const ownAttendanceQuery = useQuery({
    queryKey: ["attendance-mine", from, to],
    queryFn: () => {
      const params = new URLSearchParams({ from, to });
      return request<AttendanceRecord[]>(`/api/attendance/me?${params}`);
    },
    enabled: Boolean(session && isOwnClockRole),
  });
  const scheduleQuery = useQuery({
    queryKey: ["attendance-schedule", branchId],
    queryFn: async () => {
      const response = await fetch(
        `/api/attendance/schedules/${encodeURIComponent(branchId)}`,
        {
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      const body = await response.text();
      if (!response.ok) {
        let message: string | undefined;
        try {
          const payload = JSON.parse(body) as {
            message?: string | string[];
          };
          message = Array.isArray(payload.message)
            ? payload.message.join(". ")
            : payload.message;
        } catch {
          message = undefined;
        }
        throw new Error(
          message ?? "The attendance schedule could not be loaded.",
        );
      }
      return parseAttendanceSchedule(body);
    },
    enabled: Boolean(branchId),
  });
  const correctionHistoryQuery = useQuery({
    queryKey: ["attendance-corrections", correctionId],
    queryFn: () =>
      request<AttendanceCorrection[]>(
        `/api/attendance/${correctionId}/corrections`,
      ),
    enabled: Boolean(correctionId),
  });

  const scheduleDraft = scheduleDrafts[branchId];
  const scheduleForm = {
    ...(scheduleDraft ??
      (scheduleQuery.data
        ? {
            timeZone:
              scheduleQuery.data.timeZone || DEFAULT_ATTENDANCE_TIME_ZONE,
            workDays: scheduleQuery.data.workDays,
            shiftStart: scheduleQuery.data.shiftStart,
            shiftEnd: scheduleQuery.data.shiftEnd,
            breakMinutes: String(scheduleQuery.data.breakMinutes),
            graceMinutes: String(scheduleQuery.data.graceMinutes),
            defaultLocation:
              scheduleQuery.data.defaultLocation?.trim() ||
              selectedBranchDetails?.name ||
              "",
          }
        : {
            timeZone: DEFAULT_ATTENDANCE_TIME_ZONE,
            workDays: [],
            shiftStart: "",
            shiftEnd: "",
            breakMinutes: "",
            graceMinutes: "",
            defaultLocation: "",
          })),
    defaultLocation:
      scheduleDraft?.defaultLocation.trim() ||
      scheduleQuery.data?.defaultLocation?.trim() ||
      selectedBranchDetails?.name ||
      "",
  };

  function updateScheduleDraft(update: Partial<ScheduleForm>) {
    setScheduleDrafts((previous) => ({
      ...previous,
      [branchId]: { ...scheduleForm, ...update },
    }));
  }

  const clockMutation = useMutation({
    mutationFn: (action: "clock-in" | "clock-out") =>
      request<AttendanceRecord>(`/api/attendance/${action}`, {
        method: "POST",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      notifySuccess("Attendance was recorded.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const scheduleMutation = useMutation({
    mutationFn: (values: Omit<AttendanceSchedule, "branchId">) =>
      request<AttendanceSchedule>(
        `/api/attendance/schedules/${encodeURIComponent(branchId)}`,
        { method: "PUT", body: JSON.stringify(values) },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["attendance-schedule", branchId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["attendance-work-roster", branchId],
      });
      notifySuccess("Attendance schedule saved.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const correctionMutation = useMutation({
    mutationFn: (values: {
      id: string;
      timeIn?: string;
      timeOut?: string;
      reason: string;
      changeType: "CORRECTION" | "MANUAL_ADJUSTMENT";
    }) =>
      request<AttendanceRecord>(`/api/attendance/${values.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...(values.timeIn
            ? { timeIn: new Date(values.timeIn).toISOString() }
            : {}),
          ...(values.timeOut
            ? { timeOut: new Date(values.timeOut).toISOString() }
            : {}),
          reason: values.reason,
          changeType: values.changeType,
        }),
      }),
    onSuccess: async () => {
      setCorrectionId(null);
      await queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      await queryClient.invalidateQueries({
        queryKey: ["attendance-corrections"],
      });
      notifySuccess("Attendance correction saved.");
    },
    onError: (error: Error) => notifyError(error.message),
  });
  const overtimeApprovalMutation = useMutation({
    mutationFn: (values: { id: string; decision: "APPROVE" | "REJECT" }) =>
      request<AttendanceRecord>(
        `/api/attendance/${values.id}/overtime-approval`,
        {
          method: "POST",
          body: JSON.stringify({
            decision: values.decision,
            reason: overtimeReason,
          }),
        },
      ),
    onSuccess: async () => {
      setOvertimeApprovalId(null);
      setOvertimeReason("");
      await queryClient.invalidateQueries({ queryKey: ["attendance-records"] });
      notifySuccess(
        "Overtime decision was recorded separately from the attendance log.",
      );
    },
    onError: (error: Error) => notifyError(error.message),
  });

  const records = attendanceQuery.data ?? [];
  const displayedRecords = records.filter(
    (record) => !employeeFilter || record.employeeId === employeeFilter,
  );
  const attendancePage = paginateTableRows(
    displayedRecords,
    attendancePageNumber,
  );
  const today = currentLocalDate();
  const todayRecord = (ownAttendanceQuery.data ?? []).find(
    (record) => record.workDate === today,
  );
  const totalLate = displayedRecords.reduce(
    (sum, record) => sum + record.lateMinutes,
    0,
  );
  const totalOvertime = displayedRecords.reduce(
    (sum, record) => sum + record.overtimeMinutes,
    0,
  );
  const completedDays = displayedRecords.filter(
    (record) => record.timeOut,
  ).length;
  const isScheduleAdmin =
    session?.role === "SUPER_ADMIN" ||
    session?.role === "HR_ADMIN" ||
    session?.role === "BRANCH_MANAGER";
  const attendanceSections: ReadonlyArray<
    AttendanceNavItem<AttendanceSectionId>
  > = [
    {
      id: "overview",
      label: "Overview",
      description: "Today & working time",
      icon: Clock3,
    },
    {
      id: "official-business",
      label: "Official Business",
      description: "File & review off-site work",
      icon: Building2,
    },
    ...(isOwnClockRole
      ? ([
          {
            id: "my-work-schedule",
            label: "My work schedule",
            description: "Your shifts & workdays",
            icon: CalendarClock,
          },
        ] as const)
      : []),
    ...(session?.role !== "IT_ADMIN"
      ? ([
          {
            id: "dtr",
            label: "Attendance & DTR",
            description: "Import, review & export",
            icon: ListChecks,
          },
        ] as const)
      : []),
    ...(isScheduleAdmin
      ? ([
          {
            id: "weekly-roster",
            label: "Weekly roster",
            description: "Employee schedules",
            icon: CalendarDays,
          },
          {
            id: "branch-schedule",
            label: "Branch schedule",
            description: "Defaults & workdays",
            icon: CalendarClock,
          },
        ] as const)
      : []),
    {
      id: "history",
      label: "History",
      description: "Records & corrections",
      icon: History,
    },
  ] as const;
  const currentSection = attendanceSections.some(
    (section) => section.id === activeSection,
  )
    ? activeSection
    : "overview";
  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    scheduleMutation.mutate({
      timeZone: scheduleForm.timeZone.trim(),
      workDays: scheduleForm.workDays,
      shiftStart: scheduleForm.shiftStart,
      shiftEnd: scheduleForm.shiftEnd,
      breakMinutes: Number(scheduleForm.breakMinutes),
      graceMinutes: Number(scheduleForm.graceMinutes),
      defaultLocation: scheduleForm.defaultLocation.trim() || null,
    });
  }

  function submitCorrection(
    event: FormEvent<HTMLFormElement>,
    record: AttendanceRecord,
  ) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const timeIn = String(values.get("timeIn") ?? "");
    const timeOut = String(values.get("timeOut") ?? "");
    correctionMutation.mutate({
      id: record.id,
      timeIn: timeIn || undefined,
      timeOut: timeOut || undefined,
      reason: String(values.get("reason") ?? ""),
      changeType: String(values.get("changeType") ?? "CORRECTION") as
        "CORRECTION" | "MANUAL_ADJUSTMENT",
    });
  }

  if (sessionQuery.isLoading) {
    return <AttendanceLoading />;
  }
  if (sessionQuery.isError || !session) {
    return (
      <p className={styles.error} role="alert">
        {sessionQuery.error instanceof Error
          ? sessionQuery.error.message
          : "Unable to verify your attendance access."}
      </p>
    );
  }

  return (
    <div className={`${theme.scope} ${styles.page}`}>
      <PageHeader className={styles.header}>
        <div>
          <p className={styles.eyebrow}>WORKFORCE / TIME & ATTENDANCE</p>
          <PageHeading>Attendance &amp; timekeeping</PageHeading>
          <p className={styles.description}>
            A clear view of your people, schedules and recorded working time.
          </p>
        </div>
        <div className={styles.headerActions}>
          {selectedBranchDetails && !canChooseBranch && (
            <span className={styles.branchContext}>
              <Building2 size={15} aria-hidden="true" />
              {selectedBranchDetails.name}
            </span>
          )}
          {canChooseBranch && (
            <label className={styles.branchPicker}>
              Branch
              <select
                onChange={(event) =>
                  void changeAttendanceBranch(event.target.value)
                }
                value={branchId}
              >
                {availableBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </PageHeader>

      {branchesQuery.isError && (
        <p className={styles.error} role="alert">
          {branchesQuery.error instanceof Error
            ? branchesQuery.error.message
            : "Unable to load branch options."}
        </p>
      )}

      <div className={styles.sectionSwitcherLayout}>
        <AttendanceSectionNav
          items={attendanceSections}
          activeId={currentSection}
          onChange={setActiveSection}
        />
        <div
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`attendance-section-content-tab-${currentSection}`}
          className={styles.sectionSwitcherContent}
          id="attendance-section-content"
        >
          {currentSection === "my-work-schedule" && session && (
            <MyWorkSchedule role={session.role} />
          )}
          {currentSection === "official-business" && (
            <OfficialBusinessWorkspace
              branchId={branchId}
              initialId={searchParams.get("obId")}
            />
          )}
          {session?.role !== "IT_ADMIN" && (
            <div hidden={currentSection !== "dtr"}>
              <DtrWorkspace
                key={branchId}
                branchId={branchId}
                canManage={canManage}
                active={currentSection === "dtr"}
                initialFrom={from}
                initialTo={to}
              />
            </div>
          )}
          <div hidden={currentSection !== "overview"}>
            <section
              className={styles.todayPanel}
              aria-labelledby="today-heading"
            >
              <div className={styles.todayCopy}>
                <p className={styles.eyebrow}>TODAY · {today}</p>
                <h2 id="today-heading">
                  {todayRecord?.timeOut
                    ? "Your shift is complete"
                    : todayRecord?.timeIn
                      ? "You are currently clocked in"
                      : "Ready to start your shift?"}
                </h2>
                <p>
                  {todayRecord?.timeIn
                    ? `Clocked in at ${formatTime(todayRecord.timeIn)}${todayRecord.timeOut ? ` · Clocked out at ${formatTime(todayRecord.timeOut)}` : ""}`
                    : scheduleQuery.data
                      ? `Schedule: ${scheduleQuery.data.shiftStart}–${scheduleQuery.data.shiftEnd} (${scheduleQuery.data.timeZone})`
                      : "Attendance actions are unavailable until an authorized manager configures your branch schedule."}
                </p>
              </div>
              {isOwnClockRole && (
                <div className={styles.clockActions}>
                  <button
                    className={styles.primaryButton}
                    disabled={
                      clockMutation.isPending ||
                      Boolean(todayRecord?.timeIn) ||
                      !scheduleQuery.data
                    }
                    onClick={() => clockMutation.mutate("clock-in")}
                    type="button"
                  >
                    {clockMutation.isPending ? "Saving…" : "Clock in"}
                  </button>
                  <button
                    className={styles.secondaryButton}
                    disabled={
                      clockMutation.isPending ||
                      !todayRecord?.timeIn ||
                      Boolean(todayRecord.timeOut)
                    }
                    onClick={() => clockMutation.mutate("clock-out")}
                    type="button"
                  >
                    Clock out
                  </button>
                </div>
              )}
            </section>
            {canManage && (
              <div
                className={styles.dateFilters}
                aria-label="Branch attendance summary period"
              >
                <label>
                  From
                  <input
                    type="date"
                    value={from}
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setAttendancePageNumber(1);
                    }}
                  />
                </label>
                <label>
                  To
                  <input
                    type="date"
                    value={to}
                    onChange={(event) => {
                      setTo(event.target.value);
                      setAttendancePageNumber(1);
                    }}
                  />
                </label>
                <span className={styles.subtle}>
                  Select up to 31 days. Counts are employee-days unless labeled
                  employees or minutes.
                </span>
              </div>
            )}
            {canManage && branchId && (
              <>
                {attendanceQuery.isLoading && (
                  <p className={styles.notice} role="status">
                    Loading branch attendance records...
                  </p>
                )}
                {attendanceQuery.isError && (
                  <p className={styles.error} role="alert">
                    {attendanceQuery.error.message}
                  </p>
                )}
                {!attendanceQuery.isLoading && !attendanceQuery.isError && (
                  <section
                    aria-label="Branch attendance summary"
                    className={styles.metrics}
                  >
                    {(
                      [
                        [
                          "Employees with entries",
                          new Set(
                            displayedRecords.map((record) => record.employeeId),
                          ).size,
                          "Employees with a saved attendance record",
                        ],
                        [
                          "Attendance records",
                          displayedRecords.filter(
                            (record) => record.source !== "LEAVE",
                          ).length,
                          "Saved records in the selected period",
                        ],
                        [
                          "Completed shifts",
                          completedDays,
                          "Attendance records with a clock-out time",
                        ],
                        [
                          "Late minutes",
                          totalLate,
                          "Calculated from each saved record",
                        ],
                        [
                          "Overtime minutes",
                          totalOvertime,
                          "Recorded overtime before any separate decision",
                        ],
                        [
                          "Pending OT reviews",
                          displayedRecords.filter(
                            (record) =>
                              record.overtimeApprovalStatus === "PENDING",
                          ).length,
                          "Overtime decisions still pending",
                        ],
                      ] as const
                    ).map(([label, value, description]) => (
                      <article className={styles.metric} key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                        <small>{description}</small>
                      </article>
                    ))}
                  </section>
                )}
              </>
            )}
            {!canManage && (
              <section
                aria-label="Attendance summary"
                className={styles.metrics}
              >
                <article className={styles.metric}>
                  <span>Recorded days</span>
                  <strong>{records.length}</strong>
                  <small>{completedDays} complete shifts</small>
                </article>
                <article className={styles.metric}>
                  <span>Late time</span>
                  <strong>{duration(totalLate)}</strong>
                  <small>Calculated from configured grace period</small>
                </article>
                <article className={styles.metric}>
                  <span>Overtime</span>
                  <strong>{duration(totalOvertime)}</strong>
                  <small>Above scheduled working time</small>
                </article>
                <article className={styles.metric}>
                  <span>Schedule</span>
                  <strong>
                    {scheduleQuery.data ? "Configured" : "Not set"}
                  </strong>
                  <small>
                    {scheduleQuery.data?.timeZone ?? "Waiting for branch setup"}
                  </small>
                </article>
              </section>
            )}
          </div>

          {isScheduleAdmin && (
            <section
              aria-labelledby="schedule-heading"
              className={styles.panel}
              hidden={currentSection !== "branch-schedule"}
            >
              <div className={styles.sectionHeader}>
                <h2 id="schedule-heading">Branch default schedule</h2>
                <span className={styles.subtle}>
                  {scheduleQuery.data
                    ? "Default shift times and location fill the weekly roster; adjust individual days only when needed."
                    : "Set the branch’s default times and location before setting employee schedules."}
                </span>
              </div>
              {!branchId && (
                <p className={styles.notice}>
                  Select an active branch to configure its schedule.
                </p>
              )}
              {scheduleQuery.isError && (
                <p className={styles.error} role="alert">
                  {scheduleQuery.error instanceof Error
                    ? scheduleQuery.error.message
                    : "Unable to load the branch schedule."}
                </p>
              )}
              <form className={styles.scheduleForm} onSubmit={saveSchedule}>
                <label>
                  <span>
                    Default time in <RequiredMark />
                  </span>
                  <input
                    onChange={(event) =>
                      updateScheduleDraft({ shiftStart: event.target.value })
                    }
                    required
                    type="time"
                    value={scheduleForm.shiftStart}
                  />
                </label>
                <label>
                  <span>
                    Default time out <RequiredMark />
                  </span>
                  <input
                    onChange={(event) =>
                      updateScheduleDraft({ shiftEnd: event.target.value })
                    }
                    required
                    type="time"
                    value={scheduleForm.shiftEnd}
                  />
                </label>
                <label>
                  <span>
                    Break (minutes) <RequiredMark />
                  </span>
                  <input
                    max={720}
                    min={0}
                    onChange={(event) =>
                      updateScheduleDraft({ breakMinutes: event.target.value })
                    }
                    required
                    type="number"
                    value={scheduleForm.breakMinutes}
                  />
                </label>
                <label>
                  <span>
                    Grace period (minutes) <RequiredMark />
                  </span>
                  <input
                    max={240}
                    min={0}
                    onChange={(event) =>
                      updateScheduleDraft({ graceMinutes: event.target.value })
                    }
                    required
                    type="number"
                    value={scheduleForm.graceMinutes}
                  />
                </label>
                <label>
                  <span>Default location</span>
                  <input
                    autoComplete="off"
                    maxLength={100}
                    onChange={(event) =>
                      updateScheduleDraft({
                        defaultLocation: event.target.value,
                      })
                    }
                    placeholder="e.g. M Spaces Ortigas"
                    value={scheduleForm.defaultLocation}
                  />
                </label>
                <fieldset className={styles.daysFieldset}>
                  <legend>Working days</legend>
                  <div className={styles.daysGrid}>
                    {[
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ].map((day, index) => (
                      <label key={day}>
                        <input
                          checked={scheduleForm.workDays.includes(index)}
                          onChange={(event) =>
                            updateScheduleDraft({
                              workDays: event.target.checked
                                ? [...scheduleForm.workDays, index].sort()
                                : scheduleForm.workDays.filter(
                                    (item) => item !== index,
                                  ),
                            })
                          }
                          type="checkbox"
                        />
                        {day.slice(0, 3)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <button
                  className={styles.secondaryButton}
                  disabled={!branchId || scheduleMutation.isPending}
                  type="submit"
                >
                  {scheduleMutation.isPending
                    ? "Saving schedule…"
                    : "Save schedule"}
                </button>
              </form>
            </section>
          )}

          {isScheduleAdmin && (
            <div hidden={currentSection !== "weekly-roster"}>
              <WeeklyWorkRoster
                branchId={branchId}
                enabled={Boolean(branchId)}
              />
            </div>
          )}

          <section
            aria-labelledby="records-heading"
            className={styles.panel}
            hidden={currentSection !== "history"}
          >
            <div className={styles.sectionHeader}>
              <h2 id="records-heading">Attendance history</h2>
              <div className={styles.dateFilters}>
                <label>
                  From
                  <input
                    onChange={(event) => {
                      setFrom(event.target.value);
                      setAttendancePageNumber(1);
                    }}
                    type="date"
                    value={from}
                  />
                </label>
                <label>
                  To
                  <input
                    onChange={(event) => {
                      setTo(event.target.value);
                      setAttendancePageNumber(1);
                    }}
                    type="date"
                    value={to}
                  />
                </label>
                {canManage && (
                  <label>
                    Employee
                    <select
                      onChange={(event) => {
                        setEmployeeFilter(event.target.value);
                        setAttendancePageNumber(1);
                      }}
                      value={employeeFilter}
                    >
                      <option value="">All employees</option>
                      {Array.from(
                        new Map(
                          records.map((record) => [
                            record.employeeId,
                            record.employeeName,
                          ]),
                        ),
                      ).map(([id, name]) => (
                        <option key={id} value={id}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
            {canManage && <h3>Posted records and audited corrections</h3>}
            {attendanceQuery.isLoading ? (
              <p className={styles.notice}>Loading attendance records…</p>
            ) : attendanceQuery.isError ? (
              <div className={styles.error} role="alert">
                <span>{attendanceQuery.error.message}</span>
                <IconActionButton
                  icon={RefreshCw}
                  label="Retry loading attendance"
                  onClick={() => void attendanceQuery.refetch()}
                />
              </div>
            ) : displayedRecords.length === 0 ? (
              <p className={styles.empty}>
                No attendance records are available for this date range.
              </p>
            ) : (
              <>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        {canManage && <th scope="col">Employee</th>}
                        <th scope="col">Branch</th>
                        <th scope="col">Time in</th>
                        <th scope="col">Time out</th>
                        <th scope="col">Worked</th>
                        <th scope="col">Late</th>
                        <th scope="col">Overtime</th>
                        {canManage && <th scope="col">OT approval</th>}
                        <th scope="col">Source</th>
                        {canManage && <th scope="col">Action</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {attendancePage.items.map((record) => (
                        <tr key={record.id}>
                          <td>{record.workDate}</td>
                          {canManage && <td>{record.employeeName}</td>}
                          <td>{record.branchName ?? "Assigned branch"}</td>
                          <td>
                            {formatTime(record.timeIn)}
                            {record.status === "CORRECTED" && (
                              <small className={styles.detailLine}>
                                Original {formatTime(record.originalTimeIn)}
                              </small>
                            )}
                          </td>
                          <td>
                            {formatTime(record.timeOut)}
                            {record.status === "CORRECTED" && (
                              <small className={styles.detailLine}>
                                Original {formatTime(record.originalTimeOut)}
                              </small>
                            )}
                          </td>
                          <td>
                            {record.status === "ON_LEAVE"
                              ? "On leave"
                              : record.status === "ABSENT"
                                ? "Absent"
                                : record.timeOut
                                  ? duration(record.totalMinutes)
                                  : record.timeIn
                                    ? "In progress"
                                    : "Missing punches"}
                          </td>
                          <td>{duration(record.lateMinutes)}</td>
                          <td>{duration(record.overtimeMinutes)}</td>
                          {canManage && record.source !== "LEAVE" && (
                            <td>
                              {record.overtimeMinutes <= 0 ? (
                                "—"
                              ) : record.overtimeApprovalStatus ===
                                "PENDING" ? (
                                <button
                                  className={styles.textButton}
                                  onClick={() =>
                                    setOvertimeApprovalId(
                                      overtimeApprovalId === record.id
                                        ? null
                                        : record.id,
                                    )
                                  }
                                  type="button"
                                >
                                  Review pending
                                </button>
                              ) : record.overtimeApprovalStatus ? (
                                record.overtimeApprovalStatus.replaceAll(
                                  "_",
                                  " ",
                                )
                              ) : (
                                "Not requested"
                              )}
                            </td>
                          )}
                          {canManage && record.source === "LEAVE" && <td>—</td>}
                          <td>
                            <span className={styles.source}>
                              {record.source.replaceAll("_", " ")}
                            </span>
                          </td>
                          {canManage && (
                            <td>
                              <button
                                className={styles.textButton}
                                onClick={() => {
                                  if (record.dtrCalculation) {
                                    setActiveSection("dtr");
                                    return;
                                  }
                                  setCorrectionId(
                                    correctionId === record.id
                                      ? null
                                      : record.id,
                                  );
                                }}
                                type="button"
                              >
                                {record.dtrCalculation
                                  ? "Review DTR"
                                  : correctionId === record.id
                                    ? "Close"
                                    : "Correct"}
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <TablePagination
                  label="attendance records"
                  onPageChange={setAttendancePageNumber}
                  page={attendancePage.page}
                  totalItems={displayedRecords.length}
                />
                {correctionId &&
                  canManage &&
                  (() => {
                    const record = displayedRecords.find(
                      (item) => item.id === correctionId,
                    );
                    if (!record) return null;
                    return (
                      <>
                        <form
                          className={styles.correctionForm}
                          onSubmit={(event) => submitCorrection(event, record)}
                        >
                          <h3>
                            Correct attendance · {record.employeeName} ·{" "}
                            {record.workDate}
                          </h3>
                          <label>
                            <FieldLabel required={true}>Record type</FieldLabel>
                            <select
                              required
                              defaultValue="CORRECTION"
                              name="changeType"
                            >
                              <option value="CORRECTION">
                                Attendance correction
                              </option>
                              <option value="MANUAL_ADJUSTMENT">
                                Manual adjustment
                              </option>
                            </select>
                          </label>
                          <label>
                            Time in
                            <input
                              defaultValue={toLocalInput(record.timeIn)}
                              name="timeIn"
                              type="datetime-local"
                            />
                          </label>
                          <label>
                            Time out
                            <input
                              defaultValue={toLocalInput(record.timeOut)}
                              name="timeOut"
                              type="datetime-local"
                            />
                          </label>
                          <label className={styles.reasonLabel}>
                            <span>
                              Reason <RequiredMark />
                            </span>
                            <input
                              maxLength={500}
                              minLength={10}
                              name="reason"
                              required
                            />
                          </label>
                          <button
                            className={styles.primaryButton}
                            disabled={correctionMutation.isPending}
                            type="submit"
                          >
                            {correctionMutation.isPending
                              ? "Saving…"
                              : "Save audited correction"}
                          </button>
                        </form>
                        <div className={styles.correctionHistory}>
                          <h4>Audited correction records</h4>
                          {correctionHistoryQuery.isLoading ? (
                            <p className={styles.notice}>
                              Loading correction history…
                            </p>
                          ) : correctionHistoryQuery.isError ? (
                            <p className={styles.error} role="alert">
                              Unable to load correction history.
                            </p>
                          ) : !correctionHistoryQuery.data?.length ? (
                            <p className={styles.empty}>
                              No correction or manual adjustment records.
                            </p>
                          ) : (
                            <ul>
                              {correctionHistoryQuery.data.map((change) => (
                                <li key={change.id}>
                                  <strong>
                                    {change.changeType.replaceAll("_", " ")}
                                  </strong>
                                  <span>{change.reason}</span>
                                  <small>
                                    {change.createdByName} ·{" "}
                                    {new Intl.DateTimeFormat(undefined, {
                                      dateStyle: "medium",
                                      timeStyle: "short",
                                    }).format(new Date(change.createdAt))}
                                    {` · ${formatTime(change.timeInBefore)}–${formatTime(change.timeOutBefore)} → ${formatTime(change.timeInAfter)}–${formatTime(change.timeOutAfter)}`}
                                  </small>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </>
                    );
                  })()}
                {overtimeApprovalId &&
                  canManage &&
                  (() => {
                    const record = displayedRecords.find(
                      (item) => item.id === overtimeApprovalId,
                    );
                    if (!record || record.overtimeApprovalStatus !== "PENDING")
                      return null;
                    return (
                      <form
                        className={styles.overtimeForm}
                        onSubmit={(event) => {
                          event.preventDefault();
                          overtimeApprovalMutation.mutate({
                            id: record.id,
                            decision: "APPROVE",
                          });
                        }}
                      >
                        <h3>
                          Overtime review · {record.employeeName} ·{" "}
                          {record.workDate} · {duration(record.overtimeMinutes)}
                        </h3>
                        <label>
                          Decision reason <RequiredMark />
                          <input
                            maxLength={500}
                            minLength={10}
                            onChange={(event) =>
                              setOvertimeReason(event.target.value)
                            }
                            placeholder="Explain the overtime decision"
                            required
                            value={overtimeReason}
                          />
                        </label>
                        <button
                          className={styles.primaryButton}
                          disabled={
                            overtimeApprovalMutation.isPending ||
                            overtimeReason.trim().length < 10
                          }
                          type="submit"
                        >
                          Approve overtime
                        </button>
                        <button
                          className={styles.secondaryButton}
                          disabled={
                            overtimeApprovalMutation.isPending ||
                            overtimeReason.trim().length < 10
                          }
                          onClick={(event) => {
                            event.preventDefault();
                            overtimeApprovalMutation.mutate({
                              id: record.id,
                              decision: "REJECT",
                            });
                          }}
                          type="button"
                        >
                          Reject overtime
                        </button>
                      </form>
                    );
                  })()}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceWorkspace() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <RealtimeQueryProvider client={queryClient}>
      <AttendanceContent />
    </RealtimeQueryProvider>
  );
}
