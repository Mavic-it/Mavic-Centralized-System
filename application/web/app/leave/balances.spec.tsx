import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Balances,
  EmployeeBalancesTable,
  EmployeeBalanceDrawer,
  groupEmployeeBalances,
} from "./balances";
import { currentYear } from "./api";
import type { Balance, Context } from "./types";
const row = (overrides: Partial<Balance> = {}): Balance => ({
  employeeId: "one",
  employeeName: "Alex Employee",
  branchId: "makati",
  branchName: "Makati",
  typeId: "vl",
  typeName: "Vacation Leave",
  code: "VL",
  allocated: 10,
  adjustments: 1,
  used: 3,
  restored: 1,
  reserved: 2,
  available: 7,
  year: currentYear(),
  ...overrides,
});
const records = [
  row(),
  row({ typeId: "sl", typeName: "Sick Leave", code: "SL", available: 0 }),
  row({ employeeId: "two", employeeName: "Other Employee" }),
];
describe("Organized employee balances", () => {
  it("groups by employee identity, preserving separate leave pools and same-name employees", () => {
    const groups = groupEmployeeBalances([
      ...records,
      row({ employeeId: "three" }),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].rows).toHaveLength(2);
    expect(groups[0].rows.map((b) => b.available)).toEqual([7, 0]);
    expect(groups[2].employeeName).toBe(groups[0].employeeName);
  });
  it("shows each employee once and removes financial-detail columns and repeated actions from the main table", () => {
    const html = renderToStaticMarkup(
      <EmployeeBalancesTable
        employees={groupEmployeeBalances(records)}
        onSelect={() => {}}
      />,
    );
    expect(html.match(/<tr/g)).toHaveLength(3);
    expect(html.match(/>Alex Employee</g)).toHaveLength(1);
    expect(html).toContain("Vacation Leave: 7 available days");
    expect(html).toContain("Sick Leave: 0 available days");
    expect(html.match(/>View balances /g)).toHaveLength(2);
    expect(html).not.toContain(">Allocated<");
    expect(html).not.toContain("Adjust credits");
    expect(html).not.toContain("View history");
  });
  it("keeps the complete credit breakdown and net usage in details, with adjustments limited by permission", () => {
    const employee = groupEmployeeBalances([row()])[0];
    const props = {
      employee,
      year: String(currentYear()),
      onClose: () => {},
      onHistory: () => {},
      onAdjust: () => {},
    };
    const manager = renderToStaticMarkup(
      <EmployeeBalanceDrawer {...props} canConfigure={false} />,
    );
    expect(manager).toContain("Used days</dt><dd>2</dd>");
    expect(manager).toContain("Allocated");
    expect(manager).toContain("Credits</dt>");
    expect(manager).toContain("allocated + credits - approved usage");
    expect(manager).not.toContain("Adjustments</dt>");
    expect(manager).toContain("Restored");
    expect(manager).toContain("View history");
    expect(manager).not.toContain("Adjust credits");
    expect(manager).not.toMatch(/<details[^>]*\sopen[=>\s]/);
    const hr = renderToStaticMarkup(
      <EmployeeBalanceDrawer {...props} canConfigure />,
    );
    expect(hr).toContain("Adjust credits");
  });
  it("paginates complete employees instead of splitting their leave types across pages", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    const data = Array.from({ length: 21 }, (_, index) => [
      row({ employeeId: `employee-${index}`, employeeName: `Person ${index}` }),
      row({
        employeeId: `employee-${index}`,
        employeeName: `Person ${index}`,
        typeId: "sl",
        typeName: "Sick Leave",
      }),
    ]).flat();
    client.setQueryData(["leave", "balances", `year=${currentYear()}`], data);
    const context: Context = {
      userId: "admin",
      ownEmployee: null,
      canReview: true,
      canConfigure: true,
      globalScope: true,
      branches: [],
      employees: [],
    };
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Balances context={context} types={[]} />
      </QueryClientProvider>,
    );
    expect(html).toContain("21");
    expect(html).toContain("employees");
    expect(html).toContain("Page 1 of 2");
    expect(html.match(/aria-label="View balances for Person /g)).toHaveLength(
      20,
    );
    expect(html).not.toContain("View balances for Person 20");
  });
});
