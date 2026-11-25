import React from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { pageGuides } from "../components/page-help";
import { InquirySettings } from "./inquiry-settings";
import { InquiryList } from "./inquiry-list";
import { InquiryAnalytics } from "./inquiry-analytics";
import { InquiryForm } from "./inquiry-form";
import { validateInquiryResponse } from "./contracts";
import { inquiryApi, type Metadata, type Inquiry } from "./types";
const metadata: Metadata = {
  branches: [{ id: "a", name: "Branch A" }],
  staff: [],
  lookups: [],
  permissions: {},
  userId: "staff",
};
const record: Inquiry = {
  id: "a",
  reference: "INQ-2026-000001",
  branchId: "a",
  branchName: "Branch A",
  customerId: null,
  clientName: "<script>unsafe</script>",
  client: {},
  inquiryDate: null,
  assignedStaffId: "staff",
  assignedStaffName: null,
  status: "NEW",
  priority: "NORMAL",
  description: "",
  requirements: "",
  notes: "",
  budget: null,
  pax: null,
  preferredStart: null,
  preferredEnd: null,
  channelId: null,
  sourceId: null,
  nextAction: null,
  legacyOutcome: "RESERVED",
  archivedAt: null,
  version: 1,
  preferredBranchIds: ["a"],
  serviceIds: [],
};
afterEach(() => vi.unstubAllGlobals());
describe("Inquiry presentation and API boundaries", () => {
  it("organizes the inquiry form into clear sections with cancel and save actions", () => {
    const html = renderToStaticMarkup(
      <InquiryForm meta={metadata} onClose={() => {}} onSaved={() => {}} />,
    );

    const sections = [
      "Client details",
      "Inquiry details",
      "Space preferences",
      "Ownership and follow-up",
    ];
    let previousIndex = -1;
    for (const section of sections) {
      const index = html.indexOf(`<legend>${section}</legend>`);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    expect(html).toContain("Find customer");
    expect(html).toContain("No services are available.");
    expect(html).toContain(">Cancel</button>");
    expect(html).toContain(">Save inquiry</button>");
    expect(html).toContain('aria-labelledby="services-label"');
  });
  it("provides contextual help steps for every inquiry tab", () => {
    for (const path of [
      "/inquiries",
      "/inquiries/list",
      "/inquiries/followups",
      "/inquiries/reports",
      "/inquiries/settings",
    ]) {
      expect(pageGuides[path]).toHaveLength(3);
    }
  });
  it('drills down by staff identity and keeps period links inside the selected cohort',()=>{
    const data={totals:{total:2,new:2,active:2,noResponse:0,pendingReservations:0,reserved:0,converted:0,lost:0,eligible:2,legacyReserved:0},groups:{staff:[{label:'Same name',staffId:'one',count:1,converted:0},{label:'Same name',staffId:'two',count:1,converted:0}],period:[{label:'2026-11-01',count:2,converted:0}]},followups:{today:0,overdue:0,completed:0}};
    const html=renderToStaticMarkup(<InquiryAnalytics data={data} report={false} search="branchId=a&grouping=month&from=2026-11-15&to=2026-11-20"/>);
    expect(html).toContain('assignedStaffId=one');expect(html).toContain('assignedStaffId=two');expect(html).not.toContain('from=2026-11-01');expect(html).toContain('from=2026-11-15');
    const periodData={...data,groups:{period:data.groups.period}};
    const periodHtml=renderToStaticMarkup(<InquiryAnalytics data={periodData} report={false} search="branchId=a&grouping=month&from=2026-11-15&to=2026-11-20"/>);
    expect(periodHtml).toContain('from=2026-11-15');expect(periodHtml).toContain('to=2026-11-20');
  });
  it("keeps analytics compact and shows one selectable breakdown at a time", () => {
    const html = renderToStaticMarkup(
      <InquiryAnalytics
        data={{
          totals: {
            total: 4,
            new: 1,
            active: 3,
            noResponse: 1,
            pendingReservations: 0,
            reserved: 1,
            converted: 1,
            lost: 0,
            eligible: 3,
            legacyReserved: 0,
          },
          groups: {
            status: [{ label: "NEW", count: 1, converted: 0 }],
            branch: [{ label: "Another branch", count: 4, converted: 1 }],
          },
          followups: { today: 2, overdue: 0, completed: 0 },
        }}
        report={false}
        search=""
      />,
    );
    expect(html).toContain("At a glance");
    expect(html).toContain("Show all metrics");
    expect(html).toContain("Total inquiries");
    expect(html).toContain("Follow-ups due today");
    expect(html).toContain('value="branch"');
    expect(html).not.toContain("Another branch");
    expect(html).not.toContain("No-response rate");
  });
  it("shows editable settings only for management access and keeps read-only values visible", () => {
    const client = new QueryClient();
    client.setQueryData(["inquiries", "reminder-policy", "a"], {
      enabled: true,
      overdueEnabled: true,
      leadMinutes: 0,
      escalationHours: 0,
    });
    const render = (manageSettings: boolean) =>
      renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <InquirySettings
            meta={{
              ...metadata,
              permissions: { settings: true, manageSettings },
            }}
            onSaved={() => {}}
          />
        </QueryClientProvider>,
      );
    expect(render(true)).toContain("Save value");
    expect(render(true)).toContain("Save reminder policy");
    expect(render(false)).toContain("Your access is view only");
    expect(render(false)).not.toContain("Save value");
  });
  it("renders a semantic table, escapes client text and identifies legacy outcomes", () => {
    const html = renderToStaticMarkup(
      <InquiryList
        data={{ items: [record], total: 1, page: 1, pageSize: 20 }}
        meta={metadata}
        view="table"
        onOpen={() => {}}
        selected={[]}
        onSelect={() => {}}
        page={1}
        onPage={() => {}}
      />,
    );
    expect(html).toContain("<table");
    expect(html).toContain('scope="col"');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Legacy Reserved");
    expect(html).not.toContain('type="checkbox"');
  });
  it("provides keyboard-native buttons for Kanban records", () => {
    const html = renderToStaticMarkup(
      <InquiryList
        data={{ items: [record], total: 1, page: 1, pageSize: 20 }}
        meta={metadata}
        view="kanban"
        onOpen={() => {}}
        selected={[]}
        onSelect={() => {}}
        page={1}
        onPage={() => {}}
      />,
    );
    expect(html).toContain("<button");
    expect(html).toContain("Board shows this page");
    expect(html).not.toContain("draggable");
  });
  it("handles empty report denominators without NaN and links drill-down to the active metric", () => {
    const html = renderToStaticMarkup(
      <InquiryAnalytics
        data={{
          totals: {
            total: 0,
            new: 0,
            active: 0,
            noResponse: 0,
            pendingReservations: 0,
            reserved: 0,
            converted: 0,
            lost: 0,
            eligible: 0,
            legacyReserved: 0,
          },
          groups: { status: [] },
          followups: { today: 0, overdue: 0, completed: 0 },
        }}
        report={false}
        search="branchId=a"
      />,
    );
    expect(html).not.toContain("NaN");
    expect(html).toMatch(/0(?:<!-- -->)?%/);
    expect(html).toContain("metric=active");
    expect(html).toContain("branchId=a");
  });
  it("rejects malformed collections before rendering", () =>
    expect(() =>
      validateInquiryResponse("", { items: [{ id: "bad" }] }, false),
    ).toThrow("invalid response"));
  it("accepts a validated historical record with no contact information", () =>
    expect(
      validateInquiryResponse(
        "",
        { items: [record], total: 1, page: 1, pageSize: 20 },
        false,
      ),
    ).toMatchObject({ items: [{ client: {} }] }));
  it("surfaces denied writes and validation arrays without fake success", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { message: ["Branch denied", "Invalid assignment"] },
            { status: 403 },
          ),
        ),
    );
    await expect(inquiryApi("/a/action", { status: "LOST" })).rejects.toThrow(
      "Branch denied. Invalid assignment",
    );
  });
});
