"use client";
import { FormLayout } from "@/app/components/ui/form-layout";
import { useState } from "react";
import { inquiryApi, type Lookup, type Metadata, label } from "./types";
import css from "./workspace.module.css";
import { InquiryReminderPolicy } from "./inquiry-reminder-policy";
export function InquirySettings({
  meta,
  onSaved,
}: {
  meta: Metadata;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<Lookup | null>(null),
    [kind, setKind] = useState("SERVICE"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (!meta.permissions.settings)
    return <div role="alert">Inquiry settings access is required.</div>;
  if (!meta.permissions.manageSettings)
    return (
      <section>
        <InquiryReminderPolicy meta={meta} />
        <h2>Inquiry lookup values</h2>
        <p>Your access is view only.</p>
        <div className={css.scroll}>
          <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Label</th>
                <th scope="col">State</th>
              </tr>
            </thead>
            <tbody>
              {meta.lookups.map((l) => (
                <tr key={l.id}>
                  <td>{label(l.kind)}</td>
                  <td>{l.label}</td>
                  <td>{l.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  return (
    <div className={css.sections}>
      <InquiryReminderPolicy meta={meta} />
      <FormLayout
        key={editing?.id ?? kind}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await inquiryApi(
              `/settings${editing ? `/${editing.id}` : ""}`,
              {
                kind: editing?.kind ?? kind,
                label: f.get("label"),
                position: Number(f.get("position")),
                active: f.get("active") === "on",
                reservable: f.get("reservable") === "on",
              },
              editing ? "PATCH" : "POST",
            );
            setEditing(null);
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>{editing ? "Edit value" : "Add lookup value"}</h2>
        {error && (
          <div role="alert" className={css.error}>
            {error}
          </div>
        )}
        <div className={css.fields}>
          <label>
            Category
            <select
              value={editing?.kind ?? kind}
              disabled={!!editing}
              onChange={(e) => setKind(e.target.value)}
            >
              {["SERVICE", "CHANNEL", "SOURCE", "ACTION", "LOST_REASON"].map(
                (v) => (
                  <option key={v} value={v}>
                    {label(v)}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            Label
            <input
              name="label"
              required
              maxLength={150}
              defaultValue={editing?.label}
            />
          </label>
          <label>
            Order
            <input
              name="position"
              type="number"
              min={0}
              max={10000}
              defaultValue={editing?.position ?? 0}
            />
          </label>
          <div className={css.checks}>
            <label>
              <input
                name="active"
                type="checkbox"
                defaultChecked={editing?.active ?? true}
              />
              Active
            </label>
            {(editing?.kind ?? kind) === "SERVICE" && (
              <label>
                <input
                  name="reservable"
                  type="checkbox"
                  defaultChecked={editing?.reservable ?? false}
                />
                Reservable
              </label>
            )}
          </div>
        </div>
        <div className={css.actions}>
          <button disabled={busy}>Save value</button>
          {editing && (
            <button type="button" onClick={() => setEditing(null)}>
              Cancel editing
            </button>
          )}
        </div>
      </FormLayout>
      <div className={css.scroll}>
        <table className={css.table}>
          <thead>
            <tr>
              {["Category", "Label", "Order", "State", "Action"].map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meta.lookups.map((l) => (
              <tr key={l.id}>
                <td>{label(l.kind)}</td>
                <td>
                  {l.label}
                  {l.reservable ? " · Reservable" : ""}
                </td>
                <td>{l.position}</td>
                <td>{l.active ? "Active" : "Inactive"}</td>
                <td>
                  <button onClick={() => setEditing(l)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Deactivate values to retain historical references. Referenced values
        cannot be deleted.
      </p>
    </div>
  );
}
