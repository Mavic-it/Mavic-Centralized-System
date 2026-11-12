import type { ObCalculation } from "./types";
import { obTime } from "./api";
import css from "./ob.module.css";
export function ObAttendancePreview({
  calculation,
}: {
  calculation: ObCalculation;
}) {
  const c = calculation;
  return (
    <section className={css.preview} aria-label="OB attendance impact">
      <h3>Attendance impact</h3>
      <p>
        Preview only. Approval authorizes OB time; biometric punches remain
        unchanged.
      </p>
      <dl className={css.facts}>
        <div>
          <dt>Scheduled</dt>
          <dd>
            {c.schedule
              ? `${c.schedule.shiftStart} - ${c.schedule.shiftEnd}`
              : "No schedule"}
          </dd>
        </div>
        <div>
          <dt>Biometric / office IN</dt>
          <dd>{c.actualIn ? obTime(c.actualIn) : "No punch"}</dd>
        </div>
        <div>
          <dt>Biometric / office OUT</dt>
          <dd>{c.actualOut ? obTime(c.actualOut) : "No punch"}</dd>
        </div>
        <div>
          <dt>Approved OB credit</dt>
          <dd>{c.obCreditedMinutes ?? 0} minutes</dd>
        </div>
        <div>
          <dt>Total credited work</dt>
          <dd>{c.workedMinutes} minutes</dd>
        </div>
        <div>
          <dt>DTR result</dt>
          <dd>{c.payrollReady ? "Ready for DTR review" : "Needs review"}</dd>
        </div>
      </dl>
      {!!c.exceptions.length && (
        <ul>
          {c.exceptions.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
