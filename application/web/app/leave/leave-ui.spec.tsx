import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { Workspace } from "./workspace";
import { PersonalLeave, PersonalAccountInfo } from "./personal-overview";
import { WorkspaceRoleProvider } from "../components/workspace-role-context";
import { currentYear } from "./api";
import { TypeBreakdown } from "./type-breakdown";
import { SidebarNavGroup } from "../components/sidebar-nav-group";
import {
  canAccessWorkspaceArea,
  workspaceAreaForPath,
} from "../lib/workspace-access";
import type { Context } from "./types";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));
const context: Context = {
  userId: "admin",
  ownEmployee: null,
  canReview: true,
  canConfigure: true,
  globalScope: true,
  branches: [],
  employees: [],
};
describe("Simple leave experience", () => {
  it("shows configured unpaid and future types without fabricated available credits", () => {
    const base = {
      used: 0,
      available: 0,
      reserved: 0,
      approvedUnpaidDays: 0,
      pendingUnpaidDays: 0,
      active: true,
      effectiveFrom: "2026-01-01",
    };
    const html = renderToStaticMarkup(
      <TypeBreakdown
        asOf="2026-10-23"
        onSelect={() => {}}
        items={[
          {
            ...base,
            typeId: "lwop",
            typeName: "Leave Without Pay",
            code: "LWOP",
            paid: false,
            approvedUnpaidDays: 2.5,
            pendingUnpaidDays: 1,
          },
          {
            ...base,
            typeId: "future",
            typeName: "Future Custom Leave",
            code: "CUSTOM",
            paid: false,
            active: false,
            effectiveFrom: "2027-01-01",
          },
        ]}
      />,
    );
    expect(html).toContain("Leave Without Pay");
    expect(html).toContain("Future Custom Leave");
    expect(html).toContain("2.5");
    expect(html).toContain("unpaid days approved");
    expect(html).toContain("Effective 2027-01-01");
    expect(html).toContain("Inactive");
    expect(html).toContain("Filter report by Future Custom Leave");
    expect(html).not.toContain("</b> available");
  });
  it("shows unpaid usage without presenting a credit balance or allocation", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    client.setQueryData(["leave", "personal-overview", String(currentYear())], {
      year: currentYear(),
      balances: [],
      unpaid: [
        {
          typeId: "lwop",
          typeName: "Leave Without Pay",
          code: "LWOP",
          approvedDays: 2.5,
          pendingDays: 1,
          approvedRequests: 2,
          pendingRequests: 1,
        },
      ],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <PersonalLeave
          year={String(currentYear())}
          renderHistory={() => null}
        />
      </QueryClientProvider>,
    );
    expect(html).toContain("Leave Without Pay");
    expect(html).toContain("2.5");
    expect(html).toContain("days approved");
    expect(html).toContain("Pending days");
    expect(html).toContain("No credit allocation required");
    expect(html).not.toContain("Your time, at a glance");
    expect(html).not.toContain("Leave overview</h2>");
    expect(html).not.toContain("days available");
  });
  it("gives an unlinked Super Admin useful management actions without personal filing", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    client.setQueryData(["leave", "context", "mine"], context);
    const html = renderToStaticMarkup(
      <WorkspaceRoleProvider role="SUPER_ADMIN">
        <QueryClientProvider client={client}>
          <Workspace section="mine" />
        </QueryClientProvider>
      </WorkspaceRoleProvider>,
    );
    expect(html).toContain("Super Admin account");
    expect(html).toContain("Open Leave Management");
    expect(html).toContain('href="/system/users"');
    expect(html).not.toContain(">Request Leave<");
  });
  it("keeps a linked Super Admin on their own record with an auditable self-approval explanation", () => {
    const html = renderToStaticMarkup(
      <PersonalAccountInfo
        context={{
          ...context,
          ownEmployee: {
            id: "self",
            name: "Admin Employee",
            branchId: "branch",
          },
        }}
        role="SUPER_ADMIN"
      />,
    );
    expect(html).toContain("Admin Employee");
    expect(html).toContain("Self-approval is clearly recorded");
    expect(html).toContain("Manage team leave");
    expect(html).not.toContain("not linked");
  });
  it("gives an unlinked administrator a clear personal-profile message without a request action", () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity } },
    });
    client.setQueryData(["leave", "context", "mine"], context);
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <Workspace section="mine" />
      </QueryClientProvider>,
    );
    expect(html).toContain("not linked to an employee profile");
    expect(html).not.toContain(">Request Leave<");
  });
  it("highlights only balances when the root requests item shares its route prefix", () => {
    const html = renderToStaticMarkup(
      <SidebarNavGroup
        label="Leave Management"
        icon={CalendarDays}
        pathname="/leave/balances"
        compact={false}
        onNavigate={() => {}}
        items={[
          "/leave",
          "/leave/balances",
          "/leave/settings",
          "/leave/reports",
        ].map((href) => ({ href, label: href, icon: CalendarDays }))}
      />,
    );
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(
      /href="\/leave\/balances"[^>]*aria-current="page"|aria-current="page"[^>]*href="\/leave\/balances"/,
    );
  });
  it("allows IT only into personal leave and keeps managers outside policy configuration", () => {
    expect(canAccessWorkspaceArea("IT_ADMIN", "my-leave", ["people.my-leave"])).toBe(true);
    expect(canAccessWorkspaceArea("IT_ADMIN", "leave-management", ["people.my-leave"])).toBe(false);
    expect(canAccessWorkspaceArea("IT_ADMIN", "leave-settings", ["people.my-leave"])).toBe(false);
    for (const area of [
      "my-leave",
      "leave-management",
      "leave-settings",
    ] as const)
      expect(canAccessWorkspaceArea("IT_ADMIN", area)).toBe(false);
    expect(canAccessWorkspaceArea("BRANCH_MANAGER", "leave-management")).toBe(
      true,
    );
    expect(canAccessWorkspaceArea("BRANCH_MANAGER", "leave-settings")).toBe(
      false,
    );
    expect(workspaceAreaForPath("/leave/settings")).toBe("leave-settings");
    expect(workspaceAreaForPath("/leave/balances")).toBe("leave-management");
  });
});
