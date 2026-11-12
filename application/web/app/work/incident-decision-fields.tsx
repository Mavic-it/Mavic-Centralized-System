"use client";

import { FieldLabel } from "../components/field-label";
import { useState } from "react";
import css from "./workspace.module.css";

export function IncidentDecisionFields({
  canApplyAction,
}: {
  canApplyAction: boolean;
}) {
  const [outcome, setOutcome] = useState("");
  const [action, setAction] = useState("NONE");
  return (
    <div className={css.incidentFormSection}>
      <h3>Findings and decision</h3>
      <label>
        <FieldLabel required={true}>Findings</FieldLabel>
        <textarea
          name="findings"
          rows={4}
          maxLength={8000}
          required
          placeholder="Summarize the evidence and explanation considered."
        />
      </label>
      <label>
        <FieldLabel required={true}>Outcome</FieldLabel>
        <select
          name="outcome"
          value={outcome}
          required
          onChange={(e) => {
            setOutcome(e.target.value);
            setAction("NONE");
          }}
        >
          <option value="" disabled>
            Select an outcome
          </option>
          <option value="NO_VIOLATION">No violation established</option>
          <option value="CONFIRMED">Violation confirmed</option>
        </select>
      </label>
      <label>
        Disciplinary action
        <select
          name="disciplinaryAction"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        >
          <option value="NONE">No disciplinary action</option>
          {canApplyAction && outcome === "CONFIRMED" && (
            <>
              <option value="WARNING">Warning</option>
              <option value="REPRIMAND">Reprimand</option>
              <option value="SUSPENSION">Suspension</option>
              <option value="OTHER">Other authorized action</option>
            </>
          )}
        </select>
      </label>
      {action !== "NONE" && (
        <label>
          <FieldLabel required={true}>Action details</FieldLabel>
          <textarea
            name="actionDetails"
            required
            rows={3}
            maxLength={4000}
            placeholder="Record the approved action, policy basis and any applicable dates."
          />
        </label>
      )}
      <p className={css.muted}>
        This records the decision only. Attendance and payroll are unchanged.
      </p>
    </div>
  );
}
