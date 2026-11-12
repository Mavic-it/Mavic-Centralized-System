"use client";
import { FieldLabel } from "../components/field-label";
import { useState, type FormEvent } from "react";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { useConfirmation } from "../components/ui/confirmation-provider";
import { send, useAction, currentDate, currentYear } from "./api";
import { Empty, ErrorState } from "./ui";
import type { Context, LeaveType, Policy } from "./types";
import css from "./leave.module.css";
import { effectiveNoticeDays, noticeLabel } from "./filing-dates";
import { TableTools } from "./table-tools";
const policy = (branchId: string | null): Policy => ({
  annualDays: 0,
  paid: true,
  eligibility: "ACTIVE",
  frequency: "MANUAL",
  halfDay: false,
  attachmentRule: "OPTIONAL",
  automaticAllocation: false,
  blockInsufficient: true,
  minimumServiceMonths: 0,
  minimumNoticeDays: 0,
  employmentTypes: [],
  branchId,
  allowApprovedCancellation: false,
  carryover: "NONE",
});
export function Settings({
  context,
  types,
}: {
  context: Context;
  types: LeaveType[];
}) {
  const [search, setSearch] = useState(""),
    [tableSort, setTableSort] = useState("name"),
    [editing, setEditing] = useState<LeaveType | null>(null),
    [assignment, setAssignment] = useState(false),
    [reason, setReason] = useState(""),
    [year, setYear] = useState(String(currentYear()));
  const confirm = useConfirmation();
  const allocation = useAction(
    () => send("/allocate", { year: Number(year), reason }),
    "Configured annual allocation completed.",
  );
  async function allocate(e: FormEvent) {
    e.preventDefault();
    if (allocation.isPending || !reason.trim()) return;
    if (
      await confirm({
        title: "Run approved annual allocations?",
        description:
          "Only active, eligible annual policies with automatic allocation enabled can grant credits. Existing yearly grants and adjustments are preserved.",
        confirmLabel: "Run allocation",
      })
    )
      allocation.mutate();
  }
  const visible = types
    .filter((t) =>
      `${t.code} ${t.name} ${t.policy.eligibility} ${t.active ? "active" : "inactive"}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => {
      if (tableSort === "status")
        return (
          Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
        );
      if (tableSort === "annual")
        return b.policy.annualDays - a.policy.annualDays;
      if (tableSort === "updated")
        return b.effectiveFrom.localeCompare(a.effectiveFrom);
      return a.name.localeCompare(b.name);
    });
  return (
    <>
      <section className={css.panel}>
        <div className={css.toolbar}>
          <div>
            <h2>Leave types & policies</h2>
            <p className={css.muted}>
              Keep policies simple. Changes create versions; past requests keep
              their original policy.
            </p>
          </div>
          <Button
            onClick={() =>
              setEditing({
                id: "",
                code: "",
                name: "",
                description: "",
                active: false,
                version: 1,
                effectiveFrom: currentDate(),
                policy: policy(
                  context.globalScope
                    ? null
                    : (context.branches[0]?.id ?? null),
                ),
              })
            }
          >
            Add leave type
          </Button>
        </div>
        <TableTools
          search={search}
          onSearch={setSearch}
          sort={tableSort}
          onSort={setTableSort}
          sortOptions={[
            { value: "name", label: "Name A–Z" },
            { value: "status", label: "Active first" },
            { value: "annual", label: "Most annual days" },
            { value: "updated", label: "Latest effective" },
          ]}
          count={visible.length}
          label="leave types"
        />
        {!visible.length ? (
          <Empty>No matching leave types.</Empty>
        ) : (
          <div
            className={css.scroll}
            role="region"
            tabIndex={0}
            aria-label="Leave settings"
          >
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Leave type</th>
                  <th>Annual days</th>
                  <th>Eligibility</th>
                  <th>Policy</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id}>
                    <th scope="row" className={css.rowTitle}>
                      <strong>{t.name}</strong>
                      <small>
                        {t.code} · v{t.version}
                      </small>
                    </th>
                    <td>
                      {t.policy.paid ? t.policy.annualDays : "Credit-free"}
                    </td>
                    <td>
                      {t.policy.eligibility.toLowerCase()}
                      <small>
                        {t.policy.branchId
                          ? (context.branches.find(
                              (b) => b.id === t.policy.branchId,
                            )?.name ?? "Branch policy")
                          : "All branches"}
                      </small>
                    </td>
                    <td>
                      {t.policy.frequency.toLowerCase()}
                      <small>
                        {noticeLabel(
                          effectiveNoticeDays(
                            t.code,
                            t.policy.minimumNoticeDays ?? 0,
                          ),
                        )}
                      </small>
                      <small>Effective {t.effectiveFrom}</small>
                    </td>
                    <td>
                      <span
                        className={`${css.status} ${t.active ? css.approved : css.cancelled}`}
                      >
                        {t.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td>
                      {context.globalScope ||
                      (t.policy.branchId &&
                        context.branches.some(
                          (b) => b.id === t.policy.branchId,
                        )) ? (
                        <Button variant="outline" onClick={() => setEditing(t)}>
                          Edit
                        </Button>
                      ) : (
                        <span className={css.muted}>Global policy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className={css.panel}>
        <div className={css.toolbar}>
          <div>
            <h2>Eligibility assignments</h2>
            <p className={css.muted}>
              Explicitly confirm assigned policies and SIL
              eligibility/equivalent benefits.
            </p>
          </div>
          <Button variant="outline" onClick={() => setAssignment(true)}>
            Assign eligibility
          </Button>
        </div>
      </section>
      <section className={css.panel}>
        <div className={css.toolbar}>
          <div>
            <h2>Annual credit allocation</h2>
            <p className={css.muted}>
              Grant yearly leave credits to eligible employees. Each employee
              receives one yearly grant per leave type.
            </p>
          </div>
        </div>
        <form className={css.form} onSubmit={(e) => void allocate(e)}>
          <p className={css.notice}>
            Saving a leave policy does not add credits. After HR approves the
            policy, use Run allocation to grant eligible yearly credits.
            Automatic yearly grants must be enabled by your system administrator.
          </p>
          <div className={css.fields}>
            <label>
              <FieldLabel required={true}>Credit year</FieldLabel>
              <input
                type="number"
                min={2000}
                max={currentYear()}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                disabled={allocation.isPending}
              />
            </label>
            <label>
              <FieldLabel required={true}>Reason</FieldLabel>
              <input
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                disabled={allocation.isPending}
              />
            </label>
          </div>
          {allocation.error && <ErrorState error={allocation.error} />}
          <div>
            <Button
              variant="outline"
              type="submit"
              disabled={allocation.isPending || !reason.trim()}
            >
              {allocation.isPending ? "Allocating…" : "Run allocation"}
            </Button>
          </div>
        </form>
      </section>
      {editing && (
        <TypeEditor
          value={editing}
          context={context}
          onClose={() => setEditing(null)}
        />
      )}{" "}
      {assignment && (
        <Eligibility
          context={context}
          types={types}
          onClose={() => setAssignment(false)}
        />
      )}
    </>
  );
}
function TypeEditor({
  value,
  context,
  onClose,
}: {
  value: LeaveType;
  context: Context;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [employmentText, setEmploymentText] = useState(
    value.policy.employmentTypes.join(", "),
  );
  const action = useAction(
    () =>
      send(
        value.id ? `/types/${value.id}` : "/types",
        {
          code: draft.code,
          name: draft.name,
          description: draft.description,
          active: draft.active,
          version: draft.version,
          effectiveFrom: draft.effectiveFrom,
          employmentTypes: employmentText
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
          ...Object.fromEntries(
            Object.entries(draft.policy).filter(
              ([key]) => key !== "carryover" && key !== "employmentTypes",
            ),
          ),
        },
        value.id ? "PATCH" : "POST",
      ),
    "Leave policy saved.",
    onClose,
  );
  const set = (key: keyof Policy, v: Policy[keyof Policy]) =>
    setDraft({ ...draft, policy: { ...draft.policy, [key]: v } });
  const check = (
    key:
      | "paid"
      | "halfDay"
      | "automaticAllocation"
      | "blockInsufficient"
      | "allowApprovedCancellation",
    label: string,
  ) => (
    <label key={key} className={css.check}>
      <input
        type="checkbox"
        checked={draft.policy[key]}
        disabled={action.isPending}
        onChange={(e) => set(key, e.target.checked)}
      />
      {label}
    </label>
  );
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="type-editor-title"
      busy={action.isPending}
      onClose={onClose}
    >
      <header className={css.dialogHeader}>
        <h2 id="type-editor-title">
          {value.id ? "Edit leave policy" : "Add leave type"}
        </h2>
        <Button variant="ghost" onClick={onClose} disabled={action.isPending}>
          Close
        </Button>
      </header>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!action.isPending) action.mutate();
        }}
      >
        <fieldset
          className={css.form}
          disabled={action.isPending}
          style={{ border: 0, margin: 0 }}
        >
          <div className={css.fields}>
            <label>
              <FieldLabel required={true}>Name</FieldLabel>
              <input
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              <FieldLabel required={true}>Code</FieldLabel>
              <input
                required
                pattern="[A-Z][A-Z0-9_]{1,19}"
                maxLength={20}
                disabled={!!value.id}
                value={draft.code}
                onChange={(e) =>
                  setDraft({ ...draft, code: e.target.value.toUpperCase() })
                }
              />
            </label>
            <label className={css.wide}>
              Description
              <textarea
                rows={2}
                maxLength={1000}
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </label>
            <label>
              <FieldLabel required={true}>Annual credit days</FieldLabel>
              <input
                type="number"
                step="0.5"
                min={0}
                max={366}
                required
                value={draft.policy.annualDays}
                onChange={(e) => set("annualDays", Number(e.target.value))}
              />
            </label>
            <label>
              <FieldLabel required={true}>Allocation frequency</FieldLabel>
              <select
                required
                value={draft.policy.frequency}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    policy: {
                      ...draft.policy,
                      frequency: e.target.value as Policy["frequency"],
                      automaticAllocation: false,
                    },
                  })
                }
              >
                <option value="MANUAL">Manual / none</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </label>
            <label>
              <FieldLabel required={true}>Eligibility</FieldLabel>
              <select
                required
                value={draft.policy.eligibility}
                onChange={(e) =>
                  set("eligibility", e.target.value as Policy["eligibility"])
                }
              >
                <option value="ACTIVE">Active employees</option>
                <option value="REGULAR">Regular employees</option>
                <option value="ASSIGNED">Explicit employee assignments</option>
              </select>
            </label>
            <label>
              <FieldLabel required={true}>Minimum service months</FieldLabel>
              <input
                required
                type="number"
                min={0}
                max={600}
                step={1}
                value={draft.policy.minimumServiceMonths}
                onChange={(e) =>
                  set("minimumServiceMonths", Number(e.target.value))
                }
              />
            </label>
            <label>
              <FieldLabel required={true}>
                Minimum advance notice (calendar days)
              </FieldLabel>
              <input
                type="number"
                min={0}
                max={365}
                step={1}
                required
                value={draft.policy.minimumNoticeDays ?? 0}
                onChange={(e) =>
                  set("minimumNoticeDays", Number(e.target.value))
                }
              />
              <small>
                0 allows same-day filing. 1 means tomorrow at the earliest; 2
                means the day after tomorrow. Past dates are blocked. Based on
                Philippine Time.
                {draft.code === "VL" || draft.code === "LWOP"
                  ? " Vacation Leave and Leave Without Pay require at least 3 days; longer settings still apply."
                  : ""}
              </small>
            </label>
            <label>
              Applicable branch
              <select
                value={draft.policy.branchId ?? ""}
                onChange={(e) => set("branchId", e.target.value || null)}
              >
                {context.globalScope && <option value="">All branches</option>}
                {context.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <FieldLabel required={true}>Effective date</FieldLabel>
              <input
                type="date"
                required
                value={draft.effectiveFrom}
                onChange={(e) =>
                  setDraft({ ...draft, effectiveFrom: e.target.value })
                }
              />
            </label>
            <label>
              <FieldLabel required={true}>Attachment policy</FieldLabel>
              <select
                required
                value={draft.policy.attachmentRule}
                onChange={(e) =>
                  set(
                    "attachmentRule",
                    e.target.value as Policy["attachmentRule"],
                  )
                }
              >
                <option value="OPTIONAL">Optional</option>
                <option value="REQUIRED">Required</option>
                <option value="NONE">Not accepted</option>
              </select>
            </label>
            <label>
              Employment types
              <input
                placeholder="FULL_TIME, PART_TIME"
                value={employmentText}
                onChange={(e) => setEmploymentText(e.target.value)}
              />
            </label>
          </div>
          <div className={css.fields}>
            {check("paid", "Paid leave")}
            {check("halfDay", "Allow half-day requests")}
            {check("automaticAllocation", "Enable approved annual allocation")}
            {check("blockInsufficient", "Block insufficient paid credits")}
            {check(
              "allowApprovedCancellation",
              "Allow future approved cancellation",
            )}
            <label className={css.check}>
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) =>
                  setDraft({ ...draft, active: e.target.checked })
                }
              />
              Active policy
            </label>
          </div>
          <p className={css.notice}>
            One approval step · Authorized management self-approval is recorded
            in history · No carryover. SIL requires an explicit HR assignment
            confirming eligibility and equivalent benefits. Archive a used type
            by deactivating it.
          </p>
          {action.error && <ErrorState error={action.error} />}
        </fieldset>
        <footer className={css.footer}>
          <Button
            variant="outline"
            type="button"
            disabled={action.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={action.isPending}>
            {action.isPending ? "Saving…" : "Save policy"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
function Eligibility({
  context,
  types,
  onClose,
}: {
  context: Context;
  types: LeaveType[];
  onClose: () => void;
}) {
  const [employeeId, setEmployee] = useState(""),
    [typeId, setType] = useState(""),
    [eligible, setEligible] = useState(false),
    [silVerified, setVerified] = useState(false),
    [reason, setReason] = useState("");
  const confirm = useConfirmation();
  const action = useAction(
    () =>
      send("/assignments", {
        employeeId,
        typeId,
        eligible,
        silVerified,
        reason,
      }),
    "Eligibility assignment saved.",
    onClose,
  );
  const sil = types.find((t) => t.id === typeId)?.code === "SIL";
  async function save(e: FormEvent) {
    e.preventDefault();
    if (action.isPending) return;
    if (
      await confirm({
        title: "Save employee eligibility?",
        description:
          "This records an auditable HR eligibility decision. It does not grant credits or change past requests.",
        confirmLabel: "Save assignment",
      })
    )
      action.mutate();
  }
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="eligibility-title"
      onClose={onClose}
      busy={action.isPending}
    >
      <header className={css.dialogHeader}>
        <h2 id="eligibility-title">Employee eligibility</h2>
      </header>
      <form onSubmit={(e) => void save(e)}>
        <div className={css.form}>
          <label>
            <FieldLabel required={true}>Employee</FieldLabel>
            <select
              required
              value={employeeId}
              onChange={(e) => setEmployee(e.target.value)}
              disabled={action.isPending}
            >
              <option value="">Select employee</option>
              {context.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <FieldLabel required={true}>Leave type</FieldLabel>
            <select
              required
              value={typeId}
              onChange={(e) => {
                setType(e.target.value);
                setVerified(false);
              }}
              disabled={action.isPending}
            >
              <option value="">Select leave type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className={css.check}>
            <input
              type="checkbox"
              checked={eligible}
              onChange={(e) => setEligible(e.target.checked)}
              disabled={action.isPending}
            />
            Employee is eligible
          </label>
          {sil && (
            <label className={css.check}>
              <input
                type="checkbox"
                checked={silVerified}
                onChange={(e) => setVerified(e.target.checked)}
                required={eligible}
                disabled={action.isPending}
              />
              <FieldLabel required={eligible}>
                HR verified SIL eligibility and equivalent benefits; this
                assignment does not duplicate equivalent leave.
              </FieldLabel>
            </label>
          )}
          <label>
            <FieldLabel required={true}>
              Reason / verification reference
            </FieldLabel>
            <textarea
              rows={3}
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={action.isPending}
            />
          </label>
          {action.error && <ErrorState error={action.error} />}
        </div>
        <footer className={css.footer}>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={action.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              action.isPending ||
              !reason.trim() ||
              (sil && eligible && !silVerified)
            }
          >
            Save assignment
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
