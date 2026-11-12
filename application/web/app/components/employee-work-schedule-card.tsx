"use client";

import { ScheduleObBadge, type ScheduleOb } from "./schedule-ob-badge";
import { FieldLabel } from "./field-label";
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pencil,
  RefreshCw,
} from "lucide-react";
import type { WorkspaceRole } from "../data/people";
import { IconActionButton } from "./icon-action-button";
import { hrRequest } from "./people-workspace-services";
import { notifyError, notifySuccess } from "../lib/notifications";
import {
  CARD_TABLE_VIEWS,
  useRememberedView,
} from "../lib/use-remembered-view";
import { ScheduleLeaveBadge, type ScheduleLeave } from "./schedule-leave-badge";
import scheduleStyles from "./schedule-grid.module.css";
import styles from "./employee-work-schedule-card.module.css";

type Schedule = {
  branchId: string;
  timeZone: string;
  workDays: number[];
  shiftStart: string;
  shiftEnd: string;
  breakMinutes: number;
  graceMinutes: number;
  source?: "EMPLOYEE" | "BRANCH";
  effectiveDate: string | null;
};

type ScheduleHistory = Omit<Schedule, "source"> & {
  id: string;
  employeeId: string;
  assignedBy: string | null;
  assignedByName?: string | null;
  recordedAt: string;
};

type ScheduleResponse = {
  current: Schedule | null;
  history: ScheduleHistory[];
};

export type WeekDay = {
  workDate: string;
  dayType: "WORK" | "REST_DAY";
  shiftStart: string | null;
  shiftEnd: string | null;
  assignmentLabel: string | null;
  hasSchedule: boolean;
  approvedLeave?: ScheduleLeave;
  officialBusiness?: ScheduleOb[];
};

type EmployeeWeekSchedule = {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  days: WeekDay[];
};

type WeekScheduleResponse = {
  branchName: string;
  weekStart: string;
  dates: string[];
  defaultLocation: string | null;
  employees: EmployeeWeekSchedule[];
};

const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const workDays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

function localDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

function mondayOf(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function shiftWeek(weekStart: string, weeks: number) {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + weeks * 7);
  return mondayOf(
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
  );
}

function sundayOf(weekStart: string) {
  const date = new Date(`${weekStart}T00:00:00`);
  date.setDate(date.getDate() + 6);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthFirstDay(value: string) {
  const date = new Date(`${value.slice(0, 7)}-01T00:00:00`);
  return dateValue(date);
}

function shiftMonth(monthStart: string, months: number) {
  const date = new Date(`${monthStart.slice(0, 7)}-01T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return dateValue(date);
}

export function scheduleMonthDates(monthStart: string) {
  const first = new Date(`${monthStart.slice(0, 7)}-01T00:00:00`);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(last);
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7));
  const dates: string[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    dates.push(dateValue(cursor));
  }
  return dates;
}

export function scheduleMonthWeekStarts(monthStart: string) {
  const dates = scheduleMonthDates(monthStart);
  return dates.filter((date) => new Date(`${date}T00:00:00`).getDay() === 1);
}

function displayDate(value: string, includeYear = true) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(new Date(`${value}T00:00:00`));
}

function displayMonth(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 7)}-01T00:00:00`));
}

function displayDay(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric" }).format(
    new Date(`${value}T00:00:00`),
  );
}

function fullDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function dayNames(days: number[]) {
  return workDays
    .filter((day) => days.includes(day.value))
    .map((day) => day.label)
    .join(", ");
}

