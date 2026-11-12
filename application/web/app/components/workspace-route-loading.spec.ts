import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const branchRouteLoading = readFileSync(
  new URL("../(workspace)/branches/loading.tsx", import.meta.url),
  "utf8",
);

describe("workspace route loading boundary", () => {
  it("renders the module skeleton without running protected-route authorization", () => {
    expect(branchRouteLoading).toContain("BranchesLoading");
    expect(branchRouteLoading).not.toContain("AuthorizedWorkspacePage");
    expect(branchRouteLoading).not.toContain("redirect(");
  });
});
