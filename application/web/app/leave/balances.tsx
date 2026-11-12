"use client";
import { FieldLabel } from "../components/field-label";
import { useState, type FormEvent } from "react";
import { ChevronRight, Wallet, X } from "lucide-react";
import { IconActionButton } from "../components/icon-action-button";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { Modal } from "../components/ui/modal";
import { useConfirmation } from "../components/ui/confirmation-provider";
import { randomUuid } from "../lib/random-uuid";
import { api, send, useAction, currentYear, dateLabel } from "./api";
import { ErrorState, Loading, Empty, Filters, Pagination, params } from "./ui";
import type { Balance, Context, LeaveType } from "./types";
import css from "./leave.module.css";
import { TableTools } from "./table-tools";
export type EmployeeBalances = {
  employeeId: string;
  employeeName: string;
  branchName: string;
  rows: Balance[];
};
export function groupEmployeeBalances(rows: Balance[]): EmployeeBalances[] {
  const groups = new Map<string, EmployeeBalances>();
  for (const row of rows) {
    const group = groups.get(row.employeeId) ?? {
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      branchName: row.branchName,
      rows: [],
    };
    group.rows.push(row);
    groups.set(row.employeeId, group);
  }
  return [...groups.values()];
}
export function EmployeeBalancesTable({
  employees,
  onSelect,
}: {
  employees: EmployeeBalances[];
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className={css.scroll}
      role="region"
      aria-label="Employee leave balances"
      tabIndex={0}
    >
      <table className={`${css.table} ${css.balanceTable}`} role="table">
        <thead>
          <tr>
            <th scope="col">Employee</th>
            <th scope="col">Available by leave type</th>
            <th scope="col">Pending days</th>
            <th scope="col">
              <span className={css.srOnly}>Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => (
            <tr key={e.employeeId}>
              <th
                scope="row"
                className={`${css.employeeIdentity} ${css.rowTitle}`}
              >
                <strong>{e.employeeName}</strong>
                <small>{e.branchName}</small>
              </th>
              <td className={css.employeeCredits}>
                <span className={css.balanceMobileLabel}>
                  Available credits
                </span>
                <div className={css.balanceChips}>
                  {e.rows.map((b) => (
                    <span
                      className={`${css.balanceChip} ${b.available === 0 ? css.zeroCredit : ""}`}
                      key={b.typeId}
                      aria-label={`${b.typeName}: ${b.available} available days`}
                    >
                      <span>{b.typeName}</span>
                      <strong>
                        {b.available}
                        <small>days</small>
                      </strong>
                    </span>
                  ))}
                </div>
              </td>
              <td className={css.employeePending}>
                <span className={css.balanceMobileLabel}>Pending days</span>
                {e.rows.reduce((n, b) => n + b.reserved, 0) > 0 ? (
                  <span className={css.pendingCount}>
                    {e.rows.reduce((n, b) => n + b.reserved, 0)} days
                  </span>
                ) : (
                  <span className={css.muted}>None</span>
                )}
              </td>
              <td className={css.employeeAction}>
                <Button
                  variant="outline"
                  aria-label={`View balances for ${e.employeeName}`}
                  onClick={() => onSelect(e.employeeId)}
                >
                  View balances <ChevronRight size={14} aria-hidden="true" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Balances({
  context,
  types,
}: {
  context: Context;
  types: LeaveType[];
}) {
  const [filters, setFilters] = useState<Record<string, string>>({
    year: String(currentYear()),
  });
  const [selected, setSelected] = useState<string | null>(null),
    [ledger, setLedger] = useState<string | null>(null),
    [adjust, setAdjust] = useState<string | null>(null),
    [page, setPage] = useState(1);
  const [tableSearch, setTableSearch] = useState("");
  const [resetRow, setResetRow] = useState<Balance | null>(null);
  const [tableSort, setTableSort] = useState("default");
  const q = useQuery({
    queryKey: ["leave", "balances", params(filters)],
    queryFn: () => api<Balance[]>(`/balances?${params(filters)}`),
  });
  const groups = groupEmployeeBalances(q.data ?? []),
    employee = groups.find((e) => e.employeeId === selected);
  const visibleGroups = groups
    .filter((e) =>
      [e.employeeName, e.branchName, ...e.rows.map((r) => r.typeName)]
        .join(" ")
        .toLocaleLowerCase()
        .includes(tableSearch.trim().toLocaleLowerCase()),
    )
    .sort((a, b) => {
      if (tableSort === "branch")
        return (
          a.branchName.localeCompare(b.branchName) ||
          a.employeeName.localeCompare(b.employeeName)
        );
      if (tableSort === "available")
        return (
          b.rows.reduce((n, r) => n + r.available, 0) -
          a.rows.reduce((n, r) => n + r.available, 0)
        );
      if (tableSort === "pending")
        return (
          b.rows.reduce((n, r) => n + r.reserved, 0) -
          a.rows.reduce((n, r) => n + r.reserved, 0)
        );
      if (tableSort === "employee")
        return a.employeeName.localeCompare(b.employeeName);
      return 0;
    });
  const key = (b: Balance) => `${b.employeeId}:${b.typeId}`;
  const ledgerRow = q.data?.find((b) => key(b) === ledger),
    adjustRow = q.data?.find((b) => key(b) === adjust);
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(visibleGroups.length / 20)),
  );
  function filter(name: string, value: string) {
    setFilters({
      ...filters,
      [name]: value,
      ...(name === "branchId" ? { employeeId: "" } : {}),
    });
    setPage(1);
    setSelected(null);
    setLedger(null);
    setAdjust(null);
  }
  return (
    <section className={css.panel}>
      <div className={css.toolbar}>
        <div>
          <h2>Employees</h2>
          <p className={css.muted}>
            One row per employee. Open balances for history and adjustments.
          </p>
        </div>
        <label className={css.balanceYear}>
          Credit year
          <input
            aria-label="Credit year"
            type="number"
            min={2000}
            max={currentYear() + 1}
            value={filters.year}
            onChange={(e) => filter("year", e.target.value)}
          />
        </label>
      </div>
      <Filters
        context={context}
        types={types}
        values={filters}
        status={false}
        dates={false}
        onChange={filter}
      />
      {!q.isPending && !q.isError && (
        <TableTools
          search={tableSearch}
          onSearch={(value) => {
            setTableSearch(value);
            setPage(1);
          }}
          sort={tableSort}
          onSort={(value) => {
            setTableSort(value);
            setPage(1);
          }}
          sortOptions={[
            { value: "default", label: "Default order" },
            { value: "employee", label: "Employee A–Z" },
            { value: "branch", label: "Branch A–Z" },
            { value: "available", label: "Most available days" },
            { value: "pending", label: "Most pending days" },
          ]}
          count={visibleGroups.length}
          label="employees"
        />
      )}
      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => void q.refetch()} />
      ) : !visibleGroups.length ? (
        <Empty>
          {tableSearch
            ? "No employees match your search."
            : "No employee balances match these filters."}
        </Empty>
      ) : (
        <>
          <EmployeeBalancesTable
            employees={visibleGroups.slice(
              (currentPage - 1) * 20,
              currentPage * 20,
            )}
            onSelect={setSelected}
          />
          <div className={css.balancePagination}>
            <Pagination
              page={currentPage}
              total={visibleGroups.length}
              recordLabel={
                visibleGroups.length === 1 ? "employee" : "employees"
              }
              onChange={setPage}
            />
          </div>
        </>
      )}
      {selected && (
        <EmployeeBalanceDrawer
          employee={employee}
          year={filters.year}
          canConfigure={context.canConfigure}
          onClose={() => setSelected(null)}
          onHistory={(b) => setLedger(key(b))}
          onAdjust={(b) => setAdjust(key(b))}
          onReset={setResetRow}
        />
      )}{" "}
      {ledgerRow && <Ledger row={ledgerRow} onClose={() => setLedger(null)} />}{" "}
      {adjustRow && (
        <Adjustment row={adjustRow} onClose={() => setAdjust(null)} />
      )}
      {resetRow && (
        <ResetBalance
          row={resetRow}
          types={types}
          onClose={() => setResetRow(null)}
        />
      )}
    </section>
  );
}
export function EmployeeBalanceDrawer({
  employee,
  year,
  canConfigure,
  onClose,
  onHistory,
  onAdjust,
  onReset,
}: {
  employee: EmployeeBalances | undefined;
  year: string;
  canConfigure: boolean;
  onClose: () => void;
  onHistory: (b: Balance) => void;
  onAdjust: (b: Balance) => void;
  onReset?: (b: Balance) => void;
}) {
  return (
    <Modal
      className={css.requestDrawer}
      aria-labelledby="employee-balances-title"
      onClose={onClose}
    >
      <header className={css.drawerHeader}>
        <div>
          <p className={css.eyebrow}>Leave balances - {year}</p>
          <h2 id="employee-balances-title">
            {employee?.employeeName ?? "Employee balances"}
          </h2>
          <p className={css.muted}>{employee?.branchName}</p>
        </div>
        <IconActionButton
          icon={X}
          label="Close employee balances"
          onClick={onClose}
        />
      </header>
      <div className={css.drawerBody}>
        {!employee ? (
          <Empty>
            This employee no longer appears in the current results. Close this
            view and refresh the list.
          </Empty>
        ) : (
          <div className={css.employeeBalanceDetails}>
            <p className={css.balanceIntro}>
              Available days already exclude pending reservations. Each leave
              type has its own credit balance.
            </p>
            {employee.rows.map((b) => (
              <article className={css.employeeTypeCard} key={b.typeId}>
                <div className={css.employeeTypeHeader}>
                  <span className={css.typeIcon}>
                    <Wallet size={18} aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{b.typeName}</h3>
                    <small>{b.code}</small>
                  </div>
                  <div className={css.availableCredit}>
                    <strong>{b.available}</strong>
                    <span>days available</span>
                  </div>
                </div>
                <dl className={css.employeeTypeStats}>
                  <div>
                    <dt>Used days</dt>
                    <dd>{b.used - b.restored}</dd>
                  </div>
                  <div>
                    <dt>Pending days</dt>
                    <dd>{b.reserved}</dd>
                  </div>
                </dl>
                <details className={css.creditBreakdown}>
                  <summary>Credit breakdown</summary>
                  <dl>
                    {[
                      ["Allocated", b.allocated],
                      ["Credits", b.adjustments],
                      ["Approved usage", b.used],
                      ["Restored", b.restored],
                      ["Pending reservations", b.reserved],
                      ["Available", b.available],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <p>
                    Available = allocated + credits - approved usage + restored
                    - pending.
                  </p>
                </details>
                <div className={css.employeeTypeActions}>
                  <Button variant="outline" onClick={() => onHistory(b)}>
                    View history
                  </Button>
                  {canConfigure && (
                    <Button variant="outline" onClick={() => onAdjust(b)}>
                      Adjust credits
                    </Button>
                  )}
                  {canConfigure && onReset && (
                    <Button variant="outline" onClick={() => onReset(b)}>
                      Reset settings
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      <footer className={`${css.footer} ${css.drawerFooter}`}>
        <Button variant="outline" onClick={onClose}>
          Done
        </Button>
      </footer>
    </Modal>
  );
}
function ResetBalance({
  row,
  types,
  onClose,
}: {
  row: Balance;
  types: LeaveType[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState("manual");
  const [nextDate, setNextDate] = useState("");
  const [reason, setReason] = useState("");
  const [key] = useState(randomUuid);
  const confirm = useConfirmation();
  const settings = useQuery({
    queryKey: ["leave", "reset", row.employeeId, row.typeId],
    queryFn: () =>
      api<{ nextDate: string | null }>(
        `/balances/${row.employeeId}/reset?typeId=${row.typeId}`,
      ),
  });
  const save = useAction(
    () =>
      send(`/balances/${row.employeeId}/reset-schedule`, {
        typeId: row.typeId,
        ...(mode === "january"
          ? { nextDate: `${currentYear() + 1}-01-01` }
          : mode === "date"
            ? { nextDate }
            : {}),
      }),
    "Reset schedule saved.",
    onClose,
  );
  const reset = useAction(
    () =>
      send(`/balances/${row.employeeId}/reset`, {
        typeId: row.typeId,
        key,
        reason,
      }),
    "Leave balance reset.",
    onClose,
  );
  const allowance = types.find((t) => t.id === row.typeId)?.policy.annualDays;
  const busy = save.isPending || reset.isPending;
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="reset-title"
      onClose={onClose}
      busy={busy}
    >
      <header className={css.dialogHeader}>
        <h2 id="reset-title">Leave balance reset</h2>
      </header>
      <div className={css.form}>
        <p>
          {row.employeeName} · {row.typeName}
        </p>
        <p>
          Resets the current credit year to the policy annual allowance (
          {allowance ?? "see Leave Settings"} days). Pending reservations still
          reduce available days. Usage and credit history are preserved.
        </p>
        {settings.isPending ? (
          <Loading />
        ) : settings.isError ? (
          <ErrorState
            error={settings.error}
            retry={() => void settings.refetch()}
          />
        ) : (
          <p>
            Current schedule:{" "}
            {settings.data.nextDate
              ? `Annually, next reset ${dateLabel(settings.data.nextDate)}`
              : "Manual only"}
            .
          </p>
        )}
        <label>
          Reset schedule
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            disabled={busy}
          >
            <option value="manual">
              Manual only (disable automatic reset)
            </option>
            <option value="january">Every January 1</option>
            <option value="date">Choose annual reset date</option>
          </select>
        </label>
        {mode === "date" && (
          <label>
            First reset date
            <input
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        <Button
          disabled={
            busy ||
            settings.isPending ||
            settings.isError ||
            (mode === "date" && !nextDate)
          }
          onClick={() => save.mutate()}
        >
          Save schedule
        </Button>
        <label>
          Reason for manual reset
          <textarea
            maxLength={800}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <Button
          disabled={busy || !reason.trim() || row.year !== currentYear()}
          onClick={async () => {
            if (
              await confirm({
                title: "Reset leave balance now?",
                description: `Restore ${row.employeeName}'s ${row.typeName} to the current policy allowance. Pending reservations remain. Current available: ${row.available}; expected available: ${(allowance ?? 0) - row.reserved}.`,
                confirmLabel: "Reset balance",
              })
            )
              reset.mutate();
          }}
        >
          Reset now
        </Button>
        {row.year !== currentYear() && (
          <p>Select the current credit year to reset now.</p>
        )}
        {(save.error || reset.error) && (
          <ErrorState error={(save.error || reset.error)!} />
        )}
      </div>
      <footer className={css.footer}>
        <Button variant="outline" disabled={busy} onClick={onClose}>
          Close
        </Button>
      </footer>
    </Modal>
  );
}
function Ledger({ row, onClose }: { row: Balance; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["leave", "ledger", row.employeeId, row.typeId, row.year],
    queryFn: () =>
      api<
        Array<{
          id: string;
          kind: string;
          days: number;
          reason: string;
          actor: string;
          createdAt: string;
        }>
      >(
        `/balances/${row.employeeId}/transactions?typeId=${row.typeId}&year=${row.year}`,
      ),
  });
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="ledger-title"
      onClose={onClose}
    >
      <header className={css.dialogHeader}>
        <h2 id="ledger-title">Credit history</h2>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className={css.details}>
        <p>
          {row.employeeName} | {row.typeName} | {row.year}
        </p>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => void q.refetch()} />
        ) : !q.data.length ? (
          <Empty>No credit transactions yet.</Empty>
        ) : (
          <div className={css.scroll}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Entry</th>
                  <th>Days</th>
                  <th>Reason / actor</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((e) => (
                  <tr key={e.id}>
                    <td>{dateLabel(e.createdAt)}</td>
                    <td>{e.kind.toLowerCase()}</td>
                    <td>
                      {e.days > 0 ? "+" : ""}
                      {e.days}
                    </td>
                    <td>
                      {e.reason}
                      <small>{e.actor}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
function Adjustment({ row, onClose }: { row: Balance; onClose: () => void }) {
  const [days, setDays] = useState(""),
    [reason, setReason] = useState(""),
    [reference, setReference] = useState(""),
    [key] = useState(randomUuid);
  const confirm = useConfirmation();
  const action = useAction(
    () =>
      send(`/balances/${row.employeeId}/adjustments`, {
        typeId: row.typeId,
        year: row.year,
        days: Number(days),
        reason:
          reason.trim() + (reference.trim() ? ` [${reference.trim()}]` : ""),
        key,
      }),
    "Leave credits adjusted.",
    onClose,
  );
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (action.isPending || !Number(days) || !reason.trim()) return;
    if (
      await confirm({
        title: "Confirm leave credit adjustment?",
        description: `${row.employeeName}: ${row.available} to ${row.available + Number(days)} available days for ${row.typeName} (${row.year}).`,
        confirmLabel: "Post adjustment",
      })
    )
      action.mutate();
  }
  return (
    <Modal
      className={css.dialog}
      aria-labelledby="adjust-title"
      onClose={onClose}
      busy={action.isPending}
    >
      <header className={css.dialogHeader}>
        <h2 id="adjust-title">Adjust leave credits</h2>
      </header>
      <form onSubmit={(e) => void submit(e)}>
        <div className={css.form}>
          <p>
            {row.employeeName} | {row.typeName} | {row.year}
          </p>
          <div className={css.fields}>
            <label>
              <FieldLabel required={true}>Days to add or deduct</FieldLabel>
              <input
                type="number"
                step="0.5"
                min={-366}
                max={366}
                required
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={action.isPending}
              />
            </label>
            <label>
              Reference
              <input
                maxLength={100}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={action.isPending}
              />
            </label>
            <label className={css.wide}>
              <FieldLabel required={true}>Reason</FieldLabel>
              <textarea
                required
                maxLength={800}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={action.isPending}
              />
            </label>
          </div>
          <dl className={css.preview}>
            <div>
              <dt>Before</dt>
              <dd>{row.available}</dd>
            </div>
            <div>
              <dt>After</dt>
              <dd>{row.available + Number(days)}</dd>
            </div>
          </dl>
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
              !Number(days) ||
              !reason.trim() ||
              row.available + Number(days) < 0
            }
          >
            {action.isPending ? "Posting..." : "Review adjustment"}
          </Button>
        </footer>
      </form>
    </Modal>
  );
}
