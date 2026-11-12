import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider } from "../components/ui/confirmation-provider";
import { DtrWorkspace } from "./dtr-workspace";
const configuration = {
  templates: [],
  employees: [],
  mappings: [],
  settings: {
    policy: {
      breakStart: null,
      breakEnd: null,
      minimumOtMinutes: 0,
      otIncrementMinutes: 1,
    },
    holidays: {},
  },
};
function render(canManage: boolean, branchId = "branch") {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity } },
  });
  client.setQueryData(["dtr-configuration", branchId], configuration);
  client.setQueryData(["dtr-history", branchId], {
    batches: [],
    periods: [],
    exports: [],
  });
  client.setQueryData(
    ["dtr-ledger", branchId, "2026-10-01", "2026-10-15", ""],
    { summary: {}, rows: [] },
  );
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <DialogProvider>
        <DtrWorkspace
          branchId={branchId}
          canManage={canManage}
          initialFrom="2026-10-01"
          initialTo="2026-10-15"
        />
      </DialogProvider>
    </QueryClientProvider>,
  );
}
describe("Organized attendance workflow", () => {
  it("defaults to records with three primary tasks and secondary tools", () => {
    const html = render(true);
    expect(html).toContain('aria-label="DTR workflow"');
    expect(html).toContain("Summary &amp; export");
    expect(html).toContain("Calculation settings");
    expect(html).toContain("Refresh attendance data");
    expect(html).toContain("Attendance ledger");
    expect(html).not.toContain("Import, reconcile &amp; export");
    expect(html).not.toContain("Refresh saved results");
    expect(html).not.toContain("Apply period action");
  });
  it("keeps management tools and filters hidden from read-only viewers", () => {
    const html = render(false);
    expect(html).not.toContain("Calculation settings");
    expect(html).not.toContain("All branch employees");
    expect(html).not.toContain("Saved period");
    expect(html).not.toContain("Summary &amp; export");
    expect(html).toContain("Summary");
    expect(html).not.toContain("Review / edit");
  });
  it("shows the branch-selection empty state", () => {
    expect(render(true, "")).toContain("Select an authorized branch");
  });
});