export function EmployeeScheduleMonthCalendar({
  monthStart,
  days,
}: {
  monthStart: string;
  days: ReadonlyMap<string, WeekDay>;
}) {
  return (
    <div
      className={styles.monthCalendar}
      role="region"
      aria-label={`${displayMonth(monthStart)} work schedule`}
      tabIndex={0}
    >
      <div className={styles.monthWeekdays} aria-hidden="true">
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday.slice(0, 3)}</span>
        ))}
      </div>
      <div className={styles.monthDays}>
        {scheduleMonthDates(monthStart).map((date) => {
          const day = days.get(date);
          const inMonth = date.slice(0, 7) === monthStart.slice(0, 7);
          const isToday = date === localDate();
          const fullLeave = (day?.approvedLeave?.units ?? 0) >= 1;
          return (
            <article
              key={date}
              className={styles.monthDay}
              data-outside-month={!inMonth}
              data-today={isToday}
              aria-label={fullDate(date)}
            >
              <div className={styles.monthDayHeading}>
                <time dateTime={date}>{displayDay(date)}</time>
                {isToday && <b>Today</b>}
              </div>
              {day && (
                <div className={styles.monthDayDetails}>
                  <ScheduleLeaveBadge leave={day.approvedLeave} /><ScheduleObBadge requests={day.officialBusiness} />
                  {fullLeave ? null : day.dayType === "REST_DAY" ? (
                    <span className={styles.monthRest}>Rest</span>
                  ) : day.hasSchedule ? (
                    <span className={styles.monthShift}>
                      {day.shiftStart ?? "--:--"}–{day.shiftEnd ?? "--:--"}
                    </span>
                  ) : null}
                  {day.assignmentLabel && !fullLeave && (
                    <small>{day.assignmentLabel}</small>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function EmployeeWorkScheduleCard({
  employeeId,
  role,
  readOnly = false,
}: {
  employeeId: string;
  role: WorkspaceRole | null;
  readOnly?: boolean;
}) {
  const queryClient = useQueryClient();
  const canManage =
    !readOnly &&
    ["SUPER_ADMIN", "HR_ADMIN", "BRANCH_MANAGER"].includes(role ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [view, setView] = useRememberedView(
    "employee-work-schedule",
    "cards",
    CARD_TABLE_VIEWS,
  );
  const [error, setError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => mondayOf(localDate()));
  const [schedulePeriod, setSchedulePeriod] = useState<"week" | "month">(
    "week",
  );
  const [monthStart, setMonthStart] = useState(() =>
    monthFirstDay(localDate()),
  );
  const queryKey = ["employee-work-schedule", employeeId] as const;
  const weekQueryKey = [
    "employee-work-schedule-week",
    employeeId,
    weekStart,
  ] as const;
  const scheduleQuery = useQuery({
    queryKey,
    queryFn: () =>
      hrRequest<ScheduleResponse>(
        "employees",
        `/${encodeURIComponent(employeeId)}/workflow/work-schedule`,
      ),
  });
  const weekScheduleQuery = useQuery({
    queryKey: weekQueryKey,
    enabled: schedulePeriod === "week",
    queryFn: () => {
      const params = new URLSearchParams({ weekStart });
      return hrRequest<WeekScheduleResponse>(
        "employees",
        `/${encodeURIComponent(employeeId)}/workflow/work-schedule/week?${params}`,
      );
    },
  });
  const monthWeekStarts = scheduleMonthWeekStarts(monthStart);
  const monthScheduleQuery = useQuery({
    queryKey: [
      "employee-work-schedule-month",
      employeeId,
      monthStart.slice(0, 7),
    ],
    enabled: schedulePeriod === "month",
    queryFn: async () => {
      const weeks = await Promise.all(
        monthWeekStarts.map((weekStart) => {
          const params = new URLSearchParams({ weekStart });
          return hrRequest<WeekScheduleResponse>(
            "employees",
            `/${encodeURIComponent(employeeId)}/workflow/work-schedule/week?${params}`,
          );
        }),
      );
      const days = new Map<string, WeekDay>();
      for (const week of weeks) {
        const employee = week.employees.find(
          (item) => item.employeeId === employeeId,
        );
        for (const day of employee?.days ?? []) days.set(day.workDate, day);
      }
      return {
        branchName: weeks.find((week) => week.branchName)?.branchName ?? "",
        days,
      };
    },
  });
  const mutation = useMutation({
    mutationFn: (
      input: Omit<Schedule, "branchId" | "source" | "effectiveDate"> & {
        effectiveDate: string;
      },
    ) =>
      hrRequest<ScheduleHistory>(
        "employees",
        `/${encodeURIComponent(employeeId)}/workflow/work-schedule`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({
          queryKey: ["employee-work-schedule-week", employeeId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["employee-work-schedule-month", employeeId],
        }),
      ]);
      setIsEditing(false);
      setError(null);
      notifySuccess("Employee work schedule saved.");
    },
    onError: (reason: Error) => notifyError(reason.message),
  });

  function saveSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const days = form.getAll("workDays").map(Number);
    if (!days.length) {
      setError("Select at least one work day.");
      return;
    }
    mutation.mutate({
      effectiveDate: String(form.get("effectiveDate") ?? ""),
      timeZone: String(form.get("timeZone") ?? "").trim(),
      workDays: days,
      shiftStart: String(form.get("shiftStart") ?? ""),
      shiftEnd: String(form.get("shiftEnd") ?? ""),
      breakMinutes: Number(form.get("breakMinutes")),
      graceMinutes: Number(form.get("graceMinutes")),
    });
  }

  const current = scheduleQuery.data?.current;
  const weekEmployee = weekScheduleQuery.data?.employees[0];
  const weekDays = weekEmployee?.days ?? [];
  const weekEnd = weekScheduleQuery.data?.dates.at(-1) ?? sundayOf(weekStart);
  const weekHasSchedule = weekDays.some(
    (day) => day.hasSchedule || Boolean(day.approvedLeave),
  );
  const monthDays = monthScheduleQuery.data?.days;
  const monthHasSchedule = monthDays
    ? [...monthDays.values()].some(
        (day) => day.hasSchedule || Boolean(day.approvedLeave),
      )
    : false;
  return (
    <section
      aria-labelledby="employee-work-schedule-title"
      className={styles.card}
      data-employee-panel
    >
      <div className={styles.header}>
        <h3 id="employee-work-schedule-title">Work schedule</h3>
        <Link href="/attendance/official-business">File / view Official Business</Link>
        {canManage && !isEditing && (
          <IconActionButton
            disabled={scheduleQuery.isLoading || scheduleQuery.isError}
            icon={current ? Pencil : CalendarClock}
            label={current ? "Change schedule" : "Assign schedule"}
            onClick={() => {
              setError(null);
              setIsEditing(true);
            }}
          />
        )}
      </div>

      {scheduleQuery.isLoading && (
        <p className={styles.muted}>Loading schedule…</p>
      )}
      {scheduleQuery.isError && (
        <div className={styles.errorBox}>
          <p role="alert">{scheduleQuery.error.message}</p>
          <IconActionButton
            icon={RefreshCw}
            label="Retry loading work schedule"
            onClick={() => void scheduleQuery.refetch()}
          />
        </div>
      )}
      {!scheduleQuery.isLoading && !scheduleQuery.isError && current && (
        <div className={styles.currentSchedule}>
          <strong>
            {current.shiftStart}–{current.shiftEnd}
          </strong>
          <span>
            {dayNames(current.workDays)} · {current.timeZone}
          </span>
          <small>
            {current.source === "BRANCH"
              ? "Using the branch schedule until an employee schedule takes effect."
              : `Employee schedule effective ${current.effectiveDate ?? "date unavailable"}.`}
            {current.breakMinutes ? ` Break ${current.breakMinutes} min.` : ""}
            {current.graceMinutes ? ` Grace ${current.graceMinutes} min.` : ""}
          </small>
        </div>
      )}
      {!scheduleQuery.isLoading && !scheduleQuery.isError && !current && (
        <p className={styles.muted}>
          No recurring attendance schedule is effective today.
        </p>
      )}

      <section
        className={styles.weekSection}
        aria-labelledby="employee-period-schedule-heading"
      >
        <div className={styles.weekToolbar}>
          <div className={styles.weekTitle}>
            <strong id="employee-period-schedule-heading">
              {schedulePeriod === "week"
                ? `WEEK · ${displayDate(weekStart).toUpperCase()} – ${displayDate(weekEnd).toUpperCase()}`
                : displayMonth(monthStart).toUpperCase()}
            </strong>
            {(schedulePeriod === "week"
              ? weekScheduleQuery.data?.branchName
              : monthScheduleQuery.data?.branchName) && (
              <span>
                {schedulePeriod === "week"
                  ? weekScheduleQuery.data?.branchName
                  : monthScheduleQuery.data?.branchName}
              </span>
            )}
          </div>
          <div className={styles.weekControls}>
            <div
              className={styles.viewSwitch}
              role="group"
              aria-label="Schedule period"
            >
              <button
                type="button"
                aria-pressed={schedulePeriod === "week"}
                onClick={() => setSchedulePeriod("week")}
              >
                Week
              </button>
              <button
                type="button"
                aria-pressed={schedulePeriod === "month"}
                onClick={() => setSchedulePeriod("month")}
              >
                Month
              </button>
            </div>
            {schedulePeriod === "week" ? (
              <>
                <div
                  className={styles.viewSwitch}
                  role="group"
                  aria-label="Schedule view"
                >
                  <button
                    type="button"
                    aria-pressed={view === "cards"}
                    onClick={() => setView("cards")}
                  >
                    Day cards
                  </button>
                  <button
                    type="button"
                    aria-pressed={view === "table"}
                    onClick={() => setView("table")}
                  >
                    Table
                  </button>
                </div>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => setWeekStart(mondayOf(localDate()))}
                >
                  This week
                </button>
                <label>
                  Week of
                  <input
                    aria-label="Choose a date for the work schedule week"
                    onChange={(event) => {
                      if (event.target.value)
                        setWeekStart(mondayOf(event.target.value));
                    }}
                    type="date"
                    value={weekStart}
                  />
                </label>
                <div className={styles.weekNavigation}>
                  <button
                    aria-label="Previous schedule week"
                    onClick={() =>
                      setWeekStart((value) => shiftWeek(value, -1))
                    }
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label="Next schedule week"
                    onClick={() => setWeekStart((value) => shiftWeek(value, 1))}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" size={15} />
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  className={styles.textButton}
                  type="button"
                  onClick={() => setMonthStart(monthFirstDay(localDate()))}
                >
                  This month
                </button>
                <label>
                  Month
                  <input
                    aria-label="Choose a month for the work schedule"
                    onChange={(event) => {
                      if (event.target.value)
                        setMonthStart(`${event.target.value}-01`);
                    }}
                    type="month"
                    value={monthStart.slice(0, 7)}
                  />
                </label>
                <div className={styles.weekNavigation}>
                  <button
                    aria-label="Previous schedule month"
                    onClick={() =>
                      setMonthStart((value) => shiftMonth(value, -1))
                    }
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" size={15} />
                  </button>
                  <button
                    aria-label="Next schedule month"
                    onClick={() =>
                      setMonthStart((value) => shiftMonth(value, 1))
                    }
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {schedulePeriod === "month" ? (
          <>
            {monthScheduleQuery.isLoading && (
              <p className={styles.muted}>Loading monthly schedule…</p>
            )}
            {monthScheduleQuery.isError && (
              <div className={styles.errorBox}>
                <p role="alert">{monthScheduleQuery.error.message}</p>
                <IconActionButton
                  icon={RefreshCw}
                  label="Retry loading monthly schedule"
                  onClick={() => void monthScheduleQuery.refetch()}
                />
              </div>
            )}
            {!monthScheduleQuery.isLoading &&
              !monthScheduleQuery.isError &&
              monthDays &&
              !monthHasSchedule && (
                <p className={styles.muted}>
                  No attendance schedule is configured for this month.
                </p>
              )}
            {!monthScheduleQuery.isLoading &&
              !monthScheduleQuery.isError &&
              monthDays &&
              monthHasSchedule && (
                <EmployeeScheduleMonthCalendar
                  monthStart={monthStart}
                  days={monthDays}
                />
              )}
          </>
        ) : (
          <>
            {weekScheduleQuery.isLoading && (
              <p className={styles.muted}>Loading weekly schedule…</p>
            )}
            {weekScheduleQuery.isError && (
              <div className={styles.errorBox}>
                <p role="alert">{weekScheduleQuery.error.message}</p>
                <IconActionButton
                  icon={RefreshCw}
                  label="Retry loading weekly schedule"
                  onClick={() => void weekScheduleQuery.refetch()}
                />
              </div>
            )}
            {!weekScheduleQuery.isLoading &&
              !weekScheduleQuery.isError &&
              weekEmployee &&
              !weekHasSchedule && (
                <p className={styles.muted}>
                  No attendance schedule is configured for this week.
                </p>
              )}
            {!weekScheduleQuery.isLoading &&
              !weekScheduleQuery.isError &&
              weekEmployee &&
              weekHasSchedule &&
              view === "cards" && (
                <div
                  className={styles.dayCards}
                  role="region"
                  tabIndex={0}
                  aria-label="Weekly work schedule"
                  data-schedule-view="cards"
                >
                  {weekDays.map((day, index) => (
                    <article
                      className={styles.dayCard}
                      key={day.workDate}
                      data-today={day.workDate === localDate()}
                    >
                      <div className={styles.dayTop}>
                        <span>{weekdays[index]}</span>
                        {day.workDate === localDate() && <b>Today</b>}
                      </div>
                      <strong className={styles.dayDate}>
                        {displayDate(day.workDate, false)}
                      </strong>
                      <div className={styles.dayBody}>
                        <ScheduleLeaveBadge leave={day.approvedLeave} /><ScheduleObBadge requests={day.officialBusiness} />
                        {day.approvedLeave &&
                        day.approvedLeave.units >= 1 ? null : day.dayType ===
                          "REST_DAY" ? (
                          <span className={styles.restBadge}>Rest day</span>
                        ) : (
                          <>
                            <small>Scheduled shift</small>
                            <strong>
                              {day.shiftStart ?? "--:--"} -{" "}
                              {day.shiftEnd ?? "--:--"}
                            </strong>
                          </>
                        )}
                        {day.assignmentLabel &&
                          !(
                            day.approvedLeave && day.approvedLeave.units >= 1
                          ) && <p>{day.assignmentLabel}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            {!weekScheduleQuery.isLoading &&
              !weekScheduleQuery.isError &&
              weekEmployee &&
              weekHasSchedule &&
              view === "table" && (
                <div
                  className={scheduleStyles.wrap}
                  role="region"
                  aria-label="Weekly work schedule"
                  tabIndex={0}
                >
                  <table className={scheduleStyles.table}>
                    <colgroup>
                      <col className={scheduleStyles.employeeColumn} />
                      {weekDays.map((day) => (
                        <col span={2} key={day.workDate} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        <th className={scheduleStyles.employeeHead} rowSpan={3}>
                          EMPLOYEE
                        </th>
                        {weekDays.map((day, index) => (
                          <th colSpan={2} key={day.workDate}>
                            {weekdays[index].toUpperCase()}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {weekDays.map((day) => (
                          <th
                            className={scheduleStyles.dateHead}
                            colSpan={2}
                            key={day.workDate}
                          >
                            {displayDate(day.workDate)}
                          </th>
                        ))}
                      </tr>
                      <tr>
                        {weekDays.map((day) => (
                          <th
                            className={scheduleStyles.timeHead}
                            colSpan={2}
                            key={day.workDate}
                          >
                            <span>IN</span>
                            <span>OUT</span>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th className={scheduleStyles.employeeName} scope="row">
                          <strong>{weekEmployee.name}</strong>
                          {weekEmployee.employeeNumber && (
                            <small>{weekEmployee.employeeNumber}</small>
                          )}
                        </th>
                        {weekDays.map((day, index) => (
                          <td
                            className={scheduleStyles.dayCell}
                            colSpan={2}
                            key={day.workDate}
                            aria-label={`${weekdays[index]}, ${displayDate(day.workDate)}`}
                          >
                            <div
                              className={scheduleStyles.dayHeading}
                              aria-hidden="true"
                            >
                              {weekdays[index]}
                              <small>{displayDate(day.workDate)}</small>
                            </div>
                            <ScheduleLeaveBadge leave={day.approvedLeave} /><ScheduleObBadge requests={day.officialBusiness} />
                            {day.approvedLeave &&
                            day.approvedLeave.units >=
                              1 ? null : day.dayType === "REST_DAY" ? (
                              <strong className={scheduleStyles.restDay}>
                                REST DAY
                              </strong>
                            ) : (
                              <div className={scheduleStyles.timePair}>
                                <span>{day.shiftStart ?? "--:--"}</span>
                                <span>{day.shiftEnd ?? "--:--"}</span>
                              </div>
                            )}
                            {day.assignmentLabel &&
                              !(
                                day.approvedLeave &&
                                day.approvedLeave.units >= 1
                              ) && (
                                <small className={scheduleStyles.assignment}>
                                  {day.assignmentLabel}
                                </small>
                              )}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
          </>
        )}
      </section>

      {isEditing && canManage && (
        <form className={styles.form} onSubmit={saveSchedule}>
          <label>
            <FieldLabel required={true}>Effective date</FieldLabel>
            <input
              defaultValue={localDate()}
              name="effectiveDate"
              required
              type="date"
            />
          </label>
          <label>
            <FieldLabel required={true}>Time zone</FieldLabel>
            <input
              defaultValue={current?.timeZone ?? ""}
              maxLength={100}
              name="timeZone"
              placeholder="e.g. Asia/Manila"
              required
            />
          </label>
          <fieldset className={styles.dayFieldset}>
            <legend>Work days</legend>
            <div className={styles.dayChoices}>
              {workDays.map((day) => (
                <label key={day.value}>
                  <input
                    defaultChecked={
                      current?.workDays.includes(day.value) ?? false
                    }
                    name="workDays"
                    type="checkbox"
                    value={day.value}
                  />
                  {day.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            <FieldLabel required={true}>Shift starts</FieldLabel>
            <input
              defaultValue={current?.shiftStart ?? ""}
              name="shiftStart"
              required
              type="time"
            />
          </label>
          <label>
            <FieldLabel required={true}>Shift ends</FieldLabel>
            <input
              defaultValue={current?.shiftEnd ?? ""}
              name="shiftEnd"
              required
              type="time"
            />
          </label>
          <label>
            <FieldLabel required={true}>Break minutes</FieldLabel>
            <input
              defaultValue={current?.breakMinutes ?? ""}
              max={720}
              min={0}
              name="breakMinutes"
              required
              type="number"
            />
          </label>
          <label>
            <FieldLabel required={true}>Grace minutes</FieldLabel>
            <input
              defaultValue={current?.graceMinutes ?? ""}
              max={240}
              min={0}
              name="graceMinutes"
              required
              type="number"
            />
          </label>
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
          <div className={styles.actions}>
            <button
              className={styles.cancelButton}
              onClick={() => setIsEditing(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={styles.saveButton}
              disabled={mutation.isPending}
              type="submit"
            >
              {mutation.isPending ? "Saving…" : "Save schedule"}
            </button>
          </div>
        </form>
      )}

      {!!scheduleQuery.data?.history.length && (
        <details className={styles.history}>
          <summary>
            Schedule history ({scheduleQuery.data.history.length})
          </summary>
          <ul>
            {scheduleQuery.data.history.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.effectiveDate} · {entry.shiftStart}–{entry.shiftEnd}
                </strong>
                <span>
                  {dayNames(entry.workDays)} · {entry.timeZone}
                </span>
                <small>
                  Assigned by {entry.assignedByName ?? "former account"}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
