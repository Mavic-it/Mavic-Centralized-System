"use client";
import { RequiredMark } from "../components/required-mark";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { dtrRequest, jsonBody, type Configuration } from "./dtr-client";
import styles from "./dtr.module.css";
export function DtrSettings({
  branchId,
  configuration,
  onSaved,
}: {
  branchId: string;
  configuration: Configuration;
  onSaved: () => void;
}) {
  const [name, setName] = useState(""),
    [kind, setKind] = useState("AUTO"),
    [dateOrder, setOrder] = useState("ISO"),
    [pairing, setPairing] = useState("STRICT"),
    [headerRow, setHeader] = useState(""),
    [sheets, setSheets] = useState(""),
    [fields, setFields] = useState<Record<string, string>>({});
  const [policy, setPolicy] = useState(configuration.settings.policy),
    [holidays, setHolidays] = useState(configuration.settings.holidays),
    [holidayDate, setHolidayDate] = useState(""),
    [holidayType, setHolidayType] = useState("Regular Holiday"),
    [reason, setReason] = useState("");
  const template = useMutation({
    mutationFn: () =>
      dtrRequest(
        "templates",
        jsonBody({
          branchId,
          name,
          configuration: {
            kind,
            dateOrder,
            pairing,
            ...(headerRow ? { headerRow: Number(headerRow) } : {}),
            ...(sheets.trim()
              ? { sheets: sheets.split(",").map((s) => s.trim()) }
              : {}),
            fields: Object.fromEntries(
              Object.entries(fields).filter(([, value]) => value.trim()),
            ),
          },
        }),
      ),
    onSuccess: onSaved,
  });
  const settings = useMutation({
    mutationFn: () =>
      dtrRequest(
        "settings",
        jsonBody({ branchId, policy, holidays, reason }, "PUT"),
      ),
    onSuccess: onSaved,
  });
  function submitTemplate(e: FormEvent) {
    e.preventDefault();
    template.mutate();
  }
  return (
    <div className={styles.grid}>
      <section className={styles.card}>
        <h3>Branch import templates</h3>
        <p className={styles.muted}>
          Save a reusable format for each branch or device. Choose the date
          order used in your file. First-and-last punch pairing requires an
          approved HR reconciliation policy.
        </p>
        <form onSubmit={submitTemplate} className={styles.workspace}>
          <label className={styles.field}>
            <span>
              Template name / device
              <RequiredMark />
            </span>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>
                Source rows
                <RequiredMark />
              </span>
              <select
                required
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                <option value="AUTO">Detect automatically</option>
                <option value="PUNCH">Individual punches</option>
                <option value="DAILY">Daily attendance rows</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Date order
                <RequiredMark />
              </span>
              <select
                required
                value={dateOrder}
                onChange={(e) => setOrder(e.target.value)}
              >
                <option value="ISO">Year–month–day</option>
                <option value="MDY">Month / day / year</option>
                <option value="DMY">Day / month / year</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Punch reconciliation
                <RequiredMark />
              </span>
              <select
                required
                value={pairing}
                onChange={(e) => setPairing(e.target.value)}
              >
                <option value="STRICT">Respect IN / OUT events</option>
                <option value="FIRST_LAST">
                  First and last punch · HR approved
                </option>
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>Header row (blank = detect)</span>
            <input
              type="number"
              min="1"
              max="20"
              value={headerRow}
              onChange={(e) => setHeader(e.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Relevant sheet names, comma-separated (blank = all)</span>
            <input value={sheets} onChange={(e) => setSheets(e.target.value)} />
          </label>
          <details>
            <summary>Map source column names (blank = auto-detect)</summary>
            <div className={styles.grid}>
              {Object.entries({
                timestamp: "Punch date and time",
                identifier: "Personnel / employee ID",
                name: "Employee / first name",
                lastName: "Last name",
                device: "Device name",
                date: "Daily attendance date",
                in: "Actual IN",
                out: "Actual OUT",
                direction: "Punch IN / OUT status",
                status: "Source attendance status",
                shiftStart: "Source shift start",
                shiftEnd: "Source shift end",
              }).map(([key, label]) => (
                <label className={styles.field} key={key}>
                  <span>{label}</span>
                  <input
                    maxLength={100}
                    placeholder="Source column header"
                    value={fields[key] ?? ""}
                    onChange={(e) =>
                      setFields({ ...fields, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          {template.error && (
            <p role="alert" className={styles.error}>
              {template.error.message}
            </p>
          )}
          {template.isSuccess && <p role="status">Template saved.</p>}
          <button className={styles.button} disabled={template.isPending}>
            {template.isPending ? "Saving…" : "Save new template version"}
          </button>
        </form>
      </section>
      <section className={styles.card}>
        <h3>Calculation policy & holidays</h3>
        <p className={styles.muted}>
          Use Branch default schedule and Weekly employee schedule for shifts,
          workdays, timezone, grace and break duration. Set the unpaid break
          placement here. Policy changes require reopening protected periods,
          then recalculation.
        </p>
        <form
          className={styles.workspace}
          onSubmit={(e) => {
            e.preventDefault();
            settings.mutate();
          }}
        >
          <div className={styles.fields}>
            <label className={styles.field}>
              <span>Unpaid break start · local</span>
              <input
                type="time"
                value={policy.breakStart ?? ""}
                onChange={(e) =>
                  setPolicy({ ...policy, breakStart: e.target.value || null })
                }
              />
            </label>
            <label className={styles.field}>
              <span>Unpaid break end · local</span>
              <input
                type="time"
                value={policy.breakEnd ?? ""}
                onChange={(e) =>
                  setPolicy({ ...policy, breakEnd: e.target.value || null })
                }
              />
            </label>
          </div>
          <label className={styles.field}>
            <span>
              Late grace period · minutes
              <RequiredMark />
            </span>
            <input
              type="number"
              min="0"
              max="240"
              value={policy.lateGraceMinutes}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  lateGraceMinutes: Number(e.target.value),
                })
              }
              required
            />
            <small>
              With an 08:00 schedule, arrivals through 08:15 are not late; 08:16
              counts as 16 minutes late.
            </small>
          </label>
          <label className={styles.field}>
            <span>
              Potential OT minimum · minutes
              <RequiredMark />
            </span>
            <input
              type="number"
              min="0"
              max="480"
              value={policy.minimumOtMinutes}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  minimumOtMinutes: Number(e.target.value),
                })
              }
              required
            />
            <small>
              Less than the minimum earns no OT. At 50 minutes, OT rounds up to
              one hour.
            </small>
          </label>
          <label className={styles.field}>
            <span>
              Potential OT increment · minutes
              <RequiredMark />
            </span>
            <input
              type="number"
              min="1"
              max="240"
              value={policy.otIncrementMinutes}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  otIncrementMinutes: Number(e.target.value),
                })
              }
              required
            />
            <small>
              With a 60-minute increment and 50-minute minimum, each next hour
              begins at 50 minutes into the interval.
            </small>
          </label>
          <fieldset>
            <legend>Approved branch holidays</legend>
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Holiday date</span>
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                />
              </label>
              <label className={styles.field}>
                <span>
                  Holiday type
                  <RequiredMark />
                </span>
                <select
                  required
                  value={holidayType}
                  onChange={(e) => setHolidayType(e.target.value)}
                >
                  <option>Regular Holiday</option>
                  <option>Special Non-working Day</option>
                </select>
              </label>
              <button
                type="button"
                className={styles.button}
                disabled={!holidayDate}
                onClick={() => {
                  setHolidays({ ...holidays, [holidayDate]: holidayType });
                  setHolidayDate("");
                }}
              >
                Add holiday
              </button>
            </div>
            {Object.entries(holidays)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, type]) => (
                <p className={styles.header} key={date}>
                  <span>
                    {date} · {type}
                  </span>
                  <button
                    type="button"
                    className={styles.button}
                    aria-label={`Remove holiday ${date}`}
                    onClick={() =>
                      setHolidays(
                        Object.fromEntries(
                          Object.entries(holidays).filter(
                            ([key]) => key !== date,
                          ),
                        ),
                      )
                    }
                  >
                    Remove
                  </button>
                </p>
              ))}
          </fieldset>
          <p className={styles.muted}>
            Holiday changes are saved with the policy reason below. No salary
            multipliers are applied.
          </p>
          <label className={styles.field}>
            <span>
              Policy change reason
              <RequiredMark />
            </span>
            <input
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {settings.error && (
            <p role="alert" className={styles.error}>
              {settings.error.message}
            </p>
          )}
          {settings.isSuccess && (
            <p role="status">
              Settings saved. Recalculate affected unlocked periods.
            </p>
          )}
          <button className={styles.button} disabled={settings.isPending}>
            Save approved policy
          </button>
        </form>
      </section>
    </div>
  );
}
