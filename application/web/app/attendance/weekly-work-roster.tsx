"use client";

import { ScheduleObBadge, type ScheduleOb } from "../components/schedule-ob-badge";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notifyError, notifySuccess } from "../lib/notifications";
import { paginateTableRows, TablePagination } from "../components/table-pagination";
import { ScheduleLeaveBadge, type ScheduleLeave } from "../components/schedule-leave-badge";
import scheduleStyles from "../components/schedule-grid.module.css";
import styles from "./workspace.module.css";

type RosterDay = {
  workDate: string;
  dayType: "WORK" | "REST_DAY";
  shiftStart: string | null;
  shiftEnd: string | null;
  baseShiftStart: string | null;
  baseShiftEnd: string | null;
  assignmentLabel: string | null;
  hasSchedule: boolean;
  approvedLeave?: ScheduleLeave;
  officialBusiness?: ScheduleOb[];
};

type RosterEmployee = {
  employeeId: string;
  employeeNumber: string | null;
  name: string;
  days: RosterDay[];
};

type WorkRoster = {
  branchId: string;
  branchName: string;
  weekStart: string;
  dates: string[];
  defaultLocation: string | null;
  employees: RosterEmployee[];
};

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const payload = (await response.json().catch(() => ({}))) as {
    message?: string | string[];
  } & T;
  if (!response.ok) {
    const message = Array.isArray(payload.message)
      ? payload.message.join(". ")
      : payload.message;
    throw new Error(message ?? "The weekly schedule could not be saved.");
  }
  return payload;
}

function isoLocalDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mondayOf(dateValue: string): string {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return isoLocalDate(date);
}

function dateFromIso(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function displayDate(value: string, includeYear = true): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(dateFromIso(value));
}

function todayMonday(): string {
  return mondayOf(isoLocalDate(new Date()));
}

