import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DialogProvider } from "../components/ui/confirmation-provider";
import { DtrImport } from "./dtr-import";
import type { Configuration } from "./dtr-client";

const configuration: Configuration = {
  employees: [],
  templates: [],
  mappings: [],
  settings: {
    policy: {
      breakStart: null,
      breakEnd: null,
      lateGraceMinutes: 15,
      minimumOtMinutes: 50,
      otIncrementMinutes: 60,
    },
    holidays: {},
  },
};
describe("DTR import step presentation", () => {
  it("initially shows file selection, hides cutoff, and prevents skipping prerequisites", () => {
    const client = new QueryClient();
    try {
      client.setQueryData(["dtr-import-history", "branch"], { batches: [] });
      const html = renderToStaticMarkup(
        <QueryClientProvider client={client}>
          <DialogProvider>
            <DtrImport
              branchId="branch"
              configuration={configuration}
              onSaved={() => {}}
            />
          </DialogProvider>
        </QueryClientProvider>,
      );
      const filePanel = html.match(
        /<section[^>]*data-import-step="0"[^>]*>/,
      )?.[0];
      const cutoffPanel = html.match(
        /<section[^>]*data-import-step="1"[^>]*>/,
      )?.[0];
      expect(filePanel).toBeDefined();
      expect(filePanel).not.toContain("hidden");
      expect(cutoffPanel).toContain("hidden");
      expect(html).not.toContain('data-import-step="2"');
      expect(html).not.toContain('data-import-step="3"');
      expect(html).toMatch(
        /aria-label="Step 4: Review calculations"[^>]*disabled/,
      );
      expect(html).toContain("Continue to cutoff");
      expect(html).toContain("Resume a stored import");
    } finally {
      client.clear();
    }
  });
});
