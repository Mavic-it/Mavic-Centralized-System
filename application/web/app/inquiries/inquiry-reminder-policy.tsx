"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { inquiryApi, type Metadata } from "./types";
import { LoadingFields } from "../components/content-loading";
import css from "./workspace.module.css";
type Policy = {
  enabled: boolean;
  overdueEnabled: boolean;
  leadMinutes: number;
  escalationHours: number;
};
export function InquiryReminderPolicy({ meta }: { meta: Metadata }) {
  const [branch, setBranch] = useState(meta.branches[0]?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(false);
  const policy = useQuery({
    queryKey: ["inquiries", "reminder-policy", branch],
    queryFn: () =>
      inquiryApi<Policy>(
        `/settings/reminders?branchId=${encodeURIComponent(branch)}`,
      ),
    enabled: !!branch,
  });
  if (!branch) return <p>No authorized active branches are available.</p>;
  return (
    <section>
      <h2>Follow-up reminders</h2>
      <label>
        Handling branch
        <select
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value);
            setSaved(false);
          }}
        >
          {meta.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      {policy.isPending ? (
        <LoadingFields
          label="Loading reminder policy"
          labels={["Reminders", "Advance notice", "Escalation"]}
        />
      ) : policy.isError ? (
        <div role="alert">
          {policy.error.message}
          <button onClick={() => policy.refetch()}>Retry</button>
        </div>
      ) : (
        <FormLayout
          key={`${branch}-${policy.dataUpdatedAt}`}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setSaved(false);
            const f = new FormData(e.currentTarget);
            try {
              await inquiryApi(
                `/settings/reminders?branchId=${encodeURIComponent(branch)}`,
                {
                  enabled: f.get("enabled") === "on",
                  overdueEnabled: f.get("overdueEnabled") === "on",
                  leadMinutes: Number(f.get("leadMinutes")),
                  escalationHours: Number(f.get("escalationHours")),
                },
                "PATCH",
              );
              await policy.refetch();
              setSaved(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy || !meta.permissions.manageSettings}>
            <div className={css.fields}>
              <div className={css.checks}>
                <label>
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={policy.data.enabled}
                  />
                  Enable reminders
                </label>
                <label>
                  <input
                    type="checkbox"
                    name="overdueEnabled"
                    defaultChecked={policy.data.overdueEnabled}
                  />
                  Overdue reminders
                </label>
              </div>
              <label>
                Advance notice (minutes)
                <input
                  name="leadMinutes"
                  type="number"
                  min={0}
                  max={10080}
                  required
                  defaultValue={policy.data.leadMinutes}
                />
              </label>
              <label>
                Escalate after overdue hours (0 disables)
                <input
                  name="escalationHours"
                  type="number"
                  min={0}
                  max={720}
                  required
                  defaultValue={policy.data.escalationHours}
                />
              </label>
            </div>
            <p>
              Reminders use Philippine business dates. Escalations go to the
              branch’s authorized manager. Delivery is deduplicated for each
              schedule version.
            </p>
            {meta.permissions.manageSettings && (
              <button disabled={busy}>Save reminder policy</button>
            )}
          </fieldset>
        </FormLayout>
      )}
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {saved && <p role="status">Reminder policy saved.</p>}
    </section>
  );
}
