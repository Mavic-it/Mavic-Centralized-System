import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rootLoading = readFileSync(
  new URL("./loading.tsx", import.meta.url),
  "utf8",
);

describe("root loading boundary", () => {
  it("does not run protected-route authorization while rendering a fallback", () => {
    expect(rootLoading).toContain("return null");
    expect(rootLoading).not.toContain("WorkspaceLoading");
    expect(rootLoading).not.toContain("WorkspaceRouteLoading");
    expect(rootLoading).not.toContain("AuthorizedAppShell");
  });
});