export function WeeklyWorkRoster({
  branchId,
  enabled,
}: {
  branchId: string;
  enabled: boolean;
}) {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(todayMonday);
  const rosterQuery = useQuery({
    queryKey: ["attendance-work-roster", branchId, weekStart],
    queryFn: () => {
      const params = new URLSearchParams({ branchId, weekStart });
      return request<WorkRoster>(`/api/attendance/work-roster?${params}`);
    },
    enabled: Boolean(enabled && branchId && weekStart),
  });
  const rosterKey = `${branchId}:${weekStart}`;
  const [rosterPageState, setRosterPageState] = useState({ key: "", page: 1 });
  const [rosterDraft, setRosterDraft] = useState<{
    key: string;
    employees: RosterEmployee[];
  } | null>(null);
  const savedLeave = new Map((rosterQuery.data?.employees ?? []).flatMap((employee) =>
    employee.days.map((day) => [`${employee.employeeId}:${day.workDate}`, day.approvedLeave] as const),
  ));
  const savedOb = new Map((rosterQuery.data?.employees ?? []).flatMap(employee => employee.days.map(day => [`${employee.employeeId}:${day.workDate}`,day.officialBusiness] as const)));
  const draftEmployees = (rosterDraft?.key === rosterKey
    ? rosterDraft.employees
    : rosterQuery.data?.employees ?? []).map((employee) => ({
      ...employee,
      days: employee.days.map((day) => ({ ...day, approvedLeave: savedLeave.get(`${employee.employeeId}:${day.workDate}`) ?? null,officialBusiness:savedOb.get(`${employee.employeeId}:${day.workDate}`)??[] })),
    }));
  const rosterPageNumber = rosterPageState.key === rosterKey
    ? rosterPageState.page
    : 1;
  const rosterPage = paginateTableRows(draftEmployees, rosterPageNumber);

  const saveMutation = useMutation({
    mutationFn: () => request<WorkRoster>("/api/attendance/work-roster", {
      method: "PUT",
      body: JSON.stringify({
        branchId,
        weekStart,
        employees: draftEmployees.map((employee) => ({
          employeeId: employee.employeeId,
          days: employee.days.map((day) => {
            const inheritsBaseShift =
              day.shiftStart === day.baseShiftStart &&
              day.shiftEnd === day.baseShiftEnd;
            return {
              workDate: day.workDate,
              dayType: day.dayType,
              shiftStart: day.dayType === "REST_DAY" || inheritsBaseShift
                ? null
                : day.shiftStart,
              shiftEnd: day.dayType === "REST_DAY" || inheritsBaseShift
                ? null
                : day.shiftEnd,
              assignmentLabel: day.assignmentLabel === rosterQuery.data?.defaultLocation
                ? null
                : day.assignmentLabel,
            };
          }),
        })),
      }),
    }),
    onSuccess: async (roster) => {
      setRosterDraft({ key: rosterKey, employees: roster.employees });
      queryClient.setQueryData(["attendance-work-roster", branchId, weekStart], roster);
      await queryClient.invalidateQueries({ queryKey: ["attendance-work-roster", branchId] });
      notifySuccess("Weekly employee schedules saved.");
    },
    onError: (error: Error) => notifyError(error.message),
  });

  function updateDay(employeeId: string, workDate: string, update: Partial<RosterDay>) {
    setRosterDraft((previous) => {
      const current = previous?.key === rosterKey
        ? previous.employees
        : rosterQuery.data?.employees ?? [];
      return {
        key: rosterKey,
        employees: current.map((employee) => employee.employeeId !== employeeId
          ? employee
          : {
              ...employee,
              days: employee.days.map((day) => day.workDate !== workDate
                ? day
                : { ...day, ...update }),
            }),
      };
    });
  }

  const days = rosterQuery.data?.dates ?? [];
  const endDate = days.at(-1) ?? weekStart;
  const hasMissingSchedules = draftEmployees.some((employee) =>
    employee.days.some((day) => !day.hasSchedule),
  );

  return (
    <section className={styles.panel} aria-labelledby="weekly-roster-heading">
      <div className={styles.sectionHeader}>
        <div>
          <h2 id="weekly-roster-heading">Weekly employee schedule</h2>
          <p className={styles.subtle}>
            Default shift times and location fill each workday. Change a day only when an employee’s schedule differs.
          </p>
        </div>
        <div className={styles.rosterToolbar}>
          <label className={styles.rosterWeekPicker}>
            Week starting Monday
            <input
              aria-label="Week starting Monday"
              onChange={(event) => {
                if (event.target.value) setWeekStart(mondayOf(event.target.value));
              }}
              type="date"
              value={weekStart}
            />
          </label>
          <button
            className={styles.secondaryButton}
            disabled={!draftEmployees.length || hasMissingSchedules || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            type="button"
          >
            {saveMutation.isPending ? "Saving weekly schedule…" : "Save weekly schedule"}
          </button>
        </div>
      </div>

      {!enabled && (
        <p className={styles.notice}>Select an active branch to manage its weekly roster.</p>
      )}
      {rosterQuery.isLoading && <p className={styles.notice}>Loading branch employees and schedules…</p>}
      {rosterQuery.isError && (
        <p className={styles.error} role="alert">
          {rosterQuery.error instanceof Error
            ? rosterQuery.error.message
            : "Unable to load the weekly roster."}
        </p>
      )}
      {enabled && rosterQuery.data && (
        <>
          <div className={styles.rosterTitle}>
            <strong>
              WEEK · {displayDate(weekStart).toUpperCase()} – {displayDate(endDate).toUpperCase()}
            </strong>
            <span>{rosterQuery.data.branchName}</span>
          </div>
          {hasMissingSchedules && (
            <p className={styles.notice}>
              Configure the branch defaults above first. The roster uses the default shift times and location, plus the base time zone, break, and grace-period settings. <a href="#schedule-heading">Set branch defaults</a>.
            </p>
          )}
          {!draftEmployees.length ? (
            <p className={styles.notice}>There are no active employees assigned to this branch.</p>
          ) : (
            <div className={scheduleStyles.wrap} role="region" aria-label="Weekly employee schedule" tabIndex={0}>
              <table className={scheduleStyles.table} data-editable>
                <colgroup><col className={scheduleStyles.employeeColumn} />{days.map(date => <col span={2} key={date} />)}</colgroup>
                <thead>
                  <tr>
                    <th className={scheduleStyles.employeeHead} rowSpan={3}>EMPLOYEE</th>
                    {days.map((date, index) => (
                      <th key={date} colSpan={2}>{weekdays[index].toUpperCase()}</th>
                    ))}
                  </tr>
                  <tr>
                    {days.map((date) => (
                      <th className={scheduleStyles.dateHead} colSpan={2} key={date}>
                        {displayDate(date)}
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {days.map((date) => (
                      <th className={scheduleStyles.timeHead} colSpan={2} key={date}>
                        <span>IN</span><span>OUT</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rosterPage.items.map((employee) => (
                    <tr key={employee.employeeId}>
                      <th className={scheduleStyles.employeeName} scope="row">
                        <strong>{employee.name}</strong>
                        {employee.employeeNumber && employee.employeeNumber !== "Not assigned" && (
                          <small>{employee.employeeNumber}</small>
                        )}
                      </th>
                      {employee.days.map((day, index) => (
                        <td className={scheduleStyles.dayCell} colSpan={2} key={day.workDate} aria-label={`${weekdays[index]}, ${displayDate(day.workDate)}`}>
                          <div className={scheduleStyles.dayHeading} aria-hidden="true">{weekdays[index]}<small>{displayDate(day.workDate)}</small></div>
                          <ScheduleLeaveBadge leave={day.approvedLeave} /><ScheduleObBadge requests={day.officialBusiness} />
                          {day.dayType === "REST_DAY" ? (
                            <button
                              aria-label={`${employee.name}, ${weekdays[index]}: mark as a work day`}
                              className={scheduleStyles.restDay}
                              onClick={() => updateDay(employee.employeeId, day.workDate, {
                                dayType: "WORK",
                              })}
                              type="button"
                            >
                              REST DAY
                            </button>
                          ) : (
                            <>
                              <div className={scheduleStyles.timePair}>
                                <input
                                  aria-label={`${employee.name}, ${weekdays[index]} shift start`}
                                  onChange={(event) => updateDay(employee.employeeId, day.workDate, {
                                    shiftStart: event.target.value || null,
                                  })}
                                  type="time"
                                  value={day.shiftStart ?? ""}
                                />
                                <input
                                  aria-label={`${employee.name}, ${weekdays[index]} shift end`}
                                  onChange={(event) => updateDay(employee.employeeId, day.workDate, {
                                    shiftEnd: event.target.value || null,
                                  })}
                                  type="time"
                                  value={day.shiftEnd ?? ""}
                                />
                              </div>
                              <button
                                aria-label={`${employee.name}, ${weekdays[index]}: mark as a rest day`}
                                className={scheduleStyles.markRest}
                                onClick={() => updateDay(employee.employeeId, day.workDate, {
                                  dayType: "REST_DAY",
                                })}
                                type="button"
                              >
                                Set rest day
                              </button>
                            </>
                          )}
                          <select
                            aria-label={`${employee.name}, ${weekdays[index]} work arrangement`}
                            className={scheduleStyles.assignmentInput}
                            value={day.assignmentLabel === "WFH" || day.assignmentLabel?.startsWith("WFH: ") ? "WFH" : day.assignmentLabel === "OB" || day.assignmentLabel?.startsWith("OB: ") ? "OB" : "OFFICE"}
                            onChange={(event) => {
                              const location = (day.assignmentLabel ?? "").replace(/^(WFH|OB)(: )?/, "");
                              updateDay(employee.employeeId, day.workDate, { assignmentLabel: event.target.value === "OFFICE" ? rosterQuery.data?.defaultLocation ?? null : `${event.target.value}${location ? `: ${location}` : ""}` });
                            }}
                          >
                            <option value="OFFICE">Office</option>
                            <option value="WFH">WFH</option>
                            <option value="OB">OB (Official business)</option>
                          </select>
                          <input
                            aria-label={`${employee.name}, ${weekdays[index]} assignment or location`}
                            className={scheduleStyles.assignmentInput}
                            maxLength={/^(WFH|OB)(: |$)/.test(day.assignmentLabel ?? "") ? 95 : 100}
                            onChange={(event) => updateDay(employee.employeeId, day.workDate, {
                              assignmentLabel: /^(WFH|OB)(: |$)/.test(day.assignmentLabel ?? "")
                                ? `${day.assignmentLabel!.slice(0, day.assignmentLabel!.startsWith("WFH") ? 3 : 2)}${event.target.value ? `: ${event.target.value}` : ""}`
                                : event.target.value || null,
                            })}
                            placeholder="Where / location"
                            value={(day.assignmentLabel ?? "").replace(/^(WFH|OB)(: |$)/, "")}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {draftEmployees.length > 0 && (
            <TablePagination
              label="roster employees"
              onPageChange={(page) => setRosterPageState({ key: rosterKey, page })}
              page={rosterPage.page}
              totalItems={draftEmployees.length}
            />
          )}
        </>
      )}
    </section>
  );
}
