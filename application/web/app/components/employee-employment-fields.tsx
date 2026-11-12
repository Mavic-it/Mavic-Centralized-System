"use client";

import { useState } from "react";
import { FieldLabel } from "./field-label";
import {
  EMPLOYMENT_OPTIONS,
  employmentTypeLabel,
} from "./employee-employment-options";

export function EmployeeEmploymentFields({
  initialType = "",
  probationEndDate,
  evaluationDueDate,
  labelClassName,
}: {
  initialType?: string;
  probationEndDate?: string | null;
  evaluationDueDate?: string | null;
  labelClassName?: string;
}) {
  const [type, setType] = useState(initialType);
  const isLegacy =
    initialType &&
    !EMPLOYMENT_OPTIONS.some((option) => option.value === initialType);
  return (
    <>
      <label>
        <FieldLabel required className={labelClassName}>
          Employment type
        </FieldLabel>
        <select
          name="employmentType"
          required
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="" disabled>
            Select employment type
          </option>
          {isLegacy && (
            <option value={initialType}>
              {employmentTypeLabel(initialType)} (existing)
            </option>
          )}
          {EMPLOYMENT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {type === "PROBATIONARY" && (
        <>
          <label>
            <FieldLabel required className={labelClassName}>
              End of provisionary date
            </FieldLabel>
            <input
              name="probationEndDate"
              type="date"
              required
              defaultValue={probationEndDate ?? ""}
            />
          </label>
          <label>
            <FieldLabel required className={labelClassName}>
              Evaluation due date
            </FieldLabel>
            <input
              name="evaluationDueDate"
              type="date"
              required
              defaultValue={evaluationDueDate ?? ""}
            />
          </label>
        </>
      )}
    </>
  );
}
